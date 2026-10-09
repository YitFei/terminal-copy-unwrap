import type { EngineInterface, Hook, Register } from 'claude-code'

import { unwrap } from './unwrap'

const USAGE = 'Usage: /copycmd or /cp [-1] [-w N] [-p]  (-1 one line, -w render width, -p preview only)'
const DESCRIPTION = 'Unwrap copied TUI text (hard wraps, indent) back onto the clipboard'

const UNIX_READERS = [
  ['pbpaste'],
  ['wl-paste', '--no-newline'],
  ['xclip', '-selection', 'clipboard', '-o'],
  ['xsel', '--clipboard', '--output'],
]
const WINDOWS_READER = [
  'powershell',
  '-NoProfile',
  '-Command',
  '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw',
]

type Args = { oneLine: boolean; width?: number; preview: boolean }

function parseArgs(raw: string): Args | undefined {
  const args: Args = { oneLine: false, preview: false }
  const words = raw.trim().split(/\s+/).filter(Boolean)
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    if (word === '-1') args.oneLine = true
    else if (word === '-p') args.preview = true
    else if (word === '-w' && /^\d+$/.test(words[i + 1] ?? '')) args.width = Number(words[++i])
    else return undefined
  }
  return args
}

async function readClipboard($: EngineInterface): Promise<string | undefined> {
  const readers = (await $.env.get('OS')) === 'Windows_NT' ? [WINDOWS_READER] : UNIX_READERS
  for (const argv of readers) {
    try {
      const { exitCode, stdout } = await $.process.run(argv)
      if (exitCode === 0) return stdout
    } catch {
      // reader not installed: try the next one
    }
  }
  return undefined
}

const run: Hook<'command.run'> = async ($, e) => {
  const args = parseArgs(e.args ?? '')
  if (!args) return { text: USAGE }

  // A fullscreen selection already has its wrapped rows joined by the engine.
  const selected = await $.ui.selection()
  const source = selected?.text ?? (await readClipboard($))
  if (!source?.trim()) return { text: 'Nothing to unwrap: select text or copy it first.' }

  const result = unwrap(source, {
    width: args.width,
    terminalWidth: e.presentation?.columns,
    oneLine: args.oneLine,
    noJoin: selected !== undefined,
  })
  const lines = source.trim().split(/\r\n|\r|\n/).length
  const summary = `${lines} → ${result.split('\n').length} line(s)`

  if (args.preview) return { text: `Preview (${summary}), clipboard unchanged:\n${result}` }
  const copied = await $.ui.copy({ text: result })
  if (!copied.isCopied) return { text: `Could not copy (${copied.reason}):\n${result}` }
  return { text: `Copied (${summary}):\n${result}` }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'copycmd', description: DESCRIPTION })
    await $.command.register({ name: 'cp', description: `${DESCRIPTION} (short for /copycmd)` })
    return next(e)
  })

  on('command.run', { command: 'copycmd' }, run)
  on('command.run', { command: 'cp' }, run)
}
