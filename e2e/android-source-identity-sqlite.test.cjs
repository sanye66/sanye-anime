const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DatabaseSync } = require('node:sqlite')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const source = fs.readFileSync(path.resolve(__dirname, '../sanye_android/android/app/src/main/java/com/sanye/sanye_anime/SanyeCatalogPlugin.java'), 'utf8')

function sql(method) {
  const start = source.indexOf(method)
  assert.ok(start >= 0)
  const body = source.slice(start, source.indexOf('\n        }', start))
  return [...body.matchAll(/db\.execSQL\(("(?:\\.|[^"\\])*"(?:\s*\+\s*"(?:\\.|[^"\\])*")*)\);/g)].map(match => vm.runInNewContext(match[1]))
}
function oldDatabase(location = ':memory:') {
  const db = new DatabaseSync(location)
  db.exec(sql('public void onCreate(SQLiteDatabase db)')[0])
  for (const statement of sql('private static void createPersonalDataTables')) db.exec(statement)
  db.exec("INSERT INTO saved_media(id,title,url,favorite,updated_at,cover_url,summary) VALUES(17,'作品','https://example.org/a',1,20,'https://example.org/c.jpg','简介'),(48,'已删除','https://example.org/deleted',0,1,'',''); DELETE FROM saved_media WHERE id=48")
  db.exec("INSERT INTO watch_history VALUES('https://example.org/a','作品','ep','第一集','main',42,100,0,30,'https://example.org/c.jpg')")
  db.exec("INSERT INTO app_settings VALUES('theme','dark')")
  return db
}
function migrate(db, failAt = -1) {
  db.exec('BEGIN')
  try {
    sql('private static void migrateIdentity').forEach((statement, index) => {
      db.exec(statement)
      if (index === failAt) throw new Error('模拟迁移中断')
    })
    for (const method of ['private static void createSavedMediaIndex', 'private static void createSavedMediaTitleIndex', 'private static void createHistorySortIndex']) {
      for (const statement of sql(method)) db.exec(statement)
    }
    db.exec("ALTER TABLE app_settings ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0")
    db.exec('COMMIT')
  } catch (failure) { db.exec('ROLLBACK'); throw failure }
}

test('真实 SQLite 执行原生 v7 到 v8 SQL：保留 id、资料、进度及自增序列，允许同 URL 双规则', () => {
  const db = oldDatabase()
  try {
    migrate(db)
    const saved = db.prepare('SELECT * FROM saved_media WHERE id=17').get()
    assert.equal(saved.title, '作品'); assert.equal(saved.favorite, 1); assert.equal(saved.source_key, '')
    assert.equal(saved.cover_url, 'https://example.org/c.jpg'); assert.equal(saved.summary, '简介')
    assert.equal(db.prepare('SELECT position_seconds FROM watch_history').get().position_seconds, 42)
    assert.equal(db.prepare('SELECT value FROM app_settings').get().value, 'dark')
    const insert = db.prepare("INSERT INTO saved_media(title,url,updated_at,source_key,source_context) VALUES('作品','https://example.org/a',40,?,?)")
    const first = insert.run('a'.repeat(64), '{"content":"a"}')
    insert.run('b'.repeat(64), '{"content":"b"}')
    assert.ok(Number(first.lastInsertRowid) > 48)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM saved_media').get().count, 3)
    assert.throws(() => insert.run('a'.repeat(64), '{}'), /UNIQUE/)
    const historyInsert = db.prepare("INSERT INTO watch_history(media_url,title,episode_id,episode_title,line_id,position_seconds,duration_seconds,updated_at,source_key,source_context) VALUES('https://example.org/a','作品','ep','第一集','main',?,100,40,?,?)")
    historyInsert.run(55, 'a'.repeat(64), '{}'); historyInsert.run(75, 'b'.repeat(64), '{}')
    assert.deepEqual(db.prepare('SELECT position_seconds FROM watch_history ORDER BY position_seconds').all().map(row => row.position_seconds), [42, 55, 75])
    assert.throws(() => historyInsert.run(1, 'a'.repeat(64), '{}'), /UNIQUE/)
    db.prepare("UPDATE saved_media SET source_key=?,source_context=? WHERE id=? AND source_key=''").run('c'.repeat(64), '{"content":"旧快照"}', 17)
    db.prepare("UPDATE saved_media SET source_key=?,source_context=? WHERE id=? AND source_key=''").run('d'.repeat(64), '{}', 17)
    assert.equal(db.prepare('SELECT source_key FROM saved_media WHERE id=17').get().source_key, 'c'.repeat(64))
  } finally { db.close() }
})

test('迁移中途故障完整回滚；恢复日志与资料原子提交，重启后日志仍可读且阻止覆盖', () => {
  const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'sanye-identity-'))
  const location = path.join(directory, 'catalog.db')
  let db = oldDatabase(location)
  try {
    assert.throws(() => migrate(db, 4), /模拟迁移中断/)
    assert.equal(db.prepare('SELECT id FROM saved_media').get().id, 17)
    assert.equal(db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name='saved_media_v7'").get().count, 0)
    migrate(db)
    db.exec('BEGIN')
    db.prepare('UPDATE saved_media SET updated_at=99 WHERE id=17').run()
    db.prepare('INSERT INTO restore_journal(id,payload) VALUES(1,?)').run('{"token":"恢复1","subscriptions":[]}')
    db.exec('COMMIT')
    db.close()
    db = new DatabaseSync(location)
    assert.equal(JSON.parse(db.prepare('SELECT payload FROM restore_journal').get().payload).token, '恢复1')
    assert.throws(() => db.prepare('INSERT INTO restore_journal(id,payload) VALUES(1,?)').run('{}'), /UNIQUE/)
    assert.equal(db.prepare('SELECT updated_at FROM saved_media WHERE id=17').get().updated_at, 99)
  } finally { db.close(); fs.rmSync(directory, { recursive: true }) }
})
