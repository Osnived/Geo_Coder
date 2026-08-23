import { FIELD_LABELS, NORMALIZED_FIELDS } from '@/domain/models/fields'
import type { EstablishmentRecord } from '@/domain/models/record'
import {
  sanitizeColumnSuggestions,
  sanitizeQuerySuggestions,
  type AiAssistant,
} from '@/domain/services/aiAssistant'

/**
 * Asistente sobre un modelo de lenguaje que corre en la maquina del usuario
 * (Ollama, LM Studio, llama.cpp...), a traves de la API compatible con OpenAI
 * que todos exponen en `/v1/chat/completions`.
 *
 * Por que local y no un servicio alojado: la aplicacion no tiene backend, y
 * meter una clave de API en el frontend la deja expuesta a cualquiera que abra
 * las herramientas de desarrollo (spec seccion 9.3). Un modelo en localhost no
 * necesita clave y mantiene el principio 4, local first.
 *
 * Si mas adelante se quiere usar un modelo alojado, lo correcto es apuntar
 * `endpoint` a un proxy propio que guarde la clave en el servidor.
 */

const DEFAULT_ENDPOINT = 'http://localhost:11434/v1/chat/completions'
const DEFAULT_MODEL = 'llama3.1'
const DEFAULT_TIMEOUT_MS = 30_000

export interface LocalLlmOptions {
  readonly endpoint?: string
  readonly model?: string
  readonly timeoutMs?: number
  /**
   * Solo para apuntar a un proxy propio. No pongas aqui la clave de un
   * servicio publico: viajaria en el navegador.
   */
  readonly apiKey?: string
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[]
}

/** Extrae el primer array JSON de una respuesta que puede traer texto alrededor. */
export function extractJsonArray(content: string): unknown {
  const start = content.indexOf('[')
  const end = content.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return null

  try {
    return JSON.parse(content.slice(start, end + 1))
  } catch {
    return null
  }
}

const FIELD_CATALOG = NORMALIZED_FIELDS.map((field) => `- ${field}: ${FIELD_LABELS[field]}`).join(
  '\n',
)

function columnPrompt(headers: readonly string[]): string {
  return [
    'Eres un asistente que interpreta encabezados de hojas de calculo de establecimientos comerciales.',
    'Campos disponibles:',
    FIELD_CATALOG,
    '',
    'Encabezados sin identificar:',
    ...headers.map((header) => `- ${header}`),
    '',
    'Devuelve SOLO un array JSON con los encabezados que reconozcas, en este formato:',
    '[{"header": "...", "field": "...", "confidence": 0.0}]',
    'Omite los que no sepas. No inventes campos fuera de la lista.',
  ].join('\n')
}

function queryPrompt(record: EstablishmentRecord, tried: readonly string[]): string {
  const known = NORMALIZED_FIELDS.filter((field) => record.fields[field].trim() !== '').map(
    (field) => `- ${FIELD_LABELS[field]}: ${record.fields[field]}`,
  )

  return [
    'Eres un asistente que redacta consultas para un geocodificador (Nominatim/OpenStreetMap).',
    'Datos del establecimiento:',
    ...known,
    '',
    'Consultas que ya se probaron y no encontraron nada:',
    ...tried.map((query) => `- ${query}`),
    '',
    'Propon hasta 3 consultas alternativas distintas que puedan funcionar mejor.',
    'Ideas utiles: desarrollar abreviaturas, usar el nombre de un centro comercial,',
    'quitar el nombre de la cadena, o usar solo la direccion.',
    'Devuelve SOLO un array JSON de cadenas: ["consulta 1", "consulta 2"]',
  ].join('\n')
}

export function createLocalLlmAssistant(options: LocalLlmOptions = {}): AiAssistant {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT
  const model = options.model ?? DEFAULT_MODEL
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function ask(prompt: string, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
    }, timeoutMs)
    const onAbort = () => {
      controller.abort()
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (!response.ok) return null

      const payload = (await response.json()) as ChatResponse
      const content = payload.choices?.[0]?.message?.content
      return typeof content === 'string' ? extractJsonArray(content) : null
    } catch {
      // La IA es un extra: si falla, la aplicacion sigue sin ella.
      return null
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  return {
    name: `modelo local (${model})`,

    async mapUnknownColumns(headers, signal) {
      if (headers.length === 0) return []
      const raw = await ask(columnPrompt(headers), signal)
      return sanitizeColumnSuggestions(raw, headers)
    },

    async suggestQueries(record, triedQueries, signal) {
      const raw = await ask(queryPrompt(record, triedQueries), signal)
      return sanitizeQuerySuggestions(raw, triedQueries)
    },
  }
}
