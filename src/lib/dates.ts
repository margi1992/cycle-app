// Dates are plain 'YYYY-MM-DD' strings. All arithmetic goes through a UTC day
// number, so daylight-saving changes can never shift a result by a day.
export type ISODate = string

const MS_PER_DAY = 86_400_000

export function toDayNumber(iso: ISODate): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY)
}

export function fromDayNumber(n: number): ISODate {
  const dt = new Date(n * MS_PER_DAY)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const addDays = (iso: ISODate, n: number): ISODate => fromDayNumber(toDayNumber(iso) + n)
/** Whole days from a to b (positive when b is after a). */
export const diffDays = (a: ISODate, b: ISODate): number => toDayNumber(b) - toDayNumber(a)

/** Today in the user's local time zone. */
export function todayISO(now: Date = new Date()): ISODate {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
}

export function isoFromParts(year: number, month0: number, day: number): ISODate {
  return fromDayNumber(Math.round(Date.UTC(year, month0, day) / MS_PER_DAY))
}

/** 0 = Monday ... 6 = Sunday */
export function weekdayMon0(iso: ISODate): number {
  return (new Date(toDayNumber(iso) * MS_PER_DAY).getUTCDay() + 6) % 7
}

const fmt = (iso: ISODate, o: Intl.DateTimeFormatOptions) =>
  new Date(toDayNumber(iso) * MS_PER_DAY).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' })

export const formatLong = (iso: ISODate) => fmt(iso, { weekday: 'short', day: 'numeric', month: 'short' })
export const formatShort = (iso: ISODate) => fmt(iso, { day: 'numeric', month: 'short', year: 'numeric' })
export const monthTitle = (year: number, month0: number) =>
  fmt(isoFromParts(year, month0, 1), { month: 'long', year: 'numeric' })
