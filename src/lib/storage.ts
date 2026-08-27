import { normalizeState, type AppState } from './state'

const LOCAL_KEY = 'bookingroom.finance.v1'
const IDB_NAME = 'bookingroom'
const IDB_STORE = 'kv'
const IDB_STATE = 'state'
const IDB_ENTRIES = 'entries'
const AUTH_KEY = 'bookingroom.auth'

export class AuthRequiredError extends Error {
  constructor() {
    super('Нужен пароль')
    this.name = 'AuthRequiredError'
  }
}

export type SyncMode = 'remote' | 'local'

let syncMode: SyncMode = 'local'

export function getSyncMode(): SyncMode {
  return syncMode
}

export function getAuthPassword(): string {
  try {
    return sessionStorage.getItem(AUTH_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setAuthPassword(value: string): void {
  try {
    if (value) sessionStorage.setItem(AUTH_KEY, value)
    else sessionStorage.removeItem(AUTH_KEY)
  } catch {
    // private mode
  }
}

function authHeaders(): HeadersInit {
  const password = getAuthPassword()
  return password ? { 'X-Booking-Key': password } : {}
}

function isPopulated(state: AppState): boolean {
  return state.entries.length > 0 || state.apartments.length > 1
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

async function probeRemote(): Promise<boolean> {
  try {
    const response = await fetch('/api/health')
    if (!response.ok) return false
    const payload = (await response.json()) as { ok?: unknown }
    return payload.ok === true
  } catch {
    return false
  }
}

async function readLocalFallback(): Promise<AppState> {
  const fromState = await idbGet(IDB_STATE)
  if (fromState) return normalizeState(fromState)

  const fromEntries = await idbGet(IDB_ENTRIES)
  if (fromEntries) return normalizeState(fromEntries)

  return readLocalState() ?? normalizeState(null)
}

async function cacheLocal(state: AppState): Promise<void> {
  await writeIdb(state)
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state))
  } catch {
    // quota
  }
}

export async function loadState(): Promise<AppState> {
  const remote = await probeRemote()
  syncMode = remote ? 'remote' : 'local'

  if (remote) {
    const response = await fetch('/api/state', { headers: authHeaders() })
    if (response.status === 401) throw new AuthRequiredError()
    if (!response.ok) throw new Error('Не удалось открыть общую базу')
    const serverState = normalizeState(await response.json())
    const local = await readLocalFallback()
    if (!isPopulated(serverState) && isPopulated(local)) {
      await putRemote(local)
      await cacheLocal(local)
      return local
    }
    await cacheLocal(serverState)
    return serverState
  }

  return readLocalFallback()
}

async function putRemote(state: AppState): Promise<void> {
  const response = await fetch('/api/state', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(state),
  })
  if (response.status === 401) throw new AuthRequiredError()
  if (!response.ok) throw new Error('Не удалось сохранить в общую базу')
}

export async function saveState(state: AppState): Promise<void> {
  const normalized = normalizeState(state)
  await cacheLocal(normalized)
  if (syncMode !== 'remote') return
  await putRemote(normalized)
}

export function stateToJson(state: AppState): string {
  return JSON.stringify(normalizeState(state), null, 2)
}

export function parseImportedState(text: string): AppState {
  return normalizeState(JSON.parse(text) as unknown)
}

export type { AppState }
