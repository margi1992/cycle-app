import { useState } from 'react'
import { averageDuration, type Settings as S } from '../lib/cycle'
import { todayISO } from '../lib/dates'
import { buildIcs, enableNotifications, reminderText, showNotification } from '../lib/reminders'
import type { AppData, Store } from '../lib/store'
import type { SyncApi } from '../lib/useSync'
import { DEFAULT_SYNC_URL } from '../lib/sync'
import { MIN_PASSPHRASE } from '../lib/crypto'

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v) || lo))

export default function Settings({ data, store, sync }: { data: AppData; store: Store; sync: SyncApi }) {
  const s = data.settings
  const [note, setNote] = useState('')
  const [url, setUrl] = useState(DEFAULT_SYNC_URL)
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [syncNote, setSyncNote] = useState('')
  const [busy, setBusy] = useState(false)

  const connect = async () => {
    setSyncNote('')
    if (!/^https:\/\//.test(url.trim())) return setSyncNote('Enter the sync server address (starts with https://).')
    if (pass.length < MIN_PASSPHRASE) return setSyncNote(`Use a passphrase of at least ${MIN_PASSPHRASE} characters.`)
    if (pass !== pass2) return setSyncNote('The two passphrases don’t match.')
    setBusy(true)
    const r = await sync.connect(url, pass)
    setBusy(false)
    if (!r.ok) return setSyncNote('Could not connect — check the address and your internet connection.')
    setPass(''); setPass2('')
    setSyncNote(r.hadRemote
      ? `Connected. Found your cloud data and merged it — ${r.periods} period${r.periods === 1 ? '' : 's'} in total.`
      : 'Connected. Nothing was in the cloud yet, so your data here was uploaded. On your other devices, enter the exact same passphrase.')
  }
  const [confirmText, setConfirmText] = useState('')
  const perm = 'Notification' in window ? Notification.permission : 'unsupported'
  const dur = averageDuration(data.entries, s)
  const set = (p: Partial<S>) => store.updateSettings(p)

  const toggleNotifications = async (on: boolean) => {
    if (!on) return set({ notificationsOn: false })
    const r = await enableNotifications()
    if (r === 'granted') {
      set({ notificationsOn: true })
      void showNotification(reminderText(s, s.remindDaysBefore))
      setNote('')
    } else setNote(r === 'unsupported' ? 'This browser does not support notifications.' : 'Notifications are blocked — allow them in your browser settings.')
  }

  const ics = () => {
    const text = buildIcs(data.entries, s, todayISO())
    if (!text) return setNote('Log a period first so there is something to remind you about.')
    download('cycle-reminders.ics', new Blob([text], { type: 'text/calendar' }))
    setNote('Open the downloaded file to add the reminders to your calendar.')
  }

  return (
    <>
      <h1 className="page-title">Settings</h1>

      <section className="card">
        <h2>Cycle</h2>
        <label className="field">
          <span>Period length (days)<small>{dur.fromData ? `Predictions currently use your average: ${dur.days} days` : 'Used for predictions until you have two periods with end dates'}</small></span>
          <input type="number" inputMode="numeric" min={1} max={14} value={s.periodLength}
            onChange={(e) => set({ periodLength: clamp(+e.target.value, 1, 14) })} />
        </label>
        <label className="field">
          <span>Default cycle length (days)<small>Used until you have two recorded periods</small></span>
          <input type="number" inputMode="numeric" min={21} max={60} value={s.defaultCycleLength}
            onChange={(e) => set({ defaultCycleLength: clamp(+e.target.value, 21, 60) })} />
        </label>
      </section>

      <section className="card">
        <h2>Reminders</h2>
        <label className="field">
          <span>Remind me</span>
          <select value={s.remindDaysBefore} onChange={(e) => set({ remindDaysBefore: +e.target.value })}>
            {[1, 2, 3, 4, 5, 7].map((n) => <option key={n} value={n}>{n} day{n > 1 ? 's' : ''} before</option>)}
          </select>
        </label>
        <label className="field">
          <span>Wording<small>Preview: “{reminderText(s, s.remindDaysBefore)}”</small></span>
          <select value={s.reminderMode} onChange={(e) => set({ reminderMode: e.target.value as S['reminderMode'] })}>
            <option value="gentle">Gentle</option>
            <option value="generic">Discreet — just “Reminder”</option>
            <option value="custom">My own text</option>
          </select>
        </label>
        {s.reminderMode === 'custom' && (
          <input className="text" type="text" maxLength={60} placeholder="e.g. Check the calendar" value={s.customText}
            onChange={(e) => set({ customText: e.target.value })} />
        )}
        <label className="field switch">
          <span>Notify me when I open the app<small>{perm === 'denied' ? 'Blocked in browser settings' : 'Shown once per prediction'}</small></span>
          <input type="checkbox" checked={s.notificationsOn && perm === 'granted'} onChange={(e) => void toggleNotifications(e.target.checked)} />
        </label>
        <button className="btn ghost wide" onClick={ics}>Add reminders to my calendar (.ics)</button>
        <p className="muted small">
          A web app can’t wake your phone while it’s closed without a server that would learn your dates.
          Calendar reminders fire reliably in the background and keep your data on your device.
        </p>
        {note && <p className="note" role="status">{note}</p>}
      </section>

      <section className="card">
        <h2>Sync between devices</h2>
        {sync.config ? (
          <>
            <p className="small">
              <b>{sync.state === 'syncing' ? 'Syncing…' : sync.state === 'error' ? 'Not synced' : 'In sync'}</b>
              {sync.config.lastSynced ? ` · last ${new Date(sync.config.lastSynced).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}
            </p>
            {sync.error && <p className="error" role="alert">{sync.error}</p>}
            <button className="btn ghost wide" onClick={() => void sync.syncNow()}>Sync now</button>
            <button className="btn ghost wide" onClick={() => { if (confirm('Stop syncing on this device? Your data stays here and in the cloud.')) void sync.disconnect() }}>Disconnect this device</button>
            <button className="btn danger wide" onClick={() => { if (confirm('Delete the encrypted cloud copy and stop syncing? Other devices keep their own data.')) void sync.removeCloudCopy() }}>Delete cloud copy</button>
          </>
        ) : (
          <>
            <p className="muted small">
              Your data is encrypted on this device with a passphrase before it is uploaded, so the server only stores unreadable text.
              Use the <b>same passphrase on every device</b>. It can’t be recovered if you forget it.
            </p>
            <input className="text" type="url" placeholder="Sync server address (https://…)" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Sync server address" />
            <input className="text" type="password" autoComplete="new-password" placeholder="Passphrase (12+ characters)" value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Passphrase" />
            <input className="text" type="password" autoComplete="new-password" placeholder="Repeat passphrase" value={pass2} onChange={(e) => setPass2(e.target.value)} aria-label="Repeat passphrase" />
            <button className="btn primary wide" disabled={busy} onClick={() => void connect()}>{busy ? 'Connecting…' : 'Connect and sync'}</button>
          </>
        )}
        {syncNote && <p className="note" role="status">{syncNote}</p>}
      </section>

      <section className="card">
        <h2>Your data</h2>
        <p className="muted small">Stored on this device. Nothing is uploaded unless you turn on encrypted sync above, and there is no analytics.
          Clearing browser data or uninstalling will remove it, so export a backup now and then.</p>
        <button className="btn ghost wide" onClick={() => download(`cycle-export-${todayISO()}.json`, store.exportJson())}>
          Export my data (JSON)
        </button>
        <details className="danger-zone">
          <summary>Delete all my records…</summary>
          <p className="small">This permanently removes all periods and settings from this device. Type <b>delete</b> to confirm.</p>
          <input className="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-label="Type delete to confirm" />
          <button className="btn danger wide" disabled={confirmText.trim().toLowerCase() !== 'delete'}
            onClick={async () => { await store.deleteAll(!!sync.config); setConfirmText(''); setNote('All data deleted.') }}>
            Delete everything
          </button>
        </details>
      </section>

      <p className="muted small center">Predictions are simple estimates based on your own history — not medical advice.</p>
    </>
  )
}
