const MAX_BYTES = 200 * 1024

const dataUrlBytes = (url) => Math.ceil(((url.length - url.indexOf(',') - 1) * 3) / 4)

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Imazhi nuk mund të lexohet.'))
    }
    img.src = url
  })
}

/**
 * Kompreson logon në një data URL base64 ≤ 200 KB.
 * Provon PNG (ruan transparencën) duke e zvogëluar; nëse s'mjafton, kalon në JPEG.
 */
export async function compressLogo(file) {
  if (!['image/png', 'image/jpeg'].includes(file.type)) {
    throw new Error('Lejohen vetëm skedarë PNG ose JPG.')
  }
  const img = await loadImage(file)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  for (let maxSide = 800; maxSide >= 100; maxSide = Math.round(maxSide * 0.75)) {
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    if (file.type === 'image/png') {
      const png = canvas.toDataURL('image/png')
      if (dataUrlBytes(png) <= MAX_BYTES) return png
    }
    for (const q of [0.9, 0.8, 0.7, 0.6]) {
      ctx.globalCompositeOperation = 'destination-over'
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'source-over'
      const jpg = canvas.toDataURL('image/jpeg', q)
      if (dataUrlBytes(jpg) <= MAX_BYTES) return jpg
    }
  }
  throw new Error('Logoja nuk mund të kompresohet nën 200 KB.')
}

export const logoSizeKb = (url) => (url ? Math.round(dataUrlBytes(url) / 1024) : 0)
