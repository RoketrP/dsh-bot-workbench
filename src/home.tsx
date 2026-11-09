import { useRef, useState } from "react";
import { activeStates, type Bot, type Snapshot, type Task } from "./schema.ts";
import { Avatar, Glyph, State, type Translate } from "./ui.tsx";
type Props = {
  snapshot: Snapshot;
  t: Translate;
  busy: boolean;
  chat(
    id: string,
    prompt?: { text: string; operationId: string },
  ): Promise<boolean>;
  profile(id: string, tab?: "memory" | "profile" | "manage"): void;
  createBot(): void;
  createTask(id?: string): void;
  openTask(id: string): void;
  attention(kind: "review" | "uncertain" | "all"): void;
};
export function BotHome({
  snapshot,
  t,
  busy,
  chat,
  profile,
  createBot,
  createTask,
  openTask,
  attention,
}: Props) {
  const [heroId, setHero] = useState(""),
    [draft, setDraft] = useState(""),
    [archived, setArchived] = useState(false);
  const pending = useRef<{ text: string; botId: string; id: string }>();
  const available = snapshot.bots.filter((b) => !b.archived),
    bots = archived ? snapshot.bots.filter((b) => b.archived) : available;
  const primary =
    available.find((b) => b.id === (heroId || snapshot.primaryBotId)) ??
    available.find((b) => !b.paused) ??
    available[0];
  const review = snapshot.tasks.filter(
    (t) =>
      !t.archived &&
      t.runs.at(-1)?.state === "submitted" &&
      t.runs.at(-1)?.review === "pending",
  );
  const uncertain = snapshot.tasks.filter(
    (t) => !t.archived && t.runs.at(-1)?.state === "uncertain",
  );
  async function send() {
    if (!primary || !draft.trim() || busy) return;
    const text = draft.trim();
    if (pending.current?.text !== text || pending.current?.botId !== primary.id)
      pending.current = { text, botId: primary.id, id: crypto.randomUUID() };
    if (await chat(primary.id, { text, operationId: pending.current.id })) {
      setDraft("");
      pending.current = undefined;
    }
  }
  return (
    <div className="wb-home wb-enter">
      <header className="wb-page-heading">
        <div>
          <span className="wb-overline">{t("personalSpace")}</span>
          <h1>{t("homeHeading")}</h1>
          <p>{t("homeSubheading")}</p>
        </div>
        <button className="wb-primary" onClick={createBot}>
          <Glyph name="plus" size={16} />
          {t("newBot")}
        </button>
      </header>
      {primary ? (
        <section className="wb-conversation" aria-label={t("conversation")}>
          <div className="wb-conversation-head">
            <Avatar bot={primary} />
            <div>
              <label className="wb-visually-hidden" htmlFor="wb-hero-bot">
                {t("chooseAssistant")}
              </label>
              <select
                id="wb-hero-bot"
                value={primary.id}
                onChange={(e) => {
                  setHero(e.target.value);
                  setDraft("");
                  pending.current = undefined;
                }}
              >
                {available.map((b) => (
                  <option value={b.id} key={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <span>
                {primary.id === snapshot.primaryBotId
                  ? t("primary")
                  : t("readyForChat")}
              </span>
            </div>
            <button
              className="wb-icon-button"
              aria-label={`${t("profile")} · ${primary.name}`}
              onClick={() => profile(primary.id, "profile")}
            >
              <Glyph name="settings" />
            </button>
          </div>
          <form
            className="wb-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label className="wb-visually-hidden" htmlFor="wb-message">
              {t("messageToAssistant")}
            </label>
            <textarea
              id="wb-message"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={16000}
              placeholder={t("messagePlaceholder")}
              rows={3}
              disabled={primary.paused || busy}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <div className="wb-composer-bottom">
              <button
                className="wb-text-button"
                type="button"
                disabled={busy || primary.paused}
                onClick={() => {
                  void chat(primary.id);
                }}
              >
                <Glyph name="chat" size={15} />
                {t(primary.mainSessionId ? "continueChat" : "openChat")}
              </button>
              <button
                className="wb-send"
                aria-label={t("sendMessage")}
                disabled={busy || primary.paused || !draft.trim()}
              >
                <Glyph name="up" size={20} />
              </button>
            </div>
          </form>
          <div className="wb-suggestions">
            {(
              [
                "researchSuggestion",
                "outlineSuggestion",
                "writingSuggestion",
              ] as const
            ).map((key, i) => (
              <button
                key={key}
                disabled={primary.paused}
                onClick={() => {
                  setDraft(t(key));
                  document.getElementById("wb-message")?.focus();
                }}
              >
                <Glyph
                  name={(["search", "task", "memory"] as const)[i]!}
                  size={14}
                />
                {t(
                  (
                    [
                      "researchShortcut",
                      "outlineShortcut",
                      "writingShortcut",
                    ] as const
                  )[i]!,
                )}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="wb-welcome">
          <span className="wb-welcome-icon">
            <Glyph name="bots" size={32} />
          </span>
          <h2>{t("firstBotHeading")}</h2>
          <p>{t("firstBotHelp")}</p>
          <button className="wb-primary" onClick={createBot}>
            <Glyph name="plus" size={16} />
            {t("newBot")}
          </button>
        </section>
      )}
      {review.length || uncertain.length ? (
        <div className="wb-attention">
          {review.length ? (
            <button onClick={() => attention("review")}>
              <span className="wb-attention-icon">
                <Glyph name="check" size={16} />
              </span>
              <span>
                <strong>
                  {review.length} {t("resultsReady")}
                </strong>
                <small>{t("resultsReadyHelp")}</small>
              </span>
              <Glyph name="chevron" size={15} />
            </button>
          ) : null}
          {uncertain.length ? (
            <button
              className="is-warning"
              onClick={() => attention("uncertain")}
            >
              <span className="wb-attention-icon">
                <Glyph name="warning" size={16} />
              </span>
              <span>
                <strong>
                  {uncertain.length} {t("needReconciliation")}
                </strong>
                <small>{t("noAutomaticReplay")}</small>
              </span>
              <Glyph name="chevron" size={15} />
            </button>
          ) : null}
        </div>
      ) : null}
      <section className="wb-assistants">
        <div className="wb-section-title">
          <div>
            <h2>{t(archived ? "archivedBots" : "myAssistants")}</h2>
            <span>{bots.length}</span>
          </div>
          {snapshot.bots.some((b) => b.archived) ? (
            <button
              className="wb-text-button"
              onClick={() => setArchived((v) => !v)}
            >
              {t(archived ? "showActiveBots" : "archivedBots")}
            </button>
          ) : (
            <span className="wb-section-hint">{t("assistantSectionHint")}</span>
          )}
        </div>
        <div className="wb-bot-grid">
          {bots.map((bot) => (
            <BotCard
              key={bot.id}
              bot={bot}
              snapshot={snapshot}
              t={t}
              busy={busy}
              chat={chat}
              profile={profile}
              createTask={createTask}
            />
          ))}
          <button className="wb-add-bot" onClick={createBot}>
            <span>
              <Glyph name="plus" size={20} />
            </span>
            <strong>{t("newBot")}</strong>
            <small>{t("newBotCardHint")}</small>
          </button>
        </div>
      </section>
      {snapshot.tasks.some((task) => !task.archived) ? (
        <section className="wb-recent">
          <div className="wb-section-title">
            <h2>{t("recentWork")}</h2>
            <button className="wb-text-button" onClick={() => attention("all")}>
              {t("viewTasks")}
              <Glyph name="arrow" size={14} />
            </button>
          </div>
          {snapshot.tasks
            .filter((task) => !task.archived)
            .slice(0, 3)
            .map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                snapshot={snapshot}
                t={t}
                open={() => openTask(task.id)}
              />
            ))}
        </section>
      ) : null}
    </div>
  );
}
function BotCard({
  bot,
  snapshot,
  t,
  busy,
  chat,
  profile,
  createTask,
}: Pick<
  Props,
  "snapshot" | "t" | "busy" | "chat" | "profile" | "createTask"
> & { bot: Bot }) {
  const tasks = snapshot.tasks.filter(
      (task) => task.botId === bot.id && !task.archived,
    ),
    working = tasks.some((task) => {
      const run = task.runs.at(-1);
      return !!run && activeStates.has(run.state);
    });
  const memory = snapshot.memories.filter(
    (m) => m.botId === bot.id && m.state === "confirmed",
  ).length;
  return (
    <article
      className={`wb-bot-card${bot.paused || bot.archived ? " is-paused" : ""}`}
    >
      <div className="wb-bot-card-head">
        <Avatar bot={bot} />
        <button
          className="wb-icon-button"
          aria-label={`${t("profile")} · ${bot.name}`}
          onClick={() => profile(bot.id, "profile")}
        >
          <Glyph name="more" />
        </button>
      </div>
      <div className="wb-bot-name">
        <h3>{bot.name}</h3>
        {bot.id === snapshot.primaryBotId ? (
          <span title={t("primary")}>
            <Glyph name="pin" size={13} />
          </span>
        ) : null}
      </div>
      <p className="wb-bot-description">
        {bot.description || t("noPersonaYet")}
      </p>
      <span className={`wb-bot-status${working ? " is-working" : ""}`}>
        <i />
        {t(
          bot.archived
            ? "archived"
            : bot.paused
              ? "paused"
              : working
                ? "running"
                : "standingBy",
        )}
      </span>
      <div className="wb-bot-card-bottom">
        <button
          className="wb-text-button"
          onClick={() => profile(bot.id, "memory")}
        >
          <Glyph name="memory" size={14} />
          {t("memoryShort")}
          <span>{memory}</span>
        </button>
        <button
          className="wb-text-button"
          disabled={busy || bot.paused || bot.archived}
          aria-label={`${t("assignTask")} · ${bot.name}`}
          onClick={() => createTask(bot.id)}
        >
          <Glyph name="task" size={15} />
        </button>
        <button
          className="wb-chat-link"
          disabled={busy || bot.paused || bot.archived}
          onClick={() => {
            void chat(bot.id);
          }}
        >
          {t("startChat")}
          <Glyph name="arrow" size={15} />
        </button>
      </div>
    </article>
  );
}
export function TaskRow({
  task,
  snapshot,
  t,
  open,
}: {
  task: Task;
  snapshot: Snapshot;
  t: Translate;
  open(): void;
}) {
  const bot = snapshot.bots.find((b) => b.id === task.botId);
  return (
    <button className="wb-task-row" onClick={open}>
      <span className="wb-task-symbol">
        <Glyph name="task" size={17} />
      </span>
      <span className="wb-task-row-copy">
        <strong>{task.title}</strong>
        <small>
          {bot?.name ?? t("owner")} ·{" "}
          {new Date(task.updatedAt).toLocaleDateString()}
        </small>
      </span>
      <State task={task} t={t} />
      <Glyph name="chevron" size={15} />
    </button>
  );
}
