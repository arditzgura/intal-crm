import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Search, X, Eye, Pencil, Trash2, MapPin, BarChart3, Calculator, Download, Printer } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { watchClients } from '../../services/clientService'
import { queryInvoices, queryAuditLog, deleteDraft, invoiceIdsForItems, invoicesByIds, invoiceSummary, invoiceProfit, paymentsOfInvoice, unmarkPaid, PAGE } from '../../services/invoiceService'
import { watchItems, watchItemCosts } from '../../services/itemService'
import { canSeeCost } from '../../config/roles'
import { matchesSearch } from '../../utils/text'
import { downloadCsv } from '../../utils/csv'
import { addLedgerEntry, rateFor } from '../../services/ledgerService'
import { PAYMENT_METHODS } from '../../config/ledger'
import { useSettings } from '../../hooks/useSettings'
import { STATUS_LABELS } from '../../services/invoiceChain'
import { errorMessage } from '../../services/authService'
import { formatMoney } from '../../utils/money'
import { formatDate, formatDateTime, fromInputDate, millis, periodLabel, periodRange, toInputDate } from '../../utils/date'
import { StatusBadge, ACTION_LABELS, CancelModal } from './InvoiceViewPage'
import Modal from '../../components/Modal'
import InvoicePreview from '../../components/invoice/InvoicePreview'
import PeriodReport from './PeriodReport'
import { useSort, SortTh } from '../../hooks/useSort'
import PeriodFilter, { defaultPeriod } from '../../components/PeriodFilter'


export default function HistoryPage() {
  const { perms } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('skeda') === 'veprimet' && perms.has('sheh_logun') ? 'veprimet' : 'faturat'
  return (
    <div>
      <h1 className="page-title">Historiku</h1>
      {perms.has('sheh_logun') && (
        <div className="tabs" role="tablist">
          <button role="tab" className={`tab ${tab === 'faturat' ? 'active' : ''}`} onClick={() => setParams({})}>Faturat</button>
          <button role="tab" className={`tab ${tab === 'veprimet' ? 'active' : ''}`} onClick={() => setParams({ skeda: 'veprimet' })}>Veprimet në sistem</button>
        </div>
      )}
      {tab === 'faturat' ? <InvoiceList /> : <AuditList />}
    </div>
  )
}

