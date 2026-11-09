import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { botSchema, taskSchema, type Transfer } from "../src/schema.ts";
import { prepareImport } from "../src/transfer.ts";
const bot = botSchema.parse({
  id: randomUUID(),
  name: "Research",
  createdAt: 1,
  description: "Test",
  persona: "Test role",
  defaultCwd: "/fixture",
  paused: false,
  mainSessionId: "old-session",
});
const task = taskSchema.parse({
  id: randomUUID(),
  revision: 2,
  createdAt: 1,
  updatedAt: 2,
  title: "Task",
  objective: "Read fixture",
  botId: bot.id,
  botCreatedAt: 1,
  paused: false,
  archived: false,
  criteria: [{ id: randomUUID(), text: "Check" }],
  runs: [],
  handoffs: [],
  schedule: {
    id: "old-schedule",
    sessionId: "old-scheduled-session",
    description: "Daily",
    botId: bot.id,
    botCreatedAt: 1,
  },
});
const data: Transfer = {
  format: "bot-workbench-export",
  version: 1,
  exportedAt: "fixture",
  bots: [bot],
  memories: [
    {
      id: randomUUID(),
      botId: bot.id,
      content: "Private preference",
      state: "confirmed",
      source: "fixture",
      createdAt: 1,
    },
  ],
  tasks: [task],
};
test("import never carries authority from session, schedule, acceptance or confirmed memory", () => {
  const result = prepareImport(randomUUID(), data);
  assert.notEqual(result.bots[0]!.id, bot.id);
  assert.equal(result.bots[0]!.paused, true);
  assert.equal(result.bots[0]!.mainSessionId, undefined);
  assert.equal(result.memories[0]!.state, "candidate");
  assert.deepEqual(
    Object.keys(result.tasks[0]!).sort(),
    ["id", "botId", "title", "objective", "criteria"].sort(),
  );
  assert.equal(result.memories[0]!.botId, result.bots[0]!.id);
  assert.equal(result.tasks[0]!.botId, result.bots[0]!.id);
});
test("retry identities remain stable after a partial import", () => {
  const operation = randomUUID();
  const a = prepareImport(operation, data),
    b = prepareImport(operation, data);
  assert.equal(a.bots[0]!.id, b.bots[0]!.id);
  assert.equal(a.tasks[0]!.id, b.tasks[0]!.id);
  assert.equal(a.memories[0]!.id, b.memories[0]!.id);
});
test("import refuses ambiguous owners and unknown execution instructions", () => {
  assert.throws(() =>
    prepareImport(randomUUID(), { ...data, bots: [bot, bot] }),
  );
  assert.throws(() => prepareImport(randomUUID(), { ...data, bots: [] }));
  assert.throws(() =>
    prepareImport(randomUUID(), { ...data, command: "execute" } as Transfer),
  );
});
