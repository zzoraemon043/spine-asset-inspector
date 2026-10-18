import { createContext, useContext, type ReactNode } from 'react'
import type { InspectorController } from './InspectorController'

const ControllerContext = createContext<InspectorController<ImageBitmap> | null>(null)

export function ControllerProvider({ controller, children }: { controller: InspectorController<ImageBitmap>; children: ReactNode }) {
  return <ControllerContext.Provider value={controller}>{children}</ControllerContext.Provider>
}

export function useController(): InspectorController<ImageBitmap> {
  const controller = useContext(ControllerContext)
  if (!controller) throw new Error('InspectorController 尚未提供')
  return controller
}
