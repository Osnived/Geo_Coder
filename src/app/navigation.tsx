import type { ReactNode } from 'react'

import { NavigationContext, type Navigation } from './navigationContext'

export function NavigationProvider({
  value,
  children,
}: {
  value: Navigation
  children: ReactNode
}) {
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
}
