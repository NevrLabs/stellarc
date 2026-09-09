import { useMutation, useQueryClient } from "@tanstack/react-query";
import complete from "@/fetchers/project/complete-project-milestone";
import create from "@/fetchers/project/create-project-milestone";
import remove from "@/fetchers/project/delete-project-milestone";
import reopen from "@/fetchers/project/reopen-project-milestone";
import update from "@/fetchers/project/update-project-milestone";
import { invalidateProjectQueries } from "@/lib/project-sync-invalidation";

const invalidate = (qc: ReturnType<typeof useQueryClient>, projectId: string) =>
  invalidateProjectQueries(qc, projectId);
export function useCreateProjectMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: create,
    onSuccess: (_, v) => invalidate(qc, v.projectId),
  });
}
export function useUpdateProjectMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: update,
    onSuccess: (_, v) => invalidate(qc, v.projectId),
  });
}
export function useCompleteProjectMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: complete,
    onSuccess: (_, v) => invalidate(qc, v.projectId),
  });
}
export function useReopenProjectMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reopen,
    onSuccess: (_, v) => invalidate(qc, v.projectId),
  });
}
export function useDeleteProjectMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: remove,
    onSuccess: (_, v) => invalidate(qc, v.projectId),
  });
}
