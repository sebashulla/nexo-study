import { Fragment, type ReactNode } from 'react'

const inlinePattern = /(\*\*[^*]+\*\*|`[^`]+`|\$[^$\n]+\$|\*[^*\n]+\*)/g

function inline(text: string): ReactNode[] {
  return text.split(inlinePattern).filter(Boolean).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    if (part.startsWith('$') && part.endsWith('$')) return <span className="inline-math" key={i}>{part.slice(1, -1)}</span>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>
    return <Fragment key={i}>{part}</Fragment>
  })
}

function isSpecial(line: string) {
  return /^(#{1,4})\s+/.test(line) || /^\s*([-*_])\1\1+\s*$/.test(line) || /^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line) || /^>\s?/.test(line) || /^```/.test(line) || /^\$\$/.test(line)
}

function parseTable(lines: string[], start: number) {
  if (!lines[start]?.includes('|') || start + 1 >= lines.length) return null
  const sep = lines[start + 1].trim()
  if (!/^\|?\s*:?-{3,}/.test(sep) || !sep.includes('|')) return null
  const rows: string[][] = []
  let i = start
  while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
    rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
    i++
  }
  if (rows.length < 2) return null
  rows.splice(1, 1)
  return { rows, next: i }
}

export function ResponseRenderer({ text }: { text: string }) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
  const out: ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line) { i++; continue }

    const table = parseTable(lines, i)
    if (table) {
      const [head, ...body] = table.rows
      out.push(<div className="response-table-wrap" key={`t-${i}`}><table className="response-table"><thead><tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead><tbody>{body.map((row, r) => <tr key={r}>{row.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody></table></div>)
      i = table.next
      continue
    }

    if (/^```/.test(line)) {
      const lang = line.slice(3).trim()
      const code: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i].trim())) code.push(lines[i++])
      if (i < lines.length) i++
      out.push(<pre className="response-code" key={`c-${i}`}><code data-language={lang || undefined}>{code.join('\n')}</code></pre>)
      continue
    }

    if (/^\$\$/.test(line)) {
      const math: string[] = [line.replace(/^\$\$/, '')]
      if (!line.endsWith('$$') || line === '$$') {
        i++
        while (i < lines.length && !lines[i].trim().endsWith('$$')) math.push(lines[i++])
        if (i < lines.length) math.push(lines[i].trim().replace(/\$\$$/, ''))
      }
      out.push(<div className="math-block" key={`m-${i}`}>{math.join(' ').replace(/\$\$$/, '').trim()}</div>)
      i++
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      const level = Math.min(heading[1].length + 1, 5)
      const content = inline(heading[2].replace(/^\d+[.)]\s*/, ''))
      if (level === 2) out.push(<h2 className="response-heading" key={`h-${i}`}>{content}</h2>)
      else if (level === 3) out.push(<h3 className="response-heading" key={`h-${i}`}>{content}</h3>)
      else out.push(<h4 className="response-heading" key={`h-${i}`}>{content}</h4>)
      i++
      continue
    }

    if (/^\s*([-*_])\1\1+\s*$/.test(line)) {
      out.push(<hr className="response-divider" key={`hr-${i}`} />)
      i++
      continue
    }

    if (/^>\s?/.test(line)) {
      const quotes: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) quotes.push(lines[i++].trim().replace(/^>\s?/, ''))
      out.push(<blockquote className="response-quote" key={`q-${i}`}>{quotes.map((q, j) => <p key={j}>{inline(q)}</p>)}</blockquote>)
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, '').trim())
      out.push(<ul className="response-list" key={`ul-${i}`}>{items.map((x, j) => <li key={j}>{inline(x)}</li>)}</ul>)
      continue
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, '').trim())
      out.push(<ol className="response-list numbered" key={`ol-${i}`}>{items.map((x, j) => <li key={j}>{inline(x)}</li>)}</ol>)
      continue
    }

    const paragraph = [line]
    i++
    while (i < lines.length && lines[i].trim() && !isSpecial(lines[i].trim()) && !parseTable(lines, i)) {
      paragraph.push(lines[i].trim())
      i++
    }
    out.push(<p className="response-paragraph" key={`p-${i}`}>{inline(paragraph.join(' '))}</p>)
  }

  return <div className="response-renderer">{out}</div>
}
