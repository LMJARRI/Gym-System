const baseUrl = (process.env.CRON_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const secret = process.env.CRON_SECRET
if (!secret) throw new Error('CRON_SECRET is not set')

const response = await fetch(`${baseUrl}/api/cron/notices`, {
  headers: { Authorization: `Bearer ${secret}` },
})
const body = await response.text()
if (!response.ok) throw new Error(`Cron failed (${response.status}): ${body}`)
console.log(body)
