import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { getDoc } from 'firebase/firestore'
import { Trash2, UserPlus, Save, CheckCircle2, CheckCheck, FileText, AlertTriangle, RotateCcw, Pencil, Clock, Plus, MessageSquareText, Calculator, Wallet, Scale } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { useSettings } from '../../hooks/useSettings'
import { watchClients } from '../../services/clientService'
import { watchItems, watchPricesForClient } from '../../services/itemService'
import { saveDraft, deleteDraft, issueInvoice, watchDrafts, watchNextInvoiceNumber } from '../../services/invoiceService'
import { formatDocNumber } from '../../services/settingsService'
import { watchStock } from '../../services/stockService'
import { companyDoc } from '../../services/paths'
import { rateFor } from '../../services/ledgerService'
import { errorMessage } from '../../services/authService'
import { PAYMENT_METHODS, canLedger } from '../../config/ledger'
import { CURRENCIES, RATE_SCALE, formatMoney, formatRate, parseMoney, parseRate } from '../../utils/money'
import { fromInputDate, toInputDate, formatDate } from '../../utils/date'
import { matchesSearch } from '../../utils/text'
import SearchPicker from '../../components/SearchPicker'
import ClientFormModal from '../clients/ClientFormModal'

let keySeq = 0
const newKey = () => `r${++keySeq}`
const emptyLine = () => ({ key: newKey(), itemId: null, kodi: '', emri: '', njesia: '', sasia: '1', cmimiText: '', auto: 0, manual: false })

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
  const { data: nextNumber } = useLive(watchNextInvoiceNumber, [], { initial: null })

  const [clientId, setClientId] = useState('')
  const [monedha, setMonedha] = useState('LEK')
  const [kursiText, setKursiText] = useState('')
  const [dataText, setDataText] = useState(toInputDate())
  const [lines, setLines] = useState([emptyLine()])
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
  const [showDrafts, setShowDrafts] = useState(false)
  // Navigimi me tastierë: refs për fushat e çdo rreshti dhe fusha që merr fokusin
  const fieldRefs = useRef({})
  const [focusTarget, setFocusTarget] = useState(null) // { key, field: 'qty' | 'item' }
  const refFor = (key, field) => (el) => {
    if (el) fieldRefs.current[`${key}:${field}`] = el
    else delete fieldRefs.current[`${key}:${field}`]
  }
  useEffect(() => {
    if (!focusTarget) return
    const el = fieldRefs.current[`${focusTarget.key}:${focusTarget.field}`]
    if (el) {
      el.focus()
      el.select?.()
    }
    setFocusTarget(null)
  }, [focusTarget, lines])

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
      setLines([
        ...(d.rreshtat ?? []).map((r) => ({
          key: newKey(), itemId: r.itemId, kodi: r.kodi, emri: r.emri, njesia: r.njesia, sasia: String(r.sasia),
          cmimiText: formatMoney(r.cmimi), auto: r.cmimiOrigjinal ?? r.cmimi, manual: r.cmimiOrigjinal != null,
        })),
        emptyLine(),
      ])
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
  function setItem(key, itemId) {
    const item = itemsById[itemId]
    if (!item) return
    const auto = autoPrice(item, prefs, monedha, kursi)
    setLines((ls) => {
      const next = ls.map((l) => (l.key === key ? { ...l, itemId, kodi: item.kodi, emri: item.emri, njesia: item.njesia, sasia: '', cmimiText: formatMoney(auto), auto, manual: false } : l))
      // Gjithmonë një rresht bosh në fund për artikullin e radhës
      return next[next.length - 1].itemId ? [...next, emptyLine()] : next
    })
    setFocusTarget({ key, field: 'qty' })
  }

  /** Tastiera te sasia: ↓ / ↑ kalon rreshtin pa ndryshuar numrin; Enter → artikulli i radhës. */
  function onQtyKey(e, key) {
    const idx = lines.findIndex((l) => l.key === key)
    const go = (target) => {
      if (!target) return
      setFocusTarget({ key: target.key, field: target.itemId ? 'qty' : 'item' })
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      go(lines[idx + 1])
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      go(lines.slice(0, idx).reverse().find((l) => l.itemId))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const empty = lines.find((l) => !l.itemId)
      if (empty) setFocusTarget({ key: empty.key, field: 'item' })
    }
  }
  const updateLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const removeLine = (key) => setLines((ls) => {
    const next = ls.filter((l) => l.key !== key)
    return next.length && !next[next.length - 1].itemId ? next : [...next, emptyLine()]
  })
  const addRow = () => setLines((ls) => (ls[ls.length - 1]?.itemId ? [...ls, emptyLine()] : ls))

  const filled = lines.filter((l) => l.itemId)
  const parsed = filled.map((l) => {
    const sasia = Number(l.sasia)
    const cmimi = parseMoney(l.cmimiText)
    const ok = Number.isInteger(sasia) && sasia > 0 && cmimi != null && cmimi >= 0
    return { ...l, sasiaN: sasia, cmimi, ok, totali: ok ? sasia * cmimi : 0 }
  })
  const parsedByKey = Object.fromEntries(parsed.map((l) => [l.key, l]))
  const totali = parsed.reduce((s, l) => s + l.totali, 0)
  const qtyByItem = {}
  for (const l of parsed) if (l.ok) qtyByItem[l.itemId] = (qtyByItem[l.itemId] ?? 0) + l.sasiaN
  const overStock = (itemId) => (qtyByItem[itemId] ?? 0) > (stock[itemId] ?? 0)

  // ---------- Gjendja / pagesa ----------
  const gjAuto = client?.gjendje?.[monedha] ?? 0
  const gjManual = gjParaText != null ? parseMoney(gjParaText) : null
  const gjendjaPara = gjManual ?? gjAuto
  const manualChanged = gjParaText != null && gjManual != null && gjManual !== gjAuto

  const paguar = paguarText.trim() ? parseMoney(paguarText) : 0
  const gjendjaRe = gjendjaPara + totali - (paguar ?? 0)

  function payload(paidOverride) {
    return {
      clientId,
      client,
      monedha,
      kursi,
      data: fromInputDate(dataText),
      rreshtat: parsed.map((l) => ({
        itemId: l.itemId, kodi: l.kodi, emri: l.emri, njesia: l.njesia, sasia: l.sasiaN, cmimi: l.cmimi,
        cmimiOrigjinal: l.manual ? l.auto : null,
      })),
      shenime,
      paguar: paidOverride ?? paguar ?? 0,
      metodaPagese: metoda,
      gjendjaParaManual: manualChanged ? gjManual : null,
      arsyeRregullimi: arsye,
    }
  }

  function validate(forIssue) {
    if (!clientId) return 'Zgjidhni klientin.'
    if (monedha !== 'LEK' && (!kursi || kursi <= 0)) return 'Kursi i monedhës nuk është i vlefshëm.'
    if (!filled.length) return 'Shtoni të paktën një artikull.'
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

  /** Lëshon faturën; `paidFull` = paguhet i gjithë detyrimi (Ruaj si të paguar). */
  async function onIssue(paidFull) {
    setError('')
    setInfo('')
    const v = validate(true)
    if (v) return setError(v)
    const pay = paidFull ? Math.max(0, gjendjaPara + totali) : (paguar ?? 0)
    const after = gjendjaPara + totali - pay
    const msg =
      `${paidFull ? 'Të lëshohet si e PAGUAR' : 'Të lëshohet'} fatura për ${client.emri}?\n\n` +
      `Totali: ${formatMoney(totali, monedha)}\n` +
      `Gjendja (+): ${formatMoney(gjendjaPara, monedha)}\n` +
      `Paguar (−): ${formatMoney(pay, monedha)} (${PAYMENT_METHODS[metoda]})\n` +
      `Detyrimi përfundimtar: ${formatMoney(after, monedha)}\n\n` +
      'Pas lëshimit fatura nuk ndryshohet (korrigjohet me anulim).'
    if (!window.confirm(msg)) return
    setBusy(true)
    try {
      const { id } = await issueInvoice(draftId, payload(pay), profile?.emri)
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
      if (id === draftId) resetForm()
    } catch (err) {
      setError(err.code ? errorMessage(err) : err.message)
    }
  }

  function resetForm() {
    navigate('/fature-e-re')
    setClientId('')
    setLines([emptyLine()])
    setShenime('')
    setPaguarText('')
    setPaguarTouched(false)
    setGjParaText(null)
    setArsye('')
    setError('')
    setInfo('')
    setDataText(toInputDate())
  }

  const clientOptions = useMemo(
    () =>
      clients
        .filter((c) => !c.arkivuar)
        .sort((a, b) => (b.rastesor ? 1 : 0) - (a.rastesor ? 1 : 0) || a.emri.localeCompare(b.emri, 'sq'))
        .map((c) => ({ id: c.id, label: c.emri, sub: [c.kodi, c.qyteti].filter(Boolean).join(' · '), search: [c.kodi, c.emri, c.qyteti, c.telefoni] })),
    [clients],
  )
  const numberPreview = nextNumber ? formatDocNumber(settings.numerimi.invoices, nextNumber) : '…'

  return (
    <div className="invoice-editor ni">
      <div className="ni-head">
        <h1>Faturë e Re</h1>
        <div className="muted small">Sistemi i Menaxhimit për {settings.kompania.emri}</div>
      </div>

      <div className="card ni-card">
        {/* Koka: kompania · PASTRO · FATURË · monedha · numri */}
        <div className="ni-top">
          <div className="ni-company">
            <div className="ni-company-name">
              {settings.kompania.emri}
              {perms.has('admin') && <Link to="/cilesimet" className="icon-btn" title="Të dhënat e kompanisë"><Pencil size={13} /></Link>}
            </div>
            <div className="ni-company-sub"><Clock size={12} /> Faturë: {formatDate(fromInputDate(dataText))}{draftId && <span className="tag">Draft</span>}</div>
          </div>
          <div className="ni-title-block">
            <div className="ni-title-row">
              <button type="button" className="ni-reset" onClick={resetForm}><RotateCcw size={13} /> Pastro</button>
              <span className="ni-title">{settings.etiketat.fatura}</span>
            </div>
            <div className="ni-title-row">
              <div className="ni-cur">
                {Object.keys(CURRENCIES).map((c) => (
                  <button key={c} type="button" className={monedha === c ? 'active' : ''} onClick={() => changeCurrency(c)}>{c}</button>
                ))}
              </div>
              <div className="ni-number" title="Numri jepet përfundimisht kur lëshohet fatura"><span>#</span>{numberPreview}</div>
            </div>
            {monedha !== 'LEK' && (
              <label className="ni-rate">1 {monedha} = <input inputMode="decimal" value={kursiText} onChange={(e) => setKursiText(e.target.value)} /> LEK</label>
            )}
          </div>
        </div>

        {/* Klienti · Kontakti · Data */}
        <div className="ni-client-row">
          <div className="field">
            <span>Klienti</span>
            <div className="picker-row">
              <div className="grow"><SearchPicker options={clientOptions} value={clientId} onChange={pickClient} placeholder="Emri i klientit…" /></div>
              {perms.has('kliente_ndrysho') && (
                <button type="button" className="btn" onClick={() => setCreatingClient(true)} title="Klient i ri"><UserPlus size={16} /></button>
              )}
            </div>
          </div>
          <div className="field">
            <span>Kontakti</span>
            <div className="ni-contact">
              {client ? (
                <>
                  <div>{client.telefoni || <span className="muted">Pa telefon</span>}</div>
                  <div className="muted small">{[client.qyteti, client.adresa].filter(Boolean).join(' · ')}</div>
                </>
              ) : <span className="muted small">Zgjidhni klientin</span>}
            </div>
          </div>
          <label className="field ni-date">
            <span>Data e faturës</span>
            <input type="date" value={dataText} onChange={(e) => setDataText(e.target.value)} />
          </label>
        </div>

        {/* Artikujt */}
        <div className="ni-lines">
          <div className="ni-lines-head">
            <span>Artikulli</span><span className="c">Sasia</span><span className="c">Çmimi ({CURRENCIES[monedha].symbol})</span><span className="r">Shuma</span><span />
          </div>
          {lines.map((l) => {
            const p = parsedByKey[l.key]
            return (
              <div key={l.key} className={`ni-line ${p && !p.ok ? 'row-error' : ''}`}>
                <div className="ni-item">
                  {l.itemId ? (
                    <>
                      <b>{l.emri}</b> <span className="muted small mono">{l.kodi}</span>
                      {l.manual && p?.cmimi !== l.auto && (
                        <div className="small muted">
                          Çmimi automatik: <s>{formatMoney(l.auto)}</s>
                          <button type="button" className="btn link small" onClick={() => updateLine(l.key, { cmimiText: formatMoney(l.auto), manual: false })}>rikthe</button>
                        </div>
                      )}
                      {!l.manual && prefs[l.itemId] != null && <div className="small muted">Çmim preferencial</div>}
                      {overStock(l.itemId) && <div className="small stock-warn"><AlertTriangle size={12} /> Stoku: {stock[l.itemId] ?? 0} {l.njesia}</div>}
                    </>
                  ) : (
                    <ItemSearch inputRef={refFor(l.key, 'item')} items={items} prefs={prefs} stock={stock} onPick={(id) => setItem(l.key, id)} />
                  )}
                </div>
                <input
                  ref={refFor(l.key, 'qty')}
                  className="ni-qty"
                  type="text"
                  inputMode="numeric"
                  placeholder={l.itemId ? 'Sasia' : ''}
                  value={l.sasia}
                  disabled={!l.itemId}
                  onChange={(e) => updateLine(l.key, { sasia: e.target.value.replace(/[^0-9]/g, '') })}
                  onKeyDown={(e) => onQtyKey(e, l.key)}
                />
                <input className="ni-price" inputMode="decimal" placeholder="0" value={l.cmimiText} disabled={!l.itemId}
                  onChange={(e) => updateLine(l.key, { cmimiText: e.target.value, manual: parseMoney(e.target.value) !== l.auto })} />
                <div className="ni-sum">{formatMoney(p?.totali ?? 0)}</div>
                <button type="button" className="icon-btn danger-text" onClick={() => removeLine(l.key)} aria-label="Hiq rreshtin" disabled={!l.itemId}><Trash2 size={16} /></button>
              </div>
            )
          })}
        </div>
        <button type="button" className="ni-add-row" onClick={addRow}><Plus size={16} /> Shto rresht të ri</button>

        <div className="ni-bottom">
          <div className="ni-notes">
            <div className="ni-section-title"><MessageSquareText size={15} /> Shënime për këtë faturë</div>
            <textarea rows={4} value={shenime} onChange={(e) => setShenime(e.target.value)} placeholder="Shkruaj shënime shtesë këtu…" />
          </div>

          <div className="ni-calc">
            <div className="ni-section-title pink"><Calculator size={15} /> Llogaritja finale</div>
            <div className="ni-box">
              <span>{settings.etiketat.nentotali}:</span><b>{formatMoney(totali, monedha)}</b>
            </div>
            <div className="ni-box yellow">
              <label><Scale size={13} /> {settings.etiketat.gjendja} (+)</label>
              <input inputMode="decimal" value={gjParaText ?? formatMoney(gjAuto)} disabled={!client || !canManualBalance}
                title={canManualBalance ? 'Gjendja e mëparshme e klientit (mund ta ndryshoni me arsye)' : 'Gjendja e mëparshme e klientit'}
                onChange={(e) => setGjParaText(e.target.value)} />
              {manualChanged && (
                <div className="ni-manual">
                  <div className="small">Llogaritur {formatMoney(gjAuto)} → {formatMoney(gjManual)} (diferenca {formatMoney(gjManual - gjAuto)}). Ruhet si "rregullim manual" në kartelë.</div>
                  <input placeholder="Arsyeja e ndryshimit *" value={arsye} onChange={(e) => setArsye(e.target.value)} />
                  <button type="button" className="btn link small" onClick={() => { setGjParaText(null); setArsye('') }}>Rikthe vlerën e llogaritur</button>
                </div>
              )}
            </div>
            <div className="ni-box green">
              <label><Wallet size={13} /> {settings.etiketat.paguar} (−)</label>
              <input inputMode="decimal" placeholder="0" value={paguarText} onChange={(e) => { setPaguarText(e.target.value); setPaguarTouched(true) }} />
              <div className="ni-method">
                {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                  <button key={k} type="button" className={metoda === k ? 'active' : ''} onClick={() => setMetoda(k)}>{v}</button>
                ))}
              </div>
            </div>
            <div className={`ni-final ${gjendjaRe < 0 ? 'credit' : ''}`}>
              <span>{gjendjaRe < 0 ? `${settings.etiketat.teprica} përfundimtare` : `${settings.etiketat.detyrimi} përfundimtar`}</span>
              <div><b>{formatMoney(Math.abs(gjendjaRe))}</b> <small>{monedha}</small></div>
              <Calculator className="ni-final-icon" size={54} />
            </div>

            {error && <div className="alert error">{error}</div>}
            {info && <div className="alert success">{info}</div>}
            {perms.has('fature_leshim') && (
              <>
                <button type="button" className="ni-btn pink" onClick={() => onIssue(false)} disabled={busy}><CheckCircle2 size={18} /> {busy ? 'Duke ruajtur…' : 'Ruaj faturën'}</button>
                <button type="button" className="ni-btn green" onClick={() => onIssue(true)} disabled={busy}><CheckCheck size={18} /> Ruaj si të paguar</button>
              </>
            )}
            <button type="button" className="btn link ni-draft-link" onClick={onSaveDraft} disabled={busy}><Save size={14} /> Ruaj si draft (pa numër)</button>
          </div>
        </div>
      </div>

      {drafts.length > 0 && (
        <div className="card">
          <button type="button" className="btn link" onClick={() => setShowDrafts((s) => !s)}><FileText size={15} /> Draftet e ruajtura ({drafts.length}) {showDrafts ? '▲' : '▼'}</button>
          {showDrafts && (
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
          )}
        </div>
      )}

      {creatingClient && <ClientFormModal onClose={() => setCreatingClient(false)} onSaved={(id) => pickClient(id)} />}
    </div>
  )
}

