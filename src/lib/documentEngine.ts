import type { AnalysisStatus, DocumentKind, MaterialPage } from '../types'
import type { ImageAttachment } from './imageUtils'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

type PdfTextItem = { str?: string }
interface PdfPage {
  getTextContent: () => Promise<{ items: unknown[] }>
  getViewport?: unknown
  render?: unknown
}
interface PdfDocument {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPage>
  getMetadata?: () => Promise<{ info?: unknown }>
  destroy?: () => Promise<void>
}
interface PdfLoadingTask { promise: Promise<PdfDocument>; destroy?: () => Promise<void> }
interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument: (source: { data: Uint8Array }) => PdfLoadingTask
}
declare global { interface Window { pdfjsLib?: PdfJsLib } }

export const MAX_PDF_BYTES = 25 * 1024 * 1024
export const INITIAL_PDF_PAGE_BUDGET = 80
export const PDF_BATCH_SIZE = 10

export type PdfMetadata = { pageCount: number; byteSize: number; title?: string; author?: string }
export type PdfProgress = { completed: number; total: number; currentPage: number; pageCount: number; analyzedPages: number[] }
export type PdfExtraction = {
  text: string
  pages: MaterialPage[]
  analyzedPages: number[]
  metadata: PdfMetadata
  documentKind: DocumentKind
  analysisStatus: AnalysisStatus
}
export type PdfExtractionOptions = {
  signal?: AbortSignal
  pages?: number[]
  onMetadata?: (metadata: PdfMetadata) => void
  onProgress?: (progress: PdfProgress) => void
  onBatch?: (pages: MaterialPage[], progress: PdfProgress) => void
}

let loading: Promise<PdfJsLib> | null = null

export function loadPdfJs(): Promise<PdfJsLib> {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib)
  if (loading) return loading
  const promise: Promise<PdfJsLib> = import('pdfjs-dist').then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    return pdfjs
  }).catch(() => {
    loading = null
    throw new Error('No se pudo iniciar el lector PDF. Inténtalo de nuevo.')
  })
  loading = promise
  return promise
}

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('La lectura se canceló.', 'AbortError')
}

function selectedPages(pageCount: number, requested?: number[]) {
  if (requested) return [...new Set(requested.filter(page => Number.isInteger(page) && page > 0 && page <= pageCount))].sort((a, b) => a - b)
  return Array.from({ length: Math.min(pageCount, INITIAL_PDF_PAGE_BUDGET) }, (_, index) => index + 1)
}

function documentKind(textPages: number, analyzedCount: number): DocumentKind {
  if (!analyzedCount) return 'unknown'
  if (!textPages || textPages / analyzedCount < 0.1) return 'scan'
  if (textPages / analyzedCount < 0.85) return 'mixed'
  return 'text'
}

