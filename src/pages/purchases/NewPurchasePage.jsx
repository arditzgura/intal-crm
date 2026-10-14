import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2, UserPlus, Save } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { useSettings } from '../../hooks/useSettings'
import { watchClients } from '../../services/clientService'
import { watchItems, watchItemCosts } from '../../services/itemService'
import { watchStock } from '../../services/stockService'
import { createPurchase } from '../../services/purchaseService'
import { rateFor } from '../../services/ledgerService'
import { errorMessage } from '../../services/authService'
import { canSeeCost } from '../../config/roles'
import { CURRENCIES, RATE_SCALE, formatMoney, formatRate, parseMoney, parseRate } from '../../utils/money'
import { fromInputDate, toInputDate } from '../../utils/date'
import SearchPicker from '../../components/SearchPicker'
import ClientFormModal from '../clients/ClientFormModal'

let seq = 0
const key = () => `p${++seq}`

export default function NewPurchasePage() {
  const { perms, profile } = useAuth()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const showCost = canSeeCost(perms)
  const canPrice = perms.has('artikuj_ndrysho')
  const { data: clients } = useLive(watchClients, [], { initial: [] })
  const { data: items } = useLive(watchItems, [], { initial: [] })
  const { data: costs } = useLive(watchItemCosts, [], { enabled: showCost, initial: {} })
  const { data: stock } = useLive(watchStock, [], { initial: {} })
  const origins = settings.kategorite.origjinat ?? ['Magazina Qendrore']
  const categories = settings.kategorite.blerje ?? []

  const [origjina, setOrigjina] = useState('brendshme')
  const [origjinaEmri, setOrigjinaEmri] = useState(origins[0] ?? '')
  const [furnitorId, setFurnitorId] = useState('')
  const [kategoria, setKategoria] = useState(categories[0] ?? '')
  const [monedha, setMonedha] = useState('LEK')
  const [kursiText, setKursiText] = useState('')
  const [dataText, setDataText] = useState(toInputDate())
  const [lines, setLines] = useState([])
  const [shenime, setShenime] = useState('')
  const [perditesoKoston, setPerditesoKoston] = useState(true)
  const [perditesoCmimin, setPerditesoCmimin] = useState(false)
  const [creatingSupplier, setCreatingSupplier] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const kursi = monedha === 'LEK' ? RATE_SCALE : parseRate(kursiText)
  const itemsById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items])

  function changeCurrency(c) {
    setMonedha(c)
    setKursiText(c === 'LEK' ? '' : formatRate(rateFor(c, settings)))
  }

  function addItem(itemId) {
    const it = itemsById[itemId]
    if (!it) return
    // Çmimi i blerjes sugjerohet nga kosto aktuale (në monedhën e hyrjes)
    const cost = costs[itemId]
    const buy = cost != null ? (monedha === 'LEK' || !kursi ? cost : Math.round((cost * RATE_SCALE) / kursi)) : null
    setLines((ls) => [...ls, {
      key: key(), itemId, kodi: it.kodi, emri: it.emri, njesia: it.njesia, sasia: '',
      blerjeText: buy != null ? formatMoney(buy) : '', shitjeText: formatMoney(it.cmimi ?? 0),
    }])
  }
  const update = (k, patch) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)))

  const parsed = lines.map((l) => {
    const sasia = Number(l.sasia)
    const blerje = parseMoney(l.blerjeText)
    const shitje = parseMoney(l.shitjeText)
    const ok = Number.isInteger(sasia) && sasia > 0 && blerje != null && blerje >= 0 && shitje != null && shitje >= 0
    return { ...l, sasiaN: sasia, blerje, shitje, ok, totBlerje: ok ? sasia * blerje : 0, totShitje: ok ? sasia * shitje : 0 }
  })
  const totaliBlerje = parsed.reduce((s, l) => s + l.totBlerje, 0)
  const totaliShitje = parsed.reduce((s, l) => s + l.totShitje, 0)

  async function onSave() {
    setError('')
    if (origjina === 'furnitor' && !furnitorId) return setError('Zgjidhni furnitorin.')
    if (origjina === 'brendshme' && !origjinaEmri) return setError('Zgjidhni origjinën.')
    if (monedha !== 'LEK' && (!kursi || kursi <= 0)) return setError('Kursi nuk është i vlefshëm.')
    if (!lines.length) return setError('Shtoni të paktën një artikull.')
    const bad = parsed.find((l) => !l.ok)
    if (bad) return setError(`Kontrolloni sasinë / çmimet e "${bad.emri}".`)
    const sup = clients.find((c) => c.id === furnitorId)
    const msg =
      `Të regjistrohet hyrja e mallit?\n\nOrigjina: ${origjina === 'furnitor' ? sup?.emri : origjinaEmri}\n` +
      `Totali (blerje): ${formatMoney(totaliBlerje, monedha)}\nArtikuj: ${lines.length}\n` +
      (origjina === 'furnitor' ? `\nKrijohet detyrim ndaj furnitorit: ${formatMoney(totaliBlerje, monedha)}` : '')
    if (!window.confirm(msg)) return
    setBusy(true)
    try {
      const { id } = await createPurchase(
        {
          data: fromInputDate(dataText),
          origjina,
          origjinaEmri,
          furnitorId,
          kategoria,
          monedha,
          kursi,
          rreshtat: parsed.map((l) => ({ itemId: l.itemId, kodi: l.kodi, emri: l.emri, njesia: l.njesia, sasia: l.sasiaN, cmimiBlerjes: l.blerje, cmimiShitjes: l.shitje })),
          shenime,
          perditesoKoston,
          perditesoCmimin,
        },
        { canCost: showCost, canPrice },
        profile?.emri,
      )
      navigate(`/blerje/${id}`, { replace: true })
    } catch (err) {
      setError(err.code ? errorMessage(err) : err.message)
      setBusy(false)
    }
  }

  const supplierOptions = useMemo(
    () => clients.filter((c) => !c.arkivuar && c.tipi !== 'klient').map((c) => ({ id: c.id, label: `${c.kodi} – ${c.emri}`, sub: c.qyteti, search: [c.kodi, c.emri, c.qyteti] })),
    [clients],
  )
  const itemOptions = useMemo(
    () => items.filter((i) => !i.arkivuar).map((i) => ({ id: i.id, label: `${i.kodi} – ${i.emri}`, sub: `Stoku: ${stock[i.id] ?? 0}`, search: [i.kodi, i.emri, i.kategoria] })),
    [items, stock],
  )

  return (
    <div>
      <Link to="/blerje" className="back-link"><ArrowLeft size={16} /> Blerje</Link>
      <h1 className="page-title">Hyrje e re malli</h1>

      <div className="card">
        <div className="grid-3">
          <label className="field">
            <span>Origjina</span>
            <select value={origjina} onChange={(e) => setOrigjina(e.target.value)}>
              <option value="brendshme">E brendshme (pa detyrim)</option>
              <option value="furnitor">Furnitor i jashtëm (krijon detyrim)</option>
            </select>
          </label>
          {origjina === 'brendshme' ? (
            <label className="field">
              <span>Nga</span>
              <select value={origjinaEmri} onChange={(e) => setOrigjinaEmri(e.target.value)}>
                {origins.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          ) : (
            <div className="field">
              <span>Furnitori *</span>
              <div className="picker-row">
                <div className="grow"><SearchPicker options={supplierOptions} value={furnitorId} onChange={setFurnitorId} placeholder="Kërko furnitorin…" /></div>
                {perms.has('kliente_ndrysho') && (
                  <button type="button" className="btn" onClick={() => setCreatingSupplier(true)} title="Furnitor i ri"><UserPlus size={16} /></button>
                )}
              </div>
            </div>
          )}
          <label className="field">
            <span>Kategoria</span>
            <select value={kategoria} onChange={(e) => setKategoria(e.target.value)}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Data</span>
            <input type="date" value={dataText} onChange={(e) => setDataText(e.target.value)} />
          </label>
          <label className="field">
            <span>Monedha e blerjes</span>
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
        </div>
      </div>

      <div className="card no-pad">
        <div className="table-wrap">
          <table className="table inv-lines">
            <thead>
              <tr>
                <th>Artikulli</th>
                <th className="num">Sasia</th>
                <th className="num">Çmimi i blerjes ({monedha})</th>
                <th className="num">Çmimi i shitjes (LEK)</th>
                <th className="num">Totali blerje</th>
                <th className="num">Totali shitje</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {parsed.map((l) => (
                <tr key={l.key} className={l.ok || !l.sasia ? '' : 'row-error'}>
                  <td className="wrap">
                    <b>{l.emri}</b> <span className="muted small mono">{l.kodi}</span>
                    <div className="small muted">Stoku aktual: {stock[l.itemId] ?? 0} {l.njesia}</div>
                  </td>
                  <td className="num"><input className="qty-input" type="number" min={1} step={1} value={l.sasia} onChange={(e) => update(l.key, { sasia: e.target.value })} autoFocus /></td>
                  <td className="num"><input className="price-input" inputMode="decimal" value={l.blerjeText} onChange={(e) => update(l.key, { blerjeText: e.target.value })} /></td>
                  <td className="num"><input className="price-input" inputMode="decimal" value={l.shitjeText} onChange={(e) => update(l.key, { shitjeText: e.target.value })} /></td>
                  <td className="num">{formatMoney(l.totBlerje)}</td>
                  <td className="num">{formatMoney(l.totShitje)}</td>
                  <td className="num"><button type="button" className="icon-btn danger-text" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Hiq"><Trash2 size={16} /></button></td>
                </tr>
              ))}
              {!lines.length && <tr><td colSpan={7} className="muted">Asnjë artikull ende.</td></tr>}
            </tbody>
            {lines.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={4}>Totali</td>
                  <td className="num">{formatMoney(totaliBlerje, monedha)}</td>
                  <td className="num">{formatMoney(totaliShitje, 'LEK')}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="add-line">
          <SearchPicker key={lines.length} options={itemOptions} value="" onChange={addItem} placeholder="+ Shto artikull (kërko me kod ose emër)…" />
        </div>
      </div>

      <div className="inv-summary-grid">
        <div className="card">
          <label className="field">
            <span>Shënime</span>
            <textarea rows={3} value={shenime} onChange={(e) => setShenime(e.target.value)} />
          </label>
        </div>
        <div className="card">
          {showCost && (
            <label className="check perm-check">
              <input type="checkbox" checked={perditesoKoston} onChange={(e) => setPerditesoKoston(e.target.checked)} />
              Përditëso koston e artikujve me çmimin e blerjes{monedha !== 'LEK' ? ' (konvertuar në LEK)' : ''}
            </label>
          )}
          {canPrice && (
            <label className="check perm-check">
              <input type="checkbox" checked={perditesoCmimin} onChange={(e) => setPerditesoCmimin(e.target.checked)} />
              Përditëso çmimin e shitjes së artikujve
            </label>
          )}
          {error && <div className="alert error">{error}</div>}
          <div className="inv-actions">
            <button className="btn primary big-btn" onClick={onSave} disabled={busy}><Save size={16} /> {busy ? 'Duke ruajtur…' : 'Regjistro hyrjen'}</button>
          </div>
        </div>
      </div>

      {creatingSupplier && (
        <ClientFormModal client={null} onClose={() => setCreatingSupplier(false)} onSaved={(id) => setFurnitorId(id)} defaultType="furnitor" />
      )}
    </div>
  )
}
