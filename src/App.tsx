import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  MONTHS,
  buildYearRows,
  calcTotals,
  formatMoney,
  formatMoneyExact,
  newApartmentId,
  sumRows,
  rateBaseLabel,
  type Apartment,
  type MonthEntry,
  type RateBase,
} from './lib/finance'
import { loadState, saveState, stateToJson, parseImportedState } from './lib/storage'
import { fileSlug } from './lib/state'
import { downloadTextFile, entriesToCsv, entriesToXls } from './lib/exportFiles'

type MetricKey = 'gross' | 'maintenance' | 'cleaning' | 'tax' | 'agentFee' | 'owner'
type Tab = 'journal' | 'chart'

const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: 'gross', label: 'Поступления', color: '#2563eb' },
  { key: 'maintenance', label: 'Обслуживание', color: '#0f766e' },
  { key: 'cleaning', label: 'Клининг', color: '#64748b' },
  { key: 'tax', label: 'Налоги', color: '#7c3aed' },
  { key: 'agentFee', label: 'Комиссия агента', color: '#d97706' },
  { key: 'owner', label: 'К выплате', color: '#15803d' },
]

const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1

function parseAmount(value: string): number | null {
  const normalized = value.replace(/\s/g, '').replace(',', '.')
  if (normalized === '') return null
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return n
}

