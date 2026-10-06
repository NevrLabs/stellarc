import { sql } from "drizzle-orm";
import db from "../database";

/**
 * Transitive team membership (sub-teams).
 *
 * A team may nest under a parent team (team.parent_team_id). Members of a
 * sub-team COUNT AS members of every ancestor team, resolved at query time —
 * nothing is materialized, so leaving a sub-team can never strand stale
 * ancestor rows.
 *
 * Both directions are recursive CTEs with a visited-set guard (`path`), so a
 * cycle in the data (which the API rejects, but the DB does not constrain)
 * terminates instead of hanging the query.
 */

const MAX_DEPTH = 12;

/**
 * Every team the user effectively belongs to: their direct teams plus all
 * ancestors of those teams.
 */
export async function getEffectiveTeamIdsForUser(
  userId: string,
): Promise<string[]> {
  const result = await db.execute(sql`
    WITH RECURSIVE effective_team(id, path, depth) AS (
      SELECT tm.team_id, ARRAY[tm.team_id], 1
        FROM team_member tm
       WHERE tm.user_id = ${userId}
      UNION ALL
      SELECT t.parent_team_id, et.path || t.parent_team_id, et.depth + 1
        FROM team t
        JOIN effective_team et ON t.id = et.id
       WHERE t.parent_team_id IS NOT NULL
         AND NOT t.parent_team_id = ANY(et.path)
         AND et.depth < ${MAX_DEPTH}
    )
    SELECT DISTINCT id FROM effective_team
  `);
  return (result.rows as Array<{ id: string }>).map((row) => row.id);
}

export type EffectiveTeamMember = {
  userId: string;
  /**
   * null for direct members; for inherited members, the id/name of the
   * sub-team that contributes them ("from sub-team X" in the UI). A user who
   * is both direct and inherited resolves as DIRECT — direct membership is
   * the stronger claim.
   */
  viaTeamId: string | null;
  viaTeamName: string | null;
};

/**
 * Everyone who effectively belongs to a team: its direct members plus every
 * member of its descendant sub-teams, each row carrying provenance.
 */
export async function getEffectiveTeamMembers(
  teamId: string,
): Promise<EffectiveTeamMember[]> {
  const result = await db.execute(sql`
    WITH RECURSIVE descendant_team(id, name, path, depth) AS (
      SELECT t.id, t.name, ARRAY[t.id], 1
        FROM team t
       WHERE t.id = ${teamId}
      UNION ALL
      SELECT c.id, c.name, dt.path || c.id, dt.depth + 1
        FROM team c
        JOIN descendant_team dt ON c.parent_team_id = dt.id
       WHERE NOT c.id = ANY(dt.path)
         AND dt.depth < ${MAX_DEPTH}
    ),
    memberships AS (
      SELECT tm.user_id,
             dt.id   AS via_team_id,
             dt.name AS via_team_name,
             (dt.id = ${teamId}) AS is_direct
        FROM team_member tm
        JOIN descendant_team dt ON tm.team_id = dt.id
    )
    SELECT DISTINCT ON (user_id)
           user_id,
           CASE WHEN is_direct THEN NULL ELSE via_team_id   END AS via_team_id,
           CASE WHEN is_direct THEN NULL ELSE via_team_name END AS via_team_name
      FROM memberships
     ORDER BY user_id, is_direct DESC
  `);
  return (
    result.rows as Array<{
      user_id: string;
      via_team_id: string | null;
      via_team_name: string | null;
    }>
  ).map((row) => ({
    userId: row.user_id,
    viaTeamId: row.via_team_id,
    viaTeamName: row.via_team_name,
  }));
}

/**
 * Would making `parentId` the parent of `teamId` create a cycle? True when
 * `parentId` is `teamId` itself or one of its descendants.
 */
export async function wouldCreateTeamCycle(
  teamId: string,
  parentId: string,
): Promise<boolean> {
  if (teamId === parentId) return true;
  const result = await db.execute(sql`
    WITH RECURSIVE descendant_team(id, path, depth) AS (
      SELECT t.id, ARRAY[t.id], 1
        FROM team t
       WHERE t.id = ${teamId}
      UNION ALL
      SELECT c.id, dt.path || c.id, dt.depth + 1
        FROM team c
        JOIN descendant_team dt ON c.parent_team_id = dt.id
       WHERE NOT c.id = ANY(dt.path)
         AND dt.depth < ${MAX_DEPTH}
    )
    SELECT 1 FROM descendant_team WHERE id = ${parentId} LIMIT 1
  `);
  return result.rows.length > 0;
}
