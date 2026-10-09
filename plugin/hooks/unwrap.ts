// Unwrap text copied from the Claude Code TUI: it hard-wraps long lines at
// terminal width and indents output, so copied commands break when pasted.

const TUI_GLYPHS = '⏺⎿●'
const LIST_ITEM = /^\s*([-*+•]|\d+[.)]|#+)\s/
const MIN_WRAP_WIDTH = 60 // below this nothing was wrapped by the TUI
const TERMINAL_MARGIN = 6 // the TUI wraps a bit narrower than the terminal
const TUI_INDENT = 2 // base indent Claude Code adds to output
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\u{20000}-\u{3FFFD}]/u

export type UnwrapOptions = {
  /** Width the text was rendered at; estimated when left out. */
  width?: number
  /** Width of the terminal the text was copied from. */
  terminalWidth?: number
  /** Join everything into one line. */
  oneLine?: boolean
  /** Only strip markers and indent (text whose wrapped rows are already joined). */
  noJoin?: boolean
}

/** Display width: CJK / fullwidth characters take two columns. */
export function cols(s: string): number {
  let n = 0
  for (const c of s) n += WIDE.test(c) ? 2 : 1
  return n
}

function indentOf(line: string): number {
  return line.length - line.replace(/^ +/, '').length
}

/** Replace a leading TUI marker like '⏺ ' with spaces, keeping columns. */
function stripGlyph(line: string): string {
  const indent = indentOf(line)
  const first = line.charAt(indent)
  return first !== '' && TUI_GLYPHS.includes(first)
    ? ' '.repeat(indent + 1) + line.slice(indent + 1)
    : line
}

/** Remove the shared indent. The selection may start after the first line's
 * indent, so that line only caps the shared indent at the TUI's base indent. */
function dedent(lines: string[]): string[] {
  const rest = lines.slice(1).filter(l => l.trim())
  const body = rest.length ? rest : lines
  const shared = Math.min(
    Math.min(...body.map(indentOf)),
    Math.max(indentOf(lines[0]), TUI_INDENT),
  )
  return lines.map(l => l.slice(Math.min(shared, indentOf(l))))
}

/** True if `cur` only starts a new line because its first word did not fit. */
function isWrapped(prev: string, cur: string, width: number): boolean {
  if (!prev.trim() || !cur.trim()) return false
  if (prev.trimEnd().endsWith('\\') || LIST_ITEM.test(cur)) return false
  return cols(prev) + 1 + cols(cur.trim().split(/\s+/)[0]) > width
}

/** A space-less line filling the full width is a long token (URL) cut mid-way. */
function isBrokenToken(line: string, width: number): boolean {
  return !line.trim().includes(' ') && cols(line) >= width
}

export function unwrap(text: string, options: UnwrapOptions = {}): string {
  const lines = text.split(/\r\n|\r|\n/).map(l => stripGlyph(l).trimEnd())
  while (lines.length && !lines[0].trim()) lines.shift()
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  if (!lines.length) return ''

  if (options.oneLine) {
    return lines
      .filter(l => l.trim())
      .map(l => l.trim().replace(/\\$/, '').trimEnd())
      .join(' ')
  }

  let width = options.width
  if (width === undefined) {
    width = Math.max(...lines.map(cols))
    if (options.terminalWidth) width = Math.max(width, options.terminalWidth - TERMINAL_MARGIN)
    if (width < MIN_WRAP_WIDTH) return dedent(lines).join('\n')
  }
  if (options.noJoin) return dedent(lines).join('\n')

  const out = [lines[0]]
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1]
    const cur = lines[i]
    if (isWrapped(prev, cur, width)) {
      const sep = isBrokenToken(prev, width) ? '' : ' '
      out[out.length - 1] += sep + cur.trim()
    } else {
      out.push(cur)
    }
  }
  return dedent(out).join('\n')
}
