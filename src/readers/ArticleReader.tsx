import { DocumentReader, type ReaderProps } from './DocumentReader'
export function ArticleReader(props: ReaderProps) {
  const url = props.material.sourceMetadata?.sourceUrl
  let href: string | undefined
  try { const parsed = new URL(url ?? ''); if (['https:','http:'].includes(parsed.protocol)) href = parsed.href } catch { /* No external link for invalid metadata. */ }
  return <div className="article-reader">{href && <a className="reader-origin" href={href} target="_blank" rel="noopener noreferrer">Abrir artículo original ↗</a>}<DocumentReader {...props}/></div>
}
