import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import QRCode from 'qrcode'

const PORT = Number(process.env.PORT ?? 8089)
const HOST = process.env.HOST ?? '127.0.0.1'
const ADMIN_TOKEN = process.env.BRIDGE_ADMIN_TOKEN ?? ''
const HMAC_SECRET = process.env.BRIDGE_HMAC_SECRET ?? ''
const AUTH_DIR = process.env.AUTH_DIR ?? '/var/lib/lazyhand-whatsapp/auth'
const BACKUP_DIR = process.env.AUTH_BACKUP_DIR ?? path.join(path.dirname(AUTH_DIR), 'auth-backup')

if (!ADMIN_TOKEN || ADMIN_TOKEN.length < 32) {
  console.error('[bridge] BRIDGE_ADMIN_TOKEN must be set to at least 32 characters')
  process.exit(1)
}
if (!HMAC_SECRET || HMAC_SECRET.length < 32) {
  console.error('[bridge] BRIDGE_HMAC_SECRET must be set to at least 32 characters')
  process.exit(1)
}

fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 })

// Keep a second copy of the linked session so a restart or redeploy can restore
// it. A WhatsApp-side unlink still revokes the credentials permanently.
function restoreAuthBackup() {
  if (fs.existsSync(path.join(AUTH_DIR, 'creds.json'))) return
  if (!fs.existsSync(path.join(BACKUP_DIR, 'creds.json'))) return
  try {
    fs.cpSync(BACKUP_DIR, AUTH_DIR, { recursive: true, force: true })
    console.log('[bridge] restored WhatsApp session from backup')
  } catch (error) {
    console.error('[bridge] session restore failed', error.message)
  }
}

let backupTimer = null
function scheduleAuthBackup() {
  clearTimeout(backupTimer)
  backupTimer = setTimeout(() => {
    try {
      fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 })
      fs.cpSync(AUTH_DIR, BACKUP_DIR, { recursive: true, force: true })
      fs.chmodSync(BACKUP_DIR, 0o700)
    } catch (error) {
      console.error('[bridge] session backup failed', error.message)
    }
  }, 2000)
  backupTimer.unref?.()
}

restoreAuthBackup()

const state = {
  status: 'disconnected',
  qr: null,
  phone: null,
  lastConnectedAt: null,
  lastQrAt: null,
  socket: null,
  starting: false,
  wanted: false,
  reconnectTimer: null,
  reconnectDelay: 3000,
  lastStream515At: 0,
}

const sendLog = new Map()

function jidToPhone(jid) {
  if (!jid) return null
  const digits = String(jid).split('@')[0].split(':')[0].replace(/\D/g, '')
  return /^[1-9][0-9]{7,14}$/.test(digits) ? `+${digits}` : null
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

function isAdminRequest(req, url) {
  const header = req.headers.authorization ?? ''
  if (header.startsWith('Bearer ') && timingSafeEqual(header.slice(7), ADMIN_TOKEN)) return true
  const token = url.searchParams.get('token')
  return Boolean(token) && timingSafeEqual(token, ADMIN_TOKEN)
}

function signatureValid(req, rawBody) {
  const timestamp = req.headers['x-lazyhand-timestamp']
  const signature = req.headers['x-lazyhand-signature']
  if (typeof timestamp !== 'string' || typeof signature !== 'string') return false
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false
  const expected = crypto.createHmac('sha256', HMAC_SECRET).update(`${timestamp}.${rawBody}`).digest('hex')
  return timingSafeEqual(expected, signature)
}

function rateLimited(recipient) {
  const now = Date.now()
  const recent = (sendLog.get(recipient) ?? []).filter(at => now - at < 60_000)
  if (recent.length >= 10) return true
  recent.push(now)
  sendLog.set(recipient, recent)
  return false
}

async function startSocket() {
  if (state.starting || state.socket) return
  state.starting = true
  try {
    const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1023223821] }))
    const socket = makeWASocket({
      version,
      auth: authState,
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      browser: ['LazyHand', 'Chrome', '1.0.0'],
    })
    state.socket = socket
    socket.ev.on('creds.update', async () => {
      await saveCreds()
      scheduleAuthBackup()
    })

    socket.ev.on('connection.update', update => {
      const { connection, lastDisconnect, qr } = update
      if (qr) {
        state.status = 'pairing'
        state.lastQrAt = new Date().toISOString()
        void QRCode.toDataURL(qr, { margin: 1, width: 320 })
          .then(dataUrl => { state.qr = dataUrl })
          .catch(error => console.error('[bridge] QR render failed', error.message))
      }
      if (connection === 'open') {
        state.status = 'connected'
        state.qr = null
        state.phone = jidToPhone(socket.user?.id)
        state.lastConnectedAt = new Date().toISOString()
        state.reconnectDelay = 3000
        state.lastStream515At = 0
        console.log('[bridge] connected', state.phone ?? 'unknown number')
      }
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode
        state.socket = null
        state.status = 'disconnected'
        state.qr = null
        state.phone = null

        // 515 (restart required) fires immediately after a successful QR
        // scan. Remember when we last saw it so a following 401 can be told
        // apart from a genuine WhatsApp-side unlink (evolution-api#2509).
        if (statusCode === DisconnectReason.restartRequired) {
          state.lastStream515At = Date.now()
        }

        // A loggedOut within 30s of a 515 is Baileys' known session-slot
        // cleanup, not a real logout. Keep the credentials and reconnect
        // quickly; wiping them here is what breaks pairing after scanning.
        const transientLogout = statusCode === DisconnectReason.loggedOut
          && state.lastStream515At > 0
          && Date.now() - state.lastStream515At < 30_000

        console.log(
          '[bridge] disconnected',
          statusCode ?? 'unknown',
          statusCode === DisconnectReason.loggedOut ? '(logged out)' : '',
          transientLogout ? '(transient, keeping creds)' : '',
        )

        if (statusCode === DisconnectReason.loggedOut && !transientLogout) {
          state.wanted = false
          fs.rmSync(AUTH_DIR, { recursive: true, force: true })
          fs.rmSync(BACKUP_DIR, { recursive: true, force: true })
          fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 })
          return
        }

        if (state.wanted) {
          // Reconnect right away with the freshly saved credentials, before
          // the pairing window closes; waiting on the backoff timer makes
          // WhatsApp reject the login with 401 (logged out).
          const fast = statusCode === DisconnectReason.restartRequired || transientLogout
          scheduleReconnect(fast ? 1000 : undefined)
        }
      }
    })
  } catch (error) {
    console.error('[bridge] socket start failed', error.message)
    state.socket = null
    state.status = 'disconnected'
  } finally {
    state.starting = false
  }
}

