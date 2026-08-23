import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Con `globals: false` Testing Library no registra su limpieza automatica.
afterEach(cleanup)

/**
 * jsdom no implementa `Blob.prototype.arrayBuffer`, que si existe en todos los
 * navegadores actuales. Se rellena aqui para poder probar la lectura de
 * archivos sin cambiar el codigo de produccion.
 */
if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        resolve(reader.result as ArrayBuffer)
      }
      reader.onerror = () => {
        reject(reader.error ?? new Error('No se pudo leer el archivo'))
      }
      reader.readAsArrayBuffer(this)
    })
  }
}
