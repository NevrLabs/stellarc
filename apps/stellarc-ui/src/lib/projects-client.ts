// STL-21 §5: frozen-fetcher adapter for the Projects surface. The lifted
// fork fetchers (src/fetchers/project/*) already speak the fork's HTTP
// contract, which this slice's API mirrors byte-for-byte under /api/project.
// This module re-exports them under one namespace plus the sync-collection
// reader, so screens can adopt the collections without touching frozen
// fetcher code. Mutations settle via their returned Mutation<T> txid (no
// refetchInterval, no WS — ADR 0007).

import archiveProject from "@/fetchers/project/archive-project";
import completeProjectMilestone from "@/fetchers/project/complete-project-milestone";
import createProject from "@/fetchers/project/create-project";
import createProjectMilestone from "@/fetchers/project/create-project-milestone";
import createProjectUpdate from "@/fetchers/project/create-project-update";
import deleteProjectMilestone from "@/fetchers/project/delete-project-milestone";
import deleteProjectUpdate from "@/fetchers/project/delete-project-update";
import getProject from "@/fetchers/project/get-project";
import getProjectMilestones from "@/fetchers/project/get-project-milestones";
import getProjects from "@/fetchers/project/get-projects";
import getProjectUpdates from "@/fetchers/project/list-project-updates";
import renameProjectSlug from "@/fetchers/project/rename-project-slug";
import reopenProjectMilestone from "@/fetchers/project/reopen-project-milestone";
import resolveProjectSlug from "@/fetchers/project/resolve-project-slug";
import unarchiveProject from "@/fetchers/project/unarchive-project";
import updateProject from "@/fetchers/project/update-project";
import updateProjectMilestone from "@/fetchers/project/update-project-milestone";
import updateProjectUpdate from "@/fetchers/project/update-project-update";
import {
  PROJECT_COLLECTIONS,
  type ProjectCollectionName,
  projectShapeUrl,
} from "./projects-collections";

export const projectsClient = {
  list: getProjects,
  get: getProject,
  create: createProject,
  update: updateProject,
  renameSlug: renameProjectSlug,
  archive: archiveProject,
  unarchive: unarchiveProject,
  resolveSlug: resolveProjectSlug,
  milestones: {
    list: getProjectMilestones,
    create: createProjectMilestone,
    update: updateProjectMilestone,
    remove: deleteProjectMilestone,
    complete: completeProjectMilestone,
    reopen: reopenProjectMilestone,
  },
  updates: {
    list: getProjectUpdates,
    create: createProjectUpdate,
    update: updateProjectUpdate,
    remove: deleteProjectUpdate,
  },
} as const;

/** Read one page of a project sync collection (snapshot first page when no
 * handle). Returns parsed messages; throws on non-200. */
export async function readProjectCollection(
  collection: ProjectCollectionName,
  org: string,
  opts: { offset?: string; handle?: string } = {},
): Promise<Array<Record<string, unknown>>> {
  if (!Object.hasOwn(PROJECT_COLLECTIONS, collection))
    throw new Error(`Unknown project collection: ${collection}`);
  const url = projectShapeUrl(collection, org, opts.offset, opts.handle);
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`Shape request failed: ${response.status}`);
  return (await response.json()) as Array<Record<string, unknown>>;
}

export { PROJECT_COLLECTIONS, projectShapeUrl };
export type { ProjectCollectionName };