// Schedule the next connection attempt. Pass a delay to force a fast
// reconnect (used after 515 "restart required" and transient logouts): any
// pending backoff timer is cancelled so the short delay actually applies.
// Without a delay, a pending timer is left alone to avoid duplicates.
function scheduleReconnect(delay) {
  if (typeof delay === 'number') {
    state.reconnectDelay = delay
  } else if (state.reconnectTimer) {
    return
  }
  if (state.reconnectTimer) clearTimeout(state.reconnectTimer)
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null
    state.reconnectDelay = Math.min(state.reconnectDelay * 2, 15_000)
    void startSocket()
  }, state.reconnectDelay)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > 16_384) {
        reject(new Error('Body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(body)
}

const pairingPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>LazyHand WhatsApp pairing</title>
<style>
  body { font-family: system-ui, sans-serif; background: #faf7f2; color: #252c37; display: grid; place-items: center; min-height: 100vh; margin: 0; }
  main { background: #fff; border: 1px solid #ece6de; border-radius: 18px; padding: 28px; max-width: 380px; width: calc(100% - 40px); text-align: center; }
  h1 { font-size: 20px; margin: 0 0 6px; }
  p { font-size: 13px; line-height: 1.5; color: #727984; margin: 0 0 16px; }
  img { width: 280px; height: 280px; image-rendering: pixelated; border-radius: 12px; }
  .state { font-weight: 700; margin-top: 14px; }
  .ok { color: #15803d; } .wait { color: #b45309; } .err { color: #b91c1c; }
  button { margin-top: 18px; min-height: 44px; width: 100%; border: 1px solid #ece6de; background: #fff; border-radius: 12px; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
<main>
  <h1>LazyHand WhatsApp sender</h1>
  <p>Scan this QR in the WhatsApp app on the dedicated LazyHand phone: Settings → Linked devices → Link a device. The QR is short-lived and never logged.</p>
  <div id="qrWrap"><p class="state wait">Requesting QR…</p></div>
  <div id="state" class="state wait">waiting</div>
  <button id="retry" type="button">Request a new QR</button>
</main>
<script>
  const token = new URLSearchParams(location.search).get('token') || '';
  const qrWrap = document.getElementById('qrWrap');
  const stateEl = document.getElementById('state');
  let started = false;
  async function authFetch(url, options = {}) {
    return fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: 'Bearer ' + token } });
  }
  async function startPairing() {
    await authFetch('/v1/pairing', { method: 'POST' });
    started = true;
  }
  async function tick() {
    try {
      const response = await authFetch('/v1/pairing/qr');
      const data = await response.json();
      stateEl.textContent = data.status;
      stateEl.className = 'state ' + (data.status === 'connected' ? 'ok' : data.status === 'pairing' ? 'wait' : 'err');
      if (data.status === 'connected') {
        qrWrap.innerHTML = '<p class="state ok">Connected as ' + (data.phone || 'WhatsApp sender') + '. You can close this page.</p>';
      } else if (data.qr) {
        qrWrap.innerHTML = '<img alt="WhatsApp pairing QR code" src="' + data.qr + '" />';
      } else if (!started) {
        await startPairing();
      }
    } catch (error) {
      stateEl.textContent = 'connection error';
      stateEl.className = 'state err';
    }
  }
  document.getElementById('retry').addEventListener('click', startPairing);
  tick();
  setInterval(tick, 2500);
</script>
</body>
</html>`

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const { pathname } = url

  if (req.method === 'GET' && pathname === '/health') return json(res, 200, { status: 'ok' })

  if (req.method === 'GET' && pathname === '/pair') {
    if (!isAdminRequest(req, url)) return json(res, 403, { error: 'Forbidden' })
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
    })
    return res.end(pairingPage)
  }

  if (!pathname.startsWith('/v1/')) return json(res, 404, { error: 'Not found' })

  if (req.method === 'GET' && pathname === '/v1/status') {
    if (!isAdminRequest(req, url)) return json(res, 401, { error: 'Unauthorized' })
    return json(res, 200, {
      connected: state.status === 'connected',
      status: state.status,
      phone: state.phone,
      lastConnectedAt: state.lastConnectedAt,
      hasQr: Boolean(state.qr),
    })
  }

  if (req.method === 'POST' && pathname === '/v1/pairing') {
    if (!isAdminRequest(req, url)) return json(res, 401, { error: 'Unauthorized' })
    state.wanted = true
    void startSocket()
    return json(res, 202, { status: 'pairing_requested' })
  }

  if (req.method === 'GET' && pathname === '/v1/pairing/qr') {
    if (!isAdminRequest(req, url)) return json(res, 401, { error: 'Unauthorized' })
    return json(res, 200, {
      status: state.status,
      qr: state.qr,
      phone: state.phone,
      lastQrAt: state.lastQrAt,
      lastConnectedAt: state.lastConnectedAt,
    })
  }

  if (req.method === 'POST' && pathname === '/v1/pairing/logout') {
    if (!isAdminRequest(req, url)) return json(res, 401, { error: 'Unauthorized' })
    try {
      if (state.socket) await state.socket.logout()
    } catch (error) {
      console.error('[bridge] logout failed', error.message)
    }
    state.socket = null
    state.wanted = false
    state.status = 'disconnected'
    state.qr = null
    state.phone = null
    fs.rmSync(AUTH_DIR, { recursive: true, force: true })
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true })
    fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 })
    return json(res, 200, { ok: true })
  }

  if (req.method === 'POST' && pathname === '/v1/messages') {
    let rawBody
    try {
      rawBody = await readBody(req)
    } catch {
      return json(res, 413, { error: 'Request body too large' })
    }
    const adminAuthorized = isAdminRequest(req, url)
    if (!adminAuthorized && !signatureValid(req, rawBody)) return json(res, 401, { error: 'Unauthorized' })

    let payload
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return json(res, 400, { error: 'Invalid JSON' })
    }
    const to = typeof payload?.to === 'string' ? payload.to.replace(/\s+/g, '') : ''
    const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
    if (!/^\+[1-9][0-9]{7,14}$/.test(to)) return json(res, 400, { error: 'Recipient must be E.164, e.g. +919798077838' })
    if (!text || text.length > 4000) return json(res, 400, { error: 'Message text is required (max 4000 chars)' })
    if (state.status !== 'connected' || !state.socket) return json(res, 503, { error: 'WhatsApp sender is not connected' })
    if (rateLimited(to)) return json(res, 429, { error: 'Rate limit reached for this recipient' })

    try {
      const sent = await state.socket.sendMessage(`${to.slice(1)}@s.whatsapp.net`, { text })
      return json(res, 200, { ok: true, id: sent?.key?.id ?? null })
    } catch (error) {
      console.error('[bridge] send failed', error.message)
      return json(res, 502, { error: 'Send failed' })
    }
  }

  return json(res, 404, { error: 'Not found' })
})

server.listen(PORT, HOST, () => {
  console.log(`[bridge] listening on http://${HOST}:${PORT}`)
  if (fs.existsSync(path.join(AUTH_DIR, 'creds.json'))) {
    console.log('[bridge] existing session found, connecting')
    state.wanted = true
    void startSocket()
  } else {
    console.log('[bridge] no session yet; open /pair to link a WhatsApp account')
  }
})

function shutdown() {
  if (state.reconnectTimer) clearTimeout(state.reconnectTimer)
  try {
    state.socket?.end(undefined)
  } catch {}
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref()
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
