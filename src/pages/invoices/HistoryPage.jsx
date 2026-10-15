import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Search, X, Eye, Pencil, Trash2, MapPin } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { watchClients } from '../../services/clientService'
import { queryInvoices, queryAuditLog, deleteDraft, correctInvoice } from '../../services/invoiceService'
import { addLedgerEntry, rateFor } from '../../services/ledgerService'
import { PAYMENT_METHODS } from '../../config/ledger'
import { useSettings } from '../../hooks/useSettings'
import { STATUS_LABELS } from '../../services/invoiceChain'
import { errorMessage } from '../../services/authService'
import { CURRENCIES, formatMoney, parseMoney } from '../../utils/money'
import { endOfDay, formatDate, formatDateTime, fromInputDate, startOfDay, toInputDate } from '../../utils/date'
import SearchPicker from '../../components/SearchPicker'
import { StatusBadge, ACTION_LABELS, CancelModal } from './InvoiceViewPage'
import Modal from '../../components/Modal'

const EMPTY = { from: '', to: '', clientId: '', statusi: '', monedha: '', min: '', max: '', numri: '' }

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

/** Lista e faturave me filtra; faqe nga serveri (cursor), 50 për faqe. */
export function InvoiceList({ fixedClientId }) {
  const navigate = useNavigate()
  const { perms, profile } = useAuth()
  const [modal, setModal] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey((k) => k + 1)

  async function onDeleteDraft(r) {
    if (!window.confirm('Të fshihet drafti?')) return
    try {
      await deleteDraft(r.id, profile?.emri)
      reload()
    } catch (err) {
      setError(err.code ? errorMessage(err) : err.message)
    }
  }
  const { data: clients } = useLive(watchClients, [], { enabled: !fixedClientId, initial: [] })
  const [draft, setDraft] = useState(EMPTY)
  const [filters, setFilters] = useState(EMPTY)
  const [pages, setPages] = useState([null]) // cursor-at e fillimit të çdo faqeje
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const toQuery = useCallback(
    (f) => ({
      clientId: fixedClientId || f.clientId || undefined,
      statusi: f.statusi || undefined,
      monedha: f.monedha || undefined,
      from: f.from ? startOfDay(f.from) : undefined,
      to: f.to ? endOfDay(f.to) : undefined,
      min: f.min.trim() ? parseMoney(f.min) : undefined,
      max: f.max.trim() ? parseMoney(f.max) : undefined,
      numri: f.numri.trim() || undefined,
    }),
    [fixedClientId],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    queryInvoices(toQuery(filters), pages[page])
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
  }, [filters, page, toQuery, reloadKey])

  function apply(e) {
    e?.preventDefault()
    setPages([null])
    setPage(0)
    setFilters(draft)
  }
  function clear() {
    setDraft(EMPTY)
    setPages([null])
    setPage(0)
    setFilters(EMPTY)
  }

  const clientOptions = useMemo(
    () => clients.map((c) => ({ id: c.id, label: `${c.kodi} – ${c.emri}`, sub: c.qyteti, search: [c.kodi, c.emri, c.qyteti] })),
    [clients],
  )
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const totals = {}
  for (const r of rows.filter((x) => x.statusi !== 'anuluar' && x.statusi !== 'draft')) totals[r.monedha] = (totals[r.monedha] ?? 0) + r.totali

  return (
    <>
      <form className="card filters" onSubmit={apply}>
        <input className="num-search" placeholder="Nr. fature" value={draft.numri} onChange={(e) => set({ numri: e.target.value })} />
        <label className="inline-field">Nga <input type="date" value={draft.from} onChange={(e) => set({ from: e.target.value })} /></label>
        <label className="inline-field">Deri <input type="date" value={draft.to} onChange={(e) => set({ to: e.target.value })} /></label>
        {!fixedClientId && (
          <div className="grow picker-filter">
            <SearchPicker options={clientOptions} value={draft.clientId} onChange={(id) => set({ clientId: id })} placeholder="Të gjithë klientët" />
          </div>
        )}
        <select value={draft.statusi} onChange={(e) => set({ statusi: e.target.value })}>
          <option value="">Të gjitha statuset</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={draft.monedha} onChange={(e) => set({ monedha: e.target.value })}>
          <option value="">Monedha</option>
          {Object.keys(CURRENCIES).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className="amount-input" inputMode="decimal" placeholder="Shuma min" value={draft.min} onChange={(e) => set({ min: e.target.value })} />
        <input className="amount-input" inputMode="decimal" placeholder="Shuma max" value={draft.max} onChange={(e) => set({ max: e.target.value })} />
        <button className="btn primary"><Search size={16} /> Kërko</button>
        <button type="button" className="btn" onClick={clear}><X size={16} /></button>
      </form>
      {(filters.min || filters.max) && <p className="muted small">Me filtër shume, lista renditet sipas shumës.</p>}
      {error && <div className="alert error">{error}</div>}

      <div className="card no-pad">
        <div className="table-wrap">
          <table className="table clickable-rows history-table">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Data</th>
                {!fixedClientId && <th>Klienti &amp; qyteti</th>}
                <th className="num">Vlera e faturës</th>
                <th className="num">Arkëtuar</th>
                <th className="num">Detyrimi</th>
                <th className="check-col" title="E paguar" />
                <th>Statusi</th>
                <th className="num">Veprime</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="muted">Duke u ngarkuar…</td></tr>}
              {!loading && !rows.length && <tr><td colSpan={9} className="muted">Asnjë faturë.</td></tr>}
              {!loading && rows.map((r) => {
                const isDraft = r.statusi === 'draft'
                const open = () => navigate(isDraft ? `/fature-e-re?draft=${r.id}` : `/fatura/${r.id}`)
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
                      <PaidCheckbox r={r} canPay={perms.has('pagese')} onPay={() => setModal({ type: 'paguaj', inv: r })} />
                    </td>
                    <td><StatusBadge statusi={r.statusi} /></td>
                    <td className="num actions-cell" onClick={(e) => e.stopPropagation()}>
                      <button className="icon-btn" title={isDraft ? 'Hap draftin' : 'Shiko faturën'} onClick={open}><Eye size={17} /></button>
                      {isDraft && perms.has('fature_leshim') && (
                        <button className="icon-btn" title="Ndrysho draftin" onClick={open}><Pencil size={17} /></button>
                      )}
                      {!isDraft && r.statusi !== 'anuluar' && perms.has('anulim_fature') && perms.has('fature_leshim') && (
                        <button className="icon-btn" title="Korrigjo (anulo dhe krijo draft të ri)" onClick={() => setModal({ type: 'korrigjo', inv: r })}><Pencil size={17} /></button>
                      )}
                      {isDraft && perms.has('fature_leshim') && (
                        <button className="icon-btn danger-text" title="Fshi draftin" onClick={() => onDeleteDraft(r)}><Trash2 size={17} /></button>
                      )}
                      {!isDraft && r.statusi !== 'anuluar' && perms.has('anulim_fature') && (
                        <button className="icon-btn danger-text" title="Anulo faturën" onClick={() => setModal({ type: 'anulo', inv: r })}><Trash2 size={17} /></button>
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
        {modal?.type === 'korrigjo' && (
          <CorrectModal inv={modal.inv} actorName={profile?.emri} onClose={() => setModal(null)} onDone={(draftId) => navigate(`/fature-e-re?draft=${draftId}`)} />
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

/** Korrigjim: anulon faturën dhe hap një draft të ri me të njëjtat të dhëna. */
function CorrectModal({ inv, actorName, onClose, onDone }) {
  const [arsye, setArsye] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const draftId = await correctInvoice(inv.id, arsye, actorName)
      onDone(draftId)
    } catch (err) {
      setError(err.code ? errorMessage(err) : err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={`Korrigjo faturën Nr. ${inv.numriTekst}`} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <p>Një faturë e lëshuar nuk ndryshohet. Korrigjimi bëhet kështu:</p>
        <ol className="steps">
          <li>Fatura <b>#{inv.numriTekst}</b> anulohet (mbetet në histori si "Anuluar"); kartela dhe stoku kthehen mbrapsht.</li>
          {inv.paguar > 0 && <li>Pagesa prej {formatMoney(inv.paguar, inv.monedha)} mbetet te klienti si tepricë dhe kalon vetë te fatura e re.</li>}
          <li>Hapet një <b>draft i ri</b> me të njëjtat artikuj dhe çmime, që e ndryshoni dhe e lëshoni me numër të ri.</li>
        </ol>
        <label className="field">
          <span>Arsyeja e korrigjimit *</span>
          <textarea rows={2} value={arsye} onChange={(e) => setArsye(e.target.value)} placeholder="p.sh. sasi e gabuar te artikulli X" required autoFocus />
        </label>
        {error && <div className="alert error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Mbyll</button>
          <button className="btn primary" disabled={busy || !arsye.trim()}>{busy ? 'Duke korrigjuar…' : 'Anulo dhe hap draftin'}</button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Checkbox "e paguar": bosh te "Pa paguar" (klikimi regjistron pagesën e borxhit
 * të mbetur), i shënuar te "E paguar". Te "Pasuar" borxhi ndodhet te fatura më e re.
 */
function PaidCheckbox({ r, canPay, onPay }) {
  if (r.statusi === 'draft' || r.statusi === 'anuluar') return null
  if (r.statusi === 'e_paguar') return <input type="checkbox" checked readOnly disabled title="E paguar" />
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
