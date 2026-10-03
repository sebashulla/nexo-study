import { safeSourceFetch, sourceError } from './safeSourceFetch.mjs'

const ignored = new Set(['script','style','nav','footer','header','aside','form','button','input','select','textarea','svg','canvas','iframe','noscript','template'])
function hidden(node) { return ignored.has(node.tagName) || node.attrs?.some(attr => attr.name === 'hidden' || attr.name === 'aria-hidden' && attr.value === 'true') }
function nodes(root) {
  const result = [], stack = [root]
  while (stack.length) { const node = stack.pop(); if (hidden(node)) continue; result.push(node); if (result.length>50000) throw sourceError('Este artículo tiene demasiados elementos. Pega solo las secciones que necesitas.',413); stack.push(...(node.childNodes ?? []).slice().reverse()) }
  return result
}
function plain(node) { return nodes(node).filter(node => node.nodeName === '#text').map(node => node.value).join(' ').replace(/\s+/g,' ').trim() }
export async function extractArticle(html, sourceUrl, suggestedTitle = '') {
  const { parse } = await import('parse5')
  const document = parse(html), all = nodes(document)
  const title = suggestedTitle.trim() || plain(all.find(node => node.tagName === 'title') ?? {}) || new URL(sourceUrl).hostname
  const candidates = all.filter(node => ['article','main'].includes(node.tagName))
  const root = candidates.slice(0,32).map(node => ({ node, length: plain(node).length })).sort((a,b) => b.length - a.length)[0]?.node ?? all.find(node => node.tagName === 'body') ?? document
  const sections = []; let heading = '', blocks = []
  const flush = () => { if (blocks.length) { sections.push({ page: sections.length+1, heading: heading || undefined, text: blocks.map(block => block.text).join('\n\n'), blocks }); blocks = [] } }
  const stack = [root]
  while (stack.length) {
    const node = stack.pop(); if (hidden(node)) continue
    if (/^h[1-6]$/.test(node.tagName)) { flush(); heading = plain(node).slice(0,180); if (heading) blocks.push({ kind: 'heading', text: heading, level: Number(node.tagName.slice(1)) }); continue }
    if (['p','li','pre','blockquote','table'].includes(node.tagName)) {
      const text = plain(node); if (text) blocks.push({ kind: node.tagName === 'li' ? 'list' : node.tagName === 'table' ? 'table' : 'paragraph', text })
      if (blocks.map(block => block.text).join('').length > 6000) flush()
      continue
    }
    stack.push(...(node.childNodes ?? []).slice().reverse())
  }
  flush()
  if (!sections.length) { const text = plain(root); if (text) sections.push({ page: 1, text }) }
  const plainText = sections.map(section => section.text).join('\n\n')
  if (plainText.length < 40) throw sourceError('No encontramos contenido suficiente. Este sitio puede requerir JavaScript o acceso privado; pega el texto manualmente.',422)
  if (plainText.length > 300000 || sections.length > 500) throw sourceError('El artículo supera el límite de contenido. Pega solo las secciones que necesitas.',413)
  return { title: title.slice(0,180), plainText, sections, sourceMetadata: { sourceUrl, extraction: 'article-html', extractedAt: new Date().toISOString(),
    units: sections.map(({ page,heading }) => ({ page,heading })) } }
}
export function youtubeSource(value) {
  let url; try { url = new URL(value) } catch { throw sourceError('Pega una URL válida de YouTube.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw sourceError('Usa un enlace HTTPS de YouTube.')
  const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : ['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)
    ? url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)$/)?.[1] : null
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) throw sourceError('No reconocemos el video de YouTube.')
  return { videoId: id, sourceUrl: `https://www.youtube.com/watch?v=${id}` }
}
export async function processRemoteSource(payload, { fetchSource = safeSourceFetch, transcriptProvider } = {}) {
  if (!payload || !['web','youtube'].includes(payload.sourceType) || typeof payload.url !== 'string') throw sourceError('Elige una fuente web o YouTube válida.')
  if (payload.sourceType === 'web') {
    const result = await fetchSource(payload.url)
    const mime = String(result.headers['content-type'] ?? '').toLowerCase()
    if (!mime.startsWith('text/html') && !mime.startsWith('application/xhtml+xml')) throw sourceError('Este enlace no contiene un artículo HTML. Descarga el archivo y usa Subir.',422)
    const charset = mime.match(/charset=["']?([a-z0-9_-]+)/)?.[1] ?? 'utf-8'
    let html; try { html = new TextDecoder(charset).decode(result.body) } catch { throw sourceError('No pudimos leer la codificación de esta página.',422) }
    return await extractArticle(html,result.sourceUrl,typeof payload.title === 'string' ? payload.title.slice(0,180) : '')
  }
  const source = youtubeSource(payload.url)
  let title = typeof payload.title === 'string' ? payload.title.trim().slice(0,180) : ''
  let author
  try {
    const result = await fetchSource(`https://www.youtube.com/oembed?url=${encodeURIComponent(source.sourceUrl)}&format=json`)
    const metadata = JSON.parse(result.body.toString('utf8')); title ||= String(metadata.title ?? '').slice(0,180); author = String(metadata.author_name ?? '').slice(0,180)
  } catch { /* Metadata may be unavailable; that never implies a transcript exists. */ }
  const transcript = transcriptProvider ? await transcriptProvider(source.videoId) : undefined
  const sections = Array.isArray(transcript) ? transcript.map((item,index) => ({ page: index+1, timestamp: item.timestamp, text: String(item.text ?? '') })) : []
  if (sections.length > 500 || sections.some((item,index) => !Number.isFinite(item.timestamp) || item.timestamp < 0 || index>0 && item.timestamp < sections[index-1].timestamp || !item.text.trim() || item.text.length > 15000) || sections.map(item => item.text).join('').length > 300000) throw sourceError('La transcripción supera los límites de lectura o tiene un formato inválido.',422)
  const plainText = sections.map(item => item.text).join('\n\n')
  return { title: title || `Video de YouTube · ${source.videoId}`, plainText, sections,
    partial: !plainText, warning: !plainText ? 'No encontramos una transcripción disponible.' : undefined,
    sourceMetadata: { ...source, author, extraction: plainText ? 'authorized-transcript' : 'youtube-metadata-only', extractedAt: new Date().toISOString(), units: sections.map(({ page,timestamp }) => ({ page,timestamp })) } }
}
