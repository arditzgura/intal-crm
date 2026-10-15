import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { X, Printer, FileDown, Image as ImageIcon, MessageCircle, ExternalLink } from 'lucide-react'
import { useSettings } from '../../hooks/useSettings'
import { formatMoney } from '../../utils/money'
import { formatDate } from '../../utils/date'
import { downloadPdf, downloadPng, printInvoice, sendWhatsApp } from '../../utils/exportInvoice'
import InvoiceDocument from './InvoiceDocument'

/**
 * Parapamja e faturës sipër faqes. Klik në zonën bosh jashtë faturës (ose Esc) e mbyll.
 */
export default function InvoicePreview({ invoice, onClose }) {
  const { settings } = useSettings()
  const docRef = useRef(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.classList.add('preview-open')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('preview-open')
    }
  }, [onClose])

  const L = settings.etiketat
  const summary =
    `${settings.kompania.emri} – ${L.fatura} Nr. ${invoice.numriTekst ?? invoice.numri} (${formatDate(invoice.data)})\n` +
    `${L.klienti}: ${invoice.klient?.emri ?? ''}\n` +
    `${L.totali}: ${formatMoney(invoice.totali, invoice.monedha)}\n` +
    `${invoice.gjendjaRe < 0 ? L.teprica : L.detyrimi}: ${formatMoney(Math.abs(invoice.gjendjaRe ?? 0), invoice.monedha)}\n` +
    L.falenderim

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

  return createPortal(
    <div className="preview-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="preview-toolbar no-print" onMouseDown={(e) => e.stopPropagation()}>
        <b>{L.fatura} #{invoice.numriTekst}</b>
        <span className="grow" />
        <button className="btn" onClick={() => printInvoice({ format: 'a4' })}><Printer size={16} /> Printo</button>
        <button className="btn" disabled={!!busy} onClick={() => run('pdf', () => downloadPdf(docRef.current, invoice, { format: 'a4' }))}><FileDown size={16} /> {busy === 'pdf' ? '…' : 'PDF'}</button>
        <button className="btn" disabled={!!busy} onClick={() => run('png', () => downloadPng(docRef.current, invoice))}><ImageIcon size={16} /> {busy === 'png' ? '…' : 'PNG'}</button>
        <button className="btn whatsapp" disabled={!!busy} onClick={() => run('wa', async () => {
          const mode = await sendWhatsApp(docRef.current, invoice, summary)
          if (mode === 'copied') setMsg({ type: 'success', text: 'Imazhi u kopjua – në WhatsApp shtypni Ctrl+V.' })
        })}><MessageCircle size={16} /> WhatsApp</button>
        <Link className="btn" to={`/fatura/${invoice.id}`} title="Faqja e plotë e faturës (termik, log, anulim)"><ExternalLink size={16} /></Link>
        <button className="btn" onClick={onClose} aria-label="Mbyll"><X size={16} /></button>
      </div>
      {msg && <div className={`alert ${msg.type} preview-msg no-print`}>{msg.text}</div>}
      <div className="preview-doc invoice-print-area" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <InvoiceDocument ref={docRef} invoice={invoice} settings={settings} format="a4" />
      </div>
    </div>,
    document.body,
  )
}
