import { noopAssistant, type AiAssistant } from '@/domain/services/aiAssistant'
import { createLocalLlmAssistant } from '@/providers/ai/localLlmAssistant'

/**
 * Asistente de IA de la aplicacion (spec seccion 22).
 *
 * Apagado por defecto. Mientras lo este, `getAssistant` devuelve el asistente
 * nulo y ninguna parte del sistema cambia de comportamiento.
 */

export interface AiSettings {
  readonly enabled: boolean
  readonly endpoint: string
  readonly model: string
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'llama3.1',
}

let cached: { settings: AiSettings; assistant: AiAssistant } | null = null

export function getAssistant(settings: AiSettings): AiAssistant {
  if (!settings.enabled) return noopAssistant

  if (
    cached &&
    cached.settings.endpoint === settings.endpoint &&
    cached.settings.model === settings.model
  ) {
    return cached.assistant
  }

  const assistant = createLocalLlmAssistant({
    endpoint: settings.endpoint,
    model: settings.model,
  })
  cached = { settings, assistant }
  return assistant
}

/** Solo para tests. */
export function resetAssistant(): void {
  cached = null
}
