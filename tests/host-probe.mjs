import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { LlmAdapter, ToolCallId } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";

export const name = "workbench-host-probe";
export const inject = [
  "llm",
  "loader",
  "botWorkbench",
  "sessionController",
  "agents",
  "sessions",
  "webServer",
  "schedule",
];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
export function apply(ctx, config) {
  let calls = 0,
    approvalCount = 0,
    finished = false;
  class Adapter extends LlmAdapter {
    async listModels(provider) {
      return [
        { provider, id: "fixture", name: "Scripted test model (not DeepSeek)" },
      ];
    }
    async *stream(options) {
      calls++;
      const text = JSON.stringify(options.messages),
        snap = await ctx.botWorkbench.snapshot();
      const task = snap.tasks.find((t) => text.includes(t.id));
      const run = task?.runs.at(-1);
      if (task?.objective === "CRASH_PROBE") {
        yield { type: "block-start", index: 0, blockType: "text" };
        yield {
          type: "text-delta",
          index: 0,
          text: "Partial scripted output before forced process loss.",
        };
        await new Promise((_resolve, reject) => {
          const abort = () =>
            reject(options.signal.reason ?? new Error("aborted"));
          if (options.signal.aborted) abort();
          else options.signal.addEventListener("abort", abort, { once: true });
        });
        return;
      }
      if (task?.schedule && text.includes("workbench_schedule_receive")) {
        const scheduled = ctx.agents.get(SessionId(task.schedule.sessionId));
        const source = scheduled?.session
          .snapshotEvents()
          .findLast(
            (e) =>
              e.type === "user/message" && e.data.source.kind === "schedule",
          );
        if (source && run?.requestId !== source.data.id) {
          const id = ToolCallId(`receive-${source.data.id}`),
            args = JSON.stringify({ taskId: task.id });
          yield { type: "block-start", index: 0, blockType: "tool-call" };
          yield {
            type: "tool-call-delta",
            index: 0,
            id,
            name: "workbench_schedule_receive",
            argumentsDelta: args,
          };
          yield {
            type: "block-end",
            index: 0,
            block: {
              type: "tool-call",
              id,
              name: "workbench_schedule_receive",
              arguments: args,
            },
          };
          yield { type: "finish", reason: { kind: "tool-calls" } };
          return;
        }
      }
      if (task && run && !run.submissionKey) {
        const id = ToolCallId(`result-${run.id}`),
          args = JSON.stringify({
            summary: config.preview
              ? "已整理这份界面样例的交付摘要。此处使用脚本化模型验证提交与验收流程，没有调用真实 DeepSeek，也没有执行真实资料研究。"
              : "SCRIPTED_RESULT: source comparison complete.",
            evidence: task.criteria.map((c) => ({
              criterionId: c.id,
              note: config.preview
                ? "这是一条用于界面验证的样例依据，需要人工核对。"
                : "Scripted fixture evidence; not a real source check.",
              reference: "fixture://source-check",
            })),
          });
        yield { type: "block-start", index: 0, blockType: "tool-call" };
        yield {
          type: "tool-call-delta",
          index: 0,
          id,
          name: "workbench_submit",
          argumentsDelta: args,
        };
        yield {
          type: "block-end",
          index: 0,
          block: {
            type: "tool-call",
            id,
            name: "workbench_submit",
            arguments: args,
          },
        };
        yield { type: "finish", reason: { kind: "tool-calls" } };
        return;
      }
      const reply = config.preview
        ? "这是一条脚本化界面验证回复，消息已通过真实原生会话入口接收；没有调用真实模型。"
        : task
          ? "Submitted for user review."
          : text.includes("WB_MEMORY_PROBE_SHORT")
            ? "MEMORY_VISIBLE"
            : "NO_MEMORY";
      yield { type: "block-start", index: 0, blockType: "text" };
      yield { type: "text-delta", index: 0, text: reply };
      yield {
        type: "block-end",
        index: 0,
        block: { type: "text", text: reply },
      };
      yield { type: "finish", reason: { kind: "stop" } };
    }
  }
  ctx.effect(
    () => ctx.llm.registerAdapter(["workbench-fixture"], new Adapter()),
    "fixture: scripted model",
  );
  ctx.effect(
    () =>
      ctx.on("agent/created", async ({ agent }) => {
        agent.ctx.effect(
          () =>
            agent.ctx.on(
              "tools/pre-execute",
              async (exec, next) => {
                const decision = await next();
                if (
                  exec.name !== "workbench_submit" ||
                  ["deny", "cancel"].includes(decision.kind)
                )
                  return decision;
                return {
                  kind: "ask",
                  reason: "Fixture: confirm result submission",
                };
              },
              { prepend: true },
            ),
          "fixture: require native approval",
        );
        agent.ctx.effect(
          () =>
            agent.ctx.on(
              "approval/request",
              async (req, next) => {
                if (req.toolName !== "workbench_submit") return next();
                approvalCount++;
                return "allowed-once";
              },
              { prepend: true },
            ),
          "fixture: answer only the synthetic result approval",
        );
      }),
    "fixture: approval probe",
  );
  const outcome = (async () => {
    await ctx.loader.await();
    let snapshot = await ctx.botWorkbench.snapshot();
    if (config.preview) {
      if (!snapshot.bots.length) {
        const roles = [
          ["研究助手", "查证资料、比较观点，把结论和出处整理清楚。"],
          ["写作搭档", "从一个想法到一份初稿，保持你的语气，让表达更准确。"],
          ["项目助理", "把目标拆成清晰的步骤，跟进进度，做好每一次交接。"],
        ];
        const ids = [];
        for (const [name, persona] of roles) {
          await ctx.botWorkbench.command({
            action: "createBot",
            name,
            persona,
            cwd: config.workspace,
          });
          ids.push((await ctx.botWorkbench.snapshot()).bots.at(-1).id);
        }
        await ctx.botWorkbench.command({ action: "setPrimary", botId: ids[0] });
        await ctx.botWorkbench.command({
          action: "memoryAdd",
          botId: ids[0],
          content: "整理资料时先给结论，再列出可以核对的来源。",
        });
        await ctx.botWorkbench.command({
          action: "memoryAdd",
          botId: ids[0],
          content: "对于尚不确定的信息，请单独标注，不要补齐没有依据的细节。",
        });
        await ctx.botWorkbench.command({
          action: "memoryAdd",
          botId: ids[1],
          content: "文字尽量简洁，保留自然的表达，不堆砌形容词。",
        });
        const examples = [
          {
            botId: ids[0],
            title: "比较两份资料的交付窗口",
            criteria: ["列出共同点和差异", "标注依据与不确定之处"],
            review: false,
          },
          {
            botId: ids[1],
            title: "梳理产品介绍的表达结构",
            criteria: ["结构清楚", "语气自然"],
            review: true,
          },
        ];
        for (const example of examples) {
          const id = randomUUID();
          await ctx.botWorkbench.command({
            action: "create",
            operationId: id,
            botId: example.botId,
            title: example.title,
            criteria: example.criteria,
            objective:
              "只用脚本化模型验证界面中的成果与验收流程。此处为人为界面样例，不能当作真实资料研究。",
          });
          let task = (await ctx.botWorkbench.snapshot()).tasks.find(
            (t) => t.id === id,
          );
          await ctx.botWorkbench.command({
            action: "start",
            taskId: id,
            revision: task.revision,
            operationId: randomUUID(),
          });
          for (let i = 0; i < 400; i++) {
            task = (await ctx.botWorkbench.snapshot()).tasks.find(
              (t) => t.id === id,
            );
            if (task.runs.at(-1).state === "submitted") break;
            await pause(25);
          }
          assert.equal(task.runs.at(-1).state, "submitted");
          if (example.review)
            await ctx.botWorkbench.command({
              action: "review",
              taskId: id,
              revision: task.revision,
              runId: task.runs.at(-1).id,
              decision: "accepted",
              note: "仅验收脚本化界面样例。",
              checkedCriteria: task.criteria.map((c) => c.id),
            });
        }
        await ctx.botWorkbench.command({
          action: "create",
          operationId: randomUUID(),
          botId: ids[2],
          title: "准备周五的项目进展更新",
          objective: "界面样例：整理本周进展、需要支持的事项和下周安排。",
          criteria: ["区分已完成与待推进", "明确下一步安排"],
        });
      }
      await writeFile(
        config.output,
        JSON.stringify(
          { status: "PREVIEW_READY", realModelRequests: 0 },
          null,
          2,
        ),
      );
      console.log("WORKBENCH_PREVIEW_READY");
      return;
    }
    if (config.timer) {
      let task = snapshot.tasks.find(
        (t) =>
          !t.paused &&
          !t.archived &&
          !t.schedule &&
          t.runs.at(-1)?.review === "accepted" &&
          !snapshot.bots.find((b) => b.id === t.botId)?.paused,
      );
      assert.ok(task);
      const taskId = task.id,
        oldRuns = task.runs.length;
      await ctx.botWorkbench.command({
        action: "schedule",
        taskId,
        revision: task.revision,
        kind: "every",
        everySeconds: 60,
      });
      const scheduleId = (await ctx.botWorkbench.snapshot()).tasks.find(
        (t) => t.id === taskId,
      ).schedule.id;
      for (let i = 0; i < 1900; i++) {
        task = (await ctx.botWorkbench.snapshot()).tasks.find(
          (t) => t.id === taskId,
        );
        if (
          task.runs.length > oldRuns &&
          task.runs.at(-1).state === "submitted"
        )
          break;
        await pause(50);
      }
      assert.equal(task.runs.length, oldRuns + 1);
      assert.equal(task.runs.at(-1).state, "submitted");
      const native = await ctx.schedule.view({ id: scheduleId });
      assert.ok(native.lastDelivery);
      assert.equal(
        task.runs.at(-1).requestId,
        String(native.lastDelivery.messageId),
      );
      await ctx.botWorkbench.command({
        action: "review",
        taskId,
        revision: task.revision,
        runId: task.runs.at(-1).id,
        decision: "accepted",
        note: "Headless native timer received and executed once.",
        checkedCriteria: task.criteria.map((c) => c.id),
      });
      task = (await ctx.botWorkbench.snapshot()).tasks.find(
        (t) => t.id === taskId,
      );
      await ctx.botWorkbench.command({
        action: "unschedule",
        taskId,
        revision: task.revision,
      });
      await writeFile(
        config.output,
        JSON.stringify(
          {
            status: "PASS",
            phase: "headless-timer",
            nativeReceiptMatched: true,
            calls,
            realModelRequests: 0,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (config.lifecycleBefore) {
      const task = snapshot.tasks.find(
        (t) =>
          !t.paused &&
          !t.archived &&
          !t.schedule &&
          t.runs.at(-1)?.review === "accepted" &&
          !snapshot.bots.find((b) => b.id === t.botId)?.paused,
      );
      assert.ok(task);
      await ctx.botWorkbench.command({
        action: "schedule",
        taskId: task.id,
        revision: task.revision,
        kind: "every",
        everySeconds: 3600,
      });
      const updated = (await ctx.botWorkbench.snapshot()).tasks.find(
        (t) => t.id === task.id,
      );
      assert.equal(
        (await ctx.schedule.view({ id: updated.schedule.id })).status,
        "active",
      );
      await writeFile(
        config.output,
        JSON.stringify(
          {
            status: "PASS",
            phase: "lifecycle-before",
            taskId: task.id,
            scheduleId: updated.schedule.id,
            realModelRequests: 0,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (config.lifecycleAfter) {
      const task = snapshot.tasks.find((t) => t.id === config.taskId);
      assert.ok(task.schedule);
      assert.equal(task.schedule.suspendedByPlugin, undefined);
      assert.equal(
        (await ctx.schedule.view({ id: task.schedule.id })).status,
        "active",
      );
      await ctx.botWorkbench.command({
        action: "unschedule",
        taskId: task.id,
        revision: task.revision,
      });
      await writeFile(
        config.output,
        JSON.stringify(
          {
            status: "PASS",
            phase: "lifecycle-after",
            resumed: true,
            realModelRequests: 0,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (config.crash) {
      const bot = snapshot.bots.find((b) => !b.paused && !b.archived),
        taskId = randomUUID();
      assert.ok(bot);
      await ctx.botWorkbench.command({
        action: "create",
        operationId: taskId,
        botId: bot.id,
        title: "强制中断恢复验证",
        objective: "CRASH_PROBE",
        criteria: ["不自动重放不确定操作"],
      });
      const t = (await ctx.botWorkbench.snapshot()).tasks.find(
        (t) => t.id === taskId,
      );
      await ctx.botWorkbench.command({
        action: "start",
        taskId,
        revision: t.revision,
        operationId: randomUUID(),
      });
      for (let i = 0; i < 400; i++) {
        snapshot = await ctx.botWorkbench.snapshot();
        const task = snapshot.tasks.find((t) => t.id === taskId),
          r = task.runs.at(-1);
        if (calls > 0 && r?.sessionId && r.steps > 0) {
          const agent = ctx.agents.get(SessionId(r.sessionId));
          assert.ok(await ctx.sessions.flush(agent.session));
          await writeFile(
            config.output,
            JSON.stringify(
              {
                status: "CRASH_READY",
                pid: process.pid,
                taskId,
                sessionId: r.sessionId,
                calls,
                realModelRequests: 0,
              },
              null,
              2,
            ),
          );
          console.log("WORKBENCH_CRASH_READY");
          return;
        }
        await pause(25);
      }
      throw new Error("Crash probe did not reach a live model stream");
    }
    if (config.cold) {
      assert.ok(snapshot.tasks.length > 0);
      assert.ok(snapshot.bots.length > 0);
      assert.ok(
        snapshot.memories.some((m) => m.content === "WB_MEMORY_PROBE_SHORT"),
      );
      assert.equal(snapshot.active, 0);
      if (config.crashTaskId) {
        const t = snapshot.tasks.find((t) => t.id === config.crashTaskId);
        assert.equal(t.runs.at(-1).state, "uncertain");
        assert.equal(calls, 0);
      }
      await writeFile(
        config.output,
        JSON.stringify(
          {
            status: "PASS",
            phase: "cold",
            tasks: snapshot.tasks.length,
            bots: snapshot.bots.length,
            calls,
            realModelRequests: 0,
          },
          null,
          2,
        ),
      );
      console.log("WORKBENCH_PROBE_DONE");
      finished = true;
      return;
    }
    await ctx.botWorkbench.command({
      action: "createBot",
      name: "验证研究助手",
      persona: "Only process the test assignment.",
      cwd: config.workspace,
      model: { provider: "workbench-fixture", model: "fixture" },
    });
    snapshot = await ctx.botWorkbench.snapshot();
    const bot = snapshot.bots.at(-1);
    await ctx.botWorkbench.command({
      action: "memoryAdd",
      botId: bot.id,
      content: "WB_MEMORY_PROBE_SHORT",
    });
    await ctx.botWorkbench.command({ action: "chatBot", botId: bot.id });
    snapshot = await ctx.botWorkbench.snapshot();
    const main = snapshot.bots.find((b) => b.id === bot.id).mainSessionId;
    const chatOperation = randomUUID(),
      chatText = "Check your saved preference.";
    await ctx.botWorkbench.command({
      action: "chatBot",
      botId: bot.id,
      prompt: { operationId: chatOperation, text: chatText },
    });
    await ctx.agents.get(SessionId(main)).whenIdle();
    const callsAfterChat = calls;
    await ctx.botWorkbench.command({
      action: "chatBot",
      botId: bot.id,
      prompt: { operationId: chatOperation, text: chatText },
    });
    await ctx.agents.get(SessionId(main)).whenIdle();
    assert.equal(
      calls,
      callsAfterChat,
      "Repeated chat receipt duplicated model execution",
    );
    assert.equal(
      ctx.agents
        .get(SessionId(main))
        .session.snapshotEvents()
        .filter(
          (e) =>
            e.type === "user/message" &&
            JSON.stringify(e.data).includes(chatText),
        ).length,
      1,
    );
    assert.ok(
      JSON.stringify(
        ctx.agents.get(SessionId(main)).session.snapshotEvents(),
      ).includes("MEMORY_VISIBLE"),
    );
    const taskId = randomUUID();
    await ctx.botWorkbench.command({
      action: "create",
      operationId: taskId,
      botId: bot.id,
      title: "核对两条资料（脚本化验收样例）",
      objective: "Compare two fixture sources and record evidence.",
      criteria: ["列出资料出处", "说明对照结论"],
    });
    let task = (await ctx.botWorkbench.snapshot()).tasks.find(
      (t) => t.id === taskId,
    );
    await ctx.botWorkbench.command({
      action: "start",
      taskId,
      revision: task.revision,
      operationId: randomUUID(),
    });
    for (let i = 0; i < 400; i++) {
      snapshot = await ctx.botWorkbench.snapshot();
      task = snapshot.tasks.find((t) => t.id === taskId);
      if (
        ["submitted", "failed", "uncertain"].includes(task.runs.at(-1)?.state)
      )
        break;
      await pause(25);
    }
    const run = task.runs.at(-1);
    assert.equal(run.state, "submitted");
    assert.equal(run.review, "pending");
    assert.equal(run.evidence.length, 2);
    assert.ok(approvalCount > 0, "Native approval was not exercised");
    const agent = ctx.agents.get(SessionId(run.sessionId)),
      events = agent.session.snapshotEvents();
    assert.ok(events.some((e) => e.type === "approval/asked"));
    assert.ok(
      events.some(
        (e) =>
          e.type === "approval/decided" && e.data.outcome === "allowed-once",
      ),
    );
    await assert.rejects(
      ctx.botWorkbench.command({
        action: "review",
        taskId,
        revision: task.revision,
        runId: run.id,
        decision: "accepted",
        note: "",
        checkedCriteria: [],
      }),
    );
    snapshot = await ctx.botWorkbench.command({
      action: "review",
      taskId,
      revision: task.revision,
      runId: run.id,
      decision: "accepted",
      note: "Scripted test only; not real-model verification.",
      checkedCriteria: task.criteria.map((c) => c.id),
    });
    task = snapshot.tasks.find((t) => t.id === taskId);
    assert.equal(task.runs.at(-1).review, "accepted");
    assert.ok(await ctx.sessions.flush(agent.session));
    await ctx.botWorkbench.command({
      action: "schedule",
      taskId,
      revision: task.revision,
      kind: "every",
      everySeconds: 3600,
    });
    task = (await ctx.botWorkbench.snapshot()).tasks.find(
      (t) => t.id === taskId,
    );
    assert.ok(task.schedule);
    const scheduleId = task.schedule.id;
    await ctx.schedule.run({ id: scheduleId });
    for (let i = 0; i < 400; i++) {
      task = (await ctx.botWorkbench.snapshot()).tasks.find(
        (t) => t.id === taskId,
      );
      if (task.runs.length === 2 && task.runs.at(-1).state === "submitted")
        break;
      await pause(25);
    }
    assert.equal(
      task.runs.length,
      2,
      "Native schedule did not claim a second run",
    );
    assert.equal(task.runs.at(-1).state, "submitted");
    await ctx.botWorkbench.command({
      action: "review",
      taskId,
      revision: task.revision,
      runId: task.runs.at(-1).id,
      decision: "accepted",
      note: "Scripted scheduled result.",
      checkedCriteria: task.criteria.map((c) => c.id),
    });
    task = (await ctx.botWorkbench.snapshot()).tasks.find(
      (t) => t.id === taskId,
    );
    await ctx.botWorkbench.command({
      action: "pause",
      taskId,
      revision: task.revision,
      paused: true,
    });
    assert.equal(
      (await ctx.schedule.view({ id: scheduleId })).status,
      "paused",
    );
    task = (await ctx.botWorkbench.snapshot()).tasks.find(
      (t) => t.id === taskId,
    );
    await ctx.botWorkbench.command({
      action: "pause",
      taskId,
      revision: task.revision,
      paused: false,
    });
    assert.equal(
      (await ctx.schedule.view({ id: scheduleId })).status,
      "active",
    );
    task = (await ctx.botWorkbench.snapshot()).tasks.find(
      (t) => t.id === taskId,
    );
    await ctx.botWorkbench.command({
      action: "unschedule",
      taskId,
      revision: task.revision,
    });
    task = (await ctx.botWorkbench.snapshot()).tasks.find(
      (t) => t.id === taskId,
    );
    await ctx.botWorkbench.command({
      action: "schedule",
      taskId,
      revision: task.revision,
      kind: "daily",
      time: "09:15",
      timeZone: "Asia/Shanghai",
    });
    task = (await ctx.botWorkbench.snapshot()).tasks.find(
      (t) => t.id === taskId,
    );
    const daily = await ctx.schedule.view({ id: task.schedule.id });
    assert.equal(daily.timeZone, "Asia/Shanghai");
    assert.ok(Date.parse(daily.scheduledAt) > Date.now());
    await ctx.botWorkbench.command({
      action: "unschedule",
      taskId,
      revision: task.revision,
    });
    await ctx.botWorkbench.command({
      action: "createBot",
      name: "验证接收助手",
      persona: "Only process explicitly assigned test work.",
      cwd: config.workspace,
    });
    snapshot = await ctx.botWorkbench.snapshot();
    const receiver = snapshot.bots.at(-1);
    await ctx.botWorkbench.command({ action: "chatBot", botId: receiver.id });
    const secondMain = (await ctx.botWorkbench.snapshot()).bots.find(
      (b) => b.id === receiver.id,
    ).mainSessionId;
    await ctx.sessionController.prompt(
      {
        sessionId: secondMain,
        requestId: randomUUID(),
        mode: "queue",
        content: [{ type: "text", text: "Check your saved preference." }],
      },
      new AbortController().signal,
    );
    await ctx.agents.get(SessionId(secondMain)).whenIdle();
    assert.ok(
      JSON.stringify(
        ctx.agents.get(SessionId(secondMain)).session.snapshotEvents(),
      ).includes("NO_MEMORY"),
      "Private memory leaked to the receiving Bot",
    );
    task = (await ctx.botWorkbench.snapshot()).tasks.find(
      (t) => t.id === taskId,
    );
    await ctx.botWorkbench.command({
      action: "handoff",
      taskId,
      revision: task.revision,
      operationId: randomUUID(),
      botId: receiver.id,
      context: "ONLY_THIS_HANDOFF_CONTEXT",
    });
    task = (await ctx.botWorkbench.snapshot()).tasks.find(
      (t) => t.id === taskId,
    );
    assert.equal(task.botId, receiver.id);
    assert.equal(task.handoffs.length, 1);
    assert.equal(
      (await ctx.botWorkbench.snapshot()).memories.filter(
        (m) => m.botId === receiver.id,
      ).length,
      0,
    );
    const originalMemory = (await ctx.botWorkbench.snapshot()).memories.find(
      (m) => m.botId === bot.id,
    );
    await ctx.botWorkbench.command({
      action: "memoryShare",
      memoryId: originalMemory.id,
      botId: receiver.id,
    });
    snapshot = await ctx.botWorkbench.snapshot();
    const shared = snapshot.memories.find((m) => m.botId === receiver.id);
    assert.equal(shared.state, "candidate");
    await ctx.botWorkbench.command({
      action: "memoryEdit",
      memoryId: shared.id,
      previous: shared.content,
      content: "RECEIVER_ONLY_PREFERENCE",
    });
    await assert.rejects(
      ctx.botWorkbench.command({
        action: "memoryEdit",
        memoryId: shared.id,
        previous: shared.content,
        content: "STALE_EDIT",
      }),
    );
    await ctx.botWorkbench.command({
      action: "memoryConfirm",
      memoryId: shared.id,
    });
    await ctx.botWorkbench.command({
      action: "memoryForget",
      memoryId: shared.id,
    });
    await ctx.botWorkbench.command({
      action: "setPrimary",
      botId: receiver.id,
    });
    snapshot = await ctx.botWorkbench.snapshot();
    assert.equal(snapshot.primaryBotId, receiver.id);
    let current = snapshot.bots.find((b) => b.id === receiver.id);
    await ctx.botWorkbench.command({
      action: "editBot",
      botId: receiver.id,
      revision: current.revision,
      name: "验证接收助手（已编辑）",
      persona: "Edited responsibility.",
      cwd: config.workspace,
    });
    await ctx.botWorkbench.command({
      action: "botState",
      botId: receiver.id,
      revision: current.revision + 1,
      paused: true,
      archived: false,
    });
    await assert.rejects(
      ctx.botWorkbench.command({
        action: "start",
        taskId,
        revision: task.revision,
        operationId: randomUUID(),
      }),
    );
    await ctx.botWorkbench.command({
      action: "botState",
      botId: receiver.id,
      revision: current.revision + 2,
      paused: false,
      archived: false,
    });
    const transfer = {
      format: "bot-workbench-export",
      version: 1,
      exportedAt: new Date().toISOString(),
      bots: [
        (await ctx.botWorkbench.snapshot()).bots.find(
          (b) => b.id === receiver.id,
        ),
      ],
      memories: [],
      tasks: [task],
    };
    const operationId = randomUUID();
    await ctx.botWorkbench.command({
      action: "importTemplates",
      operationId,
      data: transfer,
    });
    let imported = await ctx.botWorkbench.snapshot();
    const count = imported.bots.length;
    await ctx.botWorkbench.command({
      action: "importTemplates",
      operationId,
      data: transfer,
    });
    imported = await ctx.botWorkbench.snapshot();
    assert.equal(imported.bots.length, count);
    const copied = imported.tasks.find(
      (t) =>
        t.id !== taskId &&
        t.title === task.title &&
        t.botId !== task.botId &&
        imported.bots.find((b) => b.id === t.botId)?.paused,
    );
    assert.ok(copied);
    assert.equal(copied.paused, true);
    assert.equal(copied.runs.length, 0);
    assert.equal(copied.schedule, undefined);
    // A real native second run must receive the user's requested corrections.
    task = (await ctx.botWorkbench.snapshot()).tasks.find(
      (t) => t.id === taskId,
    );
    await ctx.botWorkbench.command({
      action: "start",
      taskId,
      revision: task.revision,
      operationId: randomUUID(),
    });
    for (let i = 0; i < 400; i++) {
      task = (await ctx.botWorkbench.snapshot()).tasks.find(
        (t) => t.id === taskId,
      );
      if (task.runs.at(-1).state === "submitted") break;
      await pause(25);
    }
    await ctx.botWorkbench.command({
      action: "review",
      taskId,
      revision: task.revision,
      runId: task.runs.at(-1).id,
      decision: "changes_requested",
      note: "SCRIPTED_CORRECTION_MARKER",
      checkedCriteria: [],
    });
    task = (await ctx.botWorkbench.snapshot()).tasks.find(
      (t) => t.id === taskId,
    );
    await ctx.botWorkbench.command({
      action: "start",
      taskId,
      revision: task.revision,
      operationId: randomUUID(),
    });
    for (let i = 0; i < 400; i++) {
      task = (await ctx.botWorkbench.snapshot()).tasks.find(
        (t) => t.id === taskId,
      );
      if (task.runs.at(-1).state === "submitted") break;
      await pause(25);
    }
    const correctedAgent = ctx.agents.get(
      SessionId(task.runs.at(-1).sessionId),
    );
    assert.ok(
      JSON.stringify(correctedAgent.session.snapshotEvents()).includes(
        "SCRIPTED_CORRECTION_MARKER",
      ),
    );
    await ctx.botWorkbench.command({
      action: "review",
      taskId,
      revision: task.revision,
      runId: task.runs.at(-1).id,
      decision: "accepted",
      note: "Correction receipt verified with scripted model.",
      checkedCriteria: task.criteria.map((c) => c.id),
    });
    const stoppedTaskId = randomUUID();
    await ctx.botWorkbench.command({
      action: "create",
      operationId: stoppedTaskId,
      botId: receiver.id,
      title: "准备中停止验证",
      objective: "No model prompt should be admitted.",
      criteria: ["No model call"],
    });
    const controller = ctx.sessionController,
      originalCreate = controller.create;
    let release, entered;
    const gate = new Promise((r) => (release = r)),
      entry = new Promise((r) => (entered = r));
    const callsBeforeStop = calls;
    try {
      controller.create = async function (request) {
        const result = await originalCreate.call(controller, request);
        entered();
        await gate;
        return result;
      };
      let stopped = (await ctx.botWorkbench.snapshot()).tasks.find(
        (t) => t.id === stoppedTaskId,
      );
      await ctx.botWorkbench.command({
        action: "start",
        taskId: stoppedTaskId,
        revision: stopped.revision,
        operationId: randomUUID(),
      });
      await entry;
      stopped = (await ctx.botWorkbench.snapshot()).tasks.find(
        (t) => t.id === stoppedTaskId,
      );
      assert.equal(stopped.runs.at(-1).state, "preparing");
      await ctx.botWorkbench.command({
        action: "stop",
        taskId: stoppedTaskId,
        revision: stopped.revision,
      });
      release();
      for (let i = 0; i < 400; i++) {
        stopped = (await ctx.botWorkbench.snapshot()).tasks.find(
          (t) => t.id === stoppedTaskId,
        );
        if (stopped.runs.at(-1).state === "cancelled") break;
        await pause(25);
      }
      assert.equal(stopped.runs.at(-1).state, "cancelled");
      assert.equal(calls, callsBeforeStop);
    } finally {
      release();
      controller.create = originalCreate;
    }
    await writeFile(
      config.output,
      JSON.stringify(
        {
          status: "PASS",
          phase: "hot",
          hostVersion: snapshot.hostVersion,
          taskId,
          sessionId: run.sessionId,
          approvalCount,
          calls,
          realModelRequests: 0,
          chatEntryDeduplicated: true,
          memoryInjection: true,
          acceptanceSeparated: true,
          nativeSchedule: true,
          explicitDailyTimeZone: true,
          pauseResume: true,
          privateMemoryIsolation: true,
          explicitHandoff: true,
          metadataAndMemoryManagement: true,
          pausedIdempotentImport: true,
          reviewFeedback: true,
          stoppedBeforeAdmission: true,
        },
        null,
        2,
      ),
    );
    console.log("WORKBENCH_PROBE_DONE");
    finished = true;
  })().catch(async (error) => {
    await writeFile(
      config.output,
      JSON.stringify(
        {
          status: "FAIL",
          error: String(error),
          stack: error.stack,
          calls,
          approvalCount,
          realModelRequests: 0,
        },
        null,
        2,
      ),
    );
    console.error("WORKBENCH_PROBE_FAILED", error);
    finished = true;
  });
  ctx.effect(() => () => outcome, "fixture: result settlement");
}
