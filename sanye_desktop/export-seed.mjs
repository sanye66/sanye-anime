import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile, mkdir, cp } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'runtime')
const pg = process.env.SANYE_DESKTOP_PG_HOME || 'C:/Program Files/PostgreSQL/18'
const upload = process.env.SANYE_DESKTOP_COVER_ROOT || path.join(os.homedir(), '.sanye_anime/uploads')
const ids = '127,128,133,135,136,137'
const args = ['-w', '-h', '127.0.0.1', '-p', process.env.SANYE_DESKTOP_SOURCE_PORT || '5433', '-U', process.env.SANYE_DESKTOP_SOURCE_USER || 'sanye', '-d', 'sanye_anime', '-At', '-v', 'ON_ERROR_STOP=1']
async function query(sql) {
  const { stdout } = await promisify(execFile)(path.join(pg, 'bin/psql.exe'), [...args, '-c', sql], {
    windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
  })
  return JSON.parse(stdout.trim())
}
const anime = await query(`select coalesce(json_agg(t),'[]') from (select * from sanye_anime.sanye_anime where id in (${ids}) and deleted_at is null order by id) t`)
if (anime.length !== 6) throw new Error('All six fixed recommendations must exist in the local source catalog')
const episodes = await query(`select coalesce(json_agg(t),'[]') from (select * from sanye_anime.sanye_anime_episode where anime_id in (${ids}) order by id) t`)
for (const record of anime) {
  if (!record.cover_url?.startsWith('/admin-profile/profile/')) continue
  const relative = record.cover_url.slice('/admin-profile/profile/'.length)
  const source = path.resolve(upload, relative)
  if (!source.startsWith(path.resolve(upload) + path.sep)) throw new Error('Invalid fixed cover path')
  const destination = path.join(root, 'client', 'admin-profile/profile', relative)
  await mkdir(path.dirname(destination), { recursive: true })
  await cp(source, destination)
}
const literal = rows => "'" + JSON.stringify(rows).replaceAll("'", "''") + "'"
const sql = `begin;
insert into sanye_anime.sanye_anime select * from json_populate_recordset(null::sanye_anime.sanye_anime, ${literal(anime)}) on conflict (id) do nothing;
insert into sanye_anime.sanye_anime_episode select * from json_populate_recordset(null::sanye_anime.sanye_anime_episode, ${literal(episodes)}) on conflict (id) do nothing;
select setval('sanye_anime.sanye_anime_id_seq', (select max(id) from sanye_anime.sanye_anime));
select setval(pg_get_serial_sequence('sanye_anime.sanye_anime_episode','id'), greatest(1,(select coalesce(max(id),1) from sanye_anime.sanye_anime_episode)));
commit;
`
await mkdir(root, { recursive: true })
await writeFile(path.join(root, 'seed.sql'), sql, 'utf8')
console.log(`Prepared ${anime.length} fixed recommendations and ${episodes.length} episode metadata records; no account or activity data.`)
