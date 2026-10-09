import { expect, test } from 'claude-code/testing'

const WRAPPED = [
  '  docker tag insighthub-nginx-proxy:latest insighthub-nginx-proxy:pre-beszel',
  '  && $DC build nginx-proxy && $DC up -d --no-deps nginx-proxy',
].join('\n')
const JOINED =
  'docker tag insighthub-nginx-proxy:latest insighthub-nginx-proxy:pre-beszel ' +
  '&& $DC build nginx-proxy && $DC up -d --no-deps nginx-proxy'

test('/copycmd unwraps the clipboard back onto it', async ($, on) => {
  let copied: string | undefined
  on('env.get', () => ({ value: 'Windows_NT' }))
  on('ui.selection', () => ({ value: undefined }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: WRAPPED, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('ui.copy', ($, e) => {
    copied = e.text
    return { value: { isCopied: true as const } }
  })

  const result = await $.command.run({ command: 'copycmd', args: '' })
  expect(copied).toBe(JOINED)
  expect(result.text).toContain('2 → 1 line(s)')
})

test('/copycmd -p previews without copying', async ($, on) => {
  let copied = false
  on('env.get', () => ({ value: 'Windows_NT' }))
  on('ui.selection', () => ({ value: undefined }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: WRAPPED, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('ui.copy', () => {
    copied = true
    return { value: { isCopied: true as const } }
  })

  const result = await $.command.run({ command: 'copycmd', args: '-p' })
  expect(copied).toBe(false)
  expect(result.text).toContain(JOINED)
})

test('/copycmd rejects unknown flags', async $ => {
  const result = await $.command.run({ command: 'copycmd', args: '--bogus' })
  expect(result.text).toContain('Usage')
})

test('/cp is the short form of /copycmd', async $ => {
  const result = await $.command.run({ command: 'cp', args: '--bogus' })
  expect(result.text).toContain('Usage')
})
