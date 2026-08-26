import {
  DEFAULT_APARTMENT,
  normalizeEntry,
  type Apartment,
  type MonthEntry,
} from './finance.ts'

export type AppState = {
  apartments: Apartment[]
  activeApartmentId: string
  entries: MonthEntry[]
}

export function emptyState(): AppState {
  return {
    apartments: [DEFAULT_APARTMENT],
    activeApartmentId: DEFAULT_APARTMENT.id,
    entries: [],
  }
}

export function normalizeApartment(value: unknown): Apartment | null {
  if (!value || typeof value !== 'object') return null
  const a = value as Record<string, unknown>
  if (typeof a.id !== 'string' || !a.id.trim()) return null
  if (typeof a.name !== 'string' || !a.name.trim()) return null
  return { id: a.id, name: a.name.trim() }
}

export function normalizeState(raw: unknown): AppState {
  if (Array.isArray(raw)) {
    const entries = raw.map(normalizeEntry).filter((e): e is MonthEntry => e !== null)
    return {
      apartments: [DEFAULT_APARTMENT],
      activeApartmentId: DEFAULT_APARTMENT.id,
      entries,
    }
  }

  if (!raw || typeof raw !== 'object') return emptyState()
  const data = raw as Record<string, unknown>
  const entries = Array.isArray(data.entries)
    ? data.entries.map(normalizeEntry).filter((e): e is MonthEntry => e !== null)
    : []
  const apartments = Array.isArray(data.apartments)
    ? data.apartments.map(normalizeApartment).filter((a): a is Apartment => a !== null)
    : []

  const list = apartments.length > 0 ? apartments : [DEFAULT_APARTMENT]
  const ids = new Set(list.map((a) => a.id))
  const active =
    typeof data.activeApartmentId === 'string' && ids.has(data.activeApartmentId)
      ? data.activeApartmentId
      : list[0].id

  return {
    apartments: list,
    activeApartmentId: active,
    entries: entries.map((entry) =>
      ids.has(entry.apartmentId) ? entry : { ...entry, apartmentId: list[0].id },
    ),
  }
}

export function fileSlug(name: string): string {
  const slug = name.trim().replaceAll(/\s+/g, '-').replaceAll(/[\\/:*?"<>|]/g, '')
  return slug || 'kvartira'
}
