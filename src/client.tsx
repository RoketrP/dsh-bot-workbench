import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-api-remotes/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type {} from "@deepseek-ai/dsh-client-ui-workspace/client";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type { SessionId } from "@deepseek-ai/dsh-session";
import {
  BotPanel,
  ImportPanel,
  ModelFields,
  modelFrom,
} from "./management.tsx";
import { BotHome, TaskRow } from "./home.tsx";
import { TaskDetail, type TaskTab } from "./tasks.tsx";
import { Field, Glyph, type Translate, type CommandCall } from "./ui.tsx";
import { REMOTE } from "./contract.ts";
import { en, zh, type TextKey } from "./locales.ts";
import { activeStates, type Command, type Snapshot } from "./schema.ts";
import css from "./style.css";
export const name = "dsh-bot-workbench-client";
export const inject = ["slots", "locale", "remote", "layout", "uiWorkspace"];
declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    "bot-workbench": TextKey;
  }
}
type PageProps = {
  api: { load(): Promise<Snapshot>; command(c: Command): Promise<Snapshot> };
  translate: Translate;
  openSession(id: string): void;
};
type Dialog = {
  kind: "bot" | "task" | "profile" | "detail" | "import" | "data";
  botId?: string;
  profileTab?: "memory" | "profile" | "manage";
  taskId?: string;
  taskTab?: TaskTab;
};
export function WorkbenchPage({ api, translate: t, openSession }: PageProps) {
  const [snapshot, setSnapshot] = useState<Snapshot>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [view, setView] = useState<"home" | "tasks" | "plans">("home"),
    [filter, setFilter] = useState("all"),
    [dialog, setDialog] = useState<Dialog | null>(null);
  const generation = useRef(0),
    commandBusy = useRef(false),
    dialogRef = useRef<HTMLElement>(null);
  async function refresh() {
    const ticket = ++generation.current;
    try {
      const next = await api.load();
      if (ticket === generation.current) {
        setSnapshot(next);
        setError("");
      }
    } catch (e) {
      if (ticket === generation.current)
        setError(e instanceof Error ? e.message : t("error"));
    }
  }
  useEffect(() => {
    let active = true;
    async function poll() {
      if (active && !document.hidden && !commandBusy.current) await refresh();
    }
    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 2500);
    return () => {
      active = false;
      generation.current++;
      clearInterval(timer);
    };
  }, [api]);
  useEffect(() => {
    if (!dialog) return;
    const old = document.activeElement as HTMLElement | null,
      box = dialogRef.current;
    (
      box?.querySelector<HTMLElement>("[data-initial-focus]") ??
      box?.querySelector<HTMLElement>("input,textarea,select") ??
      box?.querySelector<HTMLElement>("button")
    )?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape" && !commandBusy.current) {
        e.preventDefault();
        setDialog(null);
      }
      if (e.key === "Tab" && box) {
        const nodes = Array.from(
          box.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex="0"]',
          ),
        ).filter((n) => n.getClientRects().length);
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      old?.focus();
    };
  }, [dialog?.kind, dialog?.botId, dialog?.taskId]);
  async function mutate(c: Command) {
    if (commandBusy.current) return;
    commandBusy.current = true;
    setBusy(true);
    const ticket = ++generation.current;
    try {
      const next = await api.command(c);
      if (ticket === generation.current) {
        setSnapshot(next);
        setError("");
      }
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      commandBusy.current = false;
      setBusy(false);
    }
  }
  const command: CommandCall = async (c) => !!(await mutate(c));
  async function chat(
    botId: string,
    prompt?: { operationId: string; text: string },
  ) {
    const next = await mutate({
      action: "chatBot",
      botId,
      ...(prompt ? { prompt } : {}),
    });
    const id = next?.bots.find((b) => b.id === botId)?.mainSessionId;
    if (id) {
      setDialog(null);
      openSession(id);
      return true;
    }
    return false;
  }
  const attention = (kind: "review" | "uncertain" | "all") => {
    setFilter(kind);
    setView("tasks");
  };
  const openTask = (taskId: string, taskTab: TaskTab = "result") =>
    setDialog({ kind: "detail", taskId, taskTab });
  const profile = (
    botId: string,
    profileTab: "memory" | "profile" | "manage" = "memory",
  ) => setDialog({ kind: "profile", botId, profileTab });
  const tasks =
    snapshot?.tasks
      .filter((task) =>
        filter === "archivedTasks" ? task.archived : !task.archived,
      )
      .filter((task) => {
        const run = task.runs.at(-1);
        return filter === "active"
          ? !!run && activeStates.has(run.state)
          : filter === "review"
            ? run?.state === "submitted" && run.review === "pending"
            : filter === "uncertain"
              ? run?.state === "uncertain"
              : true;
      }) ?? [];
  const reviewCount =
    snapshot?.tasks.filter(
      (task) =>
        !task.archived &&
        task.runs.at(-1)?.state === "submitted" &&
        task.runs.at(-1)?.review === "pending",
    ).length ?? 0;
  function exportRecords() {
    if (!snapshot || !window.confirm(t("backupHelp"))) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              format: "bot-workbench-export",
              version: 1,
              exportedAt: new Date().toISOString(),
              bots: snapshot.bots,
              memories: snapshot.memories,
              tasks: snapshot.tasks,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "bot-workbench-records.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const task = dialog?.taskId
    ? snapshot?.tasks.find((task) => task.id === dialog.taskId)
    : undefined;
  return (
    <div id="dsh-bot-workbench" translate="no" aria-busy={busy}>
      <div className="wb-app-bar">
        <a
          className="wb-brand"
          role="button"
          tabIndex={0}
          onClick={() => setView("home")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setView("home");
            }
          }}
        >
          <span>
            <Glyph name="bots" size={19} />
          </span>
          {t("brand")}
        </a>
        <nav className="wb-main-nav" aria-label={t("navigation")}>
          {(["home", "tasks", "plans"] as const).map((key) => (
            <button
              key={key}
              aria-current={view === key ? "page" : undefined}
              className={view === key ? "is-active" : ""}
              onClick={() => setView(key)}
            >
              <Glyph
                name={
                  key === "home" ? "bots" : key === "tasks" ? "task" : "clock"
                }
                size={16}
              />
              {t(
                key === "home"
                  ? "myAssistants"
                  : key === "tasks"
                    ? "taskNav"
                    : "plansNav",
              )}
              {key === "tasks" && reviewCount ? (
                <span>{reviewCount}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <button
          className="wb-icon-button wb-data-trigger"
          aria-label={t("dataSettings")}
          onClick={() => setDialog({ kind: "data" })}
        >
          <Glyph name="settings" size={19} />
        </button>
      </div>
      <div className="wb-content">
        {error && !dialog ? (
          <div className="wb-error" role="alert">
            <Glyph name="warning" size={17} />
            <span>{error}</span>
            <button
              onClick={() => {
                void refresh();
              }}
            >
              {t("refresh")}
            </button>
          </div>
        ) : null}
        {!snapshot ? (
          <div className="wb-loading">
            <span />
            <p>{t("waiting")}</p>
          </div>
        ) : view === "home" ? (
          <BotHome
            snapshot={snapshot}
            t={t}
            busy={busy}
            chat={chat}
            profile={profile}
            createBot={() => setDialog({ kind: "bot" })}
            createTask={(botId) => setDialog({ kind: "task", botId })}
            openTask={openTask}
            attention={attention}
          />
        ) : view === "tasks" ? (
          <div className="wb-enter">
            <header className="wb-page-heading">
              <div>
                <span className="wb-overline">{t("personalSpace")}</span>
                <h1>{t("taskNav")}</h1>
                <p>{t("taskPageHelp")}</p>
              </div>
              <button
                className="wb-primary"
                disabled={!snapshot.bots.some((b) => !b.paused && !b.archived)}
                onClick={() => setDialog({ kind: "task" })}
              >
                <Glyph name="plus" size={16} />
                {t("newTask")}
              </button>
            </header>
            <nav className="wb-filters" aria-label={t("filter")}>
              {(
                [
                  "all",
                  "active",
                  "review",
                  "uncertain",
                  "archivedTasks",
                ] as const
              ).map((key) => (
                <button
                  key={key}
                  className={filter === key ? "is-selected" : ""}
                  onClick={() => setFilter(key)}
                >
                  {t(key)}
                </button>
              ))}
            </nav>
            <div className="wb-task-list">
              {tasks.length ? (
                tasks.map((task) => (
                  <TaskRow
                    task={task}
                    key={task.id}
                    snapshot={snapshot}
                    t={t}
                    open={() => openTask(task.id)}
                  />
                ))
              ) : (
                <div className="wb-small-empty">
                  <Glyph name="task" size={30} />
                  <h2>
                    {t(filter === "all" ? "emptyTitle" : "noFilteredTasks")}
                  </h2>
                  <p>
                    {t(filter === "all" ? "emptyText" : "noFilteredTasksHelp")}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="wb-enter">
            <header className="wb-page-heading">
              <div>
                <span className="wb-overline">{t("personalSpace")}</span>
                <h1>{t("plansNav")}</h1>
                <p>{t("plansPageHelp")}</p>
              </div>
            </header>
            <div className="wb-plans">
              {snapshot.tasks.some((task) => !!task.schedule) ? (
                snapshot.tasks
                  .filter((task) => !!task.schedule)
                  .map((task) => {
                    const plan = snapshot.schedules.find(
                      (p) => p.taskId === task.id,
                    );
                    return (
                      <article className="wb-plan-card" key={task.id}>
                        <span className="wb-plan-icon">
                          <Glyph name="clock" size={22} />
                        </span>
                        <div>
                          <h2>{task.title}</h2>
                          <p>
                            {
                              snapshot.bots.find((b) => b.id === task.botId)
                                ?.name
                            }{" "}
                            · {task.schedule!.description}
                          </p>
                          <span className="wb-footnote">
                            {t("nextRun")} ·{" "}
                            {plan?.status === "active" && plan.scheduledAt
                              ? new Date(plan.scheduledAt).toLocaleString()
                              : "—"}
                          </span>
                        </div>
                        <span className={`wb-state state-${plan?.status}`}>
                          <i />
                          {t(
                            plan?.status === "active"
                              ? "planActive"
                              : plan?.status === "paused"
                                ? "paused"
                                : plan?.status === "ended"
                                  ? "ended"
                                  : "missing",
                          )}
                        </span>
                        <button
                          className="wb-text-button"
                          onClick={() => openTask(task.id, "settings")}
                        >
                          {t("managePlan")}
                          <Glyph name="chevron" size={15} />
                        </button>
                      </article>
                    );
                  })
              ) : (
                <div className="wb-small-empty wb-plan-empty">
                  <Glyph name="clock" size={34} />
                  <h2>{t("planEmpty")}</h2>
                  <p>{t("planEmptyHelp")}</p>
                  <button
                    onClick={() => {
                      setView("tasks");
                      setFilter("all");
                    }}
                  >
                    {t("viewTasks")}
                    <Glyph name="arrow" size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        <footer className="wb-footer">
          <span>
            <i />
            {t("localCommunityExtension")}
          </span>
        </footer>
      </div>
      {dialog ? (
        <div
          className={`wb-modal-backdrop${dialog.kind === "detail" ? " is-drawer" : ""}`}
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setDialog(null);
          }}
        >
          <section
            ref={dialogRef}
            className={`wb-modal${dialog.kind === "detail" ? " wb-drawer" : dialog.kind === "profile" ? " wb-profile-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={t(
              dialog.kind === "detail"
                ? "taskDetails"
                : dialog.kind === "profile"
                  ? "profile"
                  : dialog.kind === "data"
                    ? "dataSettings"
                    : dialog.kind === "import"
                      ? "importRecords"
                      : dialog.kind === "task"
                        ? "newTask"
                        : "newBot",
            )}
          >
            <div className="wb-modal-top">
              <span>
                {t(
                  dialog.kind === "detail"
                    ? "taskDetails"
                    : dialog.kind === "profile"
                      ? "profile"
                      : dialog.kind === "data"
                        ? "dataSettings"
                        : dialog.kind === "import"
                          ? "importRecords"
                          : dialog.kind === "task"
                            ? "newTask"
                            : "newBot",
                )}
              </span>
              <button
                className="wb-icon-button"
                aria-label={t("close")}
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                <Glyph name="close" size={18} />
              </button>
            </div>
            {error ? (
              <div className="wb-error" role="alert">
                <Glyph name="warning" size={17} />
                <span>{error}</span>
                <button onClick={() => setError("")}>{t("close")}</button>
              </div>
            ) : null}
            {dialog.kind === "profile" && snapshot ? (
              <BotPanel
                key={dialog.botId + ":" + dialog.profileTab}
                snapshot={snapshot}
                t={t}
                busy={busy}
                command={command}
                close={() => setDialog(null)}
                chat={chat}
                initialBotId={dialog.botId}
                initialTab={dialog.profileTab}
              />
            ) : dialog.kind === "detail" && task && snapshot ? (
              <TaskDetail
                key={task.id + ":" + dialog.taskTab}
                task={task}
                snapshot={snapshot}
                t={t}
                busy={busy}
                command={command}
                openSession={openSession}
                initialTab={dialog.taskTab}
              />
            ) : dialog.kind === "import" ? (
              <div className="wb-modal-padding">
                <ImportPanel
                  t={t}
                  busy={busy}
                  command={command}
                  close={() => setDialog(null)}
                />
              </div>
            ) : dialog.kind === "data" ? (
              <div className="wb-modal-padding">
                <h2>{t("dataHeading")}</h2>
                <p>{t("dataHelp")}</p>
                <div className="wb-data-actions">
                  <button onClick={exportRecords}>
                    <Glyph name="download" size={20} />
                    <span>
                      <strong>{t("export")}</strong>
                      <small>{t("exportHelp")}</small>
                    </span>
                    <Glyph name="chevron" size={16} />
                  </button>
                  <button onClick={() => setDialog({ kind: "import" })}>
                    <Glyph name="upload" size={20} />
                    <span>
                      <strong>{t("importRecords")}</strong>
                      <small>{t("importShortHelp")}</small>
                    </span>
                    <Glyph name="chevron" size={16} />
                  </button>
                </div>
                <details className="wb-advanced">
                  <summary>{t("diagnostics")}</summary>
                  <dl className="wb-diagnostics">
                    <div>
                      <dt>{t("version")}</dt>
                      <dd>{snapshot?.version ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>{t("hostVersion")}</dt>
                      <dd>{snapshot?.hostVersion ?? "—"}</dd>
                    </div>
                  </dl>
                  {snapshot?.warnings.map((w) => (
                    <p className="wb-footnote" key={w}>
                      {w}
                    </p>
                  ))}
                </details>
              </div>
            ) : dialog.kind === "task" || dialog.kind === "bot" ? (
              <div className="wb-modal-padding">
                <CreateForm
                  key={dialog.kind}
                  type={dialog.kind}
                  snapshot={snapshot}
                  defaultBotId={dialog.botId}
                  t={t}
                  busy={busy}
                  cancel={() => setDialog(null)}
                  submit={async (c) => {
                    if (await command(c)) {
                      if (c.action === "create") {
                        setView("tasks");
                        setFilter("all");
                        openTask(c.operationId);
                      } else setDialog(null);
                    }
                  }}
                />
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
function CreateForm({
  type,
  snapshot,
  defaultBotId,
  t,
  busy,
  cancel,
  submit,
}: {
  type: "task" | "bot";
  snapshot?: Snapshot;
  defaultBotId?: string;
  t: Translate;
  busy: boolean;
  cancel(): void;
  submit(c: Command): Promise<void>;
}) {
  const operationId = useRef(crypto.randomUUID());
  function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget),
      value = (key: string) => String(data.get(key) ?? "");
    void submit(
      type === "task"
        ? {
            action: "create",
            operationId: operationId.current,
            botId: value("botId"),
            title: value("title"),
            objective: value("objective"),
            criteria: value("criteria")
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
          }
        : {
            action: "createBot",
            name: value("name"),
            persona: value("persona"),
            cwd: value("cwd"),
            preset: value("preset") || "standard",
            model: modelFrom(data),
          },
    );
  }
  return (
    <form onSubmit={send}>
      <div className="wb-form-intro">
        <span className="wb-form-symbol">
          <Glyph name={type === "bot" ? "bots" : "task"} size={24} />
        </span>
        <h2>{t(type === "task" ? "newTask" : "newBot")}</h2>
        <p>{t(type === "task" ? "createTaskHelp" : "createBotHelp")}</p>
      </div>
      {type === "task" ? (
        <>
          <Field label={t("owner")}>
            <select
              name="botId"
              required
              defaultValue={defaultBotId ?? snapshot?.primaryBotId}
            >
              {snapshot?.bots
                .filter((bot) => !bot.paused && !bot.archived)
                .map((bot) => (
                  <option key={bot.id} value={bot.id}>
                    {bot.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={t("taskTitle")}>
            <input
              name="title"
              required
              maxLength={120}
              data-initial-focus
              placeholder={t("taskTitlePlaceholder")}
            />
          </Field>
          <Field label={t("objective")}>
            <textarea
              name="objective"
              required
              maxLength={16000}
              rows={4}
              placeholder={t("taskObjectivePlaceholder")}
            />
          </Field>
          <Field label={t("criteria")}>
            <textarea
              name="criteria"
              required
              rows={3}
              placeholder={t("criteriaPlaceholder")}
            />
          </Field>
        </>
      ) : (
        <>
          <Field label={t("name")}>
            <input
              name="name"
              required
              maxLength={64}
              data-initial-focus
              placeholder={t("botNamePlaceholder")}
            />
          </Field>
          <Field label={t("persona")}>
            <textarea
              name="persona"
              rows={4}
              maxLength={8000}
              placeholder={t("personaPlaceholder")}
            />
          </Field>
          <Field label={t("cwd")}>
            <div className="wb-path-field">
              <Glyph name="folder" size={16} />
              <input name="cwd" required placeholder="/…" />
            </div>
          </Field>
          <details className="wb-advanced">
            <summary>{t("capabilitySettings")}</summary>
            <Field label={t("preset")}>
              <select name="preset" defaultValue="standard">
                {snapshot?.availablePresets.map((preset) => (
                  <option value={preset.id} key={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </Field>
            <ModelFields t={t} />
          </details>
        </>
      )}
      <div className="wb-actions wb-form-end">
        <button type="button" onClick={cancel}>
          {t("cancel")}
        </button>
        <button className="wb-primary" disabled={busy}>
          {t(type === "bot" ? "createAssistant" : "create")}
        </button>
      </div>
    </form>
  );
}
function Icon({ size }: PropsRuntime<"sidebar.panellist">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <path d="m8 9 2 2 5-5M8 16h8" />
    </svg>
  );
}
export async function apply(ctx: Context) {
  ctx.effect(
    () => ctx.locale.register("bot-workbench", { en, zh }),
    "workbench: dictionaries",
  );
  await ctx.effect(() => ctx.remote.$mount(REMOTE), "workbench: Remote");
  ctx.effect(() => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    return () => style.remove();
  }, "workbench: styles");
  const translate = (key: TextKey) => ctx.locale.bind("bot-workbench")(key);
  const remote = () => {
    const value = ctx.get("remote.botWorkbench");
    if (!value) throw new Error("Workbench connection is not ready");
    return value;
  };
  const api = {
    async load() {
      const r = await remote().snapshot();
      if (!r.ok) throw r.error;
      return r.value;
    },
    async command(c: Command) {
      const r = await remote().command(c);
      if (!r.ok) throw r.error;
      return r.value;
    },
  };
  ctx.effect(
    () =>
      ctx.slots.inject("main", () =>
        ctx.slots.register(
          {
            name: "main",
            key: "bot-workbench",
            locale: "bot-workbench",
            inject: () => ({
              api,
              translate,
              openSession: (id: string) =>
                ctx.uiWorkspace.openSession(id as SessionId),
            }),
          },
          WorkbenchPage,
        ),
      ),
    "workbench: page",
  );
  ctx.effect(
    () =>
      ctx.slots.inject("sidebar.panellist", () =>
        ctx.slots.register(
          {
            name: "sidebar.panellist",
            id: "bot-workbench",
            order: 21,
            locale: "bot-workbench",
            label: () => translate("title"),
          },
          Icon,
        ),
      ),
    "workbench: navigation",
  );
}
