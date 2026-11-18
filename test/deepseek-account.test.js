import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('backend no longer reads DSH DeepSeek credentials', async () => {
  const source = await readFile(new URL('../lib/index.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\.credentials\.yaml|get_user_summary|deepseekAccountToken/)
})
