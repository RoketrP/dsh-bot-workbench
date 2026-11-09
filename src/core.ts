import { randomUUID } from 'node:crypto';
import { activeStates, taskSchema, type Task, type Run, type Evidence } from './schema.ts';

export interface TaskStore { list(): Task[]; get(id: string): Task | undefined; put(task: Task): Promise<void> }
export class Conflict extends Error { constructor(message = '内容已经变化，请刷新后重试。 / Changed; refresh before retrying.') { super(message); } }
export function currentRun(task: Task): Run | undefined { return task.runs.at(-1); }
export function isActive(task: Task): boolean { return task.runs.some(r => activeStates.has(r.state)); }

/** One atomic task record owns its runs and handoffs. A failed write never publishes its draft. */
export class Ledger {
  private tail: Promise<unknown> = Promise.resolve();
  private closed = false;
  constructor(readonly store: TaskStore, readonly limits: { maxTasks: number; maxRunsPerTask: number }) {}
  private serial<T>(work: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Workbench is closing'));
    const result = this.tail.then(work); this.tail = result.catch(() => {}); return result;
  }
  async close() { this.closed = true; await this.tail; }
  async idle() { await this.tail; }
  list() { return this.store.list().map(t => structuredClone(t)); }
  get(id: string) { const value = this.store.get(id); if (!value) throw new Error('Task not found'); return structuredClone(value); }
  create(input: { id: string; botId: string; botCreatedAt: number; title: string; objective: string; criteria: string[] }): Promise<Task> {
    return this.serial(async () => {
      const previous = this.store.get(input.id);
      if (previous) {
        if (previous.botId !== input.botId || previous.title !== input.title || previous.objective !== input.objective || JSON.stringify(previous.criteria.map(c => c.text)) !== JSON.stringify(input.criteria)) throw new Conflict('Operation identity reused with different content');
        return structuredClone(previous);
      }
      if (this.store.list().length >= this.limits.maxTasks) throw new Error('Task limit reached; export and archive old work');
      const now = Date.now();
      const task = taskSchema.parse({ id: input.id, botId: input.botId, botCreatedAt: input.botCreatedAt, title: input.title, objective: input.objective, revision: 0, createdAt: now, updatedAt: now, paused: false, archived: false,
        criteria: input.criteria.map(text => ({ id: randomUUID(), text })), runs: [], handoffs: [] });
      await this.store.put(task); return structuredClone(task);
    });
  }
  update(id: string, expected: number | undefined, edit: (draft: Task) => void): Promise<Task> {
    return this.serial(async () => {
      const draft = this.get(id);
      if (expected !== undefined && expected !== draft.revision) throw new Conflict();
      edit(draft); draft.revision++; draft.updatedAt = Date.now();
      const next = taskSchema.parse(draft); await this.store.put(next); return structuredClone(next);
    });
  }
  reserve(id: string, expected: number, operationId: string, globalLimit: number): Promise<Task> {
    return this.serial(async () => {
      const draft = this.get(id), previous = draft.runs.find(r => r.id === operationId);
      if (previous) return draft;
      if (draft.revision !== expected) throw new Conflict();
      if (draft.paused || draft.archived || isActive(draft)) throw new Error('Task is paused, archived, or already active');
      if (currentRun(draft)?.review === 'pending') throw new Error('Review the previous result before starting another run');
      if (draft.runs.some(r => r.state === 'uncertain')) throw new Error('Reconcile the uncertain run before executing again');
      if (this.list().filter(isActive).length >= globalLimit) throw new Error('Global concurrency limit reached');
      if (this.list().some(t => t.botId === draft.botId && isActive(t))) throw new Error('This Bot is already working');
      if (draft.runs.length >= this.limits.maxRunsPerTask) throw new Error('Run history limit reached; export this task and create another');
      draft.runs.push({ id: operationId, requestId: operationId, botId: draft.botId, botCreatedAt: draft.botCreatedAt,
        state: 'preparing', review: 'none', startedAt: Date.now(), steps: 0, summary: '', evidence: [], note: '' });
      draft.revision++; draft.updatedAt = Date.now(); await this.store.put(taskSchema.parse(draft)); return structuredClone(draft);
    });
  }
  submit(taskId: string, sessionId: string, key: string, summary: string, evidence: Evidence[]) {
    return this.update(taskId, undefined, task => {
      const run = currentRun(task);
      if (!run || run.sessionId !== sessionId || !['running', 'waiting_approval', 'submitted'].includes(run.state)) throw new Error('No submitting run belongs to this session');
      if (run.submissionKey) {
        if (run.submissionKey !== key || run.summary !== summary || JSON.stringify(run.evidence) !== JSON.stringify(evidence)) throw new Conflict('Result already submitted; use the existing result');
        return;
      }
      const allowed = new Set(task.criteria.map(c => c.id));
      if (evidence.some(e => !allowed.has(e.criterionId))) throw new Error('Evidence names an unknown acceptance criterion');
      run.summary = summary; run.evidence = evidence; run.submissionKey = key; run.review = 'pending';
      // Submission is a proposal; turn-end, not a tool response, ends execution.
    });
  }
  review(id: string, expected: number, runId: string, decision: 'accepted' | 'changes_requested', note: string, checked: string[]) {
    return this.update(id, expected, task => {
      const run = currentRun(task);
      if (!run || run.id !== runId || run.state !== 'submitted' || run.review !== 'pending') throw new Error('Only a stopped, pending result can be reviewed');
      if (decision === 'accepted') {
        if (task.criteria.some(c => !checked.includes(c.id) || !run.evidence.some(e => e.criterionId === c.id))) throw new Error('Every criterion needs evidence and an explicit check');
      } else if (!note.trim()) throw new Error('Explain the requested changes');
      run.review = decision; run.note = note;
    });
  }
  async recover() {
    for (const task of this.list().filter(isActive)) await this.update(task.id, undefined, draft => {
      for (const run of draft.runs.filter(r => activeStates.has(r.state))) {
        run.state = 'uncertain'; run.endedAt = Date.now();
        run.note = '服务中断；请核对原会话及外部结果。未自动重放。 / Interrupted; verify session and external effects. Not replayed.';
      }
    });
  }
}
