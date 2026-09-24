import type { MaterialPage } from '../types'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

type PdfTextItem = {
  str?: string
}

interface PdfPage {
  getTextContent: () => Promise<{ items: unknown[] }>
}

interface PdfDocument {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPage>
  destroy?: () => Promise<void>
}

interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument: (source: { data: Uint8Array }) => { promise: Promise<PdfDocument> }
}

declare global {
  interface Window { pdfjsLib?: PdfJsLib }
}

export const MAX_PDF_BYTES = 25 * 1024 * 1024
export const MAX_PDF_PAGES = 250
let loading: Promise<PdfJsLib> | null = null

export function loadPdfJs(): Promise<PdfJsLib> {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib)
  if (loading) return loading
  loading = import('pdfjs-dist').then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    return pdfjs
  }).catch(() => {
    loading = null
    throw new Error('No se pudo iniciar el lector PDF. Inténtalo de nuevo.')
  })
  return loading
}

export async function extractPdf(file: File): Promise<{ text: string; pages: MaterialPage[] }> {
  if (file.size > MAX_PDF_BYTES) throw new Error('Este PDF supera 25 MB. Divide el documento y vuelve a subirlo.')
  const pdfjs = await loadPdfJs()
  const bytes = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjs.getDocument({ data: bytes }).promise
  try {
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error('Este PDF supera 250 páginas. Divide el documento y vuelve a subirlo.')
    const pages: MaterialPage[] = []

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items
        .map((item: unknown) => {
          if (typeof item === 'object' && item !== null && 'str' in item) {
            const textItem = item as PdfTextItem
            return typeof textItem.str === 'string' ? textItem.str : ''
          }
          return ''
        })
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (text) pages.push({ page: pageNumber, text })
    }

    const text = pages.map((page) => `[Página ${page.page}] ${page.text}`).join('\n\n')
    if (!text.trim()) throw new Error('No encontré texto seleccionable. Si el PDF es escaneado, después añadiremos OCR.')
    return { text, pages }
  } finally {
    try { await pdf.destroy?.() } catch { /* The extracted content remains usable. */ }
  }
}
