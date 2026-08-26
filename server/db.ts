import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { normalizeEntry, type MonthEntry } from '../src/lib/finance.ts'

const require = createRequire(import.meta.url)
const wasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm')
const dataDir = path.join(process.cwd(), 'data')
const dbPath = path.join(dataDir, 'bookingroom.db')

fs.mkdirSync(dataDir, { recursive: true })

let SQL: SqlJsStatic | null = null
let db: Database | null = null

async function getDb(): Promise<Database> {
  if (db) return db
  SQL ??= await initSqlJs({ locateFile: () => wasmPath })
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath))
  } else {
    db = new SQL.Database()
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS month_entries (
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      gross REAL NOT NULL,
      maintenance REAL NOT NULL DEFAULT 0,
      cleaning REAL NOT NULL,
      tax_percent REAL NOT NULL,
      tax_base TEXT NOT NULL CHECK (tax_base IN ('gross', 'net')),
      agent_percent REAL NOT NULL,
      agent_base TEXT NOT NULL CHECK (agent_base IN ('gross', 'net')),
      PRIMARY KEY (year, month)
    );
  `)
  ensureColumn(db, 'maintenance')
  persist()
  return db
}

function persist(): void {
  if (!db) return
  fs.writeFileSync(dbPath, Buffer.from(db.export()))
}

function ensureColumn(database: Database, name: string): void {
  const stmt = database.prepare('PRAGMA table_info(month_entries)')
  let exists = false
  while (stmt.step()) {
    const row = stmt.getAsObject()
    if (row.name === name) {
      exists = true
      break
    }
  }
  stmt.free()
  if (!exists) {
    database.run(`ALTER TABLE month_entries ADD COLUMN ${name} REAL NOT NULL DEFAULT 0`)
  }
}

export async function getEntries(): Promise<MonthEntry[]> {
  const database = await getDb()
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

export async function setEntries(raw: unknown): Promise<MonthEntry[]> {
  const database = await getDb()
  const list = Array.isArray(raw) ? raw : []
  const entries = list.map(normalizeEntry).filter((e): e is MonthEntry => e !== null)

  database.run('DELETE FROM month_entries')
  const stmt = database.prepare(`
    INSERT INTO month_entries (
      year, month, gross, maintenance, cleaning, tax_percent, tax_base, agent_percent, agent_base
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const entry of entries) {
    stmt.run([
      entry.year,
      entry.month,
      entry.gross,
      entry.maintenance,
      entry.cleaning,
      entry.taxPercent,
      entry.taxBase,
      entry.agentPercent,
      entry.agentBase,
    ])
  }
  stmt.free()
  persist()
  return entries
}
