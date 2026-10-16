import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, Plus, RefreshCw, ArrowLeftRight, Wallet, Ban } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { watchClients } from '../../services/clientService'
import {
  ACCOUNTS, CASH_TYPES, watchCashBalances, queryCash, recalcCash, cashFlow,
  queryExpenses, cancelExpense, querySupplierPayments, cancelSupplierPayment,
} from '../../services/cashService'
import { errorMessage } from '../../services/authService'
import { CURRENCIES, formatMoney } from '../../utils/money'
import { endOfDay, formatDate, startOfDay, toInputDate } from '../../utils/date'
import { downloadCsv } from '../../utils/csv'
import { ExpenseModal, SupplierPaymentModal, CashAdjustModal, TransferModal, CancelReasonModal } from './FinanceModals'
import { useSort, SortTh } from '../../hooks/useSort'

const TABS = [
  ['permbledhje', 'Përmbledhja'],
  ['cashflow', 'Cash flow'],
  ['regjistri', 'Regjistri i arkës'],
  ['shpenzimet', 'Shpenzimet'],
  ['furnitoret', 'Pagesat e furnitorëve'],
]

const monthStart = () => { const d = new Date(); return toInputDate(new Date(d.getFullYear(), d.getMonth(), 1)) }

export default function FinancePage() {
  const { perms } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('skeda') ?? 'permbledhje'
  const [modal, setModal] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const close = () => { setModal(null); setReloadKey((k) => k + 1) }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Financa (Cash Flow)</h1>
        <div className="actions">
          {perms.has('financa_shpenzime') && <button className="btn primary" onClick={() => setModal('shpenzim')}><Plus size={16} /> Shpenzim</button>}
          {perms.has('financa_furnitore') && <button className="btn" onClick={() => setModal('furnitor')}><Wallet size={16} /> Paguaj furnitorin</button>}
          {perms.has('financa_arka') && <button className="btn" onClick={() => setModal('transferte')}><ArrowLeftRight size={16} /> Transfertë</button>}
          {perms.has('financa_arka') && <button className="btn" onClick={() => setModal('arka')}>Gjendje / rregullim</button>}
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setParams({ skeda: k })}>{label}</button>
        ))}
      </div>

      {tab === 'permbledhje' && <Summary />}
      {tab === 'cashflow' && <CashFlowTab key={reloadKey} />}
      {tab === 'regjistri' && <RegisterTab key={reloadKey} />}
      {tab === 'shpenzimet' && <ExpensesTab key={reloadKey} />}
      {tab === 'furnitoret' && <SupplierPaymentsTab key={reloadKey} />}

      {modal === 'shpenzim' && <ExpenseModal onClose={close} />}
      {modal === 'furnitor' && <SupplierPaymentModal onClose={close} />}
      {modal === 'transferte' && <TransferModal onClose={close} />}
      {modal === 'arka' && <CashAdjustModal onClose={close} />}
    </div>
  )
}

