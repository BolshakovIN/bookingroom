import type { MonthEntry } from './finance'
import { normalizeEntry } from './finance'

const LOCAL_KEY = 'bookingroom.finance.v1'
const IDB_NAME = 'bookingroom'
const IDB_STORE = 'kv'
const IDB_KEY = 'entries'

function isPrivateHost(): boolean {
  const host = window.location.hostname
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  )
}

function parseList(value: unknown): MonthEntry[] {
  if (!Array.isArray(value)) return []
  return value.map(normalizeEntry).filter((e): e is MonthEntry => e !== null)
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readIdb(): Promise<MonthEntry[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const request = tx.objectStore(IDB_STORE).get(IDB_KEY)
    request.onsuccess = () => resolve(parseList(request.result))
    request.onerror = () => reject(request.error)
  })
}

async function writeIdb(entries: MonthEntry[]): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.objectStore(IDB_STORE).put(entries, IDB_KEY)
  })
}

function readLocalEntries(): MonthEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return []
    return parseList(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}

async function readServerEntries(): Promise<MonthEntry[]> {
  if (!isPrivateHost()) return []
  try {
    const response = await fetch('/api/entries')
    if (!response.ok) return []
    const payload = (await response.json()) as { entries?: unknown }
    return parseList(payload.entries)
  } catch {
    return []
  }
}

export async function loadEntries(): Promise<MonthEntry[]> {
  const idb = await readIdb()
  if (idb.length > 0) return idb

  const local = readLocalEntries()
  if (local.length > 0) {
    await writeIdb(local)
    return local
  }

  const remote = await readServerEntries()
  if (remote.length > 0) {
    await writeIdb(remote)
    return remote
  }

  return []
}

export async function saveEntries(entries: MonthEntry[]): Promise<void> {
  await writeIdb(entries)
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(entries))
  } catch {
    // quota
  }
}

export function entriesToJson(entries: MonthEntry[]): string {
  return JSON.stringify(entries, null, 2)
}

export function parseImportedEntries(text: string): MonthEntry[] {
  return parseList(JSON.parse(text) as unknown)
}
