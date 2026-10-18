import { useEffect, useState } from 'react'
import { InspectorController } from './controller/InspectorController'
import { ControllerProvider } from './controller/ControllerContext'
import { createBrowserEnvironment } from './controller/browserEnvironment'
import { Workbench } from './components/layout/Workbench'

export function App() {
  const [controller] = useState(() => new InspectorController(createBrowserEnvironment()))
  useEffect(() => () => controller.detachStage(), [controller])
  return (
    <ControllerProvider controller={controller}>
      <Workbench />
    </ControllerProvider>
  )
}
