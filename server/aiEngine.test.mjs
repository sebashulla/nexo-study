import test from 'node:test'
import assert from 'node:assert/strict'
import { callNexoEngine } from './aiEngine.mjs'

test('page summary is accepted by the existing AI artifact endpoint', async () => {
  const original = { key: process.env.NEXO_AI_API_KEY, standard: process.env.NEXO_AI_STANDARD_MODEL, deep: process.env.NEXO_AI_DEEP_MODEL, fetch: globalThis.fetch }
  process.env.NEXO_AI_API_KEY = 'fixture-key'
  process.env.NEXO_AI_STANDARD_MODEL = 'fixture-standard'
  process.env.NEXO_AI_DEEP_MODEL = 'fixture-deep'
  let body
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body)
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"summary":"Página preparada"}' }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const result = await callNexoEngine({ task: 'artifact', artifactType: 'summary', question: 'Solo página 2: energía cinética.' })
    assert.equal(result.text, '{"summary":"Página preparada"}')
    assert.match(body.systemInstruction.parts[0].text, /summary/)
    assert.equal(body.generationConfig.responseMimeType, 'application/json')
    assert.equal(body.contents[0].parts.at(-1).text, 'Solo página 2: energía cinética.')
  } finally {
    globalThis.fetch = original.fetch
    for (const [name, value] of [['NEXO_AI_API_KEY', original.key], ['NEXO_AI_STANDARD_MODEL', original.standard], ['NEXO_AI_DEEP_MODEL', original.deep]]) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})
