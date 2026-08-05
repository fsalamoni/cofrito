/**
 * Hook de toasts.
 */
import { useUIStore } from '@/stores/uiStore'

export function useToast() {
  return useUIStore((s) => ({ push: s.pushToast, dismiss: s.dismissToast, toasts: s.toasts }))
}
