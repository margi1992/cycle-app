// End-to-end encryption for sync. The passphrase never leaves the device; the server only sees
// an opaque vault id, an auth token (both derived from the passphrase) and encrypted bytes.
const enc = new TextEncoder()
const dec = new TextDecoder()
const SALT = enc.encode('cycle-sync-v1')
const ITERATIONS = 310_000

export const MIN_PASSPHRASE = 12

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
const toB64 = (b: Uint8Array) => { let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s) }
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export interface Derived { id: string; token: string; keyB64: string }

export async function derive(passphrase: string): Promise<Derived> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveBits'])
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: SALT, iterations: ITERATIONS }, base, 80 * 8))
  return {
    id: hex(bits.slice(0, 16)), // 32 hex chars
    token: hex(bits.slice(16, 48)), // 64 hex chars
    keyB64: toB64(bits.slice(48, 80)), // 32 bytes AES key
  }
}

const importKey = (keyB64: string) => crypto.subtle.importKey('raw', fromB64(keyB64), 'AES-GCM', false, ['encrypt', 'decrypt'])

export async function encryptJson(value: unknown, keyB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(keyB64), enc.encode(JSON.stringify(value))))
  return JSON.stringify({ iv: toB64(iv), ct: toB64(ct) })
}

export async function decryptJson<T>(blob: string, keyB64: string): Promise<T> {
  const { iv, ct } = JSON.parse(blob) as { iv: string; ct: string }
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, await importKey(keyB64), fromB64(ct))
  return JSON.parse(dec.decode(plain)) as T
}
