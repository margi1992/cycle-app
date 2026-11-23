import { useState } from 'react'
import PeriodSheet from '../components/PeriodSheet'
import { cycleLengthOf, durationOf, isPlausibleCycle, type PeriodEntry } from '../lib/cycle'
import { formatShort } from '../lib/dates'
import type { AppData, Store } from '../lib/store'

export default function History({ data, store }: { data: AppData; store: Store }) {
  const [edit, setEdit] = useState<PeriodEntry | null | 'new'>(null)
  const list = [...data.entries].reverse()

  return (
    <>
      <h1 className="page-title">History</h1>
      {list.length === 0 && <p className="muted">No periods recorded yet.</p>}
      <ul className="history">
        {list.map((e) => {
          const dur = durationOf(e)
          const cyc = cycleLengthOf(data.entries, e.id)
          return (
            <li key={e.id}>
              <button onClick={() => setEdit(e)}>
                <strong>{formatShort(e.start)}</strong>
                <span className="meta">
                  <span>{e.end ? `to ${formatShort(e.end)}` : 'end not recorded'}</span>
                  <span>Duration: {dur ? `${dur} days` : '—'}</span>
                  <span>
                    Cycle: {cyc !== undefined ? `${cyc} days` : 'in progress'}
                    {cyc !== undefined && !isPlausibleCycle(cyc) ? ' (not used in average)' : ''}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <button className="btn ghost wide" onClick={() => setEdit('new')}>Add a past period</button>
      {edit && (
        <PeriodSheet
          entry={edit === 'new' ? null : edit}
          onSave={(s, en) => (edit === 'new' ? store.addPeriod(s, en) : store.updatePeriod(edit.id, s, en))}
          onDelete={edit === 'new' ? undefined : () => store.deletePeriod(edit.id)}
          onClose={() => setEdit(null)}
        />
      )}
    </>
  )
}
