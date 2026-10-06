import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import {
  boardTable,
  labelTable,
  organizationMemberTable,
  organizationTable,
  taskTable,
  userTable,
} from "../database/schema";
import createLabel from "../label/controllers/create-label";
import createTask from "../task/controllers/create-task";
import updateTaskAssignee from "../task/controllers/update-task-assignee";
import { organizationAccess } from "../utils/organization-access-middleware";
import { hasOrganizationPermission } from "../utils/require-organization-permission";
import { decryptAiSecret, encryptAiSecret } from "./secrets";

const commandSchema = v.object({
  message: v.string(),
  actions: v.optional(
    v.array(
      v.variant("type", [
        v.object({
          type: v.literal("assign_task"),
          taskId: v.string(),
          assigneeId: v.nullable(v.string()),
        }),
        v.object({
          type: v.literal("add_label"),
          taskId: v.string(),
          labelName: v.string(),
          color: v.optional(v.string()),
        }),
        v.object({
          type: v.literal("create_task"),
          boardId: v.string(),
          title: v.string(),
          description: v.optional(v.string(), ""),
          status: v.optional(v.string(), "to-do"),
          priority: v.optional(v.string(), "no-priority"),
          assigneeId: v.optional(v.nullable(v.string())),
        }),
      ]),
    ),
    [],
  ),
});

type Variables = {
  userId: string;
  organizationId: string;
  apiKey?: { id: string };
};

type ProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

/**
 * Organization configuration wins over the instance-wide env fallback so a
 * self-hosted deployment can keep working without per-org setup.
 */
async function resolveProviderConfig(
  organizationId: string,
): Promise<ProviderConfig | null> {
  const [row] = await db
    .select({
      baseUrl: organizationTable.aiProviderBaseUrl,
      model: organizationTable.aiProviderModel,
      apiKey: organizationTable.aiProviderApiKey,
    })
    .from(organizationTable)
    .where(eq(organizationTable.id, organizationId))
    .limit(1);

  const apiKey =
    (row?.apiKey ? decryptAiSecret(row.apiKey) : null) ||
    process.env.AI_API_KEY ||
    process.env.AIPROXY_API_KEY;
  if (!apiKey) return null;

  return {
    apiKey,
    baseUrl: (
      row?.baseUrl ||
      process.env.AI_API_URL ||
      "https://aiproxy.entelechia.cloud/v1"
    ).replace(/\/$/, ""),
    model: row?.model || process.env.AI_MODEL || "gpt-4o-mini",
  };
}

async function settings(organizationId: string, userId: string) {
  const [row] = await db
    .select({
      enabled: organizationTable.aiEnabled,
      defaultTokenLimit: organizationTable.aiDefaultTokenLimit,
      defaultCharacterLimit: organizationTable.aiDefaultCharacterLimit,
      providerBaseUrl: organizationTable.aiProviderBaseUrl,
      providerModel: organizationTable.aiProviderModel,
      providerApiKey: organizationTable.aiProviderApiKey,
      memberTokenLimit: organizationMemberTable.aiTokenLimit,
      memberCharacterLimit: organizationMemberTable.aiCharacterLimit,
    })
    .from(organizationTable)
    .innerJoin(
      organizationMemberTable,
      and(
        eq(organizationMemberTable.organizationId, organizationTable.id),
        eq(organizationMemberTable.userId, userId),
      ),
    )
    .where(eq(organizationTable.id, organizationId))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Organization not found" });
  const { providerApiKey, ...rest } = row;
  return {
    ...rest,
    effectiveTokenLimit: row.memberTokenLimit ?? row.defaultTokenLimit,
    effectiveCharacterLimit:
      row.memberCharacterLimit ?? row.defaultCharacterLimit,
    // Never expose the stored key; only whether one is usable.
    providerApiKeySet: Boolean(providerApiKey),
    configured: Boolean(
      providerApiKey || process.env.AI_API_KEY || process.env.AIPROXY_API_KEY,
    ),
  };
}

async function buildContext(organizationId: string, taskId?: string) {
  const boards = await db
    .select({ id: boardTable.id, name: boardTable.name })
    .from(boardTable)
    .where(eq(boardTable.organizationId, organizationId));
  const members = await db
    .select({ id: userTable.id, name: userTable.name })
    .from(organizationMemberTable)
    .innerJoin(userTable, eq(organizationMemberTable.userId, userTable.id))
    .where(eq(organizationMemberTable.organizationId, organizationId));
  const labels = await db
    .select({ name: labelTable.name, color: labelTable.color })
    .from(labelTable)
    .where(
      and(
        eq(labelTable.organizationId, organizationId),
        isNull(labelTable.taskId),
      ),
    );
  const tasks = await db
    .select({
      id: taskTable.id,
      number: taskTable.number,
      title: taskTable.title,
      status: taskTable.status,
      assigneeId: taskTable.userId,
      boardId: taskTable.boardId,
    })
    .from(taskTable)
    .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
    .where(
      taskId
        ? and(
            eq(boardTable.organizationId, organizationId),
            eq(taskTable.id, taskId),
          )
        : eq(boardTable.organizationId, organizationId),
    )
    .limit(taskId ? 1 : 100);
  return { boards, members, labels, tasks };
}