export async function extractPdf(file: File, options: PdfExtractionOptions = {}): Promise<PdfExtraction> {
  if (file.size > MAX_PDF_BYTES) throw new Error('Este PDF supera 25 MB. Divide el documento y vuelve a subirlo.')
  abortIfNeeded(options.signal)
  const pdfjs = await loadPdfJs()
  const bytes = new Uint8Array(await file.arrayBuffer())
  abortIfNeeded(options.signal)
  const task = pdfjs.getDocument({ data: bytes })
  const cancelLoading = () => { void task.destroy?.() }
  options.signal?.addEventListener('abort', cancelLoading, { once: true })
  let pdf: PdfDocument | undefined
  try {
    pdf = await task.promise
    abortIfNeeded(options.signal)
    let info: Record<string, unknown> | undefined
    try {
      const raw = (await pdf.getMetadata?.())?.info
      if (raw && typeof raw === 'object') info = raw as Record<string, unknown>
    } catch { /* Metadata is optional. */ }
    const metadata: PdfMetadata = {
      pageCount: pdf.numPages, byteSize: file.size,
      title: typeof info?.Title === 'string' ? info.Title : undefined,
      author: typeof info?.Author === 'string' ? info.Author : undefined,
    }
    options.onMetadata?.(metadata)
    const targets = selectedPages(pdf.numPages, options.pages)
    const pages: MaterialPage[] = []
    const failedPageNumbers = new Set<number>()
    for (let offset = 0; offset < targets.length; offset += PDF_BATCH_SIZE) {
      abortIfNeeded(options.signal)
      const batch = targets.slice(offset, offset + PDF_BATCH_SIZE)
      const extracted: MaterialPage[] = []
      for (const pageNumber of batch) {
        abortIfNeeded(options.signal)
        try {
          const page = await pdf.getPage(pageNumber)
          const content = await page.getTextContent()
          const text = content.items.map((item: unknown) => {
            if (typeof item === 'object' && item !== null && 'str' in item) {
              const textItem = item as PdfTextItem
              return typeof textItem.str === 'string' ? textItem.str : ''
            }
            return ''
          }).join(' ').replace(/\s+/g, ' ').trim()
          if (text) extracted.push({ page: pageNumber, text })
        } catch (error) {
          abortIfNeeded(options.signal)
          failedPageNumbers.add(pageNumber)
          if (targets.length === 1) throw error
        }
      }
      pages.push(...extracted)
      const progress = { completed: offset + batch.length, total: targets.length,
        currentPage: batch[batch.length - 1], pageCount: pdf.numPages,
        analyzedPages: batch.filter(page => !failedPageNumbers.has(page)) }
      options.onBatch?.(extracted, progress)
      options.onProgress?.(progress)
      if (offset + batch.length < targets.length) await new Promise<void>(resolve => setTimeout(resolve, 0))
    }
    abortIfNeeded(options.signal)
    if (targets.length && failedPageNumbers.size === targets.length) throw new Error('Nexo no pudo leer las páginas seleccionadas.')
    const analyzedPages = targets.filter(page => !failedPageNumbers.has(page))
    const kind = documentKind(pages.length, analyzedPages.length)
    return {
      text: pages.map(page => `[Página ${page.page}] ${page.text}`).join('\n\n'),
      pages, analyzedPages, metadata, documentKind: kind,
      analysisStatus: failedPageNumbers.size || kind !== 'text' || analyzedPages.length < pdf.numPages ? 'partial' : 'ready',
    }
  } finally {
    options.signal?.removeEventListener('abort', cancelLoading)
    try { await pdf?.destroy?.() } catch { /* The extracted content remains usable. */ }
  }
}

export async function renderPdfPages(file: File, selected: number[], signal?: AbortSignal): Promise<ImageAttachment[]> {
  if (file.size > MAX_PDF_BYTES) throw new Error('Este PDF supera 25 MB.')
  if (!selected.length || selected.length > 4) throw new Error('Elige entre una y cuatro páginas.')
  abortIfNeeded(signal)
  const pdfjs = await loadPdfJs()
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const cancelLoading = () => { void task.destroy?.() }
  signal?.addEventListener('abort', cancelLoading, { once: true })
  let pdf: PdfDocument | undefined
  try {
    pdf = await task.promise
    const targets = selectedPages(pdf.numPages, selected)
    if (targets.length !== selected.length) throw new Error('Una página seleccionada no existe en este PDF.')
    const result: ImageAttachment[] = []
    for (const number of targets) {
      abortIfNeeded(signal)
      const page = await pdf.getPage(number)
      const renderable = page as PdfPage & {
        getViewport: (options: { scale: number }) => { width: number; height: number }
        render: (options: { canvasContext: CanvasRenderingContext2D; viewport: ReturnType<typeof renderable.getViewport>; canvas: HTMLCanvasElement }) => { promise: Promise<void> }
      }
      const natural = renderable.getViewport({ scale: 1 })
      const viewport = renderable.getViewport({ scale: Math.min(1.6, 1280 / Math.max(natural.width, natural.height)) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('No pudimos preparar la imagen de esta página.')
      await renderable.render({ canvasContext: context, viewport, canvas }).promise
      abortIfNeeded(signal)
      let quality = 0.78
      let dataUrl = canvas.toDataURL('image/webp', quality)
      let bytes = Math.ceil((dataUrl.split(',')[1]?.length ?? 0) * 0.75)
      while (bytes > 650 * 1024 && quality > 0.48) {
        quality -= 0.1
        dataUrl = canvas.toDataURL('image/webp', quality)
        bytes = Math.ceil((dataUrl.split(',')[1]?.length ?? 0) * 0.75)
      }
      if (bytes > 650 * 1024) throw new Error('La imagen de esta página es demasiado grande para analizarla.')
      result.push({ id: crypto.randomUUID(), dataUrl, mimeType: 'image/webp', name: `Página ${number}`, bytes })
    }
    return result
  } finally {
    signal?.removeEventListener('abort', cancelLoading)
    try { await pdf?.destroy?.() } catch { /* Rendering is already complete. */ }
  }
}
