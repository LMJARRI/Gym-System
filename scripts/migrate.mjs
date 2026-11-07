import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const url = process.env.POSTGRES_URL_NON_POOLING
if (!url) throw new Error('POSTGRES_URL_NON_POOLING is not set')

const dir = path.resolve('supabase/migrations')
const client = new pg.Client({
  connectionString: url.replace(/[?&]sslmode=[^&]*/, ''),
  ssl: { rejectUnauthorized: false },
})
await client.connect()
try {
  await client.query(`
    create table if not exists public._gym_system_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `)
  const applied = new Set((await client.query('select name from public._gym_system_migrations')).rows.map((row) => row.name))
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    if (applied.has(file)) {
      console.log(`skipped ${file}`)
      continue
    }
    const sql = await readFile(path.join(dir, file), 'utf8')
    await client.query('begin')
    try {
      await client.query(sql)
      await client.query('insert into public._gym_system_migrations (name) values ($1)', [file])
      await client.query('commit')
      console.log(`applied ${file}`)
    } catch (error) {
      await client.query('rollback')
      throw new Error(`${file}: ${error.message}`)
    }
  }
  await client.query("notify pgrst, 'reload schema'")
} finally {
  await client.end()
}
