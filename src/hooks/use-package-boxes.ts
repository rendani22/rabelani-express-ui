import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { reportError } from '@/lib/logger'
import type { BoxContentLine } from '@/lib/box-label'
import {
  deletePackageBox,
  getPackageLocationName,
  listPackageBoxes,
  savePackageBox,
} from '@/lib/api/package-boxes'

export function usePackageBoxes(packageId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['package-boxes', packageId],
    queryFn: () => listPackageBoxes(packageId!),
    enabled: !!packageId && enabled,
  })
}

export function usePackageLocationName(packageId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['package-location-name', packageId],
    queryFn: () => getPackageLocationName(packageId!),
    enabled: !!packageId && enabled,
    staleTime: 5 * 60_000,
  })
}

export function useSavePackageBox(packageId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ lines, boxId }: { lines: readonly BoxContentLine[]; boxId?: string }) =>
      savePackageBox(packageId, lines, boxId),
    onSuccess: (_id, { boxId }) => {
      toast.success(boxId ? 'Pack updated.' : 'Pack added.')
      qc.invalidateQueries({ queryKey: ['package-boxes', packageId] })
    },
    onError: (e) => toast.error(reportError(e, 'Could not save the pack.', { op: 'boxes.save', packageId })),
  })
}

export function useDeletePackageBox(packageId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (boxId: string) => deletePackageBox(boxId),
    onSuccess: () => {
      toast.success('Pack removed.')
      qc.invalidateQueries({ queryKey: ['package-boxes', packageId] })
    },
    onError: (e) => toast.error(reportError(e, 'Could not remove the pack.', { op: 'boxes.delete', packageId })),
  })
}
