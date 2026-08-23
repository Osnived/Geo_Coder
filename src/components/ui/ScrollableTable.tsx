import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { cx } from '@/shared/cx'

/**
 * Contenedor de tablas anchas.
 *
 * Resuelve dos molestias de una tabla con muchas columnas:
 *
 * - El scroll horizontal vive tambien arriba, no solo debajo de la tabla. Con
 *   muchas filas, la barra de abajo queda fuera de la pantalla y hay que bajar
 *   toda la pagina para desplazarse de lado.
 * - El scroll vertical es interno: la cabecera queda fija y la pagina no se
 *   mueve mientras recorres las filas.
 */

export interface ScrollableTableProps {
  children: ReactNode
  /** Alto maximo del area de filas. */
  maxHeightClass?: string
}

/**
 * Copia la posicion horizontal de un contenedor a otro.
 *
 * Solo escribe si el valor difiere: cuando el destino dispara su propio evento
 * de scroll, los valores ya coinciden y la cadena se corta sola, sin banderas
 * ni temporizadores.
 */
function mirrorScroll(from: HTMLElement | null, to: HTMLElement | null): void {
  if (!from || !to) return
  if (to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft
}

export function ScrollableTable({
  children,
  maxHeightClass = 'max-h-[65vh]',
}: ScrollableTableProps) {
  const topBar = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)

  const [contentWidth, setContentWidth] = useState(0)
  const [visibleWidth, setVisibleWidth] = useState(0)

  const measure = useCallback(() => {
    const element = body.current
    if (!element) return
    setContentWidth(element.scrollWidth)
    setVisibleWidth(element.clientWidth)
  }, [])

  useEffect(() => {
    const element = body.current
    if (!element) return

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(element)
    const table = element.firstElementChild
    if (table) observer.observe(table)

    // El observador cubre casi todo, pero al cambiar el tamano de la ventana
    // puede medir antes de que el navegador termine de recolocar. El evento de
    // `resize` llega despues y confirma la medida.
    window.addEventListener('resize', measure)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  // El contenido cambia al filtrar, al editar una fila o al cambiar de hoja.
  useEffect(measure, [measure, children])

  const onTopScroll = useCallback(() => {
    mirrorScroll(topBar.current, body.current)
  }, [])

  const onBodyScroll = useCallback(() => {
    mirrorScroll(body.current, topBar.current)
  }, [])

  const hasOverflow = contentWidth > visibleWidth + 1

  return (
    <div className="border-border-subtle overflow-hidden rounded-md border">
      {hasOverflow ? (
        <div
          ref={topBar}
          onScroll={onTopScroll}
          // `overflow-x: scroll` y no `auto`: la barra debe verse siempre que
          // haya desbordamiento, no solo al pasar el raton.
          className="border-border-subtle overflow-x-scroll overflow-y-hidden border-b"
          aria-hidden="true"
        >
          <div style={{ width: contentWidth, height: 1 }} />
        </div>
      ) : null}

      <div
        ref={body}
        onScroll={onBodyScroll}
        className={cx('overflow-auto', maxHeightClass)}
        // La tabla es una region desplazable: debe poder recorrerse con teclado.
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  )
}