/** Gjendja e arkës/bankës, të arkëtueshmet dhe të pagueshmet. */
function Summary() {
  const { perms, profile } = useAuth()
  const { data: bal } = useLive(watchCashBalances, [], { initial: { arke: {}, banke: {} } })
  const { data: clients } = useLive(watchClients, [], { initial: [] })
  const [msg, setMsg] = useState(null)

  const receivable = {}
  const payable = {}
  for (const c of clients) {
    for (const [m, v] of Object.entries(c.gjendje ?? {})) if (v > 0) receivable[m] = (receivable[m] ?? 0) + v
    for (const [m, v] of Object.entries(c.detyrimFurnitori ?? {})) if (v > 0) payable[m] = (payable[m] ?? 0) + v
  }
  const debtors = clients.filter((c) => (c.gjendje?.LEK ?? 0) > 0 || (c.gjendje?.EUR ?? 0) > 0 || (c.gjendje?.USD ?? 0) > 0)
    .sort((a, b) => (b.gjendje?.LEK ?? 0) - (a.gjendje?.LEK ?? 0)).slice(0, 10)
  const suppliers = clients.filter((c) => Object.values(c.detyrimFurnitori ?? {}).some((v) => v > 0))
  const currencies = Object.keys(CURRENCIES).filter((c) => c === 'LEK' || bal.arke[c] || bal.banke[c])

  async function onRecalc() {
    if (!window.confirm('Të rindërtohet gjendja e arkës dhe bankës nga regjistri?')) return
    try {
      const n = await recalcCash(profile?.emri)
      setMsg({ type: 'success', text: `U rillogarit nga ${n} lëvizje.` })
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) })
    }
  }

  return (
    <>
      <div className="balance-cards inv-cards">
        {Object.entries(ACCOUNTS).map(([acc, label]) =>
          currencies.map((m) => (
            <div key={`${acc}${m}`} className={`balance-card ${(bal[acc][m] ?? 0) < 0 ? 'debt' : ''}`}>
              <div className="balance-card-label">{label} · {m}</div>
              <div className="balance-card-value">{formatMoney(bal[acc][m] ?? 0, m)}</div>
            </div>
          )),
        )}
      </div>
      {perms.has('admin') && (
        <button className="btn small" onClick={onRecalc}><RefreshCw size={14} /> Rillogarit arkën</button>
      )}
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}

      <div className="grid-2 gap-top">
        <div className="card">
          <h3>Të arkëtueshmet (borxhet e klientëve)</h3>
          <div className="stat-chips">
            {Object.keys(receivable).length ? Object.entries(receivable).map(([m, v]) => (
              <div key={m} className="stat-chip"><span>{m}</span><b className="neg">{formatMoney(v, m)}</b></div>
            )) : <span className="muted">Asnjë borxh.</span>}
          </div>
          <table className="table gap-top">
            <tbody>
              {debtors.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/kliente/${c.id}`}>{c.kodi} – {c.emri}</Link></td>
                  <td className="num">{Object.entries(c.gjendje ?? {}).filter(([, v]) => v > 0).map(([m, v]) => <div key={m}>{formatMoney(v, m)}</div>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {debtors.length === 10 && <p className="muted small">10 klientët me borxhin më të madh. Raporti i plotë: Raporte → Borxhet.</p>}
        </div>
        <div className="card">
          <h3>Të pagueshmet (detyrimet ndaj furnitorëve)</h3>
          <div className="stat-chips">
            {Object.keys(payable).length ? Object.entries(payable).map(([m, v]) => (
              <div key={m} className="stat-chip"><span>{m}</span><b>{formatMoney(v, m)}</b></div>
            )) : <span className="muted">Asnjë detyrim.</span>}
          </div>
          <table className="table gap-top">
            <tbody>
              {suppliers.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/kliente/${c.id}?skeda=furnitori`}>{c.kodi} – {c.emri}</Link></td>
                  <td className="num">{Object.entries(c.detyrimFurnitori ?? {}).filter(([, v]) => v > 0).map(([m, v]) => <div key={m}>{formatMoney(v, m)}</div>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/** Ngarkon të dhëna për periudhë (Nga/Deri) me një funksion query(from, to). */
function usePeriod(load) {
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(toInputDate())
  const [period, setPeriod] = useState({ from: monthStart(), to: toInputDate() })
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    load(startOfDay(period.from), endOfDay(period.to))
      .then((r) => !cancelled && setRows(r))
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, tick])
  const form = (
    <>
      <label className="inline-field">Nga <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="inline-field">Deri <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <button type="button" className="btn primary" onClick={() => setPeriod({ from, to })}>Shfaq</button>
    </>
  )
  return { rows, loading, error, form, period, reload: () => setTick((t) => t + 1) }
}

