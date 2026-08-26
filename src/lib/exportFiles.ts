import {
  MONTHS,
  calcTotals,
  rateBaseLabel,
  type MonthEntry,
} from './finance'

export type ExportRow = {
  year: number
  month: string
  gross: number
  maintenance: number
  cleaning: number
  agentPercent: number
  agentBase: string
  agentFee: number
  taxPercent: number
  taxBase: string
  tax: number
  owner: number
}

const HEADERS = [
  'Год',
  'Месяц',
  'Поступления',
  'Обслуживание',
  'Клининг',
  'Комиссия агента, %',
  'База комиссии',
  'Комиссия агента, ₽',
  'Налог, %',
  'База налога',
  'Налог, ₽',
  'К выплате',
] as const

export function toExportRows(entries: MonthEntry[]): ExportRow[] {
  return [...entries]
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((entry) => {
      const totals = calcTotals(entry)
      return {
        year: entry.year,
        month: MONTHS[entry.month - 1] ?? String(entry.month),
        gross: entry.gross,
        maintenance: entry.maintenance,
        cleaning: entry.cleaning,
        agentPercent: entry.agentPercent,
        agentBase: rateBaseLabel(entry.agentBase),
        agentFee: totals.agentFee,
        taxPercent: entry.taxPercent,
        taxBase: rateBaseLabel(entry.taxBase),
        tax: totals.tax,
        owner: totals.owner,
      }
    })
}

function rowValues(row: ExportRow): (string | number)[] {
  return [
    row.year,
    row.month,
    row.gross,
    row.maintenance,
    row.cleaning,
    row.agentPercent,
    row.agentBase,
    row.agentFee,
    row.taxPercent,
    row.taxBase,
    row.tax,
    row.owner,
  ]
}

function csvCell(value: string | number): string {
  const text = String(value).replaceAll('"', '""')
  return `"${text}"`
}

export function entriesToCsv(entries: MonthEntry[]): string {
  const lines = [
    HEADERS.map(csvCell).join(';'),
    ...toExportRows(entries).map((row) => rowValues(row).map(csvCell).join(';')),
  ]
  return `\uFEFF${lines.join('\r\n')}`
}

function xmlEscape(value: string | number): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function xlsCell(value: string | number): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`
  }
  return `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`
}

export function entriesToXls(entries: MonthEntry[]): string {
  const header = `<Row>${HEADERS.map((h) => xlsCell(h)).join('')}</Row>`
  const body = toExportRows(entries)
    .map((row) => `<Row>${rowValues(row).map(xlsCell).join('')}</Row>`)
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Учёт">
  <Table>${header}${body}</Table>
 </Worksheet>
</Workbook>`
}

export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
