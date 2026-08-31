import { useEffect, useState } from 'react'

import { nowMs } from '@/shared/id'

/**
 * Reloj que avanza mientras algo esta en marcha.
 *
 * Vive en la interfaz y no en el store a proposito: si el store guardara un
 * contador que cambia cada segundo, cada tic volveria a renderizar todo lo
 * suscrito al store —la tabla, la barra lateral, los filtros— para mover un
 * numero. Aqui solo se entera el panel que lo usa.
 */
export function useTicker(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(nowMs)

  useEffect(() => {
    if (!active) return

    // Un tic inmediato: si no, el primer segundo se ve congelado.
    setNow(nowMs())
    const timer = setInterval(() => {
      setNow(nowMs())
    }, intervalMs)

    return () => {
      clearInterval(timer)
    }
  }, [active, intervalMs])

  return now
}
