import type { Material } from '../types'

export function analysisPages(material: Material, selection: 40 | 80 | 'all' | 'range', start = 1, end = material.pageCount ?? 0) {
  const total = material.pageCount ?? 0
  if (!total) throw new Error('Todavía no conocemos el total de páginas.')
  if (selection === 'range' && (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > total || start > end))
    throw new Error(`El rango debe estar entre 1 y ${total}, con inicio menor o igual al final.`)
  const prepared = new Set(material.analyzedPages ?? [])
  const first = selection === 'range' ? start : 1
  const last = selection === 'range' ? end : total
  const pages = Array.from({ length: last - first + 1 }, (_, index) => first + index).filter(page => !prepared.has(page))
  return typeof selection === 'number' ? pages.slice(0, selection) : pages
}
