import { test } from 'node:test'
import assert from 'node:assert/strict'
import { csvCell, isIsoDate, resolveRange, toCsv } from './csv.ts'

test('csvCell escapes quotes, commas and newlines', () => {
  assert.equal(csvCell('hola'), 'hola')
  assert.equal(csvCell('a,b'), '"a,b"')
  assert.equal(csvCell('di "hola"'), '"di ""hola"""')
  assert.equal(csvCell('línea1\nlínea2'), '"línea1\nlínea2"')
  assert.equal(csvCell(null), '')
  assert.equal(csvCell(undefined), '')
  assert.equal(csvCell(1500.5), '1500.5')
})

test('csvCell neutralizes spreadsheet formulas in text but not numbers', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`)
  assert.equal(csvCell('+54 9 341'), "'+54 9 341")
  assert.equal(csvCell('@cmd'), "'@cmd")
  assert.equal(csvCell(-20), '-20')
})

test('toCsv writes BOM, header and CRLF rows', () => {
  const out = toCsv(['a', 'b'], [[1, 'x'], [2, 'y,z']])
  assert.equal(out, '\uFEFFa,b\r\n1,x\r\n2,"y,z"\r\n')
})

test('isIsoDate validates real calendar dates', () => {
  assert.equal(isIsoDate('2026-10-31'), true)
  assert.equal(isIsoDate('2026-02-31'), false)
  assert.equal(isIsoDate('31/10/2026'), false)
  assert.equal(isIsoDate(undefined), false)
})

test('resolveRange defaults to the current month and swaps inverted ranges', () => {
  assert.deepEqual(resolveRange(undefined, undefined, '2026-10-31'), { from: '2026-10-01', to: '2026-10-31' })
  assert.deepEqual(resolveRange('2026-10-20', '2026-10-05', '2026-10-31'), { from: '2026-10-05', to: '2026-10-20' })
  assert.deepEqual(resolveRange('basura', '2026-10-05', '2026-10-31'), { from: '2026-10-01', to: '2026-10-05' })
})

test('resolveRange caps very long ranges', () => {
  const r = resolveRange('2000-01-01', '2026-10-31', '2026-10-31', 366)
  assert.equal(r.to, '2026-10-31')
  assert.ok(r.from >= '2025-10-01')
})
