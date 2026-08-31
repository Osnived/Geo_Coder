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

/**
 * jsdom tampoco implementa `Element.prototype.scrollIntoView`, que existe en
 * todos los navegadores. Lo usa el desplegable de sugerencias para mantener a
 * la vista la opcion resaltada al recorrerla con las flechas.
 *
 * Se rellena con una funcion vacia: aqui no hay nada que desplazar, y lo que se
 * quiere probar es la navegacion, no el desplazamiento.
 */
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {
    // Sin efecto en jsdom.
  }
}
