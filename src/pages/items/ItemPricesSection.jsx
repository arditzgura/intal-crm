import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import SearchPicker from '../../components/SearchPicker'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { watchPricesForItem, setPreferentialPrice, removePreferentialPrice } from '../../services/itemService'
import { watchClients } from '../../services/clientService'
import { errorMessage } from '../../services/authService'
import { formatMoney, parseMoney } from '../../utils/money'

/** Çmimet preferenciale të artikullit: klient → çmim. */
export default function ItemPricesSection({ item, readOnly }) {
  const { profile } = useAuth()
  const { data: prices, error } = useLive((ok, ko) => watchPricesForItem(item.id, ok, ko), [item.id], { initial: [] })
  const { data: clients } = useLive(watchClients, [], { initial: [] })
  const [clientId, setClientId] = useState('')
  const [cmimi, setCmimi] = useState('')
  const [msg, setMsg] = useState('')

  const byId = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])
  const options = useMemo(
    () => clients.filter((c) => !c.arkivuar && !c.rastesor).map((c) => ({ id: c.id, label: `${c.kodi} – ${c.emri}`, sub: c.qyteti, search: [c.kodi, c.emri, c.qyteti] })),
    [clients],
  )

  async function add(e) {
    e.preventDefault()
    setMsg('')
    const v = parseMoney(cmimi)
    if (!clientId) return setMsg('Zgjidhni klientin.')
    if (v == null || v < 0) return setMsg('Çmimi nuk është i vlefshëm.')
    try {
      await setPreferentialPrice(item.id, clientId, v, profile?.emri)
      setClientId('')
      setCmimi('')
    } catch (err) {
      setMsg(err.code ? errorMessage(err) : err.message)
    }
  }

  async function remove(p) {
    if (!window.confirm('Të hiqet ky çmim preferencial?')) return
    try {
      await removePreferentialPrice(item.id, p.clientId, profile?.emri)
    } catch (err) {
      setMsg(err.code ? errorMessage(err) : err.message)
    }
  }

  const rows = prices.map((p) => ({ ...p, client: byId[p.clientId] })).sort((a, b) => (a.client?.emri ?? '').localeCompare(b.client?.emri ?? '', 'sq'))

  return (
    <div className="card">
      <p className="muted small">Te Fatura e Re, çmimi merret automatikisht: 1) çmimi preferencial i klientit, 2) përndryshe çmimi standard ({formatMoney(item.cmimi, 'LEK')}).</p>
      {error && <div className="alert error">{errorMessage(error)}</div>}
      <table className="table">
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.client ? `${p.client.kodi} – ${p.client.emri}` : <span className="muted">Klient i panjohur</span>}</td>
              <td className="num"><b>{formatMoney(p.cmimi, 'LEK')}</b></td>
              {!readOnly && (
                <td className="num" style={{ width: 40 }}>
                  <button type="button" className="icon-btn danger-text" onClick={() => remove(p)} aria-label="Hiq"><Trash2 size={16} /></button>
                </td>
              )}
            </tr>
          ))}
          {!rows.length && <tr><td className="muted">Asnjë çmim preferencial.</td></tr>}
        </tbody>
      </table>
      {!readOnly && (
        <form className="inline-form" onSubmit={add}>
          <div className="grow"><SearchPicker options={options} value={clientId} onChange={setClientId} placeholder="Kërko klientin…" exclude={prices.map((p) => p.clientId)} /></div>
          <input className="price-input" inputMode="decimal" placeholder="Çmimi (LEK)" value={cmimi} onChange={(e) => setCmimi(e.target.value)} />
          <button className="btn primary">Shto</button>
        </form>
      )}
      {msg && <div className="alert error">{msg}</div>}
    </div>
  )
}
