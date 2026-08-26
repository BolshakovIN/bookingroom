import { normalizeState, type AppState } from './state'

const LOCAL_KEY = 'bookingroom.finance.v1'
const IDB_NAME = 'bookingroom'
const IDB_STORE = 'kv'
const IDB_STATE = 'state'
const IDB_ENTRIES = 'entries'

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

function idbGet(key: string): Promise<unknown> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly')
        const request = tx.objectStore(IDB_STORE).get(key)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

async function writeIdb(state: AppState): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.objectStore(IDB_STORE).put(state, IDB_STATE)
  })
}

function readLocalState(): AppState | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return null
    return normalizeState(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

async function readServerState(): Promise<AppState | null> {
  if (!isPrivateHost()) return null
  try {
    const response = await fetch('/api/state')
    if (!response.ok) return null
    return normalizeState(await response.json())
  } catch {
    return null
  }
}

export async function loadState(): Promise<AppState> {
  const fromState = await idbGet(IDB_STATE)
  if (fromState) return normalizeState(fromState)

  const fromEntries = await idbGet(IDB_ENTRIES)
  if (fromEntries) return normalizeState(fromEntries)

  const local = readLocalState()
  if (local && (local.entries.length > 0 || local.apartments.length > 1)) {
    await writeIdb(local)
    return local
  }

  const remote = await readServerState()
  if (remote && (remote.entries.length > 0 || remote.apartments.length > 1)) {
    await writeIdb(remote)
    return remote
  }

  return local ?? remote ?? normalizeState(null)
}

export async function saveState(state: AppState): Promise<void> {
  const normalized = normalizeState(state)
  await writeIdb(normalized)
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(normalized))
  } catch {
    // quota
  }
  if (!isPrivateHost()) return
  try {
    await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalized),
    })
  } catch {
    // local sqlite is optional
  }
}

export function stateToJson(state: AppState): string {
  return JSON.stringify(normalizeState(state), null, 2)
}

export function parseImportedState(text: string): AppState {
  return normalizeState(JSON.parse(text) as unknown)
}

export type { AppState }
