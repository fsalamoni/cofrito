/**
 * Hook de perfil.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import type { UserProfile } from '@/types'

export function useProfile() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: ['profile', user?.uid],
    queryFn: () => api.getProfile().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    enabled: !!user, // só busca perfil se houver user logado
    retry: 0,
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<UserProfile>) => api.updateProfile(data).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['profile'], data)
    },
  })
}