function CashFlowTab() {
  const p = usePeriod(queryCash)
  const [by, setBy] = useState('month')
  const [llogaria, setLlogaria] = useState('')
  const flow = useMemo(() => cashFlow(p.rows, by, { llogaria: llogaria || undefined }), [p.rows, by, llogaria])
  const keys = Object.keys(flow).sort().reverse()
  const totals = {}
  for (const k of keys) for (const [m, v] of Object.entries(flow[k])) {
    const t = (totals[m] ??= { hyrje: 0, dalje: 0 })
    t.hyrje += v.hyrje
    t.dalje += v.dalje
  }
  const label = (k) => (by === 'day' ? formatDate(new Date(k)) : k.split('-').reverse().join('/'))
  const flat = keys.flatMap((k) => Object.entries(flow[k]).map(([m, v]) => ({ k, m, ...v, neto: v.hyrje - v.dalje })))
  const fs = useSort(flat, { periudha: (r) => r.k, monedha: (r) => r.m, hyrje: (r) => r.hyrje, dalje: (r) => r.dalje, neto: (r) => r.neto })

  function exportCsv() {
    const rows = []
    for (const k of keys) for (const [m, v] of Object.entries(flow[k])) rows.push([label(k), m, formatMoney(v.hyrje), formatMoney(v.dalje), formatMoney(v.hyrje - v.dalje)])
    downloadCsv(`cashflow_${p.period.from}_${p.period.to}.csv`, ['Periudha', 'Monedha', 'Hyrje', 'Dalje', 'Neto'], rows)
  }

  return (
    <>
      <div className="card filters">
        {p.form}
        <select value={by} onChange={(e) => setBy(e.target.value)}>
          <option value="month">Mujor</option>
          <option value="day">Ditor</option>
        </select>
        <select value={llogaria} onChange={(e) => setLlogaria(e.target.value)}>
          <option value="">Arkë + Bankë</option>
          {Object.entries(ACCOUNTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="button" className="btn" onClick={exportCsv}><Download size={16} /> CSV</button>
      </div>
      {p.error && <div className="alert error">{p.error}</div>}
      <div className="balance-cards inv-cards">
        {Object.entries(totals).map(([m, t]) => (
          <div key={m} className="balance-card">
            <div className="balance-card-label">{m} · neto</div>
            <div className={`balance-card-value ${t.hyrje - t.dalje < 0 ? 'neg' : 'pos'}`}>{formatMoney(t.hyrje - t.dalje, m)}</div>
            <div className="balance-card-sub">Hyrje {formatMoney(t.hyrje)} · Dalje {formatMoney(t.dalje)}</div>
          </div>
        ))}
      </div>
      <div className="card no-pad">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><SortTh s={fs} k="periudha">Periudha</SortTh><SortTh s={fs} k="monedha">Monedha</SortTh><SortTh s={fs} k="hyrje" className="num">Hyrje</SortTh><SortTh s={fs} k="dalje" className="num">Dalje</SortTh><SortTh s={fs} k="neto" className="num">Neto</SortTh></tr></thead>
            <tbody>
              {p.loading && <tr><td colSpan={5} className="muted">Duke u ngarkuar…</td></tr>}
              {!p.loading && !keys.length && <tr><td colSpan={5} className="muted">Asnjë lëvizje në këtë periudhë.</td></tr>}
              {!p.loading && fs.sorted.map((r) => (
                <tr key={`${r.k}${r.m}`}>
                  <td>{label(r.k)}</td>
                  <td>{r.m}</td>
                  <td className="num pos">{formatMoney(r.hyrje)}</td>
                  <td className="num neg">{formatMoney(r.dalje)}</td>
                  <td className="num"><b>{formatMoney(r.neto)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted small">Transfertat arkë ↔ bankë nuk llogariten si hyrje/dalje kur shihen të dyja llogaritë bashkë.</p>
    </>
  )
}

function RegisterTab() {
  const p = usePeriod(queryCash)
  const [llogaria, setLlogaria] = useState('')
  const [monedha, setMonedha] = useState('')
  const [tipi, setTipi] = useState('')
  const rows = p.rows.filter((r) => (!llogaria || r.llogaria === llogaria) && (!monedha || r.monedha === monedha) && (!tipi || r.tipi === tipi))
  const rs = useSort(rows, { data: (r) => r.data, llogaria: (r) => ACCOUNTS[r.llogaria], lloji: (r) => CASH_TYPES[r.tipi] ?? r.tipi, shenim: (r) => r.shenim, shuma: (r) => r.shuma, perdoruesi: (r) => r.emri })

  function exportCsv() {
    downloadCsv(`regjistri_arkes_${p.period.from}_${p.period.to}.csv`, ['Data', 'Llogaria', 'Lloji', 'Shënim', 'Monedha', 'Shuma', 'Përdoruesi'],
      rows.map((r) => [formatDate(r.data), ACCOUNTS[r.llogaria], CASH_TYPES[r.tipi] ?? r.tipi, r.shenim, r.monedha, formatMoney(r.shuma), r.emri]))
  }

  return (
    <>
      <div className="card filters">
        {p.form}
        <select value={llogaria} onChange={(e) => setLlogaria(e.target.value)}>
          <option value="">Të gjitha llogaritë</option>
          {Object.entries(ACCOUNTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={monedha} onChange={(e) => setMonedha(e.target.value)}>
          <option value="">Të gjitha monedhat</option>
          {Object.keys(CURRENCIES).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={tipi} onChange={(e) => setTipi(e.target.value)}>
          <option value="">Të gjitha llojet</option>
          {Object.entries(CASH_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="button" className="btn" onClick={exportCsv}><Download size={16} /> CSV</button>
      </div>
      {p.error && <div className="alert error">{p.error}</div>}
      <div className="card no-pad">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><SortTh s={rs} k="data">Data</SortTh><SortTh s={rs} k="llogaria">Llogaria</SortTh><SortTh s={rs} k="lloji">Lloji</SortTh><SortTh s={rs} k="shenim">Shënim</SortTh><SortTh s={rs} k="shuma" className="num">Shuma</SortTh><SortTh s={rs} k="perdoruesi">Përdoruesi</SortTh></tr></thead>
            <tbody>
              {p.loading && <tr><td colSpan={6} className="muted">Duke u ngarkuar…</td></tr>}
              {!p.loading && !rows.length && <tr><td colSpan={6} className="muted">Asnjë lëvizje.</td></tr>}
              {!p.loading && rs.sorted.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.data)}</td>
                  <td>{ACCOUNTS[r.llogaria]}</td>
                  <td>{CASH_TYPES[r.tipi] ?? r.tipi}</td>
                  <td className="wrap">
                    {r.invoiceId ? <Link to={`/fatura/${r.invoiceId}`}>{r.shenim}</Link> : r.clientId ? <Link to={`/kliente/${r.clientId}`}>{r.shenim}</Link> : r.shenim}
                  </td>
                  <td className={`num ${r.shuma < 0 ? 'neg' : 'pos'}`}><b>{formatMoney(r.shuma, r.monedha)}</b></td>
                  <td className="small">{r.emri}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function ExpensesTab() {
  const { perms, profile } = useAuth()
  const p = usePeriod(queryExpenses)
  const [cancelling, setCancelling] = useState(null)
  const active = p.rows.filter((r) => r.statusi === 'aktiv')
  const es = useSort(p.rows, { data: (r) => r.data, kategoria: (r) => r.kategoria, shenim: (r) => r.shenim, llogaria: (r) => ACCOUNTS[r.llogaria], shuma: (r) => r.shuma })
  const byCat = {}
  for (const r of active) {
    const k = `${r.kategoria}|${r.monedha}`
    byCat[k] = (byCat[k] ?? 0) + r.shuma
  }

  function exportCsv() {
    downloadCsv(`shpenzimet_${p.period.from}_${p.period.to}.csv`, ['Data', 'Kategoria', 'Llogaria', 'Monedha', 'Shuma', 'Shënim', 'Statusi'],
      p.rows.map((r) => [formatDate(r.data), r.kategoria, ACCOUNTS[r.llogaria], r.monedha, formatMoney(r.shuma), r.shenim, r.statusi]))
  }

  return (
    <>
      <div className="card filters">{p.form}<button type="button" className="btn" onClick={exportCsv}><Download size={16} /> CSV</button></div>
      {p.error && <div className="alert error">{p.error}</div>}
      <div className="stat-chips gap-bottom">
        {Object.entries(byCat).map(([k, v]) => {
          const [cat, m] = k.split('|')
          return <div key={k} className="stat-chip"><span>{cat}</span><b>{formatMoney(v, m)}</b></div>
        })}
      </div>
      <div className="card no-pad">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><SortTh s={es} k="data">Data</SortTh><SortTh s={es} k="kategoria">Kategoria</SortTh><SortTh s={es} k="shenim">Shënim</SortTh><SortTh s={es} k="llogaria">Llogaria</SortTh><SortTh s={es} k="shuma" className="num">Shuma</SortTh><th /></tr></thead>
            <tbody>
              {p.loading && <tr><td colSpan={6} className="muted">Duke u ngarkuar…</td></tr>}
              {!p.loading && !p.rows.length && <tr><td colSpan={6} className="muted">Asnjë shpenzim në këtë periudhë.</td></tr>}
              {!p.loading && es.sorted.map((r) => (
                <tr key={r.id} className={r.statusi === 'anuluar' ? 'archived' : ''}>
                  <td>{formatDate(r.data)}</td>
                  <td>{r.kategoria}</td>
                  <td className="wrap">{r.shenim}{r.anuluar && <div className="small neg">Anuluar: {r.anuluar.arsye}</div>}</td>
                  <td>{ACCOUNTS[r.llogaria]}</td>
                  <td className="num"><b>{formatMoney(r.shuma, r.monedha)}</b></td>
                  <td className="num">
                    {perms.has('financa_shpenzime') && r.statusi === 'aktiv' && (
                      <button className="icon-btn danger-text" title="Anulo" onClick={() => setCancelling(r)}><Ban size={16} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {cancelling && (
        <CancelReasonModal
          title="Anulo shpenzimin"
          text={`${cancelling.kategoria} · ${formatMoney(cancelling.shuma, cancelling.monedha)}. Shuma kthehet në ${ACCOUNTS[cancelling.llogaria].toLowerCase()}.`}
          onConfirm={(arsye) => cancelExpense(cancelling.id, arsye, profile?.emri)}
          onClose={() => { setCancelling(null); p.reload() }}
        />
      )}
    </>
  )
}

function SupplierPaymentsTab() {
  const { perms, profile } = useAuth()
  const p = usePeriod(querySupplierPayments)
  const [cancelling, setCancelling] = useState(null)
  const ps = useSort(p.rows, { data: (r) => r.data, furnitori: (r) => r.furnitor, shenim: (r) => r.shenim, llogaria: (r) => ACCOUNTS[r.llogaria], shuma: (r) => r.shuma })
  return (
    <>
      <div className="card filters">{p.form}</div>
      {p.error && <div className="alert error">{p.error}</div>}
      <div className="card no-pad">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><SortTh s={ps} k="data">Data</SortTh><SortTh s={ps} k="furnitori">Furnitori</SortTh><SortTh s={ps} k="shenim">Shënim</SortTh><SortTh s={ps} k="llogaria">Llogaria</SortTh><SortTh s={ps} k="shuma" className="num">Shuma</SortTh><th /></tr></thead>
            <tbody>
              {p.loading && <tr><td colSpan={6} className="muted">Duke u ngarkuar…</td></tr>}
              {!p.loading && !p.rows.length && <tr><td colSpan={6} className="muted">Asnjë pagesë në këtë periudhë.</td></tr>}
              {!p.loading && ps.sorted.map((r) => (
                <tr key={r.id} className={r.statusi === 'anuluar' ? 'archived' : ''}>
                  <td>{formatDate(r.data)}</td>
                  <td><Link to={`/kliente/${r.clientId}?skeda=furnitori`}>{r.furnitor}</Link></td>
                  <td className="wrap">{r.shenim}{r.anuluar && <div className="small neg">Anuluar: {r.anuluar.arsye}</div>}</td>
                  <td>{ACCOUNTS[r.llogaria]}</td>
                  <td className="num"><b>{formatMoney(r.shuma, r.monedha)}</b></td>
                  <td className="num">
                    {perms.has('financa_furnitore') && r.statusi === 'aktiv' && (
                      <button className="icon-btn danger-text" title="Anulo" onClick={() => setCancelling(r)}><Ban size={16} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {cancelling && (
        <CancelReasonModal
          title="Anulo pagesën e furnitorit"
          text={`${cancelling.furnitor} · ${formatMoney(cancelling.shuma, cancelling.monedha)}. Detyrimi ndaj furnitorit rritet përsëri dhe shuma kthehet në ${ACCOUNTS[cancelling.llogaria].toLowerCase()}.`}
          onConfirm={(arsye) => cancelSupplierPayment(cancelling.id, arsye, profile?.emri)}
          onClose={() => { setCancelling(null); p.reload() }}
        />
      )}
    </>
  )
}
