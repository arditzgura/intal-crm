import { useCallback, useEffect, useState } from 'react'
import { Copy, Plus } from 'lucide-react'
import { createInvite, listCompanies, listInvites, setInviteActive } from '../services/companyService'
import { errorMessage } from '../services/authService'
import { formatDate } from '../utils/date'

/** Vetëm për pronarin e aplikacionit: kompanitë e regjistruara dhe kodet e ftesës. */
export default function SuperAdminPage() {
  const [companies, setCompanies] = useState(null)
  const [invites, setInvites] = useState(null)
  const [shenim, setShenim] = useState('')
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    try {
      const [c, i] = await Promise.all([listCompanies(), listInvites()])
      setCompanies(c)
      setInvites(i)
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) })
    }
  }, [])
  useEffect(() => { load() }, [load])

  const byCompany = Object.fromEntries((companies ?? []).map((c) => [c.id, c]))

  async function onCreate(e) {
    e.preventDefault()
    setMsg(null)
    try {
      const code = await createInvite(shenim)
      setShenim('')
      setMsg({ type: 'success', text: `Kodi i ri: ${code}` })
      await load()
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) })
    }
  }

  async function toggle(inv) {
    try {
      await setInviteActive(inv.code, !inv.aktiv)
      await load()
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) })
    }
  }

  return (
    <div>
      <h1 className="page-title">Super-Admin</h1>
      <p className="muted small">Vetëm për pronarin e aplikacionit. Kompanitë krijohen nga "Krijo llogari" me një kod ftese.</p>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}

      <div className="card no-pad">
        <h3 className="pad">Kompanitë ({companies?.length ?? '…'})</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Kompania</th><th>Administratori</th><th>Email</th><th>Kodi i ftesës</th><th>Regjistruar</th></tr></thead>
            <tbody>
              {!companies && <tr><td colSpan={5} className="muted">Duke u ngarkuar…</td></tr>}
              {companies?.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.emri}</b><div className="small muted mono">{c.id}</div></td>
                  <td>{c.ownerEmri ?? '—'}</td>
                  <td>{c.ownerEmail ?? '—'}</td>
                  <td className="mono">{c.kodiFtese ?? '—'}</td>
                  <td>{formatDate(c.krijuar)}</td>
                </tr>
              ))}
              {companies && !companies.length && <tr><td colSpan={5} className="muted">Asnjë kompani e regjistruar ende (INTAL ALBANIA është kompania fillestare dhe nuk shfaqet këtu).</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card no-pad">
        <div className="pad">
          <h3>Kodet e ftesës</h3>
          <form className="filters-inline" onSubmit={onCreate}>
            <input placeholder="Shënim (p.sh. për kë është kodi)" value={shenim} onChange={(e) => setShenim(e.target.value)} />
            <button className="btn primary"><Plus size={16} /> Krijo kod</button>
          </form>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Kodi</th><th>Shënim</th><th>Statusi</th><th>Përdorur nga</th><th>Krijuar</th></tr></thead>
            <tbody>
              {!invites && <tr><td colSpan={5} className="muted">Duke u ngarkuar…</td></tr>}
              {invites?.map((i) => (
                <tr key={i.code}>
                  <td className="mono">
                    <b>{i.code}</b>{' '}
                    <button type="button" className="icon-btn" title="Kopjo" onClick={() => navigator.clipboard?.writeText(i.code)}><Copy size={14} /></button>
                  </td>
                  <td>{i.shenim || <span className="muted">—</span>}</td>
                  <td>
                    {i.usedBy
                      ? <span className="badge muted-badge">Përdorur</span>
                      : <button type="button" className={`badge clickable ${i.aktiv ? 'success' : 'muted-badge'}`} onClick={() => toggle(i)} title="Kliko për ta ndryshuar">{i.aktiv ? 'Aktiv' : 'Çaktivizuar'}</button>}
                  </td>
                  <td>{i.companyId ? (byCompany[i.companyId]?.emri ?? i.companyId) : <span className="muted">—</span>}</td>
                  <td>{formatDate(i.krijuar)}</td>
                </tr>
              ))}
              {invites && !invites.length && <tr><td colSpan={5} className="muted">Asnjë kod ende.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
