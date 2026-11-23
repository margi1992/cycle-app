import { useState } from 'react'
import Calendar from '../components/Calendar'
import PeriodSheet from '../components/PeriodSheet'
import {
  averageCycle, classifyDay, cycleDay, daysUntilNext, entryRange, predict, sortByStart, type PeriodEntry,
} from '../lib/cycle'
import { diffDays, formatLong, formatShort, todayISO, type ISODate } from '../lib/dates'
import type { Store } from '../lib/store'
import type { AppData } from '../lib/store'

function headline(days: number | null): string {
  if (days === null) return 'Log your first period to see predictions'
  if (days > 1) return `Your period is expected in ${days} days`
  if (days === 1) return 'Your period is expected tomorrow'
  if (days === 0) return 'Your period is expected today'
  const late = -days
  return `Your period was expected ${late} day${late === 1 ? '' : 's'} ago`
}

export default function Home({ data, store }: { data: AppData; store: Store }) {
  const { entries, settings } = data
  const today = todayISO()
  const [selected, setSelected] = useState<ISODate | null>(null)
  const [sheet, setSheet] = useState<{ entry: PeriodEntry | null; start?: ISODate } | null>(null)

  const pred = predict(entries, settings)
  const until = daysUntilNext(entries, today, settings)
  const avg = averageCycle(entries, settings)
  const cd = cycleDay(entries, today, settings)
  const last = sortByStart(entries).at(-1)
  const startedToday = entries.some((e) => e.start === today)

  const kind = selected ? classifyDay(selected, entries, settings) : null
  const selectedEntry = selected
    ? entries.find((e) => {
        const r = entryRange(entries, e, pred?.duration ?? settings.periodLength)
        return selected >= r.from && selected <= r.to
      }) ?? null
    : null

  const kindLabel: Record<string, string> = {
    first: 'First day of a recorded period',
    period: 'Recorded period day',
    'predicted-first': 'Estimated start of your next period',
    predicted: 'Estimated period day',
    ordinary: 'Ordinary day',
  }

  return (
    <>
      <section className="hero">
        <p className="eyebrow">{cd ? `Cycle day ${cd}` : 'Cycle'}</p>
        <h1>{headline(until)}</h1>
        {pred && <p className="muted">Estimated start: {formatLong(pred.nextStart)}</p>}
        <div className="actions">
          <button
            className="btn primary big"
            disabled={startedToday}
            onClick={() => store.addPeriod(today)}
          >
            {startedToday ? 'Period started today ✓' : 'Period started today'}
          </button>
          <button className="link" onClick={() => setSheet({ entry: null })}>Other date…</button>
        </div>
      </section>

      <Calendar entries={entries} settings={settings} selected={selected} onSelect={setSelected} />

      {selected && kind && (
        <section className="detail" aria-live="polite">
          <h3>{formatLong(selected)}</h3>
          <p>{kindLabel[kind]}</p>
          {kind.startsWith('predicted') && <p className="muted">Predictions are estimates, not medical advice.</p>}
          <div className="row">
            {selectedEntry ? (
              <button className="btn ghost" onClick={() => setSheet({ entry: selectedEntry })}>Edit this period</button>
            ) : selected <= today ? (
              <button className="btn ghost" onClick={() => setSheet({ entry: null, start: selected })}>Period started here</button>
            ) : null}
          </div>
        </section>
      )}

      <section className="stats">
        <div><span>{avg.days} days</span><small>Average cycle{avg.fromData ? '' : ' (default)'}</small></div>
        <div>
          <span>{last ? formatShort(last.start) : '—'}</span>
          <small>Last period</small>
        </div>
        <div>
          <span>{pred ? `${pred.duration} days` : `${settings.periodLength} days`}</span>
          <small>Period length</small>
        </div>
      </section>
      {last && until !== null && until < 0 && (
        <p className="muted center">Predictions update once you log your next period.{' '}
          {diffDays(last.start, today)} days since your last one.</p>
      )}

      {sheet && (
        <PeriodSheet
          entry={sheet.entry}
          initialStart={sheet.start}
          onSave={(s, e) => (sheet.entry ? store.updatePeriod(sheet.entry.id, s, e) : store.addPeriod(s, e))}
          onDelete={sheet.entry ? () => store.deletePeriod(sheet.entry!.id) : undefined}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  )
}
