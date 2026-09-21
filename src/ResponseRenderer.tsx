import { Fragment, type ReactNode } from 'react'
import katex from 'katex'

function renderKatex(tex: string, displayMode: boolean): string {
  const clean = tex
    .replace(/^(\$\$|\$|\\\[|\\\()/, '')
    .replace(/(\$\$|\$|\\\]|\\\))$/, '')
    .trim()
  try {
    return katex.renderToString(clean, {
      displayMode,
      throwOnError: false,
      output: 'htmlAndMathml',
      strict: false,
    })
  } catch {
    return clean
  }
}

// Patrón de parsing inline: **negrita**, `código`, $math$, \(math\), *cursiva*
const inlinePattern = /(\*\*[^*]+\*\*|`[^`]+`|\$(?:\\\$|[^$\n])+\$|\\\([^\n\\]+\\\)|\*[^*\n]+\*)/g

// Comandos matemáticos habituales en respuestas académicas
const latexMathDetector = /\\(?:frac|sqrt|text|times|approx|cdot|mu|theta|alpha|beta|gamma|lambda|sigma|omega|Delta|pi|le|ge|neq|pm|sin|cos|tan|cot|sec|csc|log|ln|lim|int|sum|prod|left|right|partial|infty|vec|hat|circ)\b/

function inline(text: string): ReactNode[] {
  return text.split(inlinePattern).filter(Boolean).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{inline(part.slice(2, -2))}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    if ((part.startsWith('$') && part.endsWith('$')) || (part.startsWith('\\(') && part.endsWith('\\)'))) {
      const mathHtml = renderKatex(part, false)
      return <span className="inline-math" key={i} dangerouslySetInnerHTML={{ __html: mathHtml }} />
    }
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>

    // Si un fragmento de texto suelto contiene comandos LaTeX no delimitados, procesarlo con KaTeX
    if (latexMathDetector.test(part) && !part.includes('http') && !part.includes('```')) {
      const mathHtml = renderKatex(part, false)
      return <span className="inline-math" key={i} dangerouslySetInnerHTML={{ __html: mathHtml }} />
    }

    return <Fragment key={i}>{part}</Fragment>
  })
}

