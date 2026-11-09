import { z } from "zod";
import {
  defineDomain,
  domainTable,
  type Domain,
} from "@deepseek-ai/dsh-storage-domain";
import { taskSchema, botSchema, memorySchema } from "./schema.ts";
import type { TaskStore } from "./core.ts";

export const domainSpec = defineDomain({
  name: "bot_workbench",
  version: 1,
  layout: "per-record",
  tables: {
    tasks: domainTable(taskSchema),
    bots: domainTable(botSchema),
    memories: domainTable(memorySchema),
    settings: domainTable(
      z.object({ primaryBotId: z.string().optional() }).strict(),
    ),
  },
});
export function taskStore(domain: Domain<typeof domainSpec>): TaskStore {
  const table = domain.table("tasks");
  return {
    list: () => [...table.entries()].map(([, task]) => task),
    get: (id) => table.get(id),
    put: (task) => table.put(task.id, task),
  };
}
