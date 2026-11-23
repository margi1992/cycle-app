import { describe, expect, it } from 'vitest'
import { addDays, diffDays, weekdayMon0, daysInMonth, todayISO } from '../src/lib/dates'
import {
  DEFAULT_SETTINGS as S, averageCycle, averageDuration, classifyDay, cycleDay, cycleLengthOf,
  daysUntilNext, predict, type PeriodEntry,
} from '../src/lib/cycle'

const e = (id: string, start: string, end?: string): PeriodEntry => ({ id, start, end })

describe('dates', () => {
  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('diffs are exact across DST changes', () => {
    expect(diffDays('2026-03-20', '2026-04-05')).toBe(16)
    expect(diffDays('2026-10-20', '2026-11-05')).toBe(16)
    expect(diffDays('2026-12-01', '2026-11-01')).toBe(-30)
  })
  it('weekday and month length', () => {
    expect(weekdayMon0('2026-11-23')).toBe(0) // Monday
    expect(weekdayMon0('2026-11-29')).toBe(6)
    expect(daysInMonth(2028, 1)).toBe(29)
    expect(daysInMonth(2026, 1)).toBe(28)
  })
  it('todayISO uses local parts', () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('cycle engine', () => {
  it('no data: no prediction, default cycle', () => {
    expect(predict([], S)).toBeNull()
    expect(averageCycle([], S)).toMatchObject({ days: 35, fromData: false })
    expect(daysUntilNext([], '2026-11-23', S)).toBeNull()
  })
  it('one entry: uses default 35-day cycle and 7-day duration', () => {
    const p = predict([e('a', '2026-11-01')], S)!
    expect(p.nextStart).toBe('2026-12-06')
    expect(p.duration).toBe(7)
    expect(p.futureStarts).toHaveLength(3)
    expect(p.futureStarts[1]).toBe('2027-01-10')
    expect(daysUntilNext([e('a', '2026-11-01')], '2026-11-23', S)).toBe(13)
  })
  it('averages recorded cycles and rounds', () => {
    const list = [e('a', '2026-01-01'), e('b', '2026-01-29'), e('c', '2026-03-03')] // 28, 33
    expect(averageCycle(list, S)).toMatchObject({ days: 31, fromData: true, sample: 2 }) // 30.5 -> 31
    expect(predict(list, S)!.nextStart).toBe('2026-04-03')
  })
  it('only the last 6 cycles count', () => {
    let d = '2025-01-01'
    const list: PeriodEntry[] = [e('0', d)]
    for (let i = 1; i <= 8; i++) { d = addDays(d, i <= 2 ? 50 : 30); list.push(e(String(i), d)) }
    expect(averageCycle(list, S).days).toBe(30)
  })
  it('ignores implausible intervals (typos)', () => {
    const list = [e('a', '2026-01-01'), e('b', '2026-01-04'), e('c', '2026-02-05')] // 3 (ignored), 32
    expect(averageCycle(list, S).days).toBe(32)
  })
  it('order of input does not matter; cycle length is derived from next entry', () => {
    const list = [e('c', '2026-03-03'), e('a', '2026-01-01'), e('b', '2026-01-29')]
    expect(cycleLengthOf(list, 'a')).toBe(28)
    expect(cycleLengthOf(list, 'b')).toBe(33)
    expect(cycleLengthOf(list, 'c')).toBeUndefined()
  })
  it('deleting an entry recomputes', () => {
    const list = [e('a', '2026-01-01'), e('b', '2026-01-29'), e('c', '2026-03-03')]
    const after = list.filter((x) => x.id !== 'b')
    expect(cycleLengthOf(after, 'a')).toBe(61) // a long but plausible gap
    expect(averageCycle(after, S)).toMatchObject({ days: 61, fromData: true })
    expect(averageCycle([after[0]], S)).toMatchObject({ days: 35, fromData: false })
  })
  it('duration: setting until 2 end dates exist, then the average', () => {
    expect(averageDuration([e('a', '2026-01-01', '2026-01-04')], S)).toMatchObject({ days: 7, fromData: false })
    const list = [e('a', '2026-01-01', '2026-01-05'), e('b', '2026-02-01', '2026-02-04')] // 5, 4
    expect(averageDuration(list, S)).toMatchObject({ days: 5, fromData: true }) // 4.5 -> 5 (rounded)
  })
  it('cycle day, and null when past the expected cycle', () => {
    const list = [e('a', '2026-11-01')]
    expect(cycleDay(list, '2026-11-01', S)).toBe(1)
    expect(cycleDay(list, '2026-11-23', S)).toBe(23)
    expect(cycleDay(list, '2026-12-20', S)).toBeNull()
    expect(cycleDay(list, '2026-10-30', S)).toBeNull()
  })
  it('countdown goes negative when overdue', () => {
    expect(daysUntilNext([e('a', '2026-10-01')], '2026-11-10', S)).toBe(-5)
  })
  it('classifies days', () => {
    const list = [e('a', '2026-11-01', '2026-11-03')]
    expect(classifyDay('2026-11-01', list, S)).toBe('first')
    expect(classifyDay('2026-11-03', list, S)).toBe('period')
    expect(classifyDay('2026-11-04', list, S)).toBe('ordinary')
    expect(classifyDay('2026-12-06', list, S)).toBe('predicted-first')
    expect(classifyDay('2026-12-12', list, S)).toBe('predicted')
    expect(classifyDay('2026-12-13', list, S)).toBe('ordinary')
  })
  it('open entry shades the expected duration, but never into the next period', () => {
    const list = [e('a', '2026-11-01'), e('b', '2026-11-05')]
    expect(classifyDay('2026-11-04', list, S)).toBe('period')
    expect(classifyDay('2026-11-05', list, S)).toBe('first')
  })
})
