import { useEffect, useState } from 'react'
import { useStore } from './lib/store'
import { useSync } from './lib/useSync'
import { todayISO } from './lib/dates'
import { reminderDue, reminderText, showNotification } from './lib/reminders'
import Home from './screens/Home'
import History from './screens/History'
import Settings from './screens/Settings'

type Tab = 'home' | 'history' | 'settings'
const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Today' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' },
]

export default function App() {
  const store = useStore()
  const [tab, setTab] = useState<Tab>('home')
  const { data } = store
  const sync = useSync(store, data)

  const due = data ? reminderDue(data.entries, data.settings, todayISO()) : null

  // Show the in-app reminder notification at most once per prediction.
  useEffect(() => {
    if (!data || !due || !data.settings.notificationsOn || data.lastNotified === due.key) return
    store.markNotified(due.key)
    void showNotification(reminderText(data.settings, due.daysLeft))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due?.key, data?.settings.notificationsOn])

  if (!data) return <div className="loading" aria-busy="true" />

  return (
    <div className="app">
      <nav className="tabs" aria-label="Main">
        <span className="brand">Cycle</span>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <main>
        {due && tab === 'home' && (
          <div className="banner" role="status">{reminderText(data.settings, due.daysLeft)}</div>
        )}
        {tab === 'home' && <Home data={data} store={store} />}
        {tab === 'history' && <History data={data} store={store} />}
        {tab === 'settings' && <Settings data={data} store={store} sync={sync} />}
      </main>
    </div>
  )
}
