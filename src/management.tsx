import { useRef, useState, type FormEvent } from "react";
import {
  transferSchema,
  type Bot,
  type Snapshot,
  type Transfer,
} from "./schema.ts";
import {
  Avatar,
  Field,
  Glyph,
  type Translate,
  type CommandCall,
} from "./ui.tsx";
export { Field } from "./ui.tsx";
export type { Translate } from "./ui.tsx";
export function ModelFields({ bot, t }: { bot?: Bot; t: Translate }) {
  return (
    <details className="wb-advanced">
      <summary>{t("advancedModel")}</summary>
      <p>{t("modelHelp")}</p>
      <div className="wb-form-grid">
        <Field label={t("provider")}>
          <input
            name="provider"
            defaultValue={bot?.model?.provider ?? ""}
            maxLength={200}
          />
        </Field>
        <Field label={t("model")}>
          <input
            name="model"
            defaultValue={bot?.model?.model ?? ""}
            maxLength={200}
          />
        </Field>
      </div>
    </details>
  );
}
export function modelFrom(data: FormData) {
  const provider = String(data.get("provider") ?? "").trim(),
    model = String(data.get("model") ?? "").trim();
  return !provider && !model ? undefined : { provider, model };
}
export function BotPanel({
  snapshot,
  t,
  busy,
  command,
  close,
  chat,
  initialBotId,
  initialTab = "memory",
}: {
  snapshot: Snapshot;
  t: Translate;
  busy: boolean;
  command: CommandCall;
  close(): void;
  chat(id: string): Promise<unknown>;
  initialBotId?: string;
  initialTab?: "memory" | "profile" | "manage";
}) {
  const [tab, setTab] = useState(initialTab),
    [query, setQuery] = useState(""),
    [content, setContent] = useState(""),
    [adding, setAdding] = useState(false);
  const bot =
    snapshot.bots.find(
      (b) => b.id === (initialBotId ?? snapshot.primaryBotId),
    ) ?? snapshot.bots[0];
  const editRevision = useRef(bot?.revision ?? 0);
  if (!bot) return <p>{t("noBots")}</p>;
  const rows = snapshot.memories.filter(
    (m) =>
      m.botId === bot.id &&
      m.content.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  async function edit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!bot) return;
    const data = new FormData(e.currentTarget);
    if (
      await command({
        action: "editBot",
        botId: bot.id,
        revision: editRevision.current,
        name: String(data.get("name")),
        persona: String(data.get("persona")),
        cwd: String(data.get("cwd")),
        model: modelFrom(data),
      })
    )
      editRevision.current++;
  }
  return (
    <div className="wb-bot-profile">
      <div className="wb-profile-identity">
        <Avatar bot={bot} large />
        <div>
          <h2>{bot.name}</h2>
          <p>
            {bot.id === snapshot.primaryBotId
              ? t("primary")
              : t("personalAssistant")}
          </p>
        </div>
        <button
          className="wb-secondary"
          disabled={busy || bot.paused || bot.archived}
          onClick={() => {
            void chat(bot.id);
          }}
        >
          <Glyph name="chat" size={15} />
          {t("startChat")}
        </button>
      </div>
      <nav className="wb-tabs" aria-label={t("profile")} role="tablist">
        {(["memory", "profile", "manage"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "is-active" : ""}
            onClick={() => {
              if (key === "profile") editRevision.current = bot.revision ?? 0;
              setTab(key);
            }}
          >
            {t(key)}
            {key === "memory" && rows.length ? (
              <span>{rows.length}</span>
            ) : null}
          </button>
        ))}
      </nav>
      {tab === "memory" ? (
        <div className="wb-profile-body">
          <div className="wb-memory-toolbar">
            <label className="wb-search">
              <Glyph name="search" size={16} />
              <input
                type="search"
                aria-label={t("searchMemory")}
                placeholder={t("searchMemory")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button
              className="wb-secondary"
              onClick={() => setAdding((v) => !v)}
            >
              <Glyph name="plus" size={15} />
              {t("addMemory")}
            </button>
          </div>
          {adding ? (
            <div className="wb-memory-editor">
              <Field label={t("memoryContent")}>
                <textarea
                  autoFocus
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={t("memoryPlaceholder")}
                  maxLength={4000}
                  rows={3}
                />
              </Field>
              <div className="wb-actions">
                <button onClick={() => setAdding(false)}>{t("cancel")}</button>
                <button
                  className="wb-primary"
                  disabled={busy || !content.trim()}
                  onClick={() => {
                    void command({
                      action: "memoryAdd",
                      botId: bot.id,
                      content,
                    }).then((ok) => {
                      if (ok) {
                        setContent("");
                        setAdding(false);
                      }
                    });
                  }}
                >
                  {t("save")}
                </button>
              </div>
            </div>
          ) : null}
          <div className="wb-memories">
            {rows.length ? (
              rows.map((m) => (
                <MemoryRow
                  key={m.id}
                  memory={m}
                  snapshot={snapshot}
                  t={t}
                  busy={busy}
                  command={command}
                />
              ))
            ) : (
              <div className="wb-small-empty">
                <Glyph name="memory" size={26} />
                <h3>{t(query ? "noMatchingMemory" : "memoryEmpty")}</h3>
                <p>{t(query ? "tryAnotherSearch" : "memoryEmptyHelp")}</p>
              </div>
            )}
          </div>
          <p className="wb-footnote">{t("memoryHelp")}</p>
        </div>
      ) : tab === "profile" ? (
        <form
          className="wb-profile-body"
          onSubmit={(e) => {
            void edit(e);
          }}
        >
          <Field label={t("name")}>
            <input
              name="name"
              defaultValue={bot.name}
              maxLength={64}
              required
            />
          </Field>
          <Field label={t("persona")}>
            <textarea
              name="persona"
              defaultValue={bot.persona}
              maxLength={8000}
              rows={5}
              placeholder={t("personaPlaceholder")}
            />
          </Field>
          <Field label={t("cwd")}>
            <div className="wb-path-field">
              <Glyph name="folder" size={16} />
              <input name="cwd" defaultValue={bot.defaultCwd} required />
            </div>
          </Field>
          <ModelFields bot={bot} t={t} />
          <p className="wb-footnote">{t("editBotHelp")}</p>
          <div className="wb-actions wb-form-end">
            <button type="button" onClick={close}>
              {t("cancel")}
            </button>
            <button className="wb-primary" disabled={busy}>
              {t("saveProfile")}
            </button>
          </div>
        </form>
      ) : (
        <div className="wb-profile-body">
          <div className="wb-setting-row">
            <div>
              <strong>{t("primary")}</strong>
              <p>{t("primaryHelp")}</p>
            </div>
            <button
              disabled={
                busy || bot.archived || snapshot.primaryBotId === bot.id
              }
              onClick={() => {
                void command({ action: "setPrimary", botId: bot.id });
              }}
            >
              {t(
                snapshot.primaryBotId === bot.id
                  ? "alreadyPrimary"
                  : "setPrimary",
              )}
            </button>
          </div>
          <div className="wb-setting-row">
            <div>
              <strong>{t("pauseBot")}</strong>
              <p>{t("pauseBotHelp")}</p>
            </div>
            <button
              disabled={busy}
              onClick={() => {
                void command({
                  action: "botState",
                  botId: bot.id,
                  revision: bot.revision ?? 0,
                  paused: !bot.paused,
                  archived: bot.archived,
                });
              }}
            >
              {t(bot.paused ? "resumeBot" : "pauseBot")}
            </button>
          </div>
          <div className="wb-setting-row">
            <div>
              <strong>{t("archiveBot")}</strong>
              <p>{t("archiveBotHelp")}</p>
            </div>
            <button
              disabled={busy}
              onClick={() => {
                void command({
                  action: "botState",
                  botId: bot.id,
                  revision: bot.revision ?? 0,
                  paused: !bot.archived,
                  archived: !bot.archived,
                });
              }}
            >
              {t(bot.archived ? "restore" : "archiveBot")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function MemoryRow({
  memory: m,
  snapshot,
  t,
  busy,
  command,
}: {
  memory: Snapshot["memories"][number];
  snapshot: Snapshot;
  t: Translate;
  busy: boolean;
  command: CommandCall;
}) {
  const [editing, setEditing] = useState(false),
    [sharing, setSharing] = useState(false),
    [text, setText] = useState(m.content),
    [original, setOriginal] = useState(m.content),
    [target, setTarget] = useState("");
  return (
    <article className="wb-memory-row">
      <div className="wb-memory-heading">
        <span
          className={`wb-memory-state${m.state === "candidate" ? " is-candidate" : ""}`}
        >
          <i />
          {t(m.state)}
        </span>
        <time>{new Date(m.updatedAt ?? m.createdAt).toLocaleDateString()}</time>
        <details className="wb-overflow-menu">
          <summary aria-label={t("memoryActions")}>
            <Glyph name="more" size={17} />
          </summary>
          <div>
            <button
              onClick={(e) => {
                setEditing(true);
                (
                  e.currentTarget.closest("details") as HTMLDetailsElement
                ).open = false;
                setText(m.content);
                setOriginal(m.content);
              }}
            >
              {t("edit")}
            </button>
            <button
              onClick={(e) => {
                setSharing((v) => !v);
                (
                  e.currentTarget.closest("details") as HTMLDetailsElement
                ).open = false;
              }}
            >
              {t("share")}
            </button>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    `${t("confirmForget")}\n\n${m.content}\n\n${t("memoryHelp")}`,
                  )
                )
                  void command({ action: "memoryForget", memoryId: m.id });
              }}
            >
              {t("forget")}
            </button>
          </div>
        </details>
      </div>
      {editing ? (
        <div className="wb-memory-editor">
          <Field label={t("memoryContent")}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={4000}
            />
          </Field>
          <div className="wb-actions">
            <button onClick={() => setEditing(false)}>{t("cancel")}</button>
            <button
              className="wb-primary"
              disabled={busy || !text.trim() || text === original}
              onClick={() => {
                void command({
                  action: "memoryEdit",
                  memoryId: m.id,
                  previous: original,
                  content: text,
                }).then((ok) => {
                  if (ok) setEditing(false);
                });
              }}
            >
              {t("save")}
            </button>
          </div>
        </div>
      ) : (
        <p>{m.content}</p>
      )}
      {m.state === "candidate" ? (
        <button
          className="wb-text-button"
          disabled={busy}
          onClick={() => {
            void command({ action: "memoryConfirm", memoryId: m.id });
          }}
        >
          <Glyph name="check" size={14} />
          {t("confirm")}
        </button>
      ) : null}
      {sharing ? (
        <div className="wb-share-preview">
          <p>{t("shareHelp")}</p>
          <Field label={t("shareTo")}>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">{t("chooseAssistant")}</option>
              {snapshot.bots
                .filter((b) => b.id !== m.botId && !b.archived)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </Field>
          <button
            disabled={busy || !target}
            onClick={() => {
              void command({
                action: "memoryShare",
                memoryId: m.id,
                botId: target,
              }).then((ok) => {
                if (ok) setSharing(false);
              });
            }}
          >
            {t("share")}
          </button>
        </div>
      ) : null}
    </article>
  );
}
export function ImportPanel({
  t,
  busy,
  command,
  close,
}: {
  t: Translate;
  busy: boolean;
  command: CommandCall;
  close(): void;
}) {
  const [data, setData] = useState<Transfer>(),
    [error, setError] = useState("");
  const operationId = useRef(crypto.randomUUID());
  return (
    <div>
      <h2>{t("importRecords")}</h2>
      <p>{t("importHelp")}</p>
      <Field label={t("chooseFile")}>
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setData(undefined);
            void (async () => {
              try {
                if (f.size > 2_000_000) throw new Error("Import limit: 2 MB");
                const value = transferSchema.parse(JSON.parse(await f.text()));
                setData(value);
                setError("");
                operationId.current = crypto.randomUUID();
              } catch (e) {
                setError(String(e));
              }
            })();
          }}
        />
      </Field>
      {error ? <p role="alert">{error}</p> : null}
      {data ? (
        <div>
          <p>
            {data.bots.length} {t("botCount")} · {data.memories.length}{" "}
            {t("memoryCount")} · {data.tasks.length} {t("taskCount")}
          </p>
          {data.bots.map((b) => (
            <p key={b.id}>
              <strong>{b.name}</strong>
              <br />
              <code>{b.defaultCwd}</code>
            </p>
          ))}
        </div>
      ) : null}
      <div className="wb-actions">
        <button onClick={close}>{t("cancel")}</button>
        <button
          disabled={busy || !data}
          onClick={() => {
            if (data)
              void command({
                action: "importTemplates",
                operationId: operationId.current,
                data,
              }).then((ok) => {
                if (ok) close();
              });
          }}
        >
          {t("confirmImport")}
        </button>
      </div>
    </div>
  );
}
