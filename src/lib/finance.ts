export type RateBase = 'gross' | 'net'

export function isRateBase(value: unknown): value is RateBase {
  return value === 'gross' || value === 'net'
}

export function normalizeEntry(value: unknown): MonthEntry | null {
  if (!value || typeof value !== 'object') return null
  const e = value as Record<string, unknown>
  if (
    typeof e.year !== 'number' ||
    typeof e.month !== 'number' ||
    typeof e.gross !== 'number' ||
    typeof e.cleaning !== 'number' ||
    typeof e.agentPercent !== 'number'
  ) {
    return null
  }

  const maintenance = typeof e.maintenance === 'number' ? e.maintenance : 0
  const agentBase: RateBase = isRateBase(e.agentBase) ? e.agentBase : 'gross'

  if (typeof e.taxPercent === 'number' && isRateBase(e.taxBase)) {
    return {
      year: e.year,
      month: e.month,
      gross: e.gross,
      maintenance,
      cleaning: e.cleaning,
      taxPercent: e.taxPercent,
      taxBase: e.taxBase,
      agentPercent: e.agentPercent,
      agentBase,
    }
  }

  if (typeof e.tax === 'number') {
    const taxPercent = e.gross > 0 ? roundMoney((e.tax / e.gross) * 100) : 0
    return {
      year: e.year,
      month: e.month,
      gross: e.gross,
      maintenance,
      cleaning: e.cleaning,
      taxPercent,
      taxBase: 'gross',
      agentPercent: e.agentPercent,
      agentBase,
    }
  }

  return null
}

export type MonthEntry = {
  year: number
  month: number
  gross: number
  maintenance: number
  cleaning: number
  taxPercent: number
  taxBase: RateBase
  agentPercent: number
  agentBase: RateBase
}

export type MonthTotals = {
  agentFee: number
  tax: number
  taxBaseAmount: number
  agentBaseAmount: number
  owner: number
}

export const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function rateBaseLabel(base: RateBase): string {
  return base === 'gross' ? 'от поступлений' : 'от чистого дохода'
}

export function serviceCosts(entry: Pick<MonthEntry, 'maintenance' | 'cleaning'>): number {
  return roundMoney(entry.maintenance + entry.cleaning)
}

export function calcTotals(
  entry: Pick<
    MonthEntry,
    | 'gross'
    | 'maintenance'
    | 'cleaning'
    | 'taxPercent'
    | 'taxBase'
    | 'agentPercent'
    | 'agentBase'
  >,
): MonthTotals {
  const costs = serviceCosts(entry)
  const afterCosts = Math.max(0, roundMoney(entry.gross - costs))
  const agentBaseAmount = entry.agentBase === 'gross' ? entry.gross : afterCosts
  const agentFee = roundMoney((agentBaseAmount * entry.agentPercent) / 100)
  const taxBaseAmount =
    entry.taxBase === 'gross'
      ? entry.gross
      : Math.max(0, roundMoney(entry.gross - costs - agentFee))
  const tax = roundMoney((taxBaseAmount * entry.taxPercent) / 100)
  const owner = roundMoney(entry.gross - costs - agentFee - tax)
  return { agentFee, tax, taxBaseAmount, agentBaseAmount, owner }
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatMoneyExact(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export type YearRow = {
  month: number
  label: string
  entry: MonthEntry | null
  gross: number
  maintenance: number
  cleaning: number
  tax: number
  agentFee: number
  owner: number
}

export function buildYearRows(year: number, entries: MonthEntry[]): YearRow[] {
  const byMonth = new Map(
    entries.filter((e) => e.year === year).map((e) => [e.month, e]),
  )

  return MONTHS.map((label, index) => {
    const month = index + 1
    const entry = byMonth.get(month) ?? null
    if (!entry) {
      return {
        month,
        label,
        entry: null,
        gross: 0,
        maintenance: 0,
        cleaning: 0,
        tax: 0,
        agentFee: 0,
        owner: 0,
      }
    }
    const totals = calcTotals(entry)
    return {
      month,
      label,
      entry,
      gross: entry.gross,
      maintenance: entry.maintenance,
      cleaning: entry.cleaning,
      tax: totals.tax,
      agentFee: totals.agentFee,
      owner: totals.owner,
    }
  })
}

export function sumRows(rows: YearRow[]) {
  return rows.reduce(
    (acc, row) => ({
      gross: acc.gross + row.gross,
      maintenance: acc.maintenance + row.maintenance,
      cleaning: acc.cleaning + row.cleaning,
      tax: acc.tax + row.tax,
      agentFee: acc.agentFee + row.agentFee,
      owner: acc.owner + row.owner,
    }),
    { gross: 0, maintenance: 0, cleaning: 0, tax: 0, agentFee: 0, owner: 0 },
  )
}
