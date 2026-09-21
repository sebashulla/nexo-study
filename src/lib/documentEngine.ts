import type { MaterialPage } from '../types'

type PdfTextItem = {
  str?: string
}

interface PdfPage {
  getTextContent: () => Promise<{ items: unknown[] }>
}

interface PdfDocument {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPage>
}

interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument: (source: { data: Uint8Array }) => { promise: Promise<PdfDocument> }
}

declare global {
  interface Window { pdfjsLib?: PdfJsLib }
}

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
let loading: Promise<PdfJsLib> | null = null

export function loadPdfJs(): Promise<PdfJsLib> {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib)
  if (loading) return loading
  loading = new Promise<PdfJsLib>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = PDFJS
    script.async = true
    script.onload = () => {
      if (!window.pdfjsLib) return reject(new Error('PDF.js no se pudo iniciar.'))
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
      resolve(window.pdfjsLib)
    }
    script.onerror = () => reject(new Error('No se pudo cargar el lector PDF. Revisa tu conexión a internet.'))
    document.head.appendChild(script)
  })
  return loading
}

export async function extractPdf(file: File): Promise<{ text: string; pages: MaterialPage[] }> {
  const pdfjs = await loadPdfJs()
  const bytes = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjs.getDocument({ data: bytes }).promise
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
}
