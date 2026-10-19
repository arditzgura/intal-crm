import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { watchClients, ensureWalkInClient } from '../../services/clientService'
import { errorMessage } from '../../services/authService'
import { CLIENT_TYPES, canEditClients } from '../../config/ledger'
import { matchesSearch } from '../../utils/text'
import Pagination, { usePaged } from '../../components/Pagination'
import { useSort, SortTh } from '../../hooks/useSort'
import Balance from '../../components/Balance'
import ClientFormModal from './ClientFormModal'

/** Klienti ka borxh (gjendje > 0) në të paktën një monedhë. */
const hasDebt = (c) => Object.values(c.gjendje ?? {}).some((v) => v > 0)

export default function ClientsPage() {
  const { perms, profile } = useAuth()
  const navigate = useNavigate()
  const { data: clients, loading, error } = useLive(watchClients, [], { initial: [] })
  const [q, setQ] = useState('')
  const [tipi, setTipi] = useState('')
  const [statusi, setStatusi] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const editable = canEditClients(perms)

  useEffect(() => {
    if (editable) ensureWalkInClient(profile?.emri).catch((err) => console.warn(err))
  }, [editable, profile?.emri])

  const filtered = useMemo(
    () =>
      clients
        .filter((c) => (showArchived ? true : !c.arkivuar))
        .filter((c) => !tipi || c.tipi === tipi || (c.tipi === 'te_dyja' && tipi !== ''))
        .filter((c) => !statusi || (statusi === 'pa_paguar') === hasDebt(c))
        .filter((c) => matchesSearch(q, c.emri, c.kodi, c.qyteti, c.telefoni, c.nipt)),
    [clients, q, tipi, statusi, showArchived],
  )
  const s = useSort(filtered, {
    kodi: (c) => c.kodi,
    emri: (c) => c.emri,
    qyteti: (c) => c.qyteti,
    telefoni: (c) => c.telefoni,
    tipi: (c) => CLIENT_TYPES[c.tipi],
    LEK: (c) => c.gjendje?.LEK ?? 0,
    EUR: (c) => c.gjendje?.EUR ?? 0,
    USD: (c) => c.gjendje?.USD ?? 0,
  }, { key: 'emri', dir: 'asc' })
  const paged = usePaged(s.sorted, `${q}|${tipi}|${s.sort?.key}|${s.sort?.dir}|${showArchived}`)

  const currencies = ['LEK', ...['EUR', 'USD'].filter((c) => clients.some((x) => x.gjendje?.[c]))]
  const totals = Object.fromEntries(
    currencies.map((c) => [c, filtered.reduce((s, x) => s + Math.max(0, x.gjendje?.[c] ?? 0), 0)]),
  )

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Klientë</h1>
        {editable && (
          <button className="btn primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> Klient i ri
          </button>
        )}
      </div>

      <div className="card filters">
        <input className="grow" placeholder="Kërko me emër, kod, qytet, telefon, NIPT…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={tipi} onChange={(e) => setTipi(e.target.value)}>
          <option value="">Të gjithë tipet</option>
          {Object.entries(CLIENT_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select className="status-select" value={statusi} onChange={(e) => setStatusi(e.target.value)} title="E paguar = pa borxh · Pa paguar = me borxh në një nga monedhat">
          <option value="">Të gjitha statuset</option>
          <option value="e_paguar">E paguar</option>
          <option value="pa_paguar">Pa paguar</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Të arkivuarit
        </label>
      </div>

      {error && <div className="alert error">{errorMessage(error)}</div>}

      <div className="card no-pad">
        <div className="table-wrap">
          <table className="table clickable-rows">
            <thead>
              <tr>
                <SortTh s={s} k="kodi">Kodi</SortTh>
                <SortTh s={s} k="emri">Emri / Biznesi</SortTh>
                <SortTh s={s} k="qyteti">Qyteti</SortTh>
                <SortTh s={s} k="telefoni">Telefoni</SortTh>
                <SortTh s={s} k="tipi">Tipi</SortTh>
                {currencies.map((c) => (
                  <SortTh key={c} s={s} k={c} className="num">Gjendja {c}</SortTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5 + currencies.length} className="muted">Duke u ngarkuar…</td></tr>
              )}
              {!loading && !paged.rows.length && (
                <tr><td colSpan={5 + currencies.length} className="muted">Asnjë klient.</td></tr>
              )}
              {paged.rows.map((c) => (
                <tr key={c.id} onClick={() => navigate(`/kliente/${c.id}`)} className={c.arkivuar ? 'archived' : ''}>
                  <td className="mono">{c.kodi}</td>
                  <td>
                    <b>{c.emri}</b>
                    {c.arkivuar && <span className="tag muted-tag">Arkivuar</span>}
                  </td>
                  <td>{c.qyteti}</td>
                  <td>{c.telefoni}</td>
                  <td>{CLIENT_TYPES[c.tipi] ?? ''}</td>
                  {currencies.map((cur) => (
                    <td key={cur} className="num">
                      {c.gjendje?.[cur] ? <Balance value={c.gjendje[cur]} currency={cur} /> : <span className="muted">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5} className="muted small">Totali i detyrimeve (klientët e filtruar)</td>
                  {currencies.map((c) => (
                    <td key={c} className="num"><Balance value={totals[c]} currency={c} /></td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <Pagination paged={paged} />
      </div>

      {creating && (
        <ClientFormModal
          onClose={() => setCreating(false)}
          onSaved={(id) => navigate(`/kliente/${id}`)}
        />
      )}
    </div>
  )
}