/** Kërkimi i artikullit direkt në rresht. */
function ItemSearch({ items, prefs, stock, onPick, inputRef }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const ref = useRef(null)
  const list = useMemo(
    () => items.filter((i) => !i.arkivuar && matchesSearch(q, i.kodi, i.emri, i.kategoria)).slice(0, 12),
    [items, q],
  )
  function pick(id) {
    onPick(id)
    setQ('')
    setOpen(false)
  }
  return (
    <div className="picker ni-item-search" ref={ref}>
      <input
        ref={inputRef}
        placeholder="Kërko artikullin…"
        value={q}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
          if (e.key === 'Enter' && list[hi]) { e.preventDefault(); pick(list[hi].id) }
        }}
      />
      {open && (
        <div className="picker-list">
          {list.map((i, idx) => (
            <button type="button" key={i.id} className={`picker-item ${idx === hi ? 'hi' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(i.id)}>
              <span><b>{i.emri}</b> <small className="muted mono">{i.kodi}</small></span>
              <small className="muted">{formatMoney(prefs[i.id] ?? i.cmimi, 'LEK')}{prefs[i.id] != null ? ' (pref.)' : ''} · stoku {stock[i.id] ?? 0}</small>
            </button>
          ))}
          {!list.length && <div className="picker-empty muted small">Asnjë artikull</div>}
        </div>
      )}
    </div>
  )
}
