// Eksport CSV që hapet saktë në Excel (UTF-8 me BOM, ndarës ";").
export function downloadCsv(filename, headers, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const text = [headers, ...rows].map((r) => r.map(esc).join(';')).join('\r\n')
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
