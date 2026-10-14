# nodego — Node.js build server

Node.js port of `build.py`. Polls the website for queued builds, fetches the
Go stub, cross-compiles with `go build` to `windows/amd64`, uploads the
resulting `.exe`, and reports progress.

## Requirements

- **Node.js 18+** (uses the built-in global `fetch`)
- Nothing else — Go is auto-installed on first run into `~/.nodego-go`
  (override with `GOROOT`).

## Run

```bash
cd nodego
FRONTEND_URL=https://your-app.lovable.app \
BUILDSERVER_KEY=bsk_your_key \
HIDEN_AUTH_KEY=optional_fallback \
RELAY_URL=wss://your-relay.example.com \
node server.js
```

That's it. On first boot you'll see:

```
info installing Go 1.23.4 for linux/amd64…
info   downloading https://go.dev/dl/go1.23.4.linux-amd64.tar.gz
ok   go installed → /root/.nodego-go/go/bin/go
info warming module cache…
ok   ready — waiting for builds
```

## Env vars

| Variable          | Default                                   | Purpose                              |
| ----------------- | ----------------------------------------- | ------------------------------------ |
| `FRONTEND_URL`    | `https://wallahis.lovable.app`            | Website base URL                     |
| `BUILDSERVER_KEY` | *(required)*                              | Secret shared with the website       |
| `BUILD_POLL_MS`   | `4000`                                    | Poll interval                        |
| `BUILD_WORK_DIR`  | `$TMPDIR/nodego-builds`                   | Scratch directory for each build     |
| `GO_VERSION`      | `1.23.4`                                  | Go version to auto-install           |
| `GOROOT`          | `~/.nodego-go`                            | Where to install Go                  |
| `RELAY_URL`       | `wss://umad.hidenmc.com`                  | Fallback relay URL baked into builds |
| `HIDEN_AUTH_KEY`  | *(from poll response)*                    | Fallback auth key baked into builds  |

## Run as a service (systemd)

```ini
[Unit]
Description=nodego build server
After=network-online.target

[Service]
Type=simple
Environment=FRONTEND_URL=https://your-app.lovable.app
Environment=BUILDSERVER_KEY=bsk_xxx
WorkingDirectory=/opt/nodego
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