async function callProvider(
  message: string,
  context: unknown,
  tokenLimit: number,
  provider: ProviderConfig,
) {
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0,
      max_tokens: tokenLimit,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are Kaneo's organization assistant. Return JSON only: {message:string,actions:array}. Allowed actions: assign_task(taskId,assigneeId|null), add_label(taskId,labelName,color), create_task(boardId,title,description,status,priority,assigneeId|null). Use only IDs/names in CONTEXT. Never invent IDs. Only propose actions explicitly requested by the user.",
        },
        { role: "system", content: `CONTEXT=${JSON.stringify(context)}` },
        { role: "user", content: message },
      ],
    }),
  });
  if (!response.ok) {
    throw new HTTPException(502, { message: "AI provider request failed" });
  }
  const responseText = await response.text();
  let payload: { choices?: Array<{ message?: { content?: string } }> };
  try {
    payload = JSON.parse(responseText);
  } catch {
    // Some compatible proxies append a second JSON diagnostics object. Parse
    // the first complete object rather than failing an otherwise valid reply.
    let depth = 0;
    let end = -1;
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < responseText.length; index += 1) {
      const char = responseText[index];
      if (escaped) escaped = false;
      else if (char === "\\" && quoted) escaped = true;
      else if (char === '"') quoted = !quoted;
      else if (!quoted && char === "{") depth += 1;
      else if (!quoted && char === "}" && --depth === 0) {
        end = index + 1;
        break;
      }
    }
    if (end < 0)
      throw new HTTPException(502, {
        message: "AI provider returned invalid JSON",
      });
    payload = JSON.parse(responseText.slice(0, end));
  }
  const raw = payload.choices?.[0]?.message?.content;
  if (!raw)
    throw new HTTPException(502, { message: "AI returned no response" });
  try {
    return v.parse(commandSchema, JSON.parse(raw));
  } catch {
    throw new HTTPException(502, { message: "AI returned invalid commands" });
  }
}

