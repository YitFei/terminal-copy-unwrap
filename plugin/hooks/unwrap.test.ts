import { expect, test } from 'claude-code/testing'

import { unwrap } from './unwrap'

const CMD =
  'docker tag insighthub-nginx-proxy:latest insighthub-nginx-proxy:pre-beszel ' +
  '&& $DC build nginx-proxy && $DC up -d --no-deps nginx-proxy'

// CMD as Claude Code renders it at ~75 columns: 2-space indent, hard wraps.
const CMD_TUI = [
  '  docker tag insighthub-nginx-proxy:latest insighthub-nginx-proxy:pre-beszel',
  '  && $DC build nginx-proxy && $DC up -d --no-deps nginx-proxy',
].join('\n')

test('joins a hard-wrapped command', () => {
  expect(unwrap(CMD_TUI)).toBe(CMD)
})

test('keeps short real lines', () => {
  const text = '  cd /opt/InsightHub\n  DC="docker compose --env-file .env.deploy -f docker-compose.deploy.yml"'
  expect(unwrap(text)).toBe(
    'cd /opt/InsightHub\nDC="docker compose --env-file .env.deploy -f docker-compose.deploy.yml"',
  )
})

test('terminal width keeps the longest line from swallowing the next', () => {
  const text = '  DC="docker compose --env-file .env.deploy -f docker-compose.deploy.yml"\n  docker compose up -d'
  expect(unwrap(text, { terminalWidth: 120 })).toBe(
    'DC="docker compose --env-file .env.deploy -f docker-compose.deploy.yml"\ndocker compose up -d',
  )
})

test('keeps paragraphs, list items and shell continuations', () => {
  const text = [
    '  Step: Hub',
    '',
    '  - docker run --rm -it --name a-fairly-long-container-name-here-ok \\',
    '      --env-file .env.deploy image:latest',
  ].join('\n')
  expect(unwrap(text, { width: 70 })).toBe(text.replace(/^  /gm, ''))
})

test('selection starting after the indent', () => {
  expect(unwrap(CMD_TUI.trimStart())).toBe(CMD)
})

test('joins a cut URL without a space', () => {
  const url = 'https://example.com/' + 'a'.repeat(100)
  expect(unwrap('  ' + url.slice(0, 68) + '\n  ' + url.slice(68))).toBe(url)
})

test('strips TUI markers', () => {
  expect(unwrap('⏺ ' + CMD_TUI.slice(2))).toBe(CMD)
})

test('one line mode', () => {
  expect(unwrap('  cd /opt \\\n  ls -la\n\n  pwd', { oneLine: true })).toBe('cd /opt ls -la pwd')
})

test('counts CJK as two columns', () => {
  const src = '这是一段很长的中文说明文字，'.repeat(6) + ' end'
  const rendered = '  ' + src.slice(0, 36) + '\n  ' + src.slice(36)
  expect(unwrap(rendered)).toBe(src.slice(0, 36) + ' ' + src.slice(36))
})

test('noJoin only strips indent', () => {
  expect(unwrap('  a very long line\n  next', { noJoin: true, width: 10 })).toBe('a very long line\nnext')
})
