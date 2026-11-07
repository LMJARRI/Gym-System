import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attendanceByDay, attendanceByStudent, fetchAll, summarizePayments, type AttendanceRow, type PaymentRow } from './reports.ts'

const pay = (over: Partial<PaymentRow>): PaymentRow => ({
  id: 'p', student_id: 's1', amount: 100, method: 'cash', method_detail: null, status: 'approved',
  declared_paid_on: '2026-10-01', submitted_at: '2026-10-01T10:00:00Z', verified_at: null, ...over,
})

test('only approved payments count as income', () => {
  const r = summarizePayments([
    pay({ amount: 1000, method: 'cash' }),
    pay({ amount: 500, method: 'transfer' }),
    pay({ amount: 700, method: 'transfer', status: 'pending' }),
    pay({ amount: 300, status: 'rejected' }),
    pay({ amount: 200, status: 'void' }),
  ])
  assert.equal(r.income, 1500)
  assert.deepEqual(r.incomeByMethod, { cash: 1000, transfer: 500 })
  assert.equal(r.byStatus.pending.count, 1)
  assert.equal(r.byStatus.pending.total, 700)
})

test('amounts that arrive as strings are summed numerically', () => {
  const r = summarizePayments([pay({ amount: '10.50' as unknown as number }), pay({ amount: '2.25' as unknown as number })])
  assert.equal(r.income, 12.75)
})

const att = (student_id: string, local_date: string): AttendanceRow => ({
  student_id, local_date, first_access_at: '', last_access_at: '', access_count: 1,
})

test('attendance is grouped by day and by student', () => {
  const rows = [att('a', '2026-10-02'), att('b', '2026-10-01'), att('a', '2026-10-01')]
  assert.deepEqual(attendanceByDay(rows), [{ date: '2026-10-01', count: 2 }, { date: '2026-10-02', count: 1 }])
  assert.deepEqual(attendanceByStudent(rows), [{ student_id: 'a', days: 2 }, { student_id: 'b', days: 1 }])
})

test('fetchAll pages until a short page and surfaces errors', async () => {
  const calls: number[] = []
  const rows = await fetchAll<number>(async (from) => {
    calls.push(from)
    return { data: from === 0 ? Array.from({ length: 1000 }, (_, i) => i) : [1, 2, 3], error: null }
  })
  assert.equal(rows.length, 1003)
  assert.deepEqual(calls, [0, 1000])
  await assert.rejects(fetchAll(async () => ({ data: null, error: { message: 'boom' } })), /boom/)
})
