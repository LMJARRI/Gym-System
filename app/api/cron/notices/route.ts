import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

function validSecret(header: string | null): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || !header) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(header)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

/**
 * Daily job (see vercel.json). Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 * run_membership_notices is idempotent (dedupe keys), so a retried run never repeats a notice.
 */
export async function GET(request: NextRequest) {
  if (!validSecret(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { data, error } = await createAdminClient().rpc('run_membership_notices')
  if (error) {
    console.error('[cron/notices] failed:', error.code, error.message)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, processed: data })
}
