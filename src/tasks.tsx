import { useEffect, useState, type FormEvent } from "react";
import { activeStates, type Snapshot, type Task } from "./schema.ts";
import {
  Avatar,
  Field,
  Glyph,
  State,
  type Translate,
  type CommandCall,
} from "./ui.tsx";
export type TaskTab = "result" | "history" | "settings";
export function TaskDetail({
  task,
  snapshot,
  t,
  busy,
  command,
  openSession,
  initialTab = "result",
}: {
  task: Task;
  snapshot: Snapshot;
  t: Translate;
  busy: boolean;
  command: CommandCall;
  openSession(id: string): void;
  initialTab?: TaskTab;
}) {
  const [tab, setTab] = useState<TaskTab>(initialTab),
    [checked, setChecked] = useState<string[]>([]),
    [note, setNote] = useState(""),
    [summary, setSummary] = useState(""),
    [scheduleKind, setScheduleKind] = useState<"daily" | "every">("daily");
  const run = task.runs.at(-1),
    active = !!run && activeStates.has(run.state),
    bot = snapshot.bots.find((b) => b.id === task.botId),
    base = { taskId: task.id, revision: task.revision };
  const nativePlan = snapshot.schedules.find((s) => s.taskId === task.id),
    delivery = nativePlan?.lastDelivery,
    claimed =
      delivery && task.runs.find((r) => r.requestId === delivery.messageId);
  useEffect(() => {
    setChecked([]);
    setNote("");
    setSummary("");
  }, [run?.id]);
  const canStart =
    !busy &&
    !active &&
    !task.paused &&
    !task.archived &&
    !bot?.paused &&
    !bot?.archived &&
    run?.state !== "uncertain" &&
    run?.review !== "pending";
  function schedule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    void command({
      ...base,
      action: "schedule",
      kind: scheduleKind,
      ...(scheduleKind === "daily"
        ? { time: String(d.get("time")), timeZone: String(d.get("zone")) }
        : { everySeconds: Number(d.get("seconds")) }),
    });
  }
  function handoff(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    void command({
      ...base,
      action: "handoff",
      operationId: crypto.randomUUID(),
      botId: String(d.get("botId")),
      context: String(d.get("context")),
    });
  }
  return (
    <article className="wb-task-detail">
      <header className="wb-detail-heading">
        <div className="wb-task-owner">
          {bot ? <Avatar bot={bot} /> : null}
          <span>{bot?.name ?? t("owner")}</span>
          <State task={task} t={t} />
        </div>
        <h2>{task.title}</h2>
        <div className="wb-actions">
          {active ? (
            <button
              className="wb-secondary"
              disabled={busy}
              onClick={() => {
                void command({ ...base, action: "stop" });
              }}
            >
              {t("stop")}
            </button>
          ) : run?.review === "pending" ||
            run?.state === "uncertain" ||
            task.archived ? null : (
            <button
              className="wb-primary"
              disabled={!canStart}
              onClick={() => {
                void command({
                  ...base,
                  action: "start",
                  operationId: crypto.randomUUID(),
                });
              }}
            >
              <Glyph name="arrow" size={15} />
              {t(run ? "runAgain" : "start")}
            </button>
          )}
          {run?.sessionId ? (
            <button
              className="wb-text-button"
              onClick={() => openSession(run.sessionId!)}
            >
              {t("original")}
              <Glyph name="arrow" size={14} />
            </button>
          ) : null}
        </div>
      </header>
      <nav className="wb-tabs" role="tablist" aria-label={t("taskViews")}>
        {(["result", "history", "settings"] as const).map((key) => (
          <button
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "is-active" : ""}
            key={key}
            onClick={() => setTab(key)}
          >
            {t(
              key === "result"
                ? "outcome"
                : key === "history"
                  ? "history"
                  : "taskSettings",
            )}
            {key === "history" && task.runs.length ? (
              <span>{task.runs.length}</span>
            ) : null}
          </button>
        ))}
      </nav>
      {tab === "result" ? (
        <div className="wb-detail-body">
          <details className="wb-task-brief" open={!run}>
            <summary>{t("taskBrief")}</summary>
            <p>{task.objective}</p>
          </details>
          {run?.state === "waiting_approval" ? (
            <div className="wb-inline-notice">
              <Glyph name="clock" size={18} />
              <div>
                <strong>{t("waiting_approval")}</strong>
                <p>{t("approvalHelp")}</p>
              </div>
              {run.sessionId ? (
                <button onClick={() => openSession(run.sessionId!)}>
                  {t("openApproval")}
                </button>
              ) : null}
            </div>
          ) : null}
          {run?.summary ? (
            <section className="wb-delivery">
              <div className="wb-section-title">
                <h3>{t("submittedSummary")}</h3>
                <span>
                  {run.endedAt
                    ? new Date(run.endedAt).toLocaleString()
                    : t("running")}
                </span>
              </div>
              <p className="wb-result">{run.summary}</p>
            </section>
          ) : (
            <div className="wb-small-empty">
              <Glyph name={active ? "clock" : "task"} size={28} />
              <h3>{t(active ? "workInProgress" : "taskNotStarted")}</h3>
              <p>{t(active ? "workInProgressHelp" : "taskNotStartedHelp")}</p>
            </div>
          )}
          {run?.note ? (
            <p
              className={`wb-note${run.state === "uncertain" ? " is-warning" : ""}`}
            >
              {run.note}
            </p>
          ) : null}
          {run?.state === "uncertain" ? (
            <section className="wb-reconciliation">
              <div className="wb-inline-notice is-warning">
                <Glyph name="warning" size={20} />
                <div>
                  <strong>{t("uncertain")}</strong>
                  <p>{t("uncertainHelp")}</p>
                </div>
              </div>
              <Field label={t("summary")}>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={3}
                />
              </Field>
              <Field label={t("note")}>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                />
              </Field>
              <div className="wb-actions">
                <button
                  disabled={busy || !note.trim()}
                  onClick={() => {
                    void command({
                      ...base,
                      action: "reconcile",
                      runId: run.id,
                      decision: "close_without_result",
                      summary,
                      note,
                    });
                  }}
                >
                  {t("closeRun")}
                </button>
                <button
                  className="wb-primary"
                  disabled={busy || !note.trim() || !summary.trim()}
                  onClick={() => {
                    void command({
                      ...base,
                      action: "reconcile",
                      runId: run.id,
                      decision: "record_result",
                      summary,
                      note,
                    });
                  }}
                >
                  {t("reconcile")}
                </button>
              </div>
            </section>
          ) : null}
          <section className="wb-criteria">
            <div className="wb-section-title">
              <h3>{t("evidenceAndReview")}</h3>
              <span>
                {task.criteria.length} {t("criteriaCount")}
              </span>
            </div>
            {task.criteria.map((criterion, index) => {
              const evidence =
                run?.evidence.filter((e) => e.criterionId === criterion.id) ??
                [];
              const reviewing =
                run?.state === "submitted" && run.review === "pending";
              return (
                <div className="wb-criterion" key={criterion.id}>
                  <div className="wb-criterion-title">
                    {reviewing ? (
                      <input
                        type="checkbox"
                        aria-label={`${t("checked")} ${criterion.text}`}
                        checked={checked.includes(criterion.id)}
                        disabled={!evidence.length || busy}
                        onChange={(e) =>
                          setChecked((v) =>
                            e.target.checked
                              ? [...v, criterion.id]
                              : v.filter((id) => id !== criterion.id),
                          )
                        }
                      />
                    ) : (
                      <span
                        className={`wb-criterion-number${run?.review === "accepted" ? " is-checked" : ""}`}
                      >
                        {run?.review === "accepted" ? (
                          <Glyph name="check" size={14} />
                        ) : (
                          String(index + 1).padStart(2, "0")
                        )}
                      </span>
                    )}
                    <strong>{criterion.text}</strong>
                  </div>
                  {evidence.map((e, i) => (
                    <div className="wb-evidence" key={i}>
                      <p>{e.note}</p>
                      <code>{e.reference}</code>
                    </div>
                  ))}
                  {reviewing && !evidence.length ? (
                    <p className="wb-footnote">{t("noEvidence")}</p>
                  ) : null}
                </div>
              );
            })}
          </section>
          {run?.state === "submitted" && run.review === "pending" ? (
            <section className="wb-review-panel">
              <div>
                <strong>{t("yourReview")}</strong>
                <span>
                  {checked.length} / {task.criteria.length} {t("checkedCount")}
                </span>
              </div>
              <Field label={t("reviewNote")}>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("reviewNotePlaceholder")}
                  rows={2}
                />
              </Field>
              <div className="wb-actions">
                <button
                  disabled={busy || !note.trim()}
                  onClick={() => {
                    void command({
                      ...base,
                      action: "review",
                      runId: run.id,
                      decision: "changes_requested",
                      note,
                      checkedCriteria: checked,
                    });
                  }}
                >
                  {t("changes")}
                </button>
                <button
                  className="wb-primary"
                  disabled={busy || checked.length !== task.criteria.length}
                  onClick={() => {
                    void command({
                      ...base,
                      action: "review",
                      runId: run.id,
                      decision: "accepted",
                      note,
                      checkedCriteria: checked,
                    });
                  }}
                >
                  <Glyph name="check" size={15} />
                  {t("accept")}
                </button>
              </div>
              <p className="wb-footnote">{t("reviewHelp")}</p>
            </section>
          ) : null}
        </div>
      ) : tab === "history" ? (
        <div className="wb-detail-body">
          {task.runs.length ? (
            task.runs.toReversed().map((r) => (
              <details className="wb-run-record" key={r.id}>
                <summary>
                  <span className={`wb-state state-${r.state}`}>
                    <i />
                    {t(r.state)}
                  </span>
                  <time>{new Date(r.startedAt).toLocaleString()}</time>
                  <span>
                    {r.steps} {t("steps")}
                  </span>
                </summary>
                <div>
                  <span className="wb-footnote">
                    {t(r.review)} · {r.tokens ?? "—"} {t("tokens")}
                  </span>
                  <p className="wb-result">{r.summary || "—"}</p>
                  {r.note ? <p className="wb-note">{r.note}</p> : null}
                  {r.sessionId ? (
                    <button onClick={() => openSession(r.sessionId!)}>
                      {t("original")}
                    </button>
                  ) : null}
                </div>
              </details>
            ))
          ) : (
            <div className="wb-small-empty">
              <Glyph name="clock" size={28} />
              <p>{t("noRuns")}</p>
            </div>
          )}
          {task.handoffs.length ? (
            <section>
              <h3>{t("handoffs")}</h3>
              {task.handoffs.map((h) => (
                <div className="wb-handoff-record" key={h.id}>
                  <strong>
                    {snapshot.bots.find((b) => b.id === h.fromBotId)?.name ??
                      t("owner")}{" "}
                    <Glyph name="arrow" size={13} />{" "}
                    {snapshot.bots.find((b) => b.id === h.toBotId)?.name ??
                      t("owner")}
                  </strong>
                  <p>{h.context}</p>
                  <time>{new Date(h.at).toLocaleString()}</time>
                </div>
              ))}
            </section>
          ) : null}
        </div>
      ) : (
        <div className="wb-detail-body">
          <section>
            <div className="wb-section-title">
              <h3>{t("schedule")}</h3>
              <Glyph name="clock" size={17} />
            </div>
            <p className="wb-footnote">{t("scheduleHelp")}</p>
            {task.schedule ? (
              <div className="wb-plan-summary">
                <strong>{task.schedule.description}</strong>
                <dl>
                  <div>
                    <dt>{t("nativeStatus")}</dt>
                    <dd>
                      {t(
                        nativePlan?.status === "active"
                          ? "planActive"
                          : ((nativePlan?.status ?? "missing") as
                              | "paused"
                              | "ended"
                              | "missing"),
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("nextRun")}</dt>
                    <dd>
                      {nativePlan?.status === "active" && nativePlan.scheduledAt
                        ? new Date(nativePlan.scheduledAt).toLocaleString()
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("delivery")}</dt>
                    <dd>
                      {delivery
                        ? new Date(delivery.deliveredAt).toLocaleString()
                        : "—"}
                    </dd>
                  </div>
                </dl>
                {delivery ? (
                  <p className="wb-footnote">
                    {claimed
                      ? `${t("claimed")} · ${t(claimed.state)}`
                      : t("unclaimed")}
                  </p>
                ) : null}
                <p className="wb-footnote">{t("deliveredHelp")}</p>
                <div className="wb-actions">
                  <button
                    disabled={busy || !canStart}
                    onClick={() => {
                      void command({ ...base, action: "runSchedule" });
                    }}
                  >
                    {t("runNow")}
                  </button>
                  <button onClick={() => openSession(task.schedule!.sessionId)}>
                    {t("scheduleSession")}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      void command({ ...base, action: "unschedule" });
                    }}
                  >
                    {t("unschedule")}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={schedule} className="wb-form-grid">
                <Field label={t("schedule")}>
                  <select
                    name="kind"
                    value={scheduleKind}
                    onChange={(e) =>
                      setScheduleKind(
                        e.target.value === "daily" ? "daily" : "every",
                      )
                    }
                  >
                    <option value="daily">{t("daily")}</option>
                    <option value="every">{t("interval")}</option>
                  </select>
                </Field>
                {scheduleKind === "daily" ? (
                  <>
                    <Field label={t("time")}>
                      <input type="time" name="time" defaultValue="09:00" />
                    </Field>
                    <Field label={t("timezone")}>
                      <input
                        name="zone"
                        defaultValue={
                          Intl.DateTimeFormat().resolvedOptions().timeZone
                        }
                      />
                    </Field>
                  </>
                ) : (
                  <Field label={t("seconds")}>
                    <input
                      name="seconds"
                      type="number"
                      min="60"
                      defaultValue="3600"
                    />
                  </Field>
                )}
                <button disabled={!canStart}>{t("saveSchedule")}</button>
              </form>
            )}
          </section>
          <section className="wb-settings-section">
            <h3>{t("handoff")}</h3>
            <p className="wb-footnote">{t("handoffText")}</p>
            <form onSubmit={handoff}>
              <Field label={t("owner")}>
                <select name="botId">
                  {snapshot.bots
                    .filter(
                      (b) => b.id !== task.botId && !b.paused && !b.archived,
                    )
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label={t("context")}>
                <textarea name="context" required rows={3} />
              </Field>
              <button
                disabled={
                  busy ||
                  active ||
                  !!task.schedule ||
                  run?.state === "uncertain" ||
                  snapshot.bots.filter(
                    (b) => b.id !== task.botId && !b.paused && !b.archived,
                  ).length === 0
                }
              >
                {t("saveHandoff")}
              </button>
            </form>
          </section>
          <section className="wb-settings-section">
            <div className="wb-setting-row">
              <div>
                <strong>{t(task.paused ? "resume" : "pause")}</strong>
                <p>{t("pauseTaskHelp")}</p>
              </div>
              <button
                disabled={busy}
                onClick={() => {
                  void command({
                    ...base,
                    action: "pause",
                    paused: !task.paused,
                  });
                }}
              >
                {t(task.paused ? "resume" : "pause")}
              </button>
            </div>
            <div className="wb-setting-row">
              <div>
                <strong>{t("archive")}</strong>
                <p>{t("archiveTaskHelp")}</p>
              </div>
              <button
                disabled={busy || active || !!task.schedule}
                onClick={() => {
                  if (task.archived)
                    void command({ ...base, action: "restoreTask" });
                  else if (window.confirm(t("confirmArchive")))
                    void command({ ...base, action: "archive" });
                }}
              >
                {t(task.archived ? "restoreTask" : "archive")}
              </button>
            </div>
          </section>
        </div>
      )}
    </article>
  );
}
