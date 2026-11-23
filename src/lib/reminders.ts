import { addDays, diffDays, type ISODate } from './dates'
import { predict, type PeriodEntry, type Settings } from './cycle'

export function reminderText(s: Settings, daysLeft?: number): string {
  if (s.reminderMode === 'generic') return 'Reminder'
  if (s.reminderMode === 'custom' && s.customText.trim()) return s.customText.trim()
  if (daysLeft === undefined) return 'Your period may be approaching.'
  if (daysLeft <= 0) return 'Your period may be starting about now.'
  return `Your period may be approaching in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`
}

/** The date a reminder should fire for the next predicted period. */
export const reminderDate = (nextStart: ISODate, s: Settings) => addDays(nextStart, -s.remindDaysBefore)

/** Key used to make sure the same reminder is shown only once. */
export const reminderKey = (nextStart: ISODate, s: Settings) => `${nextStart}@${s.remindDaysBefore}`

/**
 * Should an in-app reminder be shown today? True from the reminder date until the predicted start
 * (and a couple of days after, in case the app was not opened earlier).
 */
export function reminderDue(entries: PeriodEntry[], s: Settings, today: ISODate): { daysLeft: number; key: string } | null {
  const p = predict(entries, s)
  if (!p) return null
  const from = reminderDate(p.nextStart, s)
  const until = addDays(p.nextStart, 2)
  if (today < from || today > until) return null
  const daysLeft = diffDays(today, p.nextStart)
  return { daysLeft, key: reminderKey(p.nextStart, s) }
}

export async function enableNotifications(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported'
  const r = await Notification.requestPermission()
  return r === 'granted' ? 'granted' : 'denied'
}

export async function showNotification(text: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const reg = await navigator.serviceWorker?.getRegistration()
  if (reg) await reg.showNotification('Cycle', { body: text, tag: 'cycle-reminder', icon: 'icon-192.png' })
  else new Notification('Cycle', { body: text, tag: 'cycle-reminder' })
}

const icsDate = (iso: ISODate) => iso.replace(/-/g, '')

/** Calendar file with one all-day event + alarm per predicted period. Stable UIDs mean re-importing replaces. */
export function buildIcs(entries: PeriodEntry[], s: Settings, today: ISODate): string | null {
  const p = predict(entries, s)
  if (!p) return null
  const stamp = today.replace(/-/g, '') + 'T000000Z'
  const title = reminderText(s)
  const events = p.futureStarts.map((start) => {
    const day = addDays(start, -s.remindDaysBefore)
    return [
      'BEGIN:VEVENT',
      `UID:cycle-${start}@local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(day)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(day, 1))}`,
      `SUMMARY:${title.replace(/[\\;,]/g, ' ')}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${title.replace(/[\\;,]/g, ' ')}`,
      'TRIGGER:PT9H',
      'END:VALARM',
      'END:VEVENT',
    ].join('\r\n')
  })
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cycle//Local//EN', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n')
}
