import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { watchItems, watchPricesForClient, setPreferentialPrice, removePreferentialPrice } from '../../services/itemService'
import { errorMessage } from '../../services/authService'
import { canEditItems } from '../../config/ledger'
import { formatMoney, parseMoney } from '../../utils/money'
import SearchPicker from '../../components/SearchPicker'

/** Çmimet preferenciale të një klienti (çmimet janë në LEK). */
export default function ClientPricesTab({ client }) {
  const { perms, profile } = useAuth()
  const editable = canEditItems(perms)
  const { data: prices, error } = useLive((ok, ko) => watchPricesForClient(client.id, ok, ko), [client.id], { initial: [] })
  const { data: items } = useLive(watchItems, [], { initial: [] })
  const [itemId, setItemId] = useState('')
  const [cmimi, setCmimi] = useState('')
  const [msg, setMsg] = useState('')

  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items])
  const options = useMemo(
    () => items.filter((i) => !i.arkivuar).map((i) => ({ id: i.id, label: `${i.kodi} – ${i.emri}`, sub: formatMoney(i.cmimi, 'LEK'), search: [i.kodi, i.emri] })),
    [items],
  )
  const rows = prices
    .map((p) => ({ ...p, item: byId[p.itemId] }))
    .sort((a, b) => (a.item?.emri ?? '').localeCompare(b.item?.emri ?? '', 'sq'))

  async function add(e) {
    e.preventDefault()
    setMsg('')
    const v = parseMoney(cmimi)
    if (!itemId) return setMsg('Zgjidhni artikullin.')
    if (v == null || v < 0) return setMsg('Çmimi nuk është i vlefshëm.')
    try {
      await setPreferentialPrice(itemId, client.id, v, profile?.emri)
      setItemId('')
      setCmimi('')
    } catch (err) {
      setMsg(err.code ? errorMessage(err) : err.message)
    }
  }

  async function remove(p) {
    if (!window.confirm(`Të hiqet çmimi preferencial për "${p.item?.emri ?? p.itemId}"?`)) return
    try {
      await removePreferentialPrice(p.itemId, client.id, profile?.emri)
    } catch (err) {
      window.alert(err.code ? errorMessage(err) : err.message)
    }
  }

  return (
    <div className="card">
      {error && <div className="alert error">{errorMessage(error)}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Kodi</th>
              <th>Artikulli</th>
              <th className="num">Çmimi standard</th>
              <th className="num">Çmimi preferencial</th>
              <th className="num">Zbritja</th>
              {editable && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const std = p.item?.cmimi ?? 0
              const pct = std ? Math.round(((std - p.cmimi) * 1000) / std) / 10 : 0
              return (
                <tr key={p.id}>
                  <td className="mono">{p.item?.kodi ?? '—'}</td>
                  <td>{p.item?.emri ?? <span className="muted">Artikull i panjohur</span>}</td>
                  <td className="num">{formatMoney(std, 'LEK')}</td>
                  <td className="num"><b>{formatMoney(p.cmimi, 'LEK')}</b></td>
                  <td className="num">{pct ? `${pct}%` : '—'}</td>
                  {editable && (
                    <td className="num">
                      <button className="icon-btn danger-text" onClick={() => remove(p)} aria-label="Hiq"><Trash2 size={16} /></button>
                    </td>
                  )}
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={6} className="muted">Ky klient nuk ka çmime preferenciale.</td></tr>}
          </tbody>
        </table>
      </div>

      {editable && (
        <form className="inline-form" onSubmit={add}>
          <div className="grow"><SearchPicker options={options} value={itemId} onChange={setItemId} placeholder="Kërko artikullin…" exclude={prices.map((p) => p.itemId)} /></div>
          <input className="price-input" inputMode="decimal" placeholder="Çmimi (LEK)" value={cmimi} onChange={(e) => setCmimi(e.target.value)} />
          <button className="btn primary">Shto</button>
        </form>
      )}
      {msg && <div className="alert error">{msg}</div>}
    </div>
  )
}
