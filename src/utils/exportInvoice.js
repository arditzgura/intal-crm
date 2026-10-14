import { toBlob } from 'html-to-image'

/**
 * Eksporti i faturës: printim (A4 / termik), PNG, PDF dhe WhatsApp (PNG).
 * `node` është elementi i InvoiceDocument.
 */

const PIXEL_RATIO = 2

export async function invoicePngBlob(node) {
  const blob = await toBlob(node, { pixelRatio: PIXEL_RATIO, backgroundColor: '#ffffff', cacheBust: true })
  if (!blob) throw new Error('Imazhi i faturës nuk u krijua.')
  return blob
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export const invoiceFileName = (inv, ext) =>
  `Fatura_${inv.numriTekst ?? inv.numri ?? 'draft'}_${(inv.klient?.emri ?? '').replace(/[^\p{L}\p{N}]+/gu, '_')}.${ext}`

export async function downloadPng(node, inv) {
  download(await invoicePngBlob(node), invoiceFileName(inv, 'png'))
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

function imageSize(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = reject
    img.src = dataUrl
  })
}

/** PDF: A4 (me faqe të shumta nëse duhet) ose termik (një faqe e gjatë). */
export async function downloadPdf(node, inv, { format = 'a4', thermalWidthMm = 80 } = {}) {
  const { jsPDF } = await import('jspdf')
  const dataUrl = await blobToDataUrl(await invoicePngBlob(node))
  const { w, h } = await imageSize(dataUrl)

  if (format === 'termik') {
    const widthMm = thermalWidthMm
    const heightMm = (h / w) * widthMm
    const pdf = new jsPDF({ unit: 'mm', format: [widthMm, heightMm], orientation: heightMm >= widthMm ? 'portrait' : 'landscape' })
    pdf.addImage(dataUrl, 'PNG', 0, 0, widthMm, heightMm)
    pdf.save(invoiceFileName(inv, 'pdf'))
    return
  }

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = 210
  const pageH = 297
  const imgH = (h / w) * pageW
  let y = 0
  pdf.addImage(dataUrl, 'PNG', 0, y, pageW, imgH)
  let remaining = imgH - pageH
  while (remaining > 1) {
    y -= pageH
    pdf.addPage()
    pdf.addImage(dataUrl, 'PNG', 0, y, pageW, imgH)
    remaining -= pageH
  }
  pdf.save(invoiceFileName(inv, 'pdf'))
}

/** Printim nga shfletuesi vetëm i faturës, me madhësinë e faqes sipas formatit. */
export function printInvoice({ format = 'a4', thermalWidthMm = 80 } = {}) {
  const style = document.createElement('style')
  style.textContent =
    format === 'termik'
      ? `@page { size: ${thermalWidthMm}mm auto; margin: 2mm; }`
      : '@page { size: A4; margin: 0; }'
  document.head.appendChild(style)
  document.body.classList.add('printing-invoice')
  const cleanup = () => {
    document.body.classList.remove('printing-invoice')
    style.remove()
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
  setTimeout(cleanup, 1500)
}

/** Numri i telefonit për wa.me (Shqipëri: 06x… → 3556x…). */
export function whatsappPhone(phone) {
  let d = String(phone ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('00')) d = d.slice(2)
  else if (d.startsWith('0')) d = `355${d.slice(1)}`
  else if (d.length === 9 && d.startsWith('6')) d = `355${d}`
  return d
}

/**
 * Dërgon faturën si PNG në WhatsApp.
 * - Telefon (Web Share me skedarë): hapet direkt ndarja → WhatsApp.
 * - Kompjuter: imazhi kopjohet në clipboard dhe hapet WhatsApp te klienti; ngjitet me Ctrl+V.
 * @returns 'shared' | 'copied' | 'downloaded'
 */
export async function sendWhatsApp(node, inv, summary) {
  const blob = await invoicePngBlob(node)
  const file = new File([blob], invoiceFileName(inv, 'png'), { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: summary })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
    }
  }
  let mode = 'downloaded'
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    mode = 'copied'
  } catch {
    download(blob, file.name)
  }
  const phone = whatsappPhone(inv.klient?.telefoni)
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(summary)}`, '_blank', 'noopener')
  return mode
}
