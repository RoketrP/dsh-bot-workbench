import { createHash } from "node:crypto";
import {
  transferSchema,
  type Transfer,
  type Bot,
  type Memory,
} from "./schema.ts";

/** A transfer creates inert copies. Imported results, session IDs and schedules confer no authority. */
export function prepareImport(operationId: string, raw: Transfer) {
  const data = transferSchema.parse(raw);
  const ids = new Set(data.bots.map((b) => b.id));
  if (ids.size !== data.bots.length)
    throw new Error("Duplicate Bot identities in import");
  if (
    data.memories.some((m) => !ids.has(m.botId)) ||
    data.tasks.some((t) => !ids.has(t.botId))
  )
    throw new Error("Import references an absent Bot");
  const copyId = (kind: string, id: string) => {
    const hex = createHash("sha256")
      .update(`${operationId}:${kind}:${id}`)
      .digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  };
  const now = Date.now();
  const bots: Bot[] = data.bots.map((b) => ({
    id: copyId("bot", b.id),
    name: b.name,
    description: b.description,
    persona: b.persona,
    defaultCwd: b.defaultCwd,
    preset: b.preset,
    ...(b.model ? { model: b.model } : {}),
    createdAt: now,
    paused: true,
    archived: false,
    revision: 0,
  }));
  const memories: Memory[] = data.memories.map((m) => ({
    id: copyId("memory", m.id),
    botId: copyId("bot", m.botId),
    content: m.content,
    state: "candidate",
    source: `Imported copy of ${m.id}`,
    createdAt: now,
  }));
  const tasks = data.tasks.map((t) => ({
    id: copyId("task", t.id),
    botId: copyId("bot", t.botId),
    title: t.title,
    objective: t.objective,
    criteria: t.criteria.map((c) => c.text),
  }));
  return { bots, memories, tasks };
}
