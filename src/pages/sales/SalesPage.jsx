import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Search } from 'lucide-react'
import { getDocs, query, where, orderBy } from 'firebase/firestore'
import { useLive } from '../../hooks/useLive'
import { companyCol } from '../../services/paths'
import { watchClients } from '../../services/clientService'
import { watchItems } from '../../services/itemService'
import { errorMessage } from '../../services/authService'
import { CURRENCIES, formatMoney, toLek } from '../../utils/money'
import { endOfDay, formatDate, startOfDay, toInputDate } from '../../utils/date'
import { downloadCsv } from '../../utils/csv'
import SearchPicker from '../../components/SearchPicker'
import { useSort, SortTh } from '../../hooks/useSort'

const GROUPS = {
  artikulli: 'Sipas artikullit',
  klienti: 'Sipas klientit',
  dita: 'Sipas ditës',
  rreshtat: 'Të gjitha rreshtat',
}

/** Shitjet (Dalje): rreshtat e faturave të lëshuara për një periudhë. */
export default function SalesPage() {
  const now = new Date()
  const [from, setFrom] = useState(toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [to, setTo] = useState(toInputDate(now))
  const [period, setPeriod] = useState({ from, to })
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [group, setGroup] = useState('artikulli')
  const [clientId, setClientId] = useState('')
  const [itemId, setItemId] = useState('')
  const [monedha, setMonedha] = useState('')
  const { data: clients } = useLive(watchClients, [], { initial: [] })
  const { data: items } = useLive(watchItems, [], { initial: [] })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    getDocs(query(companyCol('invoiceLines'), where('data', '>=', startOfDay(period.from)), where('data', '<=', endOfDay(period.to)), orderBy('data', 'desc')))
      .then((snap) => !cancelled && setLines(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [period])

  const cById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])
  const iById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items])

  const filtered = lines.filter((l) => !l.anuluar && (!clientId || l.clientId === clientId) && (!itemId || l.itemId === itemId) && (!monedha || l.monedha === monedha))

  const rows = useMemo(() => {
    if (group === 'rreshtat') return filtered.map((l) => ({ key: l.id, l, sasia: l.sasia, totali: l.totali, monedha: l.monedha, lek: toLek(l.totali, l.kursi) }))
    const keyOf = (l) => (group === 'artikulli' ? l.itemId : group === 'klienti' ? l.clientId : toInputDate(l.data.toDate()))
    const m = new Map()
    for (const l of filtered) {
      const k = `${keyOf(l)}|${l.monedha}`
      const g = m.get(k) ?? { key: k, id: keyOf(l), monedha: l.monedha, sasia: 0, totali: 0, lek: 0, fatura: new Set() }
      g.sasia += l.sasia
      g.totali += l.totali
      g.lek += toLek(l.totali, l.kursi)
      g.fatura.add(l.invoiceId)
      m.set(k, g)
    }
    const arr = [...m.values()].map((g) => ({ ...g, fatura: g.fatura.size }))
    return group === 'dita' ? arr.sort((a, b) => b.id.localeCompare(a.id)) : arr.sort((a, b) => b.lek - a.lek)
  }, [filtered, group])

  const totals = {}
  let totalLek = 0
  for (const l of filtered) {
    totals[l.monedha] = (totals[l.monedha] ?? 0) + l.totali
    totalLek += toLek(l.totali, l.kursi)
  }
  const invoiceCount = new Set(filtered.map((l) => l.invoiceId)).size

  const label = (r) => {
    if (group === 'artikulli') { const i = iById[r.id]; return i ? <Link to={`/artikujt/${r.id}?skeda=shitjet`}>{i.kodi} – {i.emri}</Link> : r.id }
    if (group === 'klienti') { const c = cById[r.id]; return c ? <Link to={`/kliente/${r.id}?skeda=blerjet`}>{c.kodi} – {c.emri}</Link> : r.id }
    return formatDate(new Date(r.id))
  }
  const labelText = (r) =>
    group === 'artikulli' ? `${iById[r.id]?.kodi ?? ''} ${iById[r.id]?.emri ?? r.id}` : group === 'klienti' ? `${cById[r.id]?.kodi ?? ''} ${cById[r.id]?.emri ?? r.id}` : formatDate(new Date(r.id))

  const s = useSort(rows, {
    grupi: (r) => (group === 'rreshtat' ? null : labelText(r)),
    data: (r) => r.l?.data,
    fatura: (r) => r.l?.numri,
    klienti: (r) => cById[r.l?.clientId]?.emri,
    artikulli: (r) => iById[r.l?.itemId]?.emri,
    cmimi: (r) => r.l?.cmimi,
    sasia: (r) => r.sasia,
    totali: (r) => r.totali,
    lek: (r) => r.lek,
    nrFatura: (r) => r.fatura,
  })
  function exportCsv() {
    if (group === 'rreshtat') {
      downloadCsv(`shitjet_${period.from}_${period.to}.csv`, ['Data', 'Fatura', 'Klienti', 'Artikulli', 'Sasia', 'Çmimi', 'Totali', 'Monedha', 'Totali LEK'],
        rows.map(({ l, lek }) => [formatDate(l.data), l.numri, cById[l.clientId]?.emri ?? '', iById[l.itemId]?.emri ?? '', l.sasia, formatMoney(l.cmimi), formatMoney(l.totali), l.monedha, formatMoney(lek)]))
    } else {
      downloadCsv(`shitjet_${group}_${period.from}_${period.to}.csv`, [GROUPS[group], 'Monedha', 'Sasia', 'Totali', 'Totali LEK', 'Fatura'],
        rows.map((r) => [labelText(r), r.monedha, r.sasia, formatMoney(r.totali), formatMoney(r.lek), r.fatura]))
    }
  }

  return (
    <div>
      <h1 className="page-title">Shitjet (Dalje)</h1>
      <form className="card filters" onSubmit={(e) => { e.preventDefault(); setPeriod({ from, to }) }}>
        <label className="inline-field">Nga <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required /></label>
        <label className="inline-field">Deri <input type="date" value={to} onChange={(e) => setTo(e.target.value)} required /></label>
        <button className="btn primary"><Search size={16} /> Ngarko periudhën</button>
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          {Object.entries(GROUPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="picker-filter"><SearchPicker options={clients.map((c) => ({ id: c.id, label: `${c.kodi} – ${c.emri}`, search: [c.kodi, c.emri, c.qyteti] }))} value={clientId} onChange={setClientId} placeholder="Të gjithë klientët" /></div>
        <div className="picker-filter"><SearchPicker options={items.map((i) => ({ id: i.id, label: `${i.kodi} – ${i.emri}`, search: [i.kodi, i.emri] }))} value={itemId} onChange={setItemId} placeholder="Të gjithë artikujt" /></div>
        <select value={monedha} onChange={(e) => setMonedha(e.target.value)}>
          <option value="">Të gjitha monedhat</option>
          {Object.keys(CURRENCIES).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(clientId || itemId || monedha) && <button type="button" className="btn" onClick={() => { setClientId(''); setItemId(''); setMonedha('') }}>Pastro filtrat</button>}
        <button type="button" className="btn" onClick={exportCsv}><Download size={16} /> CSV</button>
      </form>

      <div className="balance-cards inv-cards">
        <div className="balance-card"><div className="balance-card-label">Shitjet</div><div className="balance-card-value">{Object.keys(totals).length ? Object.entries(totals).map(([c, v]) => <div key={c}>{formatMoney(v, c)}</div>) : '—'}</div></div>
        <div className="balance-card"><div className="balance-card-label">Totali në LEK</div><div className="balance-card-value">{formatMoney(totalLek, 'LEK')}</div></div>
        <div className="balance-card"><div className="balance-card-label">Fatura</div><div className="balance-card-value">{invoiceCount}</div></div>
        <div className="balance-card"><div className="balance-card-label">Copë / njësi</div><div className="balance-card-value">{filtered.reduce((s, l) => s + l.sasia, 0)}</div></div>
      </div>

      {error && <div className="alert error">{error}</div>}
      <div className="card no-pad">
        <div className="table-wrap">
          <table className="table">
            <thead>
              {group === 'rreshtat' ? (
                <tr><SortTh s={s} k="data">Data</SortTh><SortTh s={s} k="fatura">Fatura</SortTh><SortTh s={s} k="klienti">Klienti</SortTh><SortTh s={s} k="artikulli">Artikulli</SortTh><SortTh s={s} k="sasia" className="num">Sasia</SortTh><SortTh s={s} k="cmimi" className="num">Çmimi</SortTh><SortTh s={s} k="totali" className="num">Totali</SortTh></tr>
              ) : (
                <tr><SortTh s={s} k="grupi">{GROUPS[group].replace('Sipas ', '')}</SortTh><SortTh s={s} k="sasia" className="num">Sasia</SortTh><SortTh s={s} k="totali" className="num">Totali</SortTh><SortTh s={s} k="lek" className="num">Në LEK</SortTh><SortTh s={s} k="nrFatura" className="num">Fatura</SortTh></tr>
              )}
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="muted">Duke u ngarkuar…</td></tr>}
              {!loading && !rows.length && <tr><td colSpan={7} className="muted">Asnjë shitje në këtë periudhë.</td></tr>}
              {!loading && group === 'rreshtat' && s.sorted.map(({ l }) => (
                <tr key={l.id}>
                  <td>{formatDate(l.data)}</td>
                  <td><Link to={`/fatura/${l.invoiceId}`}>#{l.numri}</Link></td>
                  <td>{cById[l.clientId]?.emri}</td>
                  <td>{iById[l.itemId]?.emri}</td>
                  <td className="num">{l.sasia}</td>
                  <td className="num">{formatMoney(l.cmimi)}</td>
                  <td className="num">{formatMoney(l.totali, l.monedha)}</td>
                </tr>
              ))}
              {!loading && group !== 'rreshtat' && s.sorted.map((r) => (
                <tr key={r.key}>
                  <td>{label(r)}</td>
                  <td className="num">{r.sasia}</td>
                  <td className="num"><b>{formatMoney(r.totali, r.monedha)}</b></td>
                  <td className="num">{formatMoney(r.lek)}</td>
                  <td className="num">{r.fatura}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted small">Përfshihen vetëm faturat e lëshuara (jo draftet, jo të anuluarat).</p>
    </div>
  )
}
