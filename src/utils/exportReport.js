import { toBlob } from 'html-to-image'

/**
 * Raporti si PDF (A4, me faqe të shumta nëse duhet): fotografon pjesën `.printable`
 * me pamjen e printimit (pa filtrat / butonat, me kokën e kompanisë).
 */
export async function downloadReportPdf(node, filename) {
  const { jsPDF } = await import('jspdf')
  document.body.classList.add('pdf-capture')
  const prevWidth = node.style.width
  node.style.width = '1100px'
  let blob
  try {
    blob = await toBlob(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true })
  } finally {
    node.style.width = prevWidth
    document.body.classList.remove('pdf-capture')
  }
  if (!blob) throw new Error('Raporti nuk u krijua.')
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
  const { w, h } = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = reject
    img.src = dataUrl
  })

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 8
  const pageW = 210 - margin * 2
  const pageH = 297 - margin * 2
  const imgH = (h / w) * pageW
  let offset = 0
  for (let page = 0; offset < imgH - 1; page++) {
    if (page) pdf.addPage()
    pdf.addImage(dataUrl, 'PNG', margin, margin - offset, pageW, imgH)
    // Mbulo pjesën jashtë kufijve të faqes (sipër / poshtë) me të bardhë
    pdf.setFillColor(255, 255, 255)
    pdf.rect(0, 0, 210, margin, 'F')
    pdf.rect(0, 297 - margin, 210, margin, 'F')
    offset += pageH
  }
  pdf.save(filename)
}
