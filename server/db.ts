import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { normalizeEntry, type MonthEntry } from '../src/lib/finance.ts'
import { emptyState, normalizeState, type AppState } from '../src/lib/state.ts'

const require = createRequire(import.meta.url)
const wasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm')

function dataDir(): string {
  return (
    process.env.RAILWAY_VOLUME_MOUNT_PATH ||
    process.env.DATA_DIR ||
    path.join(process.cwd(), 'data')
  )
}

function dbPath(): string {
  return path.join(dataDir(), 'bookingroom.db')
}

let SQL: SqlJsStatic | null = null
let db: Database | null = null

function tableExists(database: Database, name: string): boolean {
  const stmt = database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
  )
  stmt.bind([name])
  const exists = stmt.step()
  stmt.free()
  return exists
}

function migrateLegacyEntries(database: Database): MonthEntry[] {
  if (!tableExists(database, 'month_entries')) return []
  const stmt = database.prepare(`
    SELECT
      year,
      month,
      gross,
      maintenance,
      cleaning,
      tax_percent AS taxPercent,
      tax_base AS taxBase,
      agent_percent AS agentPercent,
      agent_base AS agentBase
    FROM month_entries
    ORDER BY year, month
  `)
  const rows: MonthEntry[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject()
    const entry = normalizeEntry({
      year: Number(row.year),
      month: Number(row.month),
      gross: Number(row.gross),
      maintenance: Number(row.maintenance ?? 0),
      cleaning: Number(row.cleaning),
      taxPercent: Number(row.taxPercent),
      taxBase: row.taxBase,
      agentPercent: Number(row.agentPercent),
      agentBase: row.agentBase,
    })
    if (entry) rows.push(entry)
  }
  stmt.free()
  return rows
}

async function getDb(): Promise<Database> {
  if (db) return db
  SQL ??= await initSqlJs({ locateFile: () => wasmPath })
  fs.mkdirSync(dataDir(), { recursive: true })
  const file = dbPath()
  if (fs.existsSync(file)) {
    db = new SQL.Database(fs.readFileSync(file))
  } else {
    db = new SQL.Database()
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL
    );
  `)
  persist()
  return db
}

function persist(): void {
  if (!db) return
  fs.writeFileSync(dbPath(), Buffer.from(db.export()))
}

export async function getState(): Promise<AppState> {
  const database = await getDb()
  const stmt = database.prepare('SELECT payload FROM app_state WHERE id = 1')
  if (stmt.step()) {
    const payload = stmt.getAsObject().payload
    stmt.free()
    return normalizeState(JSON.parse(String(payload)))
  }
  stmt.free()

  const legacy = migrateLegacyEntries(database)
  if (legacy.length === 0) return emptyState()
  const migrated = normalizeState({ entries: legacy })
  await setState(migrated)
  return migrated
}

export async function setState(raw: unknown): Promise<AppState> {
  const database = await getDb()
  const state = normalizeState(raw)
  database.run('DELETE FROM app_state')
  database.run('INSERT INTO app_state (id, payload) VALUES (1, ?)', [JSON.stringify(state)])
  persist()
  return state
}
