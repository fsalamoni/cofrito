/**
 * Hook de perfil.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { UserProfile } from '@/types'

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => api.getProfile().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
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
