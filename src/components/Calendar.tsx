import { useState } from 'react'
import { classifyDay, type PeriodEntry, type Settings } from '../lib/cycle'
import { daysInMonth, isoFromParts, monthTitle, todayISO, weekdayMon0, type ISODate } from '../lib/dates'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

interface Props {
  entries: PeriodEntry[]
  settings: Settings
  selected: ISODate | null
  onSelect: (d: ISODate) => void
}

export default function Calendar({ entries, settings, selected, onSelect }: Props) {
  const now = new Date()
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const today = todayISO()

  const shift = (n: number) =>
    setView(({ y, m }) => {
      const t = m + n
      return { y: y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 }
    })

  const lead = weekdayMon0(isoFromParts(view.y, view.m, 1))
  const total = daysInMonth(view.y, view.m)
  const cells: (ISODate | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: total }, (_, i) => isoFromParts(view.y, view.m, i + 1)),
  ]

  return (
    <section className="cal" aria-label="Calendar">
      <header className="cal-head">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
        <h2>{monthTitle(view.y, view.m)}</h2>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Next month">›</button>
      </header>
      <div className="cal-grid" role="grid">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="cal-dow" aria-hidden>{w}</div>
        ))}
        {cells.map((d, i) =>
          d === null ? (
            <div key={`b${i}`} />
          ) : (
            <button
              key={d}
              className={`day ${classifyDay(d, entries, settings)}${d === today ? ' today' : ''}${d === selected ? ' selected' : ''}`}
              onClick={() => onSelect(d)}
              aria-label={d}
              aria-pressed={d === selected}
            >
              <span>{Number(d.slice(8))}</span>
            </button>
          ),
        )}
      </div>
      <ul className="legend" aria-label="Legend">
        <li><i className="lg period" />Period</li>
        <li><i className="lg first" />First day</li>
        <li><i className="lg predicted" />Expected</li>
        <li><i className="lg today" />Today</li>
      </ul>
    </section>
  )
}
