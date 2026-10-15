import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { getDoc } from 'firebase/firestore'
import { Trash2, UserPlus, Save, Send, FileText, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { useSettings } from '../../hooks/useSettings'
import { watchClients } from '../../services/clientService'
import { watchItems, watchPricesForClient } from '../../services/itemService'
import { saveDraft, deleteDraft, issueInvoice, watchDrafts } from '../../services/invoiceService'
import { watchStock } from '../../services/stockService'
import { companyDoc } from '../../services/paths'
import { rateFor } from '../../services/ledgerService'
import { errorMessage } from '../../services/authService'
import { PAYMENT_METHODS, canLedger } from '../../config/ledger'
import { CURRENCIES, RATE_SCALE, formatMoney, formatRate, parseMoney, parseRate } from '../../utils/money'
import { fromInputDate, toInputDate, formatDate } from '../../utils/date'
import SearchPicker from '../../components/SearchPicker'
import Balance from '../../components/Balance'
import ClientFormModal from '../clients/ClientFormModal'

let keySeq = 0
const newKey = () => `r${++keySeq}`

/** Çmimi automatik: preferencial → standard (LEK), i konvertuar në monedhën e faturës. */
function autoPrice(item, prefs, monedha, kursi) {
  const lek = prefs[item.id] ?? item.cmimi ?? 0
  if (monedha === 'LEK' || !kursi) return lek
  return Math.round((lek * RATE_SCALE) / kursi)
}

export default function NewInvoicePage() {
  const { perms, profile } = useAuth()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const draftId = params.get('draft')

  const { data: clients } = useLive(watchClients, [], { initial: [] })
  const { data: items } = useLive(watchItems, [], { initial: [] })
  const { data: drafts } = useLive(watchDrafts, [], { initial: [] })
  const { data: stock } = useLive(watchStock, [], { initial: {} })

  const [clientId, setClientId] = useState('')
  const [monedha, setMonedha] = useState('LEK')
  const [kursiText, setKursiText] = useState('')
  const [dataText, setDataText] = useState(toInputDate())
  const [lines, setLines] = useState([])
  const [shenime, setShenime] = useState('')
  const [paguarText, setPaguarText] = useState('')
  const [paguarTouched, setPaguarTouched] = useState(false)
  const [metoda, setMetoda] = useState('arke')
  const [gjParaText, setGjParaText] = useState(null) // null = automatike
  const [arsye, setArsye] = useState('')
  const [creatingClient, setCreatingClient] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const client = clients.find((c) => c.id === clientId) ?? null
  const kursi = monedha === 'LEK' ? RATE_SCALE : parseRate(kursiText)
  const { data: prefList } = useLive((ok, ko) => watchPricesForClient(clientId, ok, ko), [clientId], { enabled: !!clientId, initial: [] })
  const prefs = useMemo(() => Object.fromEntries((clientId ? prefList : []).map((p) => [p.itemId, p.cmimi])), [prefList, clientId])
  const itemsById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items])
  const canManualBalance = canLedger(perms, 'rregullim')

  // ---------- Ngarkimi i draftit ----------
  useEffect(() => {
    if (!draftId) return
    getDoc(companyDoc('invoices', draftId)).then((snap) => {
      if (!snap.exists() || snap.data().statusi !== 'draft') {
        setError('Drafti nuk u gjet ose është lëshuar tashmë.')
        return
      }
      const d = snap.data()
      setClientId(d.clientId ?? '')
      setMonedha(d.monedha ?? 'LEK')
      setKursiText(d.monedha && d.monedha !== 'LEK' ? formatRate(d.kursi) : '')
      setDataText(toInputDate(d.data?.toDate?.() ?? new Date()))
      setLines((d.rreshtat ?? []).map((r) => ({
        key: newKey(),
        itemId: r.itemId,
        kodi: r.kodi,
        emri: r.emri,
        njesia: r.njesia,
        sasia: String(r.sasia),
        cmimiText: formatMoney(r.cmimi),
        auto: r.cmimiOrigjinal ?? r.cmimi,
        manual: r.cmimiOrigjinal != null,
      })))
      setShenime(d.shenime ?? '')
      if (d.paguar) {
        setPaguarText(formatMoney(d.paguar))
        setPaguarTouched(true)
      }
      setMetoda(d.metodaPagese ?? 'arke')
    }).catch((err) => setError(errorMessage(err)))
  }, [draftId])

  // ---------- Klienti / monedha ----------
  function pickClient(id) {
    setClientId(id)
    const c = clients.find((x) => x.id === id)
    if (c?.monedhaPreferuar && c.monedhaPreferuar !== monedha) changeCurrency(c.monedhaPreferuar)
    setGjParaText(null)
    setArsye('')
    setPaguarTouched(false)
  }

  function changeCurrency(c) {
    setMonedha(c)
    setKursiText(c === 'LEK' ? '' : formatRate(rateFor(c, settings)))
    setGjParaText(null)
  }

  // Rillogarit çmimet automatike kur ndryshon klienti, monedha ose kursi
  useEffect(() => {
    setLines((ls) =>
      ls.map((l) => {
        const item = itemsById[l.itemId]
        if (!item) return l
        const auto = autoPrice(item, prefs, monedha, kursi)
        return l.manual ? { ...l, auto } : { ...l, auto, cmimiText: formatMoney(auto) }
      }),
    )
  }, [prefs, monedha, kursi, itemsById])

  // ---------- Rreshtat ----------
  function addItem(itemId) {
    const item = itemsById[itemId]
    if (!item) return
    const auto = autoPrice(item, prefs, monedha, kursi)
    setLines((ls) => [...ls, { key: newKey(), itemId, kodi: item.kodi, emri: item.emri, njesia: item.njesia, sasia: '1', cmimiText: formatMoney(auto), auto, manual: false }])
  }
  const updateLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const removeLine = (key) => setLines((ls) => ls.filter((l) => l.key !== key))

  const parsed = lines.map((l) => {
    const sasia = Number(l.sasia)
    const cmimi = parseMoney(l.cmimiText)
    const ok = Number.isInteger(sasia) && sasia > 0 && cmimi != null && cmimi >= 0
    return { ...l, sasiaN: sasia, cmimi, ok, totali: ok ? sasia * cmimi : 0 }
  })
  const totali = parsed.reduce((s, l) => s + l.totali, 0)
  // Paralajmërim (jo bllokim) kur sasia e faturës kalon stokun
  const qtyByItem = {}
  for (const l of parsed) if (l.ok) qtyByItem[l.itemId] = (qtyByItem[l.itemId] ?? 0) + l.sasiaN
  const overStock = (itemId) => (qtyByItem[itemId] ?? 0) > (stock[itemId] ?? 0)

  // ---------- Gjendja / pagesa ----------
  const gjAuto = client?.gjendje?.[monedha] ?? 0
  const gjManual = gjParaText != null ? parseMoney(gjParaText) : null
  const gjendjaPara = gjManual ?? gjAuto
  const manualChanged = gjParaText != null && gjManual != null && gjManual !== gjAuto

  // Klienti Rastësor paguan zakonisht menjëherë: "Paguar" ndjek totalin derisa ta ndryshojë përdoruesi.
  useEffect(() => {
    if (client?.rastesor && !paguarTouched) setPaguarText(totali ? formatMoney(totali) : '')
  }, [client?.rastesor, totali, paguarTouched])

  const paguar = paguarText.trim() ? parseMoney(paguarText) : 0
  const gjendjaRe = gjendjaPara + totali - (paguar ?? 0)

  function payload() {
    return {
      clientId,
      client,
      monedha,
      kursi,
      data: fromInputDate(dataText),
      rreshtat: parsed.map((l) => ({
        itemId: l.itemId,
        kodi: l.kodi,
        emri: l.emri,
        njesia: l.njesia,
        sasia: l.sasiaN,
        cmimi: l.cmimi,
        cmimiOrigjinal: l.manual ? l.auto : null,
      })),
      shenime,
      paguar: paguar ?? 0,
      metodaPagese: metoda,
      gjendjaParaManual: manualChanged ? gjManual : null,
      arsyeRregullimi: arsye,
    }
  }

  function validate(forIssue) {
    if (!clientId) return 'Zgjidhni klientin.'
    if (monedha !== 'LEK' && (!kursi || kursi <= 0)) return 'Kursi i monedhës nuk është i vlefshëm.'
    if (!lines.length) return 'Shtoni të paktën një artikull.'
    const bad = parsed.find((l) => !l.ok)
    if (bad) return `Kontrolloni sasinë / çmimin e "${bad.emri}".`
    if (forIssue) {
      if (paguar == null || paguar < 0) return 'Shuma e paguar nuk është e vlefshme.'
      if (gjParaText != null && gjManual == null) return 'Gjendja e mëparshme nuk është e vlefshme.'
      if (manualChanged && !arsye.trim()) return 'Shkruani arsyen e ndryshimit të gjendjes së mëparshme.'
    }
    return ''
  }

  async function onSaveDraft() {
    setError('')
    setInfo('')
    const v = validate(false)
    if (v) return setError(v)
    setBusy(true)
    try {
      const id = await saveDraft(draftId, payload(), profile?.emri)
      setParams({ draft: id }, { replace: true })
      setInfo('Drafti u ruajt.')
    } catch (err) {
      setError(err.code ? errorMessage(err) : err.message)
    } finally {
      setBusy(false)
    }
  }

  async function onIssue() {
    setError('')
    setInfo('')
    const v = validate(true)
    if (v) return setError(v)
    const msg =
      `Të lëshohet fatura për ${client.emri}?\n\n` +
      `Totali: ${formatMoney(totali, monedha)}\n` +
      `Gjendja e mëparshme: ${formatMoney(gjendjaPara, monedha)}\n` +
      `Paguar: ${formatMoney(paguar ?? 0, monedha)}\n` +
      `Gjendja e re: ${formatMoney(gjendjaRe, monedha)}\n\n` +
      'Pas lëshimit fatura nuk ndryshohet (vetëm anulohet).'
    if (!window.confirm(msg)) return
    setBusy(true)
    try {
      const { id } = await issueInvoice(draftId, payload(), profile?.emri)
      navigate(`/fatura/${id}`)
    } catch (err) {
      setError(err.code ? errorMessage(err) : err.message)
      setBusy(false)
    }
  }

  async function onDeleteDraft(id) {
    if (!window.confirm('Të fshihet drafti?')) return
    try {
      await deleteDraft(id, profile?.emri)
      if (id === draftId) navigate('/fature-e-re', { replace: true })
    } catch (err) {
      setError(err.code ? errorMessage(err) : err.message)
    }
  }

  function resetForm() {
    navigate('/fature-e-re')
    setClientId('')
    setLines([])
    setShenime('')
    setPaguarText('')
    setPaguarTouched(false)
    setGjParaText(null)
    setArsye('')
    setError('')
    setInfo('')
  }

  const clientOptions = useMemo(
    () =>
      clients
        .filter((c) => !c.arkivuar)
        .sort((a, b) => (b.rastesor ? 1 : 0) - (a.rastesor ? 1 : 0) || a.emri.localeCompare(b.emri, 'sq'))
        .map((c) => ({ id: c.id, label: `${c.kodi} – ${c.emri}`, sub: c.qyteti, search: [c.kodi, c.emri, c.qyteti, c.telefoni] })),
    [clients],
  )
  const itemOptions = useMemo(
    () =>
      items
        .filter((i) => !i.arkivuar)
        .map((i) => ({
          id: i.id,
          label: `${i.kodi} – ${i.emri}`,
          sub: `${prefs[i.id] != null ? `${formatMoney(prefs[i.id], 'LEK')} (preferencial)` : formatMoney(i.cmimi, 'LEK')} · stoku ${stock[i.id] ?? 0}`,
          search: [i.kodi, i.emri, i.kategoria],
        })),
    [items, prefs, stock],
  )

  return (
    <div className="invoice-editor">
      <div className="page-head">
        <h1 className="page-title">{draftId ? 'Faturë e Re – draft' : 'Faturë e Re'}</h1>
        {(draftId || lines.length > 0) && (
          <button className="btn" onClick={resetForm}>Faturë e re bosh</button>
        )}
      </div>

      <div className="card">
        <div className="inv-form-top">
          <div className="field grow">
            <span>Klienti *</span>
            <div className="picker-row">
              <div className="grow">
                <SearchPicker options={clientOptions} value={clientId} onChange={pickClient} placeholder="Kërko me emër, kod (KL001) ose qytet…" />
              </div>
              <button type="button" className="btn" onClick={() => setCreatingClient(true)} title="Klient i ri">
                <UserPlus size={16} />
              </button>
            </div>
          </div>
          <label className="field">
            <span>Monedha</span>
            <select value={monedha} onChange={(e) => changeCurrency(e.target.value)}>
              {Object.keys(CURRENCIES).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          {monedha !== 'LEK' && (
            <label className="field">
              <span>Kursi 1 {monedha} = ? LEK</span>
              <input inputMode="decimal" value={kursiText} onChange={(e) => setKursiText(e.target.value)} />
            </label>
          )}
          <label className="field">
            <span>Data</span>
            <input type="date" value={dataText} onChange={(e) => setDataText(e.target.value)} />
          </label>
        </div>
        {client && (
          <div className="info-row">
            <b>{client.emri}</b>
            {client.qyteti && <span className="muted">· {client.qyteti}</span>}
            <span className="muted">· Gjendja aktuale {monedha}:</span>
            <Balance value={gjAuto} currency={monedha} showLabel />
            {client.rastesor && <span className="tag">Pakicë – paguhet menjëherë</span>}
          </div>
        )}
      </div>

      <div className="card no-pad">
        <div className="table-wrap">
          <table className="table inv-lines">
            <thead>
              <tr>
                <th>#</th>
                <th>Artikulli</th>
                <th className="num">Sasia</th>
                <th className="num">Çmimi ({monedha})</th>
                <th className="num">Totali</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {parsed.map((l, i) => (
                <tr key={l.key} className={l.ok ? '' : 'row-error'}>
                  <td className="muted">{i + 1}</td>
                  <td className="wrap">
                    <b>{l.emri}</b> <span className="muted small mono">{l.kodi}</span>
                    {l.manual && l.cmimi !== l.auto && (
                      <div className="small muted">
                        Çmimi automatik: <s>{formatMoney(l.auto)}</s>
                        {l.auto > 0 && l.cmimi != null && ` · zbritje ${Math.round(((l.auto - l.cmimi) * 1000) / l.auto) / 10}%`}
                        <button type="button" className="btn link small" onClick={() => updateLine(l.key, { cmimiText: formatMoney(l.auto), manual: false })}>rikthe</button>
                      </div>
                    )}
                    {!l.manual && prefs[l.itemId] != null && <div className="small muted">Çmim preferencial</div>}
                    {overStock(l.itemId) && (
                      <div className="small stock-warn"><AlertTriangle size={12} /> Stoku: {stock[l.itemId] ?? 0} {l.njesia} – sasia e faturës e kalon</div>
                    )}
                  </td>
                  <td className="num">
                    <input className="qty-input" type="number" min={1} step={1} value={l.sasia} onChange={(e) => updateLine(l.key, { sasia: e.target.value })} />
                    <div className="small muted">{l.njesia}</div>
                  </td>
                  <td className="num">
                    <input
                      className="price-input"
                      inputMode="decimal"
                      value={l.cmimiText}
                      onChange={(e) => updateLine(l.key, { cmimiText: e.target.value, manual: parseMoney(e.target.value) !== l.auto })}
                    />
                  </td>
                  <td className="num"><b>{formatMoney(l.totali)}</b></td>
                  <td className="num">
                    <button type="button" className="icon-btn danger-text" onClick={() => removeLine(l.key)} aria-label="Hiq rreshtin"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
              {!lines.length && (
                <tr><td colSpan={6} className="muted">Asnjë artikull ende. Kërkoni më poshtë për ta shtuar.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="add-line">
          <SearchPicker key={lines.length} options={itemOptions} value="" onChange={addItem} placeholder="+ Shto artikull (kërko me kod ose emër)…" />
        </div>
      </div>

      <div className="inv-summary-grid">
        <div className="card">
          <label className="field">
            <span>Shënime (printohen në faturë)</span>
            <textarea rows={4} value={shenime} onChange={(e) => setShenime(e.target.value)} placeholder="p.sh. mungon nga porosia e parë" />
          </label>
        </div>

        <div className="card inv-summary">
          <Row label="Totali i faturës" value={<b>{formatMoney(totali, monedha)}</b>} />
          <div className="sum-row">
            <span>Gjendja e mëparshme</span>
            {canManualBalance ? (
              <input
                className="price-input"
                inputMode="decimal"
                value={gjParaText ?? formatMoney(gjAuto)}
                onChange={(e) => setGjParaText(e.target.value)}
                disabled={!client}
              />
            ) : (
              <Balance value={gjAuto} currency={monedha} />
            )}
          </div>
          {manualChanged && (
            <div className="manual-balance">
              <div className="small">
                Llogaritur: {formatMoney(gjAuto, monedha)} → vendosur: {formatMoney(gjManual, monedha)} (diferenca{' '}
                {formatMoney(gjManual - gjAuto)}). Ruhet si "rregullim manual i gjendjes" në kartelë.
              </div>
              <input placeholder="Arsyeja e ndryshimit *" value={arsye} onChange={(e) => setArsye(e.target.value)} />
              <button type="button" className="btn link small" onClick={() => { setGjParaText(null); setArsye('') }}>Rikthe vlerën e llogaritur</button>
            </div>
          )}
          <div className="sum-row">
            <span>Paguar</span>
            <div className="pay-inputs">
              <select value={metoda} onChange={(e) => setMetoda(e.target.value)}>
                {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input
                className="price-input"
                inputMode="decimal"
                placeholder="0"
                value={paguarText}
                onChange={(e) => {
                  setPaguarText(e.target.value)
                  setPaguarTouched(true)
                }}
              />
            </div>
          </div>
          <div className="sum-row total">
            <span>Gjendja e re</span>
            <Balance value={gjendjaRe} currency={monedha} showLabel />
          </div>

          {error && <div className="alert error">{error}</div>}
          {info && <div className="alert success">{info}</div>}
          <div className="inv-actions">
            <button className="btn" onClick={onSaveDraft} disabled={busy}><Save size={16} /> Ruaj draft</button>
            {perms.has('fature_leshim') && (
              <button className="btn primary big-btn" onClick={onIssue} disabled={busy}>
                <Send size={16} /> {busy ? 'Duke lëshuar…' : 'Lësho faturën'}
              </button>
            )}
          </div>
        </div>
      </div>

      {drafts.length > 0 && (
        <div className="card">
          <h3><FileText size={16} /> Draftet ({drafts.length})</h3>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {drafts.map((d) => (
                  <tr key={d.id} className={d.id === draftId ? 'selected' : ''}>
                    <td>{d.klient?.emri ?? <span className="muted">Pa klient</span>}</td>
                    <td className="num">{formatMoney(d.totali, d.monedha)}</td>
                    <td className="muted small">{formatDate(d.ndryshuar)} · {d.krijuarNga?.emri}</td>
                    <td className="num">
                      <Link className="btn small" to={`/fature-e-re?draft=${d.id}`}>Hap</Link>{' '}
                      <button className="icon-btn danger-text" onClick={() => onDeleteDraft(d.id)} aria-label="Fshi draftin"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {creatingClient && (
        <ClientFormModal onClose={() => setCreatingClient(false)} onSaved={(id) => pickClient(id)} />
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="sum-row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
