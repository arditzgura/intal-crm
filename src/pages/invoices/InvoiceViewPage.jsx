import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, FileDown, Image as ImageIcon, MessageCircle, Ban, Pencil } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { onSnapshot } from 'firebase/firestore'
import { companyDoc } from '../../services/paths'
import { useSettings } from '../../hooks/useSettings'
import { watchInvoice, cancelInvoice, watchAuditFor } from '../../services/invoiceService'
import { STATUS_LABELS } from '../../services/invoiceChain'
import { errorMessage } from '../../services/authService'
import { formatMoney } from '../../utils/money'
import { formatDate, formatDateTime } from '../../utils/date'
import { downloadPdf, downloadPng, printInvoice, sendWhatsApp } from '../../utils/exportInvoice'
import InvoiceDocument from '../../components/invoice/InvoiceDocument'
import Modal from '../../components/Modal'

export const StatusBadge = ({ statusi }) => <span className={`status st-${statusi}`}>{STATUS_LABELS[statusi] ?? statusi}</span>

export default function InvoiceViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { perms, profile } = useAuth()
  const { settings } = useSettings()
  const docRef = useRef(null)
  const [format, setFormat] = useState('a4')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const [cancelling, setCancelling] = useState(false)

  const { data: inv, loading, error } = useLive((ok, ko) => watchInvoice(id, ok, ko), [id])
  // Pikët aktuale të klientit (për faturat e vjetra pa piketKlientit në printimin 80 mm)
  const { data: clientPoints } = useLive(
    (ok, ko) => onSnapshot(companyDoc('clients', inv.clientId), (snap) => ok(snap.exists() ? snap.data().piket ?? 0 : null), ko),
    [inv?.clientId], { enabled: !!inv?.clientId && format === 'termik' && inv?.piketKlientit == null, initial: null },
  )
  const canSeeLog = perms.has('mod_historiku') || perms.has('sheh_logun')
  const { data: log } = useLive((ok, ko) => watchAuditFor('invoices', id, ok, ko), [id], { enabled: canSeeLog, initial: [] })

  if (loading) return <div className="card muted">Duke u ngarkuar…</div>
  if (error) return <div className="alert error">{errorMessage(error)}</div>
  if (!inv) return <div className="card">Fatura nuk u gjet. <Link to="/historiku">Historiku</Link></div>

  const thermalWidthMm = settings.fatura.gjeresiaTermike
  const isDraft = inv.statusi === 'draft'
  const summary =
    `${settings.kompania.emri} – ${settings.etiketat.fatura} Nr. ${inv.numriTekst ?? inv.numri ?? 'draft'} (${formatDate(inv.data)})\n` +
    `${settings.etiketat.klienti}: ${inv.klient?.emri ?? ''}\n` +
    `${settings.etiketat.totali}: ${formatMoney(inv.totali, inv.monedha)}\n` +
    (isDraft ? '' : `${inv.gjendjaRe < 0 ? settings.etiketat.teprica : settings.etiketat.detyrimi}: ${formatMoney(Math.abs(inv.gjendjaRe), inv.monedha)}\n`) +
    settings.etiketat.falenderim

  async function run(label, fn) {
    setBusy(label)
    setMsg(null)
    try {
      await fn()
    } catch (err) {
      setMsg({ type: 'error', text: err?.message ?? String(err) })
    } finally {
      setBusy('')
    }
  }

  const onWhatsApp = () =>
    run('wa', async () => {
      const mode = await sendWhatsApp(docRef.current, inv, summary)
      if (mode === 'copied') setMsg({ type: 'success', text: 'Imazhi i faturës u kopjua. Në WhatsApp shtypni Ctrl+V për ta ngjitur dhe dërgoni.' })
      if (mode === 'downloaded') setMsg({ type: 'success', text: 'Imazhi u shkarkua. Bashkëngjiteni në WhatsApp (u hap në një skedë të re).' })
    })

  return (
    <div>
      <div className="no-print">
        <button className="back-link link-btn" onClick={() => navigate(-1)}><ArrowLeft size={16} /> Kthehu</button>

        <div className="card">
          <div className="client-title">
            <div>
              <h1>
                {settings.etiketat.fatura} {inv.numriTekst ? `Nr. ${inv.numriTekst}` : '(draft)'} <StatusBadge statusi={inv.statusi} />
              </h1>
              <div className="muted">
                <Link to={`/kliente/${inv.clientId}`}>{inv.klient?.emri}</Link> · {formatDate(inv.data)} · {formatMoney(inv.totali, inv.monedha)}
                {inv.numriVjeter && ` · nr. i vjetër ${inv.numriVjeter}`}
              </div>
              {inv.anuluar && (
                <div className="alert error inline-block">
                  Anuluar më {formatDateTime(inv.anuluar.koha)} nga {inv.anuluar.emri}: {inv.anuluar.arsye}
                </div>
              )}
            </div>
            <div className="actions">
              {isDraft ? (
                <Link className="btn primary" to={`/fature-e-re?draft=${inv.id}`}><Pencil size={16} /> Vazhdo draftin</Link>
              ) : (
                perms.has('anulim_fature') && inv.statusi !== 'anuluar' && (
                  <button className="btn danger" onClick={() => setCancelling(true)}><Ban size={16} /> Anulo</button>
                )
              )}
            </div>
          </div>

          <div className="export-bar">
            <div className="seg">
              <button className={format === 'a4' ? 'active' : ''} onClick={() => setFormat('a4')}>A4</button>
              <button className={format === 'termik' ? 'active' : ''} onClick={() => setFormat('termik')}>Termik {thermalWidthMm} mm</button>
            </div>
            <button className="btn" onClick={() => printInvoice({ format, thermalWidthMm })}><Printer size={16} /> Printo</button>
            <button className="btn" disabled={!!busy} onClick={() => run('pdf', () => downloadPdf(docRef.current, inv, { format, thermalWidthMm }))}>
              <FileDown size={16} /> {busy === 'pdf' ? '…' : 'PDF'}
            </button>
            <button className="btn" disabled={!!busy} onClick={() => run('png', () => downloadPng(docRef.current, inv))}>
              <ImageIcon size={16} /> {busy === 'png' ? '…' : 'PNG'}
            </button>
            <button className="btn whatsapp" disabled={!!busy} onClick={onWhatsApp}>
              <MessageCircle size={16} /> {busy === 'wa' ? '…' : 'WhatsApp'}
            </button>
          </div>
          {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
        </div>
      </div>

      <div className="invoice-preview">
        <div className="invoice-print-area">
          <InvoiceDocument ref={docRef} invoice={inv} settings={settings} format={format} clientPoints={clientPoints} />
        </div>
      </div>

      {!isDraft && (
        <div className="card no-print">
          <h3>Gjendja e faturës</h3>
          <div className="details-grid">
            <Detail label="Gjendja e mëparshme" value={formatMoney(inv.gjendjaPara, inv.monedha)} />
            <Detail label="Totali" value={formatMoney(inv.totali, inv.monedha)} />
            <Detail label="Paguar" value={formatMoney(inv.paguar, inv.monedha)} />
            <Detail label="Gjendja e re (e printuar)" value={formatMoney(inv.gjendjaRe, inv.monedha)} />
            <Detail label="Borxhi që mban tani" value={inv.statusi === 'pa_paguar' ? formatMoney(inv.mbetur, inv.monedha) : '—'} />
            <Detail label="Pikë të dhëna" value={inv.piketDhene ? String(inv.piketDhene) : '—'} />
            {inv.rregullim && <Detail label="Rregullim manual i gjendjes" value={`${formatMoney(inv.rregullim.shuma, inv.monedha)} – ${inv.rregullim.arsye}`} />}
            <Detail label="Lëshoi" value={`${inv.leshuarNga?.emri ?? ''} · ${formatDateTime(inv.leshuar)}`} />
          </div>
          <div className="chain-links">
            {inv.faturaPara && <Link to={`/fatura/${inv.faturaPara}`}>‹ Fatura e mëparshme e klientit</Link>}
            {inv.faturaPas && <Link to={`/fatura/${inv.faturaPas}`}>Fatura pasardhëse ›</Link>}
          </div>
        </div>
      )}

      {canSeeLog && (
        <div className="card no-print">
          <h3>Log-u i veprimeve</h3>
          <table className="table">
            <tbody>
              {log.map((l) => (
                <tr key={l.id}>
                  <td className="muted small">{formatDateTime(l.koha)}</td>
                  <td>{ACTION_LABELS[l.action] ?? l.action}</td>
                  <td>{l.emri}</td>
                  <td className="wrap small muted">{l.details?.arsye ?? ''}</td>
                </tr>
              ))}
              {!log.length && <tr><td className="muted">Asnjë veprim.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {cancelling && <CancelModal inv={inv} actorName={profile?.emri} onClose={() => setCancelling(false)} />}
    </div>
  )
}

export const ACTION_LABELS = {
  krijim_drafti: 'Krijoi draftin',
  ndryshim_drafti: 'Ndryshoi draftin',
  fshirje_drafti: 'Fshiu draftin',
  leshim_fature: 'Lëshoi faturën',
  anulim_fature: 'Anuloi faturën',
  anulim_pagese: 'E ktheu "Pa paguar" (hoqi pagesën)',
}

export function CancelModal({ inv, actorName, onClose }) {
  const [arsye, setArsye] = useState('')
  const [pagesa, setPagesa] = useState('teprice')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refund = inv.paguar > 0 && pagesa === 'kthe'

  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await cancelInvoice(inv.id, arsye, actorName, { kthePagesen: refund })
      onClose()
    } catch (err) {
      setError(err.code ? errorMessage(err) : err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={`Anulo faturën Nr. ${inv.numriTekst}`} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <p>
          Fatura nuk fshihet: merr statusin <b>Anuluar</b>. Kartela e klientit dhe stoku kthehen mbrapsht
          ({formatMoney(-inv.totali + (refund ? inv.paguar : 0), inv.monedha)} në gjendjen e klientit), dhe statuset e
          faturave të tjera rillogariten. Shumat e printuara te faturat e tjera nuk ndryshojnë.
        </p>
        {inv.paguar > 0 && (
          <fieldset className="fieldset">
            <legend>Pagesa prej {formatMoney(inv.paguar, inv.monedha)} te kjo faturë</legend>
            <label className="check perm-check">
              <input type="radio" name="pagesa" checked={pagesa === 'teprice'} onChange={() => setPagesa('teprice')} />
              Paratë mbeten – klienti merr tepricë (përdoret te faturat e ardhshme)
            </label>
            <label className="check perm-check">
              <input type="radio" name="pagesa" checked={pagesa === 'kthe'} onChange={() => setPagesa('kthe')} />
              Paratë i kthehen klientit – dalin nga {inv.metodaPagese === 'banke' ? 'banka' : 'arka'}
            </label>
          </fieldset>
        )}
        <label className="field">
          <span>Arsyeja e anulimit *</span>
          <textarea rows={3} value={arsye} onChange={(e) => setArsye(e.target.value)} required autoFocus />
        </label>
        {error && <div className="alert error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Mbyll</button>
          <button className="btn danger" disabled={busy || !arsye.trim()}>{busy ? 'Duke anuluar…' : 'Anulo faturën'}</button>
        </div>
      </form>
    </Modal>
  )
}

function Detail({ label, value }) {
  return (
    <div className="detail">
      <div className="detail-label">{label}</div>
      <div className="detail-value">{value || '—'}</div>
    </div>
  )
}
