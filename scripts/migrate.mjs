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
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = await readFile(path.join(dir, file), 'utf8')
    await client.query('begin')
    try {
      await client.query(sql)
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