export default function App() {
  const [entries, setEntries] = useState<MonthEntry[]>([])
  const [apartments, setApartments] = useState<Apartment[]>([])
  const [activeId, setActiveId] = useState('')
  const [nameMode, setNameMode] = useState<'idle' | 'add' | 'rename'>('idle')
  const [nameDraft, setNameDraft] = useState('')
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const [tab, setTab] = useState<Tab>('journal')
  const [gross, setGross] = useState('')
  const [maintenance, setMaintenance] = useState('')
  const [cleaning, setCleaning] = useState('')
  const [taxPercent, setTaxPercent] = useState('')
  const [taxBase, setTaxBase] = useState<RateBase>('gross')
  const [agentPercent, setAgentPercent] = useState('')
  const [agentBase, setAgentBase] = useState<RateBase>('gross')
  const [error, setError] = useState('')
  const importRef = useRef<HTMLInputElement>(null)
  const [visible, setVisible] = useState<Record<MetricKey, boolean>>({
    gross: true,
    maintenance: false,
    cleaning: false,
    tax: false,
    agentFee: true,
    owner: true,
  })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const loaded = await loadState()
        if (cancelled) return
        setApartments(loaded.apartments)
        setActiveId(loaded.activeApartmentId)
        setEntries(loaded.entries)
        const found = loaded.entries.find(
          (e) =>
            e.apartmentId === loaded.activeApartmentId &&
            e.year === currentYear &&
            e.month === currentMonth,
        )
        if (found) {
          setGross(String(found.gross))
          setMaintenance(String(found.maintenance))
          setCleaning(String(found.cleaning))
          setTaxPercent(String(found.taxPercent))
          setTaxBase(found.taxBase)
          setAgentPercent(String(found.agentPercent))
          setAgentBase(found.agentBase)
        }
        setReady(true)
      } catch {
        if (!cancelled) setLoadError('Не удалось открыть базу данных')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    void saveState({
      apartments,
      activeApartmentId: activeId,
      entries,
    }).catch(() => {
      setError('Не удалось сохранить в базу')
    })
  }, [apartments, activeId, entries, ready])

  const currentApartment =
    apartments.find((item) => item.id === activeId) ?? apartments[0]
  const currentEntries = useMemo(
    () => entries.filter((item) => item.apartmentId === currentApartment?.id),
    [entries, currentApartment?.id],
  )

  const years = useMemo(() => {
    const fromData = currentEntries.map((e) => e.year)
    const set = new Set([currentYear, year, ...fromData, currentYear - 1, currentYear + 1])
    return [...set].sort((a, b) => b - a)
  }, [currentEntries, year])

  const rows = useMemo(
    () => buildYearRows(year, currentEntries),
    [year, currentEntries],
  )
  const totals = useMemo(() => sumRows(rows), [rows])
  const filledCount = rows.filter((r) => r.entry).length
  const deductions = totals.maintenance + totals.cleaning + totals.tax + totals.agentFee

  const live = useMemo(() => {
    const g = parseAmount(gross)
    const m = parseAmount(maintenance)
    const c = parseAmount(cleaning)
    const t = parseAmount(taxPercent)
    const p = parseAmount(agentPercent)
    if (g === null || m === null || c === null || t === null || p === null) return null
    return calcTotals({
      gross: g,
      maintenance: m,
      cleaning: c,
      taxPercent: t,
      taxBase,
      agentPercent: p,
      agentBase,
    })
  }, [gross, maintenance, cleaning, taxPercent, taxBase, agentPercent, agentBase])

  function loadMonth(nextYear: number, nextMonth: number) {
    const apartmentId = currentApartment?.id
    const found = entries.find(
      (e) => e.apartmentId === apartmentId && e.year === nextYear && e.month === nextMonth,
    )
    setYear(nextYear)
    setMonth(nextMonth)
    setError('')
    if (!found) {
      setGross('')
      setMaintenance('')
      setCleaning('')
      setTaxPercent('')
      setAgentPercent('')
      return
    }
    setGross(String(found.gross))
    setMaintenance(String(found.maintenance))
    setCleaning(String(found.cleaning))
    setTaxPercent(String(found.taxPercent))
    setTaxBase(found.taxBase)
    setAgentPercent(String(found.agentPercent))
    setAgentBase(found.agentBase)
  }

  function onSave(e: FormEvent) {
    e.preventDefault()
    if (!currentApartment) {
      setError('Сначала добавьте квартиру')
      return
    }
    const g = parseAmount(gross)
    const m = parseAmount(maintenance)
    const c = parseAmount(cleaning)
    const t = parseAmount(taxPercent)
    const p = parseAmount(agentPercent)

    if (g === null || m === null || c === null || t === null || p === null) {
      setError('Заполните все обязательные поля')
      return
    }
    if (g < 0 || m < 0 || c < 0 || t < 0 || p < 0) {
      setError('Суммы и проценты не могут быть отрицательными')
      return
    }
    if (t > 100) {
      setError('Налоговые отчисления не могут быть больше 100%')
      return
    }
    if (p > 100) {
      setError('Комиссия агента не может быть больше 100%')
      return
    }

    const next: MonthEntry = {
      apartmentId: currentApartment.id,
      year,
      month,
      gross: g,
      maintenance: m,
      cleaning: c,
      taxPercent: t,
      taxBase,
      agentPercent: p,
      agentBase,
    }

    setEntries((prev) => {
      const without = prev.filter(
        (item) =>
          !(
            item.apartmentId === currentApartment.id &&
            item.year === year &&
            item.month === month
          ),
      )
      return [...without, next].sort(
        (a, b) => a.apartmentId.localeCompare(b.apartmentId) || a.year - b.year || a.month - b.month,
      )
    })
    setError('')
  }

  function onDelete() {
    if (!currentApartment) return
    setEntries((prev) =>
      prev.filter(
        (item) =>
          !(
            item.apartmentId === currentApartment.id &&
            item.year === year &&
            item.month === month
          ),
      ),
    )
    setGross('')
    setMaintenance('')
    setCleaning('')
    setTaxPercent('')
    setAgentPercent('')
    setError('')
  }

  function toggleMetric(key: MetricKey) {
    setVisible((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      if (!Object.values(next).some(Boolean)) return prev
      return next
    })
  }

  const chartData = rows.map((row) => ({
    name: row.label.slice(0, 3),
    gross: row.entry ? row.gross : null,
    maintenance: row.entry ? row.maintenance : null,
    cleaning: row.entry ? row.cleaning : null,
    tax: row.entry ? row.tax : null,
    agentFee: row.entry ? row.agentFee : null,
    owner: row.entry ? row.owner : null,
  }))

  const existing = currentEntries.some((e) => e.year === year && e.month === month)

  function switchApartment(id: string) {
    setActiveId(id)
    setNameMode('idle')
    const found = entries.find(
      (e) => e.apartmentId === id && e.year === year && e.month === month,
    )
    setError('')
    if (!found) {
      setGross('')
      setMaintenance('')
      setCleaning('')
      setTaxPercent('')
      setAgentPercent('')
      return
    }
    setGross(String(found.gross))
    setMaintenance(String(found.maintenance))
    setCleaning(String(found.cleaning))
    setTaxPercent(String(found.taxPercent))
    setTaxBase(found.taxBase)
    setAgentPercent(String(found.agentPercent))
    setAgentBase(found.agentBase)
  }

  function submitApartmentName() {
    const name = nameDraft.trim()
    if (!name) {
      setError('Укажите название квартиры')
      return
    }
    if (nameMode === 'add') {
      const created = { id: newApartmentId(), name }
      setApartments((prev) => [...prev, created])
      switchApartment(created.id)
    }
    if (nameMode === 'rename' && currentApartment) {
      setApartments((prev) =>
        prev.map((item) => (item.id === currentApartment.id ? { ...item, name } : item)),
      )
    }
    setNameMode('idle')
    setNameDraft('')
    setError('')
  }

  function deleteApartment() {
    if (!currentApartment || apartments.length < 2) {
      setError('Должна остаться хотя бы одна квартира')
      return
    }
    const removedId = currentApartment.id
    const nextList = apartments.filter((item) => item.id !== removedId)
    setApartments(nextList)
    setEntries((prev) => prev.filter((item) => item.apartmentId !== removedId))
    switchApartment(nextList[0].id)
  }

  const filePrefix = `bookingroom-${fileSlug(currentApartment?.name ?? 'kvartira')}-${year}`

  function exportJson() {
    downloadTextFile(
      `${filePrefix}.json`,
      stateToJson({ apartments, activeApartmentId: activeId, entries }),
      'application/json',
    )
  }

  function exportCsv() {
    downloadTextFile(
      `${filePrefix}.csv`,
      entriesToCsv(currentEntries, currentApartment?.name ?? 'Квартира'),
      'text/csv;charset=utf-8',
    )
  }

  function exportXls() {
    downloadTextFile(
      `${filePrefix}.xls`,
      entriesToXls(currentEntries, currentApartment?.name ?? 'Квартира'),
      'application/vnd.ms-excel',
    )
  }

  function onImportFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = parseImportedState(String(reader.result ?? ''))
        setApartments(imported.apartments)
        setActiveId(imported.activeApartmentId)
        setEntries(imported.entries)
        const found = imported.entries.find(
          (item) =>
            item.apartmentId === imported.activeApartmentId &&
            item.year === year &&
            item.month === month,
        )
        if (found) {
          setGross(String(found.gross))
          setMaintenance(String(found.maintenance))
          setCleaning(String(found.cleaning))
          setTaxPercent(String(found.taxPercent))
          setTaxBase(found.taxBase)
          setAgentPercent(String(found.agentPercent))
          setAgentBase(found.agentBase)
        } else {
          setGross('')
          setMaintenance('')
          setCleaning('')
          setTaxPercent('')
          setAgentPercent('')
        }
        setError('')
      } catch {
        setError('Не удалось прочитать файл импорта')
      }
    }
    reader.readAsText(file)
  }

  if (loadError) {
    return (
      <div className="page">
        <h1>BookingRoom</h1>
        <p className="error">{loadError}</p>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="page">
        <h1>BookingRoom</h1>
        <p>Загрузка базы…</p>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>BookingRoom</h1>
          <p>
            Учёт аренды по нескольким квартирам. Журнал, график и CSV/Excel — по выбранному
            объекту; JSON сохраняет все квартиры сразу.
          </p>
        </div>
        <div className="top-actions">
          <button type="button" className="pill" onClick={exportCsv}>
            CSV
          </button>
          <button type="button" className="pill" onClick={exportXls}>
            Excel
          </button>
          <button type="button" className="pill" onClick={exportJson}>
            JSON
          </button>
          <button type="button" className="pill" onClick={() => importRef.current?.click()}>
            Импорт
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onImportFile(file)
              e.target.value = ''
            }}
          />
          <label className="pill">
            Год
            <select
              value={year}
              onChange={(e) => loadMonth(Number(e.target.value), month)}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {currentApartment ? (
        <section className="apartment-bar">
          <label>
            Квартира
            <select
              value={currentApartment.id}
              onChange={(e) => switchApartment(e.target.value)}
            >
              {apartments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {nameMode === 'idle' ? (
            <div className="apartment-actions">
              <button
                type="button"
                className="pill"
                onClick={() => {
                  setNameMode('add')
                  setNameDraft('')
                }}
              >
                + Квартира
              </button>
              <button
                type="button"
                className="pill"
                onClick={() => {
                  setNameMode('rename')
                  setNameDraft(currentApartment.name)
                }}
              >
                Переименовать
              </button>
              <button
                type="button"
                className="pill"
                onClick={deleteApartment}
                disabled={apartments.length < 2}
              >
                Удалить квартиру
              </button>
            </div>
          ) : (
            <form
              className="apartment-edit"
              onSubmit={(e) => {
                e.preventDefault()
                submitApartmentName()
              }}
            >
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Название квартиры"
                autoFocus
              />
              <button type="submit" className="btn btn-primary">
                Сохранить
              </button>
              <button
                type="button"
                className="pill"
                onClick={() => {
                  setNameMode('idle')
                  setNameDraft('')
                }}
              >
                Отмена
              </button>
            </form>
          )}
        </section>
      ) : null}

      <section className="summary">
        <article className="kpi">
          <span>Поступления</span>
          <strong>{formatMoney(totals.gross)}</strong>
          <small>Валовый доход за {year}, {currentApartment?.name}</small>
        </article>
        <article className="kpi">
          <span>Обслуживание</span>
          <strong>{formatMoney(totals.maintenance)}</strong>
          <small>Ремонт, расходники, мелкий сервис</small>
        </article>
        <article className="kpi">
          <span>Клининг</span>
          <strong>{formatMoney(totals.cleaning)}</strong>
          <small>Уборка объекта</small>
        </article>
        <article className="kpi">
          <span>Отчисления</span>
          <strong>{formatMoney(totals.tax + totals.agentFee)}</strong>
          <small>Налоги и комиссия агента</small>
        </article>
        <article className="kpi accent">
          <span>К выплате</span>
          <strong>{formatMoney(totals.owner)}</strong>
          <small>Чистая сумма собственнику</small>
        </article>
      </section>

      <nav className="tabs" aria-label="Разделы">
        <button
          type="button"
          className={tab === 'journal' ? 'active' : undefined}
          onClick={() => setTab('journal')}
        >
          Журнал
        </button>
        <button
          type="button"
          className={tab === 'chart' ? 'active' : undefined}
          onClick={() => setTab('chart')}
        >
          Динамика
        </button>
      </nav>

      <div className="note">
        За {year} по объекту <b>{currentApartment?.name}</b> учтено <b>{filledCount}</b> из 12
        месяцев. Удержания за год — <b>{formatMoney(deductions)}</b>, к выплате —{' '}
        <b>{formatMoney(totals.owner)}</b>.
      </div>

      {tab === 'journal' ? (
        <>
          <div className="layout">
            <form className="card ledger" onSubmit={onSave}>
              <div className="card-head">
                <div>
                  <h2>Запись месяца</h2>
                  <p>{currentApartment?.name}: обязательные поля и расчёт к выплате</p>
                </div>
              </div>
              <label>
                Месяц
                <select
                  value={month}
                  onChange={(e) => loadMonth(year, Number(e.target.value))}
                >
                  {MONTHS.map((label, i) => (
                    <option key={label} value={i + 1}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Поступления, ₽
                <input
                  inputMode="decimal"
                  value={gross}
                  onChange={(e) => setGross(e.target.value)}
                  required
                  placeholder="0"
                />
              </label>
              <label>
                Обслуживание, ₽
                <input
                  inputMode="decimal"
                  value={maintenance}
                  onChange={(e) => setMaintenance(e.target.value)}
                  required
                  placeholder="0"
                />
              </label>
              <label>
                Клининг, ₽
                <input
                  inputMode="decimal"
                  value={cleaning}
                  onChange={(e) => setCleaning(e.target.value)}
                  required
                  placeholder="0"
                />
              </label>
              <div className="field-block">
                <span>Комиссия агента</span>
                <RateToggle
                  value={agentBase}
                  onChange={setAgentBase}
                  label="База комиссии агента"
                />
                <label>
                  Ставка, %
                  <input
                    inputMode="decimal"
                    value={agentPercent}
                    onChange={(e) => setAgentPercent(e.target.value)}
                    required
                    placeholder="0"
                  />
                </label>
                <p className="tax-hint">
                  {agentBase === 'gross'
                    ? 'Процент считается от поступлений за месяц.'
                    : 'Чистый доход = поступления минус обслуживание и клининг.'}
                </p>
              </div>
              <div className="field-block">
                <span>Налоговые отчисления</span>
                <RateToggle
                  value={taxBase}
                  onChange={setTaxBase}
                  label="База налога"
                />
                <label>
                  Ставка, %
                  <input
                    inputMode="decimal"
                    value={taxPercent}
                    onChange={(e) => setTaxPercent(e.target.value)}
                    required
                    placeholder="0"
                  />
                </label>
                <p className="tax-hint">
                  {taxBase === 'gross'
                    ? 'Процент считается от поступлений за месяц.'
                    : 'Чистый доход = поступления минус обслуживание, клининг и комиссия агента.'}
                </p>
              </div>

              <div className="owner-field">
                <span>К выплате</span>
                <p>{live ? formatMoneyExact(live.owner) : '—'}</p>
                {live ? (
                  <small>
                    Налог {formatMoneyExact(live.tax)} {rateBaseLabel(taxBase)} · комиссия{' '}
                    {formatMoneyExact(live.agentFee)} {rateBaseLabel(agentBase)}
                  </small>
                ) : (
                  <small>Считается автоматически после заполнения полей</small>
                )}
              </div>

              {error ? <p className="error">{error}</p> : null}

              <div className="actions">
                <button type="submit" className="btn btn-primary">
                  {existing ? 'Обновить' : '+ Добавить'}
                </button>
                {existing ? (
                  <button type="button" className="btn ghost" onClick={onDelete}>
                    Удалить
                  </button>
                ) : null}
              </div>
            </form>

            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Динамика {year}</h2>
                  <p>Краткий график по заполненным месяцам</p>
                </div>
              </div>
              <div className="chips" role="group" aria-label="Показатели графика">
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    className={visible[m.key] ? 'chip pill on' : 'chip pill'}
                    style={{ '--chip': m.color } as CSSProperties}
                    onClick={() => toggleMetric(m.key)}
                    aria-pressed={visible[m.key]}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="chart-wrap">
                <YearChart data={chartData} visible={visible} />
              </div>
            </section>
          </div>

          <section className="card table-panel">
            <div className="table-toolbar">
              <div className="card-head" style={{ marginBottom: 0 }}>
                <div>
                  <h2>Разбивка по месяцам</h2>
                  <p>{filledCount ? `Заполнено: ${filledCount}` : 'Пока нет записей за этот год'}</p>
                </div>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Месяц</th>
                    <th>Статус</th>
                    <th>Поступления</th>
                    <th>Обслуживание</th>
                    <th>Клининг</th>
                    <th>Налоги, %</th>
                    <th>Налоги, ₽</th>
                    <th>Комиссия агента, %</th>
                    <th>Комиссия агента, ₽</th>
                    <th>К выплате</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.month}
                      className={row.month === month ? 'active' : undefined}
                      onClick={() => loadMonth(year, row.month)}
                    >
                      <td className="month-cell">{row.label}</td>
                      <td>
                        <span className={row.entry ? 'status ok' : 'status off'}>
                          {row.entry ? 'Учтено' : 'Нет данных'}
                        </span>
                      </td>
                      {row.entry ? (
                        <>
                          <td>{formatMoney(row.gross)}</td>
                          <td>{formatMoney(row.maintenance)}</td>
                          <td>{formatMoney(row.cleaning)}</td>
                          <td>
                            {row.entry.taxPercent}%
                            <span className="cell-sub">{rateBaseLabel(row.entry.taxBase)}</span>
                          </td>
                          <td>{formatMoney(row.tax)}</td>
                          <td>
                            {row.entry.agentPercent}%
                            <span className="cell-sub">{rateBaseLabel(row.entry.agentBase)}</span>
                          </td>
                          <td>{formatMoney(row.agentFee)}</td>
                          <td className="owner-cell">{formatMoney(row.owner)}</td>
                        </>
                      ) : (
                        <td colSpan={8} className="empty">
                          Нажмите, чтобы добавить запись
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th>Итого</th>
                    <th></th>
                    <th>{formatMoney(totals.gross)}</th>
                    <th>{formatMoney(totals.maintenance)}</th>
                    <th>{formatMoney(totals.cleaning)}</th>
                    <th></th>
                    <th>{formatMoney(totals.tax)}</th>
                    <th></th>
                    <th>{formatMoney(totals.agentFee)}</th>
                    <th className="owner-cell">{formatMoney(totals.owner)}</th>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      ) : (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>График за {year}</h2>
              <p>Мультивыбор показателей: на графике только заполненные месяцы</p>
            </div>
          </div>
          <div className="chips" role="group" aria-label="Показатели графика">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                className={visible[m.key] ? 'chip pill on' : 'chip pill'}
                onClick={() => toggleMetric(m.key)}
                aria-pressed={visible[m.key]}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="chart-wrap" style={{ height: 420 }}>
            <YearChart data={chartData} visible={visible} />
          </div>
        </section>
      )}
    </div>
  )
}

function RateToggle({
  value,
  onChange,
  label,
}: {
  value: RateBase
  onChange: (next: RateBase) => void
  label: string
}) {
  return (
    <div className="toggle" role="group" aria-label={label}>
      <button
        type="button"
        className={value === 'gross' ? 'active' : undefined}
        onClick={() => onChange('gross')}
        aria-pressed={value === 'gross'}
      >
        От поступлений
      </button>
      <button
        type="button"
        className={value === 'net' ? 'active' : undefined}
        onClick={() => onChange('net')}
        aria-pressed={value === 'net'}
      >
        От чистого дохода
      </button>
    </div>
  )
}

type ChartPoint = {
  name: string
  gross: number | null
  maintenance: number | null
  cleaning: number | null
  tax: number | null
  agentFee: number | null
  owner: number | null
}

function YearChart({
  data,
  visible,
}: {
  data: ChartPoint[]
  visible: Record<MetricKey, boolean>
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 6" />
        <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 12 }} />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 12 }}
          tickFormatter={(v: number) =>
            new Intl.NumberFormat('ru-RU', { notation: 'compact' }).format(v)
          }
        />
        <Tooltip
          formatter={(value, name) => [
            typeof value === 'number' ? formatMoneyExact(value) : '—',
            METRICS.find((m) => m.key === name)?.label ?? String(name),
          ]}
        />
        <Legend formatter={(value) => METRICS.find((m) => m.key === value)?.label ?? value} />
        {METRICS.filter((m) => visible[m.key]).map((m) => (
          <Line
            key={m.key}
            type="monotone"
            dataKey={m.key}
            name={m.key}
            stroke={m.color}
            strokeWidth={2.2}
            dot={{ r: 3 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
