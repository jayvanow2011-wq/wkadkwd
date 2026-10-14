// Client-safe recovery token generator (Web Crypto API).
export function generateRecoveryToken() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(32);
  (globalThis.crypto ?? (globalThis as any).msCrypto).getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 32; i++) {
    if (i > 0 && i % 4 === 0) out += "-";
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}
