import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('backend no longer reads Codex auth files or tokens', async () => {
  const source = await readFile(new URL('../lib/index.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /auth\.json|access_token|wham\/usage|codex app-server/)
  assert.match(source, /accounts', '--json/)
})
