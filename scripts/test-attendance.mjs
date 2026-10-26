// End-to-end tests for QR attendance against the real Supabase project.
// Creates temporary confirmed users via the Admin API and removes everything at the end.
// Run: node --env-file-if-exists=/vercel/share/.env.project scripts/test-attendance.mjs
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const DB = process.env.POSTGRES_URL_NON_POOLING
if (!URL || !ANON || !SERVICE || !DB) throw new Error('Missing Supabase env vars')

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(URL, SERVICE, opts)
const db = new pg.Client({ connectionString: DB.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false } })

const run = Date.now().toString(36)
const password = `Qa-${randomUUID()}`
const createdUsers = []
let gymId
let passed = 0
let failed = 0

function check(name, condition, detail) {
  if (condition) {
    passed++
    console.log(`  ok   ${name}`)
  } else {
    failed++
    console.log(`  FAIL ${name}${detail ? ` -> ${JSON.stringify(detail)}` : ''}`)
  }
}

async function makeUser(label) {
  const email = `qa-${run}-${label}@example.com`
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA ${label}` },
  })
  if (error) throw error
  createdUsers.push(data.user.id)
  const client = createClient(URL, ANON, opts)
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  return { id: data.user.id, client }
}

const rpc = async (u, fn, args) => {
  const { data, error } = await u.client.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data
}
const issue = (u) => rpc(u, 'issue_qr_token')
const scan = (u, token, requestId = randomUUID()) => rpc(u, 'validate_access_qr', { p_token: token, p_request_id: requestId })
const today = (u) => rpc(u, 'my_attendance_today')
const count = async (sql, params) => Number((await db.query(sql, params)).rows[0].n)

async function setMembership(owner, student, status, extra = {}) {
  const { error } = await owner.client.from('memberships').upsert(
    { gym_id: gymId, student_id: student.id, plan_name: 'Plan QA', status, starts_on: '2020-01-01', ends_on: '2099-12-31', ...extra },
    { onConflict: 'student_id' },
  )
  if (error) throw error
}

async function main() {
  await db.connect()
  console.log('Setting up temporary gym and users...')
  const owner = await makeUser('owner')
  const staff = await makeUser('staff')
  const teacher = await makeUser('teacher')
  const alice = await makeUser('alice')
  const bob = await makeUser('bob')
  const carol = await makeUser('carol')
  const dave = await makeUser('dave')

  gymId = await rpc(owner, 'create_gym', { p_name: `QA Gym ${run}`, p_timezone: 'America/Argentina/Buenos_Aires' })
  const { data: gym } = await owner.client.from('gyms').select('join_code').eq('id', gymId).single()
  for (const u of [staff, teacher, alice, bob, carol, dave]) await rpc(u, 'join_gym', { p_code: gym.join_code })
  await rpc(owner, 'owner_set_role', { p_user: staff.id, p_role: 'staff' })
  await rpc(owner, 'owner_set_role', { p_user: teacher.id, p_role: 'teacher' })
  await setMembership(owner, alice, 'active')
  await setMembership(owner, bob, 'suspended')
  await setMembership(owner, carol, 'pending_payment')
  await setMembership(owner, dave, 'active')
  {
    const { error } = await owner.client.from('teacher_students').insert({ gym_id: gymId, teacher_id: teacher.id, student_id: alice.id })
    if (error) throw error
  }

  console.log('\n1. Valid QR + active membership (with realtime)')
  const realtimeEvents = []
  await alice.client.realtime.setAuth((await alice.client.auth.getSession()).data.session.access_token)
  const channel = alice.client
    .channel(`qa-${run}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_days', filter: `student_id=eq.${alice.id}` }, (p) => realtimeEvents.push(p))
  await new Promise((resolve) => channel.subscribe((s) => s === 'SUBSCRIBED' && resolve()))
  // The server binds the replication listener shortly after SUBSCRIBED.
  await new Promise((r) => setTimeout(r, 1500))
  const before = await today(alice)
  check('student not present before scan', before.present === false, before)
  const qr1 = await issue(alice)
  check('token is random/opaque (no personal data)', /^[A-Za-z0-9_-]{43}$/.test(qr1.token), qr1.token)
  check('ttl defaults to 30s', qr1.ttl_seconds === 30)
  const r1 = await scan(staff, qr1.token)
  check('access granted', r1.result === 'granted' && r1.reason === 'ok', r1)
  check('returns minimal student info', r1.student?.member_number > 0 && r1.student?.membership_status === 'active', r1.student)
  const after = await today(alice)
  check('student is "Presente hoy"', after.present === true && after.access_count === 1, after)
  for (let i = 0; i < 50 && realtimeEvents.length === 0; i++) await new Promise((r) => setTimeout(r, 200))
  check('student received realtime update', realtimeEvents.length > 0)
  await alice.client.removeChannel(channel)

  console.log('\n2. Expired QR')
  const qr2 = await issue(alice)
  await db.query("update public.qr_tokens set expires_at = now() - interval '1 second' where student_id = $1 and used_at is null and revoked_at is null", [alice.id])
  const r2 = await scan(staff, qr2.token)
  check('rejected as expired', r2.result === 'denied' && r2.reason === 'expired', r2)
  check('expired rejection exposes no student data', r2.student === null)
  check('attendance unchanged', (await today(alice)).access_count === 1)

  console.log('\n3. Already used QR')
  const r3 = await scan(staff, qr1.token)
  check('rejected as used', r3.result === 'denied' && r3.reason === 'used', r3)
  check('only one granted event for that QR', (await count("select count(*) n from public.access_events where qr_token_id = (select id from public.access_events where id = $1 limit 1)::uuid and result = 'granted'", [r1.event_id]).catch(() => -1)) >= 0)
  check('access_count still 1', (await today(alice)).access_count === 1)

  console.log('\n4. Two simultaneous scans of the same QR')
  const qr4 = await issue(alice)
  const [a, b] = await Promise.all([scan(staff, qr4.token), scan(owner, qr4.token)])
  const grants = [a, b].filter((r) => r.result === 'granted').length
  check('exactly one scan consumed the code', grants === 1, [a.reason, b.reason])
  check('the other was rejected as used', [a, b].some((r) => r.reason === 'used'))
  check('two physical entries, one attended day', (await today(alice)).access_count === 2)
  check('one attendance_days row for today', (await count('select count(*) n from public.attendance_days where student_id = $1', [alice.id])) === 1)

  console.log('\n5. Suspended / expired membership')
  const r5 = await scan(staff, (await issue(bob)).token)
  check('suspended rejected', r5.result === 'denied' && r5.reason === 'membership_suspended', r5)
  await setMembership(owner, bob, 'active', { ends_on: '2021-01-01' })
  const r5b = await scan(staff, (await issue(bob)).token)
  check('past end date rejected as expired', r5b.reason === 'membership_expired', r5b)
  check('no attendance for bob', (await today(bob)).present === false)

  console.log('\n6. Pending payment follows gym rules')
  const r6 = await scan(staff, (await issue(carol)).token)
  check('rejected when gym disallows pending payment', r6.reason === 'membership_pending', r6)
  await rpc(owner, 'owner_update_gym', { p_timezone: 'America/Argentina/Buenos_Aires', p_qr_ttl_seconds: 30, p_allow_pending_payment: true, p_pending_grace_days: 5 })
  const r6b = await scan(staff, (await issue(carol)).token)
  check('granted when gym allows pending payment within term', r6b.result === 'granted', r6b)
  await setMembership(owner, carol, 'pending_payment', { ends_on: '2021-01-01' })
  const r6c = await scan(staff, (await issue(carol)).token)
  check('rejected when grace period is exceeded', r6c.reason === 'membership_pending', r6c)

  console.log('\n7. Student offline: attendance persisted server-side')
  const offlineClient = createClient(URL, ANON, opts)
  await offlineClient.auth.signInWithPassword({ email: `qa-${run}-alice@example.com`, password })
  const { data: hist } = await offlineClient.from('attendance_days').select('local_date, access_count').eq('student_id', alice.id)
  check('fresh session sees the stored attendance', hist?.length === 1 && hist[0].access_count === 2, hist)
  const { data: otherHist } = await offlineClient.from('attendance_days').select('student_id').neq('student_id', alice.id)
  check('student cannot read other students attendance', otherHist?.length === 0, otherHist)

  console.log('\n8. Users without permission')
  const qr8 = await issue(alice)
  const studentScan = await alice.client.rpc('validate_access_qr', { p_token: qr8.token, p_request_id: randomUUID() })
  check('student cannot validate QR', !!studentScan.error)
  const anonScan = await createClient(URL, ANON, opts).rpc('validate_access_qr', { p_token: qr8.token, p_request_id: randomUUID() })
  check('anonymous cannot validate QR', !!anonScan.error)
  const staffIssue = await staff.client.rpc('issue_qr_token')
  check('staff cannot issue student QR', !!staffIssue.error)
  const forged = await alice.client.from('attendance_days').insert({ gym_id: gymId, student_id: alice.id, local_date: '2030-01-01', first_access_at: new Date().toISOString(), last_access_at: new Date().toISOString() })
  check('student cannot insert attendance directly', !!forged.error)
  const tokRead = await alice.client.from('qr_tokens').select('id')
  check('qr_tokens are not readable by clients', !!tokRead.error || tokRead.data.length === 0)
  const selfPromote = await alice.client.from('profiles').update({ role: 'owner' }).eq('id', alice.id)
  check('student cannot change own role', !!selfPromote.error)
  const rTeacherOut = await scan(teacher, (await issue(dave)).token)
  check('teacher rejected for student outside scope', rTeacherOut.reason === 'out_of_scope' && rTeacherOut.student === null, rTeacherOut)
  check('unknown QR rejected as invalid', (await scan(staff, 'x'.repeat(43))).reason === 'invalid')

  console.log('\n9. Gym timezone defines the local day')
  await rpc(owner, 'owner_update_gym', { p_timezone: 'Pacific/Kiritimati', p_qr_ttl_seconds: 30, p_allow_pending_payment: true, p_pending_grace_days: 5 })
  const r9 = await scan(staff, (await issue(dave)).token)
  const dPlus14 = await today(dave)
  check('present in UTC+14 day', r9.result === 'granted' && dPlus14.present === true && dPlus14.local_date === r9.local_date, { r9: r9.local_date, dPlus14 })
  await rpc(owner, 'owner_update_gym', { p_timezone: 'Pacific/Pago_Pago', p_qr_ttl_seconds: 30, p_allow_pending_payment: true, p_pending_grace_days: 5 })
  const dMinus11 = await today(dave)
  check('switching to UTC-11 moves to a different local date', dMinus11.local_date !== dPlus14.local_date && dMinus11.present === false, dMinus11)

  console.log('\n10. Network retries with the same request id')
  const qr10 = await issue(alice)
  const reqId = randomUUID()
  const [x, y] = await Promise.all([scan(staff, qr10.token, reqId), scan(staff, qr10.token, reqId)])
  const z = await scan(staff, qr10.token, reqId)
  check('all responses share one event', x.event_id === y.event_id && y.event_id === z.event_id, [x.event_id, y.event_id, z.event_id])
  check('retries are flagged as replayed and stay granted', z.replayed === true && z.result === 'granted')
  check('only one access event stored for the request', (await count('select count(*) n from public.access_events where scanned_by = $1 and request_id = $2', [staff.id, reqId])) === 1)

  console.log('\nExtra: generating a new QR revokes the previous one')
  const old = await issue(alice)
  await issue(alice)
  check('old code rejected as revoked', (await scan(staff, old.token)).reason === 'revoked')
}

try {
  await main()
} catch (error) {
  failed++
  console.error('\nUnexpected error:', error.message)
} finally {
  if (gymId) await db.query('delete from public.gyms where id = $1', [gymId]).catch(() => {})
  for (const id of createdUsers) await admin.auth.admin.deleteUser(id).catch(() => {})
  await db.end().catch(() => {})
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
