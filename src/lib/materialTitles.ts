export function displayMaterialTitle(title: string) {
  return title.replace(/[_#]+/g, ' ').replace(/\s*[-–—]\s*/g, ' — ').replace(/\s+/g, ' ').trim()
}

export function suggestMaterialTitle(filename: string) {
  const base = filename.replace(/\.(?:pdf|txt|md|docx|pptx|png|jpe?g|webp)$/i, '')
    .replace(/^(?:[0-9a-f]{6,}(?:-[0-9a-f]{1,})+|\d{6,})[_\s-]*/i, '')
  const title = displayMaterialTitle(base)
  return /[a-záéíóúüñ]{4,}/i.test(title) ? title : `Documento ${/\.pdf$/i.test(filename) ? 'PDF' : 'de estudio'}`
}
