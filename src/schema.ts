import { z } from 'zod';

export const id = z.string().uuid();
export const nonempty = z.string().trim().min(1);
export const botSchema = z.object({ id: nonempty, name: nonempty.max(64), createdAt: z.number(), description: z.string(), persona: z.string().max(8000), defaultCwd: nonempty, paused: z.boolean(), mainSessionId: nonempty.optional() }).strict();
export const memorySchema = z.object({ id, botId: nonempty, content: nonempty.max(4000), state: z.enum(['candidate','confirmed']), source: z.string(), createdAt: z.number() }).strict();
export type Bot = z.infer<typeof botSchema>;
export type Memory = z.infer<typeof memorySchema>;
export const criterionSchema = z.object({ id, text: nonempty.max(1000) }).strict();
export const evidenceSchema = z.object({ criterionId: id, note: nonempty.max(4000), reference: nonempty.max(2000) }).strict();
export const runSchema = z.object({
  id, requestId: id, sessionId: z.string().optional(), botId: nonempty, botCreatedAt: z.number(),
  state: z.enum(['preparing', 'running', 'waiting_approval', 'stopping', 'submitted', 'failed', 'cancelled', 'uncertain']),
  review: z.enum(['none', 'pending', 'accepted', 'changes_requested']),
  startedAt: z.number(), endedAt: z.number().optional(), steps: z.number().int().nonnegative(),
  summary: z.string().max(32000), evidence: z.array(evidenceSchema).max(50),
  note: z.string().max(8000), tokens: z.number().nonnegative().optional(),
  submissionKey: z.string().optional(),
}).strict();
export const handoffSchema = z.object({
  id, fromBotId: nonempty, toBotId: nonempty, context: nonempty.max(16000), at: z.number(),
}).strict();
export const taskSchema = z.object({
  id, revision: z.number().int().nonnegative(), createdAt: z.number(), updatedAt: z.number(),
  title: nonempty.max(120), objective: nonempty.max(16000), botId: nonempty,
  botCreatedAt: z.number(), paused: z.boolean(), archived: z.boolean(),
  criteria: z.array(criterionSchema).min(1).max(20), runs: z.array(runSchema),
  handoffs: z.array(handoffSchema),
  schedule: z.object({ id: nonempty, sessionId: nonempty, description: nonempty, botId: nonempty, botCreatedAt: z.number(), suspendedByPlugin: z.boolean().optional() }).strict().optional(),
}).strict();
export type Task = z.infer<typeof taskSchema>;
export type Run = z.infer<typeof runSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type BotView = { id: string; name: string; createdAt: number; description: string };
export const activeStates = new Set<Run['state']>(['preparing', 'running', 'waiting_approval', 'stopping']);
export const resultInput = z.object({ summary: nonempty.max(32000), evidence: z.array(evidenceSchema).max(50) }).strict();
const mutation = z.object({ taskId: id, revision: z.number().int().nonnegative() });
export const commandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), operationId: id, botId: nonempty, title: nonempty.max(120), objective: nonempty.max(16000), criteria: z.array(nonempty.max(1000)).min(1).max(20) }).strict(),
  mutation.extend({ action: z.literal('start'), operationId: id }).strict(),
  mutation.extend({ action: z.literal('stop') }).strict(),
  mutation.extend({ action: z.literal('review'), runId: id, decision: z.enum(['accepted', 'changes_requested']), note: z.string().max(8000), checkedCriteria: z.array(id) }).strict(),
  mutation.extend({ action: z.literal('reconcile'), runId: id, decision: z.enum(['record_result', 'close_without_result']), summary: z.string().max(32000), note: nonempty.max(8000) }).strict(),
  mutation.extend({ action: z.literal('handoff'), operationId: id, botId: nonempty, context: nonempty.max(16000) }).strict(),
  mutation.extend({ action: z.literal('pause'), paused: z.boolean() }).strict(),
  mutation.extend({ action: z.literal('archive') }).strict(),
  mutation.extend({ action: z.literal('schedule'), kind: z.enum(['daily', 'every']), time: z.string().optional(), timeZone: z.string().optional(), everySeconds: z.number().int().min(60).optional() }).strict(),
  mutation.extend({ action: z.literal('unschedule') }).strict(),
  z.object({ action: z.literal('createBot'), name: nonempty.max(64), persona: z.string().max(8000), cwd: nonempty }).strict(),
  z.object({ action: z.literal('memoryAdd'), botId: nonempty, content: nonempty.max(4000) }).strict(),
  z.object({ action: z.literal('memoryConfirm'), memoryId: id }).strict(),
  z.object({ action: z.literal('memoryForget'), memoryId: id }).strict(),
  z.object({ action: z.literal('chatBot'), botId: nonempty }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const snapshotSchema = z.object({
  tasks: z.array(taskSchema), bots: z.array(botSchema),
  memories: z.array(memorySchema), version: z.string(), hostVersion: z.string(), active: z.number(), warnings: z.array(z.string()),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
