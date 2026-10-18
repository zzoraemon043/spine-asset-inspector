import { useEffect } from 'react'
import { useInspectorStore } from '@/store/inspectorStore'

export function useUnsavedGuard(): void {
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!useInspectorStore.getState().editor.dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])
}
