import { afterEach, describe, expect, it, vi } from 'vitest'

import { makeRecord } from '@/test/factories'

import { createLocalLlmAssistant, extractJsonArray } from './localLlmAssistant'

function mockChat(content: string, status = 200) {
  const spy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('extractJsonArray', () => {
  it('extrae el array aunque venga rodeado de texto', () => {
    expect(extractJsonArray('Claro, aqui tienes:\n["a","b"]\nEspero que sirva')).toEqual(['a', 'b'])
  })

  it('devuelve null si no hay array', () => {
    expect(extractJsonArray('no se')).toBeNull()
  })

  it('devuelve null si el JSON esta roto', () => {
    expect(extractJsonArray('[{"a": }]')).toBeNull()
  })
})

describe('createLocalLlmAssistant', () => {
  it('apunta por defecto a un modelo local sin clave', async () => {
    const spy = mockChat('[]')
    await createLocalLlmAssistant().mapUnknownColumns(['NOMBRE PDV'])

    const [url, init] = spy.mock.calls[0] ?? []
    expect(String(url)).toBe('http://localhost:11434/v1/chat/completions')
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('traduce las sugerencias de columna y las valida', async () => {
    mockChat('[{"header":"NOMBRE PDV","field":"location_name","confidence":0.9}]')
    const result = await createLocalLlmAssistant().mapUnknownColumns(['NOMBRE PDV'])

    expect(result).toEqual([{ header: 'NOMBRE PDV', field: 'location_name', confidence: 0.9 }])
  })

  it('descarta lo que el modelo se invente', async () => {
    mockChat('[{"header":"OTRA","field":"telefono","confidence":1}]')
    const result = await createLocalLlmAssistant().mapUnknownColumns(['NOMBRE PDV'])
    expect(result).toEqual([])
  })

  it('no llama al modelo si no hay columnas que resolver', async () => {
    const spy = mockChat('[]')
    await createLocalLlmAssistant().mapUnknownColumns([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('propone consultas alternativas sin repetir las ya probadas', async () => {
    mockChat('["Toks Coyoacan, CDMX", "Toks Centro"]')
    const result = await createLocalLlmAssistant().suggestQueries(
      makeRecord({ client: 'Toks', city: 'CDMX' }),
      ['Toks Centro'],
    )

    expect(result).toEqual(['Toks Coyoacan, CDMX'])
  })

  it('incluye los datos del registro en el prompt', async () => {
    const spy = mockChat('[]')
    await createLocalLlmAssistant().suggestQueries(makeRecord({ client: 'Toks', city: 'CDMX' }), [
      'una consulta',
    ])

    const body = String((spy.mock.calls[0]?.[1] as RequestInit | undefined)?.body)
    expect(body).toContain('Toks')
    expect(body).toContain('CDMX')
    expect(body).toContain('una consulta')
  })

  it('devuelve vacio si el servicio falla', async () => {
    mockChat('[]', 500)
    expect(await createLocalLlmAssistant().mapUnknownColumns(['X'])).toEqual([])
  })

  it('devuelve vacio si no hay ningun modelo escuchando', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    )
    expect(await createLocalLlmAssistant().mapUnknownColumns(['X'])).toEqual([])
  })

  it('envia la clave solo si se configura, para un proxy propio', async () => {
    const spy = mockChat('[]')
    await createLocalLlmAssistant({ apiKey: 'secreto' }).mapUnknownColumns(['X'])

    const init = spy.mock.calls[0]?.[1]
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secreto')
  })

  it('permite cambiar endpoint y modelo', async () => {
    const spy = mockChat('[]')
    await createLocalLlmAssistant({
      endpoint: 'http://localhost:1234/v1/chat/completions',
      model: 'qwen2.5',
    }).mapUnknownColumns(['X'])

    expect(String(spy.mock.calls[0]?.[0])).toContain(':1234')
    expect(String((spy.mock.calls[0]?.[1] as RequestInit | undefined)?.body)).toContain('qwen2.5')
  })
})