function isSpecial(line: string) {
  return (
    /^(#{1,4})\s+/.test(line) ||
    /^\s*([-*_])\1\1+\s*$/.test(line) ||
    /^\s*[-*•]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^```/.test(line) ||
    /^\$\$/.test(line) ||
    /^\\\[/.test(line)
  )
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

function prepareLine(line: string): string {
  // Si la línea es de tipo "Dato: valor_con_latex" y no tiene $, envolver el valor en $
  if (line.includes(':') && !line.includes('```') && !line.startsWith('#')) {
    const colonIdx = line.indexOf(':')
    const prefix = line.slice(0, colonIdx + 1)
    const rest = line.slice(colonIdx + 1).trim()
    if (latexMathDetector.test(rest) && !rest.includes('$') && !rest.includes('\\(')) {
      return `${prefix} $${rest}$`
    }
  }
  return line
}

export function ResponseRenderer({ text }: { text: string }) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
  const out: ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const raw = lines[i]
    const line = prepareLine(raw.trim())
    if (!line) { i++; continue }

    const table = parseTable(lines, i)
    if (table) {
      const [head, ...body] = table.rows
      out.push(
        <div className="response-table-wrap" key={`t-${i}`}>
          <table className="response-table">
            <thead>
              <tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r}>{row.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      i = table.next
      continue
    }

    if (/^```/.test(line)) {
      const lang = line.slice(3).trim()
      const code: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i].trim())) code.push(lines[i++])
      if (i < lines.length) i++
      out.push(
        <pre className="response-code" key={`c-${i}`}>
          <code data-language={lang || undefined}>{code.join('\n')}</code>
        </pre>
      )
      continue
    }

    // Bloque matemático $$...$$ o \[...\]
    if (/^(\$\$|\\\[)/.test(line)) {
      const isSquare = line.startsWith('\\\[')
      const closeMarker = isSquare ? '\\]' : '$$'
      let mathContent = line.replace(/^(\$\$|\\\[)/, '')
      if (mathContent.endsWith(closeMarker)) {
        mathContent = mathContent.slice(0, -closeMarker.length)
      } else {
        const mathLines: string[] = [mathContent]
        i++
        while (i < lines.length && !lines[i].trim().endsWith(closeMarker)) {
          mathLines.push(lines[i++])
        }
        if (i < lines.length) {
          mathLines.push(lines[i].trim().replace(new RegExp(`${isSquare ? '\\\\\\]' : '\\$\\$'}$`), ''))
        }
        mathContent = mathLines.join(' ')
      }
      const mathHtml = renderKatex(mathContent, true)
      out.push(<div className="math-block" key={`m-${i}`} dangerouslySetInnerHTML={{ __html: mathHtml }} />)
      i++
      continue
    }

    // Línea aislada que es una ecuación matemática completa (ej. f_k = \mu_k N = ... sin $$)
    if (
      latexMathDetector.test(line) &&
      (line.includes('=') || line.includes('\\frac') || line.includes('\\sqrt')) &&
      !line.startsWith('#') &&
      !line.startsWith('*') &&
      !line.startsWith('-') &&
      !line.startsWith('•') &&
      !line.includes(':')
    ) {
      const mathHtml = renderKatex(line, true)
      out.push(<div className="math-block" key={`mb-${i}`} dangerouslySetInnerHTML={{ __html: mathHtml }} />)
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
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quotes.push(lines[i++].trim().replace(/^>\s?/, ''))
      }
      out.push(<blockquote className="response-quote" key={`q-${i}`}>{quotes.map((q, j) => <p key={j}>{inline(q)}</p>)}</blockquote>)
      continue
    }

    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(prepareLine(lines[i++].replace(/^\s*[-*•]\s+/, '').trim()))
      }
      out.push(<ul className="response-list" key={`ul-${i}`}>{items.map((x, j) => <li key={j}>{inline(x)}</li>)}</ul>)
      continue
    }

    // Pasos numerados con formato 1. Texto:
    const stepMatch = line.match(/^\s*(\d+)[.)]\s+(.+)$/)
    if (stepMatch && (line.endsWith(':') || line.includes('**'))) {
      const stepNum = stepMatch[1]
      const stepTitle = stepMatch[2]
      out.push(
        <div className="response-step-header" key={`s-${i}`}>
          <span className="step-badge">{stepNum}</span>
          <strong>{inline(stepTitle)}</strong>
        </div>
      )
      i++
      continue
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(prepareLine(lines[i++].replace(/^\s*\d+[.)]\s+/, '').trim()))
      }
      out.push(<ol className="response-list numbered" key={`ol-${i}`}>{items.map((x, j) => <li key={j}>{inline(x)}</li>)}</ol>)
      continue
    }

    // Párrafos convencionales o tarjeta destacada de respuesta directa
    const paragraph = [line]
    i++
    while (i < lines.length && lines[i].trim() && !isSpecial(lines[i].trim()) && !parseTable(lines, i)) {
      paragraph.push(prepareLine(lines[i].trim()))
      i++
    }

    const fullParagraph = paragraph.join(' ')
    if (fullParagraph.startsWith('**Respuesta concreta:**') || fullParagraph.startsWith('Respuesta concreta:')) {
      const cleaned = fullParagraph.replace(/^\*{0,2}Respuesta concreta:\*{0,2}\s*/i, '')
      out.push(
        <div className="response-direct-answer" key={`ans-${i}`}>
          <div className="direct-answer-tag">
            <span>✦</span>
            <strong>RESPUESTA DIRECTA</strong>
          </div>
          <p>{inline(cleaned)}</p>
        </div>
      )
    } else {
      out.push(<p className="response-paragraph" key={`p-${i}`}>{inline(fullParagraph)}</p>)
    }
  }

  return <div className="response-renderer">{out}</div>
}
