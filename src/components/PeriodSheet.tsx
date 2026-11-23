import { useState } from 'react'
import { diffDays, formatShort, todayISO, type ISODate } from '../lib/dates'
import type { PeriodEntry } from '../lib/cycle'

interface Props {
  /** existing entry to edit, or null to add */
  entry: PeriodEntry | null
  initialStart?: ISODate
  onSave: (start: ISODate, end?: ISODate) => boolean
  onDelete?: () => void
  onClose: () => void
}

export default function PeriodSheet({ entry, initialStart, onSave, onDelete, onClose }: Props) {
  const today = todayISO()
  const [start, setStart] = useState(entry?.start ?? initialStart ?? today)
  const [end, setEnd] = useState(entry?.end ?? '')
  const [error, setError] = useState('')

  const save = () => {
    if (!start) return setError('Choose a start date.')
    if (end && diffDays(start, end) < 0) return setError('The end date is before the start date.')
    if (end && diffDays(start, end) > 20) return setError('That period would be longer than 21 days — check the dates.')
    if (!onSave(start, end || undefined)) return setError('A period already starts on that date.')
    onClose()
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>{entry ? 'Edit period' : 'Log a period'}</h3>
        <label>
          First day
          <input type="date" value={start} max={today} onChange={(e) => { setStart(e.target.value); setError('') }} />
        </label>
        <label>
          Last day <small>(optional — leave empty if it is still going or you are unsure)</small>
          <input type="date" value={end} min={start} onChange={(e) => { setEnd(e.target.value); setError('') }} />
        </label>
        {end && start && diffDays(start, end) >= 0 && (
          <p className="muted">{diffDays(start, end) + 1} days · {formatShort(start)}</p>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row">
          {entry && onDelete && (
            <button className="btn danger" onClick={() => { if (confirm('Delete this period record?')) { onDelete(); onClose() } }}>
              Delete
            </button>
          )}
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}
