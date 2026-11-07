import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { amountsMatch, buildPreference, isPublicUrl, isUuid, verifyMpSignature } from './mercadopago.ts'

const sign = (secret: string, manifest: string) => createHmac('sha256', secret).update(manifest).digest('hex')

test('valid signature is accepted, tampered ones are rejected', () => {
  const secret = 's3cret'
  const v1 = sign(secret, 'id:123456;request-id:req-1;ts:1700000000;')
  const ok = { secret, signatureHeader: `ts=1700000000,v1=${v1}`, requestId: 'req-1', dataId: '123456' }
  assert.equal(verifyMpSignature(ok), true)
  assert.equal(verifyMpSignature({ ...ok, dataId: '999999' }), false)
  assert.equal(verifyMpSignature({ ...ok, requestId: 'req-2' }), false)
  assert.equal(verifyMpSignature({ ...ok, secret: 'otro' }), false)
  assert.equal(verifyMpSignature({ ...ok, signatureHeader: null }), false)
  assert.equal(verifyMpSignature({ ...ok, signatureHeader: 'basura' }), false)
  assert.equal(verifyMpSignature({ ...ok, signatureHeader: `ts=1700000000,v1=${v1.slice(0, 10)}` }), false)
})

test('alphanumeric data.id is lowercased in the manifest, as Mercado Pago does', () => {
  const secret = 'k'
  const v1 = sign(secret, 'id:abc123;request-id:r;ts:5;')
  assert.equal(verifyMpSignature({ secret, signatureHeader: `ts=5,v1=${v1}`, requestId: 'r', dataId: 'ABC123' }), true)
})

test('amountsMatch compares in cents', () => {
  assert.equal(amountsMatch(1500.1, '1500.10'), true)
  assert.equal(amountsMatch(1500, 1500.01), false)
  assert.equal(amountsMatch('0.1', 0.1), true)
})

test('isUuid and isPublicUrl', () => {
  assert.equal(isUuid('3f2b8c1e-9a4d-4e7b-8f10-2c5d6e7f8a9b'), true)
  assert.equal(isUuid("1' or '1'='1"), false)
  assert.equal(isPublicUrl('https://gym.vercel.app'), true)
  assert.equal(isPublicUrl('http://localhost:3000'), false)
  assert.equal(isPublicUrl('https://localhost'), false)
})

test('preference uses the database amount, our payment id and only adds webhook on public https', () => {
  const base = { paymentId: 'p1', title: 'Plan Mensual', amount: 15000, currency: 'ARS', gymName: 'Gym & Co.' }
  const prod = buildPreference({ ...base, baseUrl: 'https://gym.example.com' }) as {
    external_reference: string
    items: Array<{ unit_price: number; currency_id: string }>
    notification_url: string
    auto_return: string
    statement_descriptor: string
  }
  assert.equal(prod.external_reference, 'p1')
  assert.equal(prod.items[0].unit_price, 15000)
  assert.equal(prod.items[0].currency_id, 'ARS')
  assert.equal(prod.notification_url, 'https://gym.example.com/api/mercadopago/webhook')
  assert.equal(prod.auto_return, 'approved')
  assert.equal(prod.statement_descriptor, 'Gym  Co')
  const dev = buildPreference({ ...base, baseUrl: 'http://localhost:3000' }) as {
    notification_url?: string
    auto_return?: string
  }
  assert.equal(dev.notification_url, undefined)
  assert.equal(dev.auto_return, undefined)
})
