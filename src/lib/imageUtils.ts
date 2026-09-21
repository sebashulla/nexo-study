export type ImageAttachment = {
  id: string
  dataUrl: string
  mimeType: string
  name: string
  bytes: number
}

const MAX_IMAGES = 4
const MAX_RAW_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_BYTES = 2.6 * 1024 * 1024
const MAX_DIMENSION = 1400

function id() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function dataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(',')[1] || ''
  return Math.ceil(base64.length * 0.75)
}

async function compressImage(file: File): Promise<ImageAttachment> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error(`${file.name}: formato no compatible.`)
  if (file.size > MAX_RAW_BYTES) throw new Error(`${file.name}: supera 10 MB.`)

  const objectUrl = URL.createObjectURL(file)
  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`${file.name}: no se pudo leer la imagen.`))
    image.src = objectUrl
  })
  const scale = Math.min(1, MAX_DIMENSION / Math.max(source.naturalWidth, source.naturalHeight))
  const width = Math.max(1, Math.round(source.naturalWidth * scale))
  const height = Math.max(1, Math.round(source.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo preparar la imagen.')
  ctx.drawImage(source, 0, 0, width, height)
  URL.revokeObjectURL(objectUrl)

  let quality = 0.84
  let dataUrl = canvas.toDataURL('image/webp', quality)
  while (dataUrlBytes(dataUrl) > 650 * 1024 && quality > 0.48) {
    quality -= 0.1
    dataUrl = canvas.toDataURL('image/webp', quality)
  }

  return { id: id(), dataUrl, mimeType: 'image/webp', name: file.name, bytes: dataUrlBytes(dataUrl) }
}

export async function prepareImages(files: File[], current: ImageAttachment[] = []) {
  const remaining = MAX_IMAGES - current.length
  if (remaining <= 0) throw new Error(`Puedes adjuntar hasta ${MAX_IMAGES} imágenes por consulta.`)
  const selected = files.slice(0, remaining)
  const prepared = [] as ImageAttachment[]
  for (const file of selected) prepared.push(await compressImage(file))

  const combined = [...current, ...prepared]
  const total = combined.reduce((sum, image) => sum + image.bytes, 0)
  if (total > MAX_TOTAL_BYTES) throw new Error('Las imágenes juntas son demasiado pesadas. Quita una imagen o usa capturas más pequeñas.')
  return combined
}

export const imageLimits = { maxImages: MAX_IMAGES }
