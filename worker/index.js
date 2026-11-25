// Cycle sync vault. Stores ONE opaque encrypted blob per vault id. It cannot read your data:
// encryption happens on your devices with a passphrase this server never sees.
// Access needs a secret token derived from the passphrase; only its hash is stored here.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type',
  'Access-Control-Max-Age': '86400',
}
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const MAX_BYTES = 200_000

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    const m = new URL(req.url).pathname.match(/^\/v1\/([0-9a-f]{32})$/)
    if (!m) return json({ error: 'not found' }, 404)
    const id = m[1]

    const token = (req.headers.get('Authorization') || '').replace(/^Bearer /, '')
    if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: 'unauthorized' }, 401)
    const tokenHash = await sha256Hex(token)

    const raw = await env.VAULT.get(id)
    const cur = raw ? JSON.parse(raw) : null
    if (cur && cur.tokenHash !== tokenHash) return json({ error: 'unauthorized' }, 401)

    if (req.method === 'GET') {
      return cur ? json({ blob: cur.blob, version: cur.version }) : json({ error: 'empty' }, 404)
    }

    if (req.method === 'DELETE') {
      if (cur) await env.VAULT.delete(id)
      return json({ ok: true })
    }

    if (req.method === 'PUT') {
      const text = await req.text()
      if (text.length > MAX_BYTES) return json({ error: 'too large' }, 413)
      let body
      try { body = JSON.parse(text) } catch { return json({ error: 'bad request' }, 400) }
      if (typeof body.blob !== 'string' || !Number.isInteger(body.baseVersion)) return json({ error: 'bad request' }, 400)
      const currentVersion = cur ? cur.version : 0
      if (body.baseVersion !== currentVersion) return json({ error: 'conflict', version: currentVersion }, 409)
      const version = currentVersion + 1
      await env.VAULT.put(id, JSON.stringify({ tokenHash, blob: body.blob, version }))
      return json({ version })
    }

    return json({ error: 'method not allowed' }, 405)
  },
}
