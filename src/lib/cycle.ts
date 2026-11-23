import { addDays, diffDays, type ISODate } from './dates'

export interface PeriodEntry { id: string; start: ISODate; end?: ISODate }

export interface Settings {
  defaultCycleLength: number
  periodLength: number
  remindDaysBefore: number
  /** 'gentle' = "Your period may be approaching...", 'generic' = "Reminder", 'custom' = customText */
  reminderMode: 'gentle' | 'generic' | 'custom'
  customText: string
  notificationsOn: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  defaultCycleLength: 35,
  periodLength: 7,
  remindDaysBefore: 3,
  reminderMode: 'gentle',
  customText: '',
  notificationsOn: false,
}

/** Intervals outside this range are treated as typos / missed logs and ignored in averages. */
export const MIN_PLAUSIBLE_CYCLE = 10
export const MAX_PLAUSIBLE_CYCLE = 90
const RECENT_CYCLES = 6
const FUTURE_CYCLES = 3

export const sortByStart = (e: PeriodEntry[]) => [...e].sort((a, b) => a.start.localeCompare(b.start))

/** Duration in days, counting both the start and end day. */
export const durationOf = (e: PeriodEntry): number | undefined =>
  e.end ? diffDays(e.start, e.end) + 1 : undefined

export const isPlausibleCycle = (n: number) => n >= MIN_PLAUSIBLE_CYCLE && n <= MAX_PLAUSIBLE_CYCLE

/** Cycle length of an entry = days until the NEXT period starts (undefined for the latest). */
export function cycleLengthOf(entries: PeriodEntry[], id: string): number | undefined {
  const s = sortByStart(entries)
  const i = s.findIndex((e) => e.id === id)
  return i >= 0 && i < s.length - 1 ? diffDays(s[i].start, s[i + 1].start) : undefined
}

export function intervals(entries: PeriodEntry[]): number[] {
  const s = sortByStart(entries)
  const out: number[] = []
  for (let i = 1; i < s.length; i++) out.push(diffDays(s[i - 1].start, s[i].start))
  return out
}

const mean = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)

export function averageCycle(entries: PeriodEntry[], settings: Settings) {
  const recent = intervals(entries).filter(isPlausibleCycle).slice(-RECENT_CYCLES)
  if (!recent.length) return { days: settings.defaultCycleLength, fromData: false, sample: 0 }
  return { days: mean(recent), fromData: true, sample: recent.length }
}

/** Average of recorded durations when at least two have an end date; otherwise the setting. */
export function averageDuration(entries: PeriodEntry[], settings: Settings) {
  const ds = sortByStart(entries)
    .map(durationOf)
    .filter((d): d is number => d !== undefined && d >= 1 && d <= 14)
  if (ds.length < 2) return { days: settings.periodLength, fromData: false }
  return { days: mean(ds.slice(-RECENT_CYCLES)), fromData: true }
}

export interface Prediction {
  nextStart: ISODate
  cycleLength: number
  duration: number
  /** Start dates of upcoming predicted periods; the first is nextStart. */
  futureStarts: ISODate[]
}

export function predict(entries: PeriodEntry[], settings: Settings): Prediction | null {
  const s = sortByStart(entries)
  if (!s.length) return null
  const cycleLength = averageCycle(entries, settings).days
  const duration = averageDuration(entries, settings).days
  const last = s[s.length - 1].start
  const futureStarts = Array.from({ length: FUTURE_CYCLES }, (_, i) => addDays(last, cycleLength * (i + 1)))
  return { nextStart: futureStarts[0], cycleLength, duration, futureStarts }
}

export type DayKind = 'first' | 'period' | 'predicted-first' | 'predicted' | 'ordinary'

/** Days covered by an entry: its end if known, otherwise the expected duration, never running into the next entry. */
export function entryRange(entries: PeriodEntry[], e: PeriodEntry, fallbackDuration: number) {
  const next = sortByStart(entries).find((x) => x.start > e.start)
  let to = e.end ?? addDays(e.start, fallbackDuration - 1)
  if (next && to >= next.start) to = addDays(next.start, -1)
  return { from: e.start, to, estimatedEnd: !e.end }
}

export function classifyDay(date: ISODate, entries: PeriodEntry[], settings: Settings): DayKind {
  const pred = predict(entries, settings)
  const dur = pred?.duration ?? settings.periodLength
  if (entries.some((e) => e.start === date)) return 'first'
  for (const e of entries) {
    const r = entryRange(entries, e, dur)
    if (date >= r.from && date <= r.to) return 'period'
  }
  if (pred) {
    for (const st of pred.futureStarts) {
      if (date === st) return 'predicted-first'
      if (date > st && date <= addDays(st, pred.duration - 1)) return 'predicted'
    }
  }
  return 'ordinary'
}

/** 1-based day of the current cycle; null if beyond the expected cycle length or no data. */
export function cycleDay(entries: PeriodEntry[], today: ISODate, settings: Settings): number | null {
  const s = sortByStart(entries).filter((e) => e.start <= today)
  if (!s.length) return null
  const n = diffDays(s[s.length - 1].start, today) + 1
  return n <= averageCycle(entries, settings).days ? n : null
}

export function daysUntilNext(entries: PeriodEntry[], today: ISODate, settings: Settings): number | null {
  const p = predict(entries, settings)
  return p ? diffDays(today, p.nextStart) : null
}
