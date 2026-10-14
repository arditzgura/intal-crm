import { forwardRef, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, FileDown, Ban } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { useSettings } from '../../hooks/useSettings'
import { watchPurchase, cancelPurchase } from '../../services/purchaseService'
import { errorMessage } from '../../services/authService'
import { formatMoney } from '../../utils/money'
import { formatDate, formatDateTime } from '../../utils/date'
import { downloadPdf, printInvoice } from '../../utils/exportInvoice'
import Modal from '../../components/Modal'

export default function PurchaseViewPage() {
  const { id } = useParams()
  const { perms, profile } = useAuth()
  const { settings } = useSettings()
  const docRef = useRef(null)
  const [cancelling, setCancelling] = useState(false)
  const [msg, setMsg] = useState('')
  const { data: p, loading, error } = useLive((ok, ko) => watchPurchase(id, ok, ko), [id])

  if (loading) return <div className="card muted">Duke u ngarkuar…</div>
  if (error) return <div className="alert error">{errorMessage(error)}</div>
  if (!p) return <div className="card">Hyrja nuk u gjet. <Link to="/blerje">Blerje</Link></div>

  return (
    <div>
      <div className="no-print">
        <Link to="/blerje" className="back-link"><ArrowLeft size={16} /> Blerje</Link>
        <div className="card">
          <div className="client-title">
            <div>
              <h1>
                Hyrja e mallit {p.numriTekst}{' '}
                {p.statusi === 'anuluar' ? <span className="status st-anuluar">Anuluar</span> : <span className="status st-e_paguar">Regjistruar</span>}
              </h1>
              <div className="muted">
                {p.furnitorId ? <Link to={`/kliente/${p.furnitorId}?skeda=furnitori`}>{p.origjinaEmri}</Link> : p.origjinaEmri} · {formatDate(p.data)} · {formatMoney(p.totaliBlerje, p.monedha)}
              </div>
              {p.anuluar && <div className="alert error inline-block">Anuluar më {formatDateTime(p.anuluar.koha)} nga {p.anuluar.emri}: {p.anuluar.arsye}</div>}
            </div>
            <div className="actions">
              {perms.has('blerje_anulo') && p.statusi === 'regjistruar' && (
                <button className="btn danger" onClick={() => setCancelling(true)}><Ban size={16} /> Anulo</button>
              )}
            </div>
          </div>
          <div className="export-bar">
            <button className="btn" onClick={() => printInvoice({ format: 'a4' })}><Printer size={16} /> Printo</button>
            <button className="btn" onClick={() => downloadPdf(docRef.current, { numriTekst: p.numriTekst, klient: { emri: p.origjinaEmri } }).catch((e) => setMsg(e.message))}>
              <FileDown size={16} /> PDF
            </button>
            <span className="muted small">
              Regjistroi {p.krijuarNga?.emri} · {formatDateTime(p.krijuar)}
              {p.perditesoiKoston && ' · kosto u përditësua'}
              {p.perditesoiCmimin && ' · çmimi i shitjes u përditësua'}
            </span>
          </div>
          {msg && <div className="alert error">{msg}</div>}
        </div>
      </div>

      <div className="invoice-preview">
        <div className="invoice-print-area">
          <PurchaseDocument ref={docRef} p={p} settings={settings} />
        </div>
      </div>

      {cancelling && <CancelModal p={p} actorName={profile?.emri} onClose={() => setCancelling(false)} />}
    </div>
  )
}