const ai = new Hono<{ Variables: Variables }>()
  .get(
    "/organization/:organizationId/settings",
    validator("param", v.object({ organizationId: v.string() })),
    organizationAccess.fromParam("organizationId"),
    async (c) =>
      c.json(
        await settings(c.req.valid("param").organizationId, c.get("userId")),
      ),
  )
  .patch(
    "/organization/:organizationId/settings",
    validator("param", v.object({ organizationId: v.string() })),
    validator(
      "json",
      v.object({
        enabled: v.optional(v.boolean()),
        defaultTokenLimit: v.optional(
          v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(32768)),
        ),
        defaultCharacterLimit: v.optional(
          v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100000)),
        ),
        providerBaseUrl: v.optional(v.nullable(v.string())),
        providerModel: v.optional(v.nullable(v.string())),
        // null clears the stored key and falls back to instance env config.
        providerApiKey: v.optional(v.nullable(v.string())),
      }),
    ),
    organizationAccess.fromParam("organizationId"),
    async (c) => {
      if (
        !(await hasOrganizationPermission(c, {
          organization: ["manage_settings"],
        }))
      )
        throw new HTTPException(403, { message: "Forbidden" });
      const input = c.req.valid("json");
      const trimmedKey = input.providerApiKey?.trim();
      await db
        .update(organizationTable)
        .set({
          aiEnabled: input.enabled,
          aiDefaultTokenLimit: input.defaultTokenLimit,
          aiDefaultCharacterLimit: input.defaultCharacterLimit,
          ...(input.providerBaseUrl !== undefined && {
            aiProviderBaseUrl: input.providerBaseUrl?.trim() || null,
          }),
          ...(input.providerModel !== undefined && {
            aiProviderModel: input.providerModel?.trim() || null,
          }),
          ...(input.providerApiKey !== undefined && {
            aiProviderApiKey: trimmedKey ? encryptAiSecret(trimmedKey) : null,
          }),
        })
        .where(eq(organizationTable.id, c.req.valid("param").organizationId));
      // Re-read through settings() so the response never carries the secret.
      return c.json(
        await settings(c.req.valid("param").organizationId, c.get("userId")),
      );
    },
  )
  .patch(
    "/organization/:organizationId/members/:memberId/limits",
    validator(
      "param",
      v.object({ organizationId: v.string(), memberId: v.string() }),
    ),
    validator(
      "json",
      v.object({
        tokenLimit: v.nullable(
          v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(32768)),
        ),
        characterLimit: v.nullable(
          v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100000)),
        ),
      }),
    ),
    organizationAccess.fromParam("organizationId"),
    async (c) => {
      if (
        !(await hasOrganizationPermission(c, {
          organization: ["manage_members"],
        }))
      )
        throw new HTTPException(403, { message: "Forbidden" });
      const { organizationId, memberId } = c.req.valid("param");
      const input = c.req.valid("json");
      const [updated] = await db
        .update(organizationMemberTable)
        .set({
          aiTokenLimit: input.tokenLimit,
          aiCharacterLimit: input.characterLimit,
        })
        .where(
          and(
            eq(organizationMemberTable.organizationId, organizationId),
            eq(organizationMemberTable.id, memberId),
          ),
        )
        .returning();
      if (!updated)
        throw new HTTPException(404, { message: "Member not found" });
      return c.json(updated);
    },
  )
  .post(
    "/organization/:organizationId/chat",
    validator("param", v.object({ organizationId: v.string() })),
    validator(
      "json",
      v.object({
        message: v.pipe(v.string(), v.trim(), v.minLength(1)),
        taskId: v.optional(v.string()),
      }),
    ),
    organizationAccess.fromParam("organizationId"),
    async (c) => {
      const organizationId = c.req.valid("param").organizationId;
      const userId = c.get("userId");
      const input = c.req.valid("json");
      const limits = await settings(organizationId, userId);
      if (!limits.enabled)
        throw new HTTPException(503, { message: "AI is disabled" });
      if (input.message.length > limits.effectiveCharacterLimit)
        throw new HTTPException(400, {
          message: "Message exceeds your character limit",
        });
      let result: v.InferOutput<typeof commandSchema>;
      try {
        const provider = await resolveProviderConfig(organizationId);
        if (!provider)
          throw new HTTPException(503, { message: "AI is not configured" });
        const context = await buildContext(organizationId, input.taskId);
        result = await callProvider(
          input.message,
          context,
          limits.effectiveTokenLimit,
          provider,
        );
      } catch (error) {
        console.error("[ai-chat] failed", error);
        throw error;
      }
      const executed: Array<Record<string, unknown>> = [];
      for (const action of result.actions) {
        if (action.type === "create_task") {
          if (!(await hasOrganizationPermission(c, { task: ["create"] })))
            throw new HTTPException(403, { message: "Forbidden" });
          const board = await db.query.boardTable.findFirst({
            where: and(
              eq(boardTable.id, action.boardId),
              eq(boardTable.organizationId, organizationId),
            ),
          });
          if (!board)
            throw new HTTPException(404, { message: "Board not found" });
          if (action.assigneeId) {
            if (!(await hasOrganizationPermission(c, { task: ["assign"] })))
              throw new HTTPException(403, { message: "Forbidden" });
            const member = await db.query.organizationMemberTable.findFirst({
              where: and(
                eq(organizationMemberTable.organizationId, organizationId),
                eq(organizationMemberTable.userId, action.assigneeId),
              ),
            });
            if (!member)
              throw new HTTPException(404, { message: "Assignee not found" });
          }
          const created = await createTask({
            boardId: action.boardId,
            currentUserId: userId,
            userId: action.assigneeId ?? undefined,
            title: action.title,
            description: action.description,
            status: action.status,
            priority: action.priority,
          });
          executed.push({
            ...action,
            taskId: created.id,
            number: created.number,
          });
          continue;
        }
        const [task] = await db
          .select({ organizationId: boardTable.organizationId })
          .from(taskTable)
          .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
          .where(eq(taskTable.id, action.taskId))
          .limit(1);
        if (!task || task.organizationId !== organizationId)
          throw new HTTPException(404, { message: "Task not found" });
        if (action.type === "assign_task") {
          if (!(await hasOrganizationPermission(c, { task: ["assign"] })))
            throw new HTTPException(403, { message: "Forbidden" });
          if (action.assigneeId) {
            const member = await db.query.organizationMemberTable.findFirst({
              where: and(
                eq(organizationMemberTable.organizationId, organizationId),
                eq(organizationMemberTable.userId, action.assigneeId),
              ),
            });
            if (!member)
              throw new HTTPException(404, { message: "Assignee not found" });
          }
          await updateTaskAssignee({
            id: action.taskId,
            userId: action.assigneeId ?? null,
            teamId: null,
            currentUserId: userId,
            organizationId,
          });
          executed.push(action);
        } else {
          if (!(await hasOrganizationPermission(c, { task: ["update"] })))
            throw new HTTPException(403, { message: "Forbidden" });
          const template = await db.query.labelTable.findFirst({
            where: and(
              eq(labelTable.organizationId, organizationId),
              eq(labelTable.name, action.labelName),
              isNull(labelTable.taskId),
            ),
          });
          const color = template?.color ?? action.color ?? "#6b7280";
          if (
            !template &&
            !(await hasOrganizationPermission(c, { label: ["create"] }))
          )
            throw new HTTPException(403, { message: "Cannot create labels" });
          if (!template)
            await createLabel(
              action.labelName,
              color,
              undefined,
              organizationId,
              userId,
            );
          await createLabel(
            action.labelName,
            color,
            action.taskId,
            organizationId,
            userId,
          );
          executed.push({ ...action, color });
        }
      }
      return c.json({
        message: result.message,
        actions: executed,
        limits: {
          tokenLimit: limits.effectiveTokenLimit,
          characterLimit: limits.effectiveCharacterLimit,
        },
      });
    },
  );

export default ai;
