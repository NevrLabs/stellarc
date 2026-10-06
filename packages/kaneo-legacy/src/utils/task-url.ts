export function getTaskUrl(
  clientUrl: string,
  organizationId: string,
  boardId: string,
  taskId: string,
) {
  return new URL(
    `/dashboard/organization/${organizationId}/board/${boardId}/task/${taskId}`,
    clientUrl,
  ).toString();
}