const PurchaseDocument = forwardRef(function PurchaseDocument({ p, settings }, ref) {
  const k = settings.kompania
  const m = (v) => formatMoney(v ?? 0)
  return (
    <div ref={ref} className="inv inv-a4 tpl-klasik">
      {p.statusi === 'anuluar' && <div className="inv-stamp">ANULUAR</div>}
      <header className="inv-head">
        <div className="inv-company">
          {k.logo && <img src={k.logo} alt="" className="inv-logo" />}
          <div>
            <div className="inv-company-name">{k.emri}</div>
            <div className="inv-company-lines">
              {k.nipt && <span>NIPT: {k.nipt}</span>}
              {k.adresa && <span>{k.adresa}</span>}
            </div>
          </div>
        </div>
        <div className="inv-title">
          <div className="inv-title-label">HYRJE MALLI</div>
          <div className="inv-title-num">Nr. {p.numriTekst}</div>
          <div>Data: {formatDate(p.data)}</div>
          <div>Monedha: {p.monedha}</div>
        </div>
      </header>
      <section className="inv-client">
        <div className="inv-client-label">{p.furnitorId ? 'FURNITORI' : 'ORIGJINA'}</div>
        <div className="inv-client-name">{p.origjinaEmri}</div>
        <div className="inv-client-lines">
          {p.furnitor?.nipt && <span>NIPT: {p.furnitor.nipt}</span>}
          {p.kategoria && <span>Kategoria: {p.kategoria}</span>}
        </div>
      </section>
      <table className="inv-items">
        <thead>
          <tr>
            <th className="c-nr">Nr.</th>
            <th>Artikulli</th>
            <th className="c-unit">Njësia</th>
            <th className="num">Sasia</th>
            <th className="num">Çm. blerjes</th>
            <th className="num">Vlera blerje</th>
            <th className="num">Çm. shitjes</th>
            <th className="num">Vlera shitje</th>
          </tr>
        </thead>
        <tbody>
          {p.rreshtat.map((r, i) => (
            <tr key={i}>
              <td className="c-nr">{i + 1}</td>
              <td>{r.emri} <span className="inv-code">({r.kodi})</span></td>
              <td className="c-unit">{r.njesia}</td>
              <td className="num">{r.sasia}</td>
              <td className="num">{m(r.cmimiBlerjes)}</td>
              <td className="num">{m(r.totaliBlerje)}</td>
              <td className="num">{m(r.cmimiShitjes)}</td>
              <td className="num">{m(r.totaliShitje)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="inv-bottom">
        <div className="inv-left">{p.shenime && <div className="inv-notes"><b>Shënime:</b> {p.shenime}</div>}</div>
        <table className="inv-totals">
          <tbody>
            <tr className="strong"><td>Totali (blerje)</td><td className="num">{m(p.totaliBlerje)} {p.monedha}</td></tr>
            <tr><td>Totali (shitje)</td><td className="num">{m(p.totaliShitje)} LEK</td></tr>
          </tbody>
        </table>
      </div>
      <footer className="inv-foot">
        <div className="inv-sign"><div>Dorëzoi</div><div>Pranoi (magazina)</div></div>
      </footer>
    </div>
  )
})

function CancelModal({ p, actorName, onClose }) {
  const [arsye, setArsye] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await cancelPurchase(p.id, arsye, actorName)
      onClose()
    } catch (err) {
      setError(err.code ? errorMessage(err) : err.message)
      setBusy(false)
    }
  }
  return (
    <Modal title={`Anulo hyrjen ${p.numriTekst}`} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <p>
          Hyrja merr statusin <b>Anuluar</b>. Sasitë zbriten nga stoku
          {p.furnitorId ? ` dhe detyrimi ndaj furnitorit ulet me ${formatMoney(p.totaliBlerje, p.monedha)}` : ''}. Kosto e
          artikujve nuk kthehet automatikisht.
        </p>
        <label className="field">
          <span>Arsyeja *</span>
          <textarea rows={3} value={arsye} onChange={(e) => setArsye(e.target.value)} required autoFocus />
        </label>
        {error && <div className="alert error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Mbyll</button>
          <button className="btn danger" disabled={busy || !arsye.trim()}>{busy ? 'Duke anuluar…' : 'Anulo hyrjen'}</button>
        </div>
      </form>
    </Modal>
  )
}