/** Lista e faturave: periudha, kërkimi (nr. / klient / artikull), statusi; faqe nga serveri. */
export function InvoiceList({ fixedClientId, period: extPeriod, setPeriod: extSetPeriod }) {
  const navigate = useNavigate()
  const { perms, profile } = useAuth()
  const [modal, setModal] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey((k) => k + 1)
  const { data: clients } = useLive(watchClients, [], { enabled: !fixedClientId, initial: [] })
  const { data: items } = useLive(watchItems, [], { initial: [] })

  const [ownPeriod, setOwnPeriod] = useState(defaultPeriod)
  const period = extPeriod ?? ownPeriod
  const setPeriod = extSetPeriod ?? setOwnPeriod
  const [statusi, setStatusi] = useState('')
  const [city, setCity] = useState('')
  const [qText, setQText] = useState('')
  const [q, setQ] = useState('')
  const [pages, setPages] = useState([null])
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [report, setReport] = useState(false)
  const [preview, setPreview] = useState(null)

  const range = useMemo(() => periodRange(period), [period])
  const label = periodLabel(period)
  const target = useMemo(() => resolveSearch(q, fixedClientId ? [] : clients, items), [q, clients, items, fixedClientId])
  const cities = useMemo(() => groupCities(clients), [clients])
  const baseFilters = useMemo(
    () => ({
      clientId: fixedClientId || undefined,
      statusi: statusi || undefined,
      from: range.from ?? undefined,
      to: range.to ?? undefined,
      cityIds: !fixedClientId && city ? cities.find((c) => c.key === city)?.ids ?? [] : undefined,
    }),
    [fixedClientId, statusi, range, city, cities],
  )

  // Kërkimi aplikohet pasi ndalet shkrimi
  useEffect(() => {
    const t = setTimeout(() => setQ(qText.trim()), 400)
    return () => clearTimeout(t)
  }, [qText])
  // Filtër i ri → faqja e parë
  useEffect(() => {
    setPages([null])
    setPage(0)
  }, [baseFilters, target])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetchPage(target, baseFilters, page, pages[page])
      .then((res) => {
        if (cancelled) return
        setRows(res.rows)
        setMore(res.more)
        setPages((p) => {
          const next = [...p]
          next[page + 1] = res.cursor
          return next
        })
      })
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, baseFilters, page, reloadKey])

  async function onDeleteDraft(r) {
    if (!window.confirm('Të fshihet drafti?')) return
    try {
      await deleteDraft(r.id, profile?.emri)
      reload()
    } catch (err) {
      setError(err.code ? errorMessage(err) : err.message)
    }
  }

  const s = useSort(rows, {
    nr: (r) => r.numri,
    data: (r) => r.data,
    klienti: (r) => r.klient?.emri,
    vlera: (r) => r.totali,
    arketuar: (r) => (r.statusi === 'draft' ? null : r.paguar),
    detyrimi: (r) => (r.statusi === 'pa_paguar' ? r.mbetur : r.statusi === 'pasuar' ? r.gjendjaRe : r.statusi === 'e_paguar' ? 0 : null),
    statusi: (r) => STATUS_LABELS[r.statusi],
  })
  const totals = {}
  for (const r of rows.filter((x) => x.statusi !== 'anuluar' && x.statusi !== 'draft')) totals[r.monedha] = (totals[r.monedha] ?? 0) + r.totali

  // Raporti zë vendin e listës (jo dritare mbi të); "Kthehu" rikthen historikun.
  if (report) return <PeriodReport initialPeriod={period} onClose={() => setReport(false)} />

  return (
    <>
      <div className="card history-filters">
        {!extPeriod && <PeriodFilter period={period} setPeriod={setPeriod} />}
        <div className="search-row">
          <div className="search-box">
            <Search size={18} />
            <input placeholder={fixedClientId ? 'Kërko nr. fature ose artikull…' : 'Kërko nr. fature, klient ose artikull…'} value={qText} onChange={(e) => setQText(e.target.value)} />
            {qText && <button type="button" className="icon-btn" onClick={() => setQText('')} aria-label="Pastro"><X size={16} /></button>}
          </div>
          <select className="status-select" value={statusi} onChange={(e) => setStatusi(e.target.value)}>
            <option value="">Të gjitha statuset</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {!fixedClientId && (
            <select className="status-select" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">Të gjithë qytetet</option>
              {cities.map((c) => <option key={c.key} value={c.key}>{c.label} ({c.ids.length})</option>)}
            </select>
          )}
          <button type="button" className="btn report-btn" onClick={() => setReport(true)}><BarChart3 size={16} /> Raport</button>
        </div>
        {target.type === 'clients' && <div className="small muted">Klientët: {target.names.join(', ')}{target.more ? ' …' : ''}</div>}
        {target.type === 'items' && <div className="small muted">Faturat me artikujt: {target.names.join(', ')}{target.more ? ' …' : ''}</div>}
        {target.type === 'empty' && <div className="small muted">Asnjë faturë, klient ose artikull nuk përputhet me "{q}".</div>}
      </div>

      {!fixedClientId && <SummaryBar range={range} label={label} items={items} reloadKey={reloadKey} />}
      {error && <div className="alert error">{error}</div>}

      {preview && <InvoicePreview invoice={preview} onClose={() => setPreview(null)} />}

      <div className="card no-pad">
        {s.sort && more && <div className="sort-hint">Renditja vlen për faturat e kësaj faqeje. Përdorni filtrat për të ngushtuar listën.</div>}
        <div className="table-wrap">
          <table className="table clickable-rows history-table">
            <thead>
              <tr>
                <SortTh s={s} k="nr">Nr.</SortTh>
                <SortTh s={s} k="data">Data</SortTh>
                {!fixedClientId && <SortTh s={s} k="klienti">Klienti &amp; qyteti</SortTh>}
                <SortTh s={s} k="vlera" className="num">Vlera e faturës</SortTh>
                <SortTh s={s} k="arketuar" className="num">Arkëtuar</SortTh>
                <SortTh s={s} k="detyrimi" className="num">Detyrimi</SortTh>
                <th className="check-col" title="E paguar" />
                <SortTh s={s} k="statusi">Statusi</SortTh>
                <th className="num">Veprime</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="muted">Duke u ngarkuar…</td></tr>}
              {!loading && !rows.length && <tr><td colSpan={9} className="muted">Asnjë faturë.</td></tr>}
              {!loading && s.sorted.map((r) => {
                const isDraft = r.statusi === 'draft'
                const open = () => (isDraft ? navigate(`/fature-e-re?draft=${r.id}`) : setPreview(r))
                return (
                  <tr key={r.id} onClick={open} className={r.statusi === 'anuluar' ? 'archived' : ''}>
                    <td className="mono">
                      <b>{r.numriTekst ? `#${r.numriTekst}` : '—'}</b>
                      {r.numriVjeter && <div className="small muted">vjetër: {r.numriVjeter}</div>}
                    </td>
                    <td>{formatDate(r.data)}</td>
                    {!fixedClientId && (
                      <td>
                        <Link to={`/kliente/${r.clientId}`} className="client-link" onClick={(e) => e.stopPropagation()}>{r.klient?.emri}</Link>
                        {r.klient?.qyteti && <div className="small muted city"><MapPin size={11} /> {r.klient.qyteti}</div>}
                      </td>
                    )}
                    <td className="num"><b>{formatMoney(r.totali, r.monedha)}</b></td>
                    <td className="num pos">{isDraft ? '' : formatMoney(r.paguar, r.monedha)}</td>
                    <td className="num"><Debt r={r} /></td>
                    <td className="check-col" onClick={(e) => e.stopPropagation()}>
                      <PaidCheckbox r={r} canPay={perms.has('pagese')} onPay={() => setModal({ type: 'paguaj', inv: r })} onUnpay={() => setModal({ type: 'zhpaguaj', inv: r })} />
                    </td>
                    <td><StatusBadge statusi={r.statusi} /></td>
                    <td className="num actions-cell" onClick={(e) => e.stopPropagation()}>
                      <button className="icon-btn" title={isDraft ? 'Hap draftin' : 'Shiko faturën'} onClick={open}><Eye size={17} /></button>
                      {isDraft && perms.has('fature_leshim') && (
                        <button className="icon-btn" title="Ndrysho draftin" onClick={open}><Pencil size={17} /></button>
                      )}
                      {!isDraft && r.statusi !== 'anuluar' && perms.has('fature_leshim') && (
                        <button
                          className="icon-btn"
                          disabled={!!r.faturaPas}
                          title={r.faturaPas ? 'Mund të ndryshohet vetëm fatura e fundit e klientit' : 'Ndrysho faturën (numri dhe data mbeten)'}
                          onClick={() => navigate(`/fature-e-re?korrigjo=${r.id}`)}
                        ><Pencil size={17} /></button>
                      )}
                      {isDraft && perms.has('fature_leshim') && (
                        <button className="icon-btn danger-text" title="Fshi draftin" onClick={() => onDeleteDraft(r)}><Trash2 size={17} /></button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {!loading && Object.keys(totals).length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={fixedClientId ? 2 : 3} className="muted small">Totali i kësaj faqeje (pa anuluarat)</td>
                  <td className="num">{Object.entries(totals).map(([c, v]) => <div key={c}>{formatMoney(v, c)}</div>)}</td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {modal?.type === 'anulo' && (
          <CancelModal inv={modal.inv} actorName={profile?.emri} onClose={() => { setModal(null); reload() }} />
        )}
        {modal?.type === 'paguaj' && (
          <PayInvoiceModal inv={modal.inv} actorName={profile?.emri} onClose={() => { setModal(null); reload() }} />
        )}
        {modal?.type === 'zhpaguaj' && (
          <UnpayInvoiceModal inv={modal.inv} actorName={profile?.emri} onClose={() => { setModal(null); reload() }} />
        )}
        <div className="pager">
          <button className="btn small" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>‹ Para</button>
          <span className="muted small">Faqja {page + 1}</span>
          <button className="btn small" disabled={!more || loading} onClick={() => setPage(page + 1)}>Pas ›</button>
        </div>
      </div>
    </>
  )
}

function AuditList() {
  const [pages, setPages] = useState([null])
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [more, setMore] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    queryAuditLog(pages[page])
      .then((res) => {
        setRows(res.rows)
        setMore(res.more)
        setPages((p) => {
          const next = [...p]
          next[page + 1] = res.cursor
          return next
        })
      })
      .catch((err) => setError(errorMessage(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  return (
    <div className="card no-pad">
      {error && <div className="alert error">{error}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Koha</th><th>Përdoruesi</th><th>Veprimi</th><th>Dokumenti</th><th>Detaje</th></tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="small">{formatDateTime(l.koha)}</td>
                <td>{l.emri}</td>
                <td>{ACTION_LABELS[l.action] ?? l.action.replace(/_/g, ' ')}</td>
                <td className="small muted">{l.entity}{l.details?.numri ? ` #${l.details.numri}` : ''}</td>
                <td className="wrap small muted">{describeDetails(l.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button className="btn small" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Para</button>
        <span className="muted small">Faqja {page + 1}</span>
        <button className="btn small" disabled={!more} onClick={() => setPage(page + 1)}>Pas ›</button>
      </div>
    </div>
  )
}

function describeDetails(d) {
  if (!d) return ''
  return ['klienti', 'emri', 'kodi', 'arsye', 'shenim', 'seksioni']
    .filter((k) => d[k])
    .map((k) => String(d[k]))
    .join(' · ')
}

/** Detyrimi (mbetja e papaguar) i faturës. */
function Debt({ r }) {
  if (r.statusi === 'draft' || r.statusi === 'anuluar') return <span className="muted">—</span>
  if (r.statusi === 'pa_paguar') return <b className="neg">{formatMoney(r.mbetur, r.monedha)}</b>
  if (r.statusi === 'pasuar') {
    return (
      <span title="Borxhi u bart te fatura pasardhëse e klientit">
        <span className="muted">{formatMoney(r.gjendjaRe, r.monedha)}</span>
        <div className="small muted">bartur</div>
      </span>
    )
  }
  return (
    <span>
      <b className="pos">{formatMoney(0, r.monedha)}</b>
      {r.gjendjaRe < 0 && <div className="small muted">tepricë {formatMoney(-r.gjendjaRe)}</div>}
    </span>
  )
}

/**
 * Checkbox "e paguar": bosh te "Pa paguar" (klikimi regjistron pagesën e borxhit
 * të mbetur), i shënuar te "E paguar". Te "Pasuar" borxhi ndodhet te fatura më e re.
 */
function PaidCheckbox({ r, canPay, onPay, onUnpay }) {
  if (r.statusi === 'draft' || r.statusi === 'anuluar') return null
  if (r.statusi === 'e_paguar') {
    // Vetëm fatura e fundit e klientit (pa faturë më të re pas saj) mund të kthehet "Pa paguar".
    const latest = !r.faturaPas
    return (
      <input
        type="checkbox"
        checked
        disabled={!canPay || !latest}
        title={!latest ? 'E paguar. Vetëm fatura e fundit e klientit mund të kthehet "Pa paguar".' : canPay ? 'E paguar – hiqe shenjën nëse u shënua gabimisht e paguar' : 'E paguar'}
        onChange={onUnpay}
      />
    )
  }
  if (r.statusi === 'pasuar') return <input type="checkbox" checked={false} readOnly disabled title="Borxhi u bart te fatura më e re e klientit – paguhet atje" />
  return (
    <input
      type="checkbox"
      checked={false}
      disabled={!canPay}
      title={canPay ? 'Shëno si të paguar (regjistron pagesën e borxhit të mbetur)' : 'Nuk keni leje për të regjistruar pagesë'}
      onChange={onPay}
    />
  )
}

/** Heq shenjën "E paguar" nga fatura e fundit e klientit (u shënua gabimisht e paguar). */
function UnpayInvoiceModal({ inv, actorName, onClose }) {
  const [found, setFound] = useState(null)
  const [arsye, setArsye] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    paymentsOfInvoice(inv).then(setFound).catch((err) => setError(errorMessage(err)))
  }, [inv])

  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await unmarkPaid(inv.id, arsye, actorName)
      onClose()
    } catch (err) {
      setError(err.code ? errorMessage(err) : err.message)
      setBusy(false)
    }
  }

  const cash = found ? Object.fromEntries(Object.entries(found.byAccount).filter(([, v]) => v > 0)) : {}
  return (
    <Modal title={`Ktheje "Pa paguar" – fatura #${inv.numriTekst}`} onClose={onClose}>
      <form onSubmit={onSubmit}>
        {!found && !error && <p className="muted">Duke kërkuar pagesat e faturës…</p>}
        {found && !found.total && (
          <p className="alert error">Kjo faturë nuk ka pagesa të regjistruara për t'u hequr (mund të jetë mbyllur me tepricë të klientit).</p>
        )}
        {found && found.total > 0 && (
          <>
            <p>
              Fatura e <b>{inv.klient?.emri}</b> ruhet sërish si e papaguar: hiqet pagesa prej{' '}
              <b className="neg">{formatMoney(found.total, inv.monedha)}</b>, borxhi i klientit rritet me këtë shumë dhe
              fatura kalon në <b>Pa paguar</b>.
            </p>
            <ul className="small">
              {found.entries.map((p) => (
                <li key={p.id}>{formatDate(p.data)} – {p.shuma < 0 ? '' : '−'}{formatMoney(Math.abs(p.shuma), p.monedha)}{p.shenim ? ` (${p.shenim})` : ''}</li>
              ))}
            </ul>
            {Object.keys(cash).length > 0 && (
              <p className="small muted">
                Paratë dalin nga: {Object.entries(cash).map(([k, v]) => `${PAYMENT_METHODS[k] ?? k} ${formatMoney(v, inv.monedha)}`).join(' · ')}.
                Pagesa e gabuar nuk fshihet; shtohet lëvizja e kundërt.
              </p>
            )}
            <label className="field">
              <span>Arsyeja (opsionale)</span>
              <textarea rows={2} value={arsye} onChange={(e) => setArsye(e.target.value)} placeholder="p.sh. U shënua e paguar gabimisht" />
            </label>
          </>
        )}
        {error && <div className="alert error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Mbyll</button>
          <button type="submit" className="btn danger" disabled={busy || !found?.total}>{busy ? 'Duke ruajtur…' : 'Ktheje "Pa paguar"'}</button>
        </div>
      </form>
    </Modal>
  )
}

/** Pagesë e plotë e borxhit që mban fatura (statusi kalon në "E paguar"). */
function PayInvoiceModal({ inv, actorName, onClose }) {
  const { settings } = useSettings()
  const [metoda, setMetoda] = useState('arke')
  const [dataText, setDataText] = useState(toInputDate())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await addLedgerEntry({
        clientId: inv.clientId,
        tipi: 'pagese',
        monedha: inv.monedha,
        kursi: rateFor(inv.monedha, settings),
        shuma: inv.mbetur,
        data: fromInputDate(dataText),
        metoda,
        shenim: `Pagesë e plotë – fatura #${inv.numriTekst}`,
      }, actorName)
      onClose()
    } catch (err) {
      setError(err.code ? errorMessage(err) : err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={`Shëno të paguar – fatura #${inv.numriTekst}`} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <p>
          Regjistrohet pagesa e borxhit të mbetur prej <b className="neg">{formatMoney(inv.mbetur, inv.monedha)}</b> nga{' '}
          <b>{inv.klient?.emri}</b>. Fatura kalon në <b>E paguar</b> (edhe faturat "Pasuar" para saj), pagesa shkon në
          kartelën e klientit dhe në arkë/bankë.
        </p>
        <div className="grid-2">
          <label className="field">
            <span>Mënyra e pagesës</span>
            <select value={metoda} onChange={(e) => setMetoda(e.target.value)}>
              {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Data e pagesës</span>
            <input type="date" value={dataText} onChange={(e) => setDataText(e.target.value)} required />
          </label>
        </div>
        {error && <div className="alert error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Anulo</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Duke regjistruar…' : `Paguaj ${formatMoney(inv.mbetur, inv.monedha)}`}</button>
        </div>
      </form>
    </Modal>
  )
}

/** Çfarë kërkohet: numër fature, klientë ose artikuj (max 30 për Firestore "in"). */
function resolveSearch(q, clients, items) {
  if (!q) return { type: 'none' }
  if (/^\d+$/.test(q)) return { type: 'numri', value: q }
  const cl = clients.filter((c) => matchesSearch(q, c.emri, c.kodi, c.qyteti))
  if (cl.length) return { type: 'clients', ids: cl.slice(0, 30).map((c) => c.id), names: cl.slice(0, 5).map((c) => c.emri), more: cl.length > 5 }
  const it = items.filter((i) => matchesSearch(q, i.emri, i.kodi))
  if (it.length) return { type: 'items', ids: it.slice(0, 30).map((i) => i.id), names: it.slice(0, 5).map((i) => i.emri), more: it.length > 5 }
  return { type: 'empty' }
}

/** Qytetet nga klientët, të bashkuara pavarësisht shkrimit (Krujë = KRUJË = Kruje). */
const cityKey = (s) => (s ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
function groupCities(clients) {
  const map = new Map()
  for (const c of clients) {
    const key = cityKey(c.qyteti)
    if (!key) continue
    const g = map.get(key) ?? { key, ids: [], names: new Map() }
    g.ids.push(c.id)
    const n = c.qyteti.trim().toUpperCase()
    g.names.set(n, (g.names.get(n) ?? 0) + 1)
    map.set(key, g)
  }
  return [...map.values()]
    .map((g) => ({ key: g.key, ids: g.ids, label: [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => a.label.localeCompare(b.label, 'sq'))
}

/**
 * Faqja e faturave për një listë klientësh (mund të jenë > 30): një kërkesë "in" për çdo
 * grup prej 30, të bashkuara sipas datës.
 */
async function fetchByClients(ids, filters, page) {
  if (!ids.length) return { rows: [], more: false, cursor: null }
  const { cityIds, ...f } = filters
  const need = (page + 1) * PAGE + 1
  const chunks = []
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30))
  const parts = await Promise.all(chunks.map((c) => queryInvoices({ ...f, clientIds: c, limit: need })))
  const all = parts.flatMap((r) => r.rows).sort((a, b) => millis(b.data) - millis(a.data))
  return { rows: all.slice(page * PAGE, (page + 1) * PAGE), more: all.length > (page + 1) * PAGE, cursor: null }
}

/** Një faqe e listës sipas llojit të kërkimit (dhe qytetit, nëse është zgjedhur). */
async function fetchPage(target, filters, page, cursor) {
  if (filters.cityIds) {
    const inCity = new Set(filters.cityIds)
    if (target.type === 'clients') return fetchByClients(target.ids.filter((id) => inCity.has(id)), filters, page)
    if (target.type === 'none') return fetchByClients(filters.cityIds, filters, page)
    const { cityIds, ...rest } = filters
    const res = await fetchPage(target, rest, page, cursor)
    return { ...res, rows: res.rows.filter((r) => inCity.has(r.clientId)) }
  }
  if (target.type === 'empty') return { rows: [], more: false, cursor: null }
  if (target.type === 'numri') {
    const res = await queryInvoices({ numri: target.value })
    return { ...res, rows: res.rows.filter((r) => !filters.clientId || r.clientId === filters.clientId) }
  }
  if (target.type === 'clients') return queryInvoices({ ...filters, clientIds: target.ids }, cursor)
  if (target.type === 'items') {
    const ids = await invoiceIdsForItems(target.ids, filters)
    let rows = await invoicesByIds(ids.slice(page * PAGE, (page + 1) * PAGE))
    if (filters.statusi) rows = rows.filter((r) => r.statusi === filters.statusi)
    if (filters.clientId) rows = rows.filter((r) => r.clientId === filters.clientId)
    return { rows, more: ids.length > (page + 1) * PAGE, cursor: null }
  }
  return queryInvoices(filters, cursor)
}

/** Të gjitha faturat e filtrit (për raportin). */
async function fetchAll(target, filters) {
  if (target.type === 'empty') return []
  if (target.type === 'numri' || target.type === 'items') {
    if (target.type === 'numri') return (await queryInvoices({ numri: target.value })).rows
    let rows = await invoicesByIds(await invoiceIdsForItems(target.ids, filters))
    if (filters.statusi) rows = rows.filter((r) => r.statusi === filters.statusi)
    if (filters.clientId) rows = rows.filter((r) => r.clientId === filters.clientId)
    return rows
  }
  return (await queryInvoices({ ...filters, ...(target.type === 'clients' ? { clientIds: target.ids } : {}), all: true })).rows
}

const money = (map) => {
  const e = Object.entries(map ?? {}).filter(([, v]) => v)
  return e.length ? e : [['LEK', 0]]
}

/** Shiriti i përmbledhjes së periudhës (sum / count nga serveri). */
function SummaryBar({ range, label, items, reloadKey }) {
  const { perms } = useAuth()
  const showProfit = canSeeCost(perms)
  const { data: costs } = useLive(watchItemCosts, [], { enabled: showProfit, initial: {} })
  const [sum, setSum] = useState(null)
  const [profit, setProfit] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setSum(null)
    setError('')
    invoiceSummary(range).then((s) => !cancelled && setSum(s)).catch((err) => !cancelled && setError(errorMessage(err)))
    return () => { cancelled = true }
  }, [range, reloadKey])

  const costKey = Object.keys(costs).length
  useEffect(() => {
    if (!showProfit || !items.length || !costKey) return undefined
    let cancelled = false
    setProfit(null)
    invoiceProfit(range, items.map((i) => i.id), costs).then((p) => !cancelled && setProfit(p)).catch(() => !cancelled && setProfit(undefined))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, showProfit, items.length, costKey, reloadKey])

  const Main = ({ map }) => {
    const [first, ...rest] = money(map)
    return (
      <>
        <b>{formatMoney(first[1], first[0])}</b>
        {rest.map(([c, v]) => <small key={c}>+ {formatMoney(v, c)}</small>)}
      </>
    )
  }

  return (
    <div className="summary-bar">
      <div className="sb-period">
        <div className="sb-icon"><Calculator size={20} /></div>
        <div>
          <div className="sb-label">{label}</div>
          <b>{sum ? `${sum.count.toLocaleString('sq')} faturime` : '…'}</b>
        </div>
      </div>
      {error ? <div className="sb-error">{error}</div> : (
        <>
          <div className="sb-item"><span>Shitjet e periudhës</span>{sum ? <Main map={sum.sales} /> : <b>…</b>}</div>
          <div className="sb-item receipts"><span>Arkëtimet e periudhës</span>{sum ? (sum.receiptsError ? <b>—</b> : <Main map={sum.receipts} />) : <b>…</b>}</div>
          {showProfit && (
            <div className="sb-item profit" title="Shitjet në LEK − sasia × kosto aktuale e artikujve">
              <span>Fitimi i periudhës</span>
              <b>{profit == null ? '…' : profit === undefined ? '—' : `${profit >= 0 ? '+' : ''}${formatMoney(profit, 'LEK')}`}</b>
            </div>
          )}
          <div className="sb-sep" />
          <div className="sb-item unpaid"><span>Pa paguar</span>{sum ? <Main map={sum.unpaid} /> : <b>…</b>}</div>
        </>
      )}
    </div>
  )
}

/** Raporti i faturave të filtrit aktual: përmbledhje + tabelë, printim dhe CSV. */
function ReportModal({ target, filters, label, onClose }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAll(target, filters).then((r) => setRows(r.filter((x) => x.statusi !== 'draft'))).catch((err) => setError(errorMessage(err)))
  }, [target, filters])

  const active = (rows ?? []).filter((r) => r.statusi !== 'anuluar')
  const add = (m, cur, v) => { m[cur] = (m[cur] ?? 0) + v }
  const sales = {}
  const paid = {}
  const unpaid = {}
  for (const r of active) {
    add(sales, r.monedha, r.totali)
    add(paid, r.monedha, r.paguar)
    if (r.statusi === 'pa_paguar') add(unpaid, r.monedha, r.mbetur)
  }
  const fmt = (m) => money(m).map(([c, v]) => formatMoney(v, c)).join(' + ')
  const headers = ['Nr.', 'Data', 'Klienti', 'Qyteti', 'Vlera', 'Arkëtuar', 'Detyrimi', 'Statusi']
  const line = (r) => [
    r.numriTekst ?? '', formatDate(r.data), r.klient?.emri ?? '', r.klient?.qyteti ?? '',
    formatMoney(r.totali, r.monedha), formatMoney(r.paguar, r.monedha),
    r.statusi === 'pa_paguar' ? formatMoney(r.mbetur, r.monedha) : r.statusi === 'pasuar' ? 'bartur' : '0',
    STATUS_LABELS[r.statusi] ?? r.statusi,
  ]
  const summaryLines = [
    `Periudha: ${label}`,
    `Fatura: ${active.length}${rows && rows.length !== active.length ? ` (+ ${rows.length - active.length} të anuluara)` : ''}`,
    `Shitjet: ${fmt(sales)}`,
    `Arkëtuar te faturat: ${fmt(paid)}`,
    `Pa paguar: ${fmt(unpaid)}`,
  ]

  function print() {
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const w = window.open('', '_blank')
    if (!w) return setError('Shfletuesi bllokoi dritaren e printimit.')
    w.document.write(`<!doctype html><html lang="sq"><head><meta charset="utf-8"><title>Raport faturash – ${esc(label)}</title>
      <style>body{font-family:Arial,sans-serif;font-size:11px;margin:16px}h1{font-size:16px;margin:0 0 6px}p{margin:2px 0}
      table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border-bottom:1px solid #ccc;padding:4px 6px;text-align:left}
      th{background:#eee}td.n{text-align:right;white-space:nowrap}</style></head><body>
      <h1>Raport faturash</h1>${summaryLines.map((l) => `<p>${esc(l)}</p>`).join('')}
      <table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
      ${(rows ?? []).map((r) => `<tr>${line(r).map((c, i) => `<td class="${i >= 4 && i <= 6 ? 'n' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}
      </tbody></table></body></html>`)
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <Modal title={`Raport faturash – ${label}`} onClose={onClose} wide>
      {error && <div className="alert error">{error}</div>}
      {!rows && !error && <p className="muted">Duke ngarkuar faturat…</p>}
      {rows && (
        <>
          <div className="report-summary">{summaryLines.map((l) => <div key={l}>{l}</div>)}</div>
          <div className="table-wrap report-table">
            <table className="table">
              <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.slice(0, 300).map((r) => (
                  <tr key={r.id} className={r.statusi === 'anuluar' ? 'archived' : ''}>{line(r).map((c, i) => <td key={i} className={i >= 4 && i <= 6 ? 'num' : ''}>{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 300 && <p className="muted small">Shfaqen 300 të parat nga {rows.length}; printimi dhe CSV-ja i përfshijnë të gjitha.</p>}
          <div className="modal-actions">
            <button className="btn" onClick={() => downloadCsv(`raport_faturash_${toInputDate()}.csv`, headers, rows.map(line))}><Download size={16} /> CSV</button>
            <button className="btn primary" onClick={print}><Printer size={16} /> Printo / PDF</button>
          </div>
        </>
      )}
    </Modal>
  )
}
