import type { ReactNode } from "react";
import type { Bot, Command, Task } from "./schema.ts";
import type { TextKey } from "./locales.ts";
export type Translate = (key: TextKey) => string;
export type CommandCall = (c: Command) => Promise<boolean | undefined>;
const paths = {
  chat: "M7 18l-4 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7Z M7 8h10M7 12h6",
  bots: "M8 3h8M12 3v3M5 6h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2ZM8 11v2M16 11v2M9 16h6",
  task: "M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3M9 3h6v4H9ZM8 13l2 2 5-5M8 18h8",
  clock: "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14M13 6l6 6-6 6",
  up: "M12 19V5M6 11l6-6 6 6",
  chevron: "m9 5 7 7-7 7",
  close: "m6 6 12 12M6 18 18 6",
  settings: "M4 7h9M17 7h3M4 17h3M11 17h9M13 4v6M7 14v6",
  memory:
    "M5 4h13a2 2 0 0 1 2 2v15H7a3 3 0 0 1-3-3V5a1 1 0 0 1 1-1ZM4 17h16M9 8h6M9 12h4",
  check: "m5 12 4 4L19 6",
  warning:
    "M12 8v5M12 17h.01M10.3 3.5 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.5a2 2 0 0 0-3.4 0Z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  download: "M12 3v12m-5-5 5 5 5-5M5 15v5h14v-5",
  upload: "M12 16V4m-5 5 5-5 5 5M5 16v4h14v-4",
  folder: "M3 7V5h6l2 3h10v12H3Z",
  pin: "m8 3 8 0-1 6 4 4H5l4-4-1-6ZM12 13v8",
} as const;
export type IconName = keyof typeof paths;
export function Glyph({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function Avatar({
  bot,
  large = false,
}: {
  bot: Pick<Bot, "id" | "name">;
  large?: boolean;
}) {
  const tone = ["blue", "teal", "ochre", "rose"][
    Array.from(bot.id).reduce((n, c) => n + c.charCodeAt(0), 0) % 4
  ];
  return (
    <span
      className={`wb-avatar tone-${tone}${large ? " is-large" : ""}`}
      aria-hidden="true"
    >
      {Array.from(bot.name.trim())[0]?.toLocaleUpperCase()}
    </span>
  );
}
export function State({ task, t }: { task: Task; t: Translate }) {
  const r = task.runs.at(-1);
  const state = task.archived
    ? "archived"
    : task.paused
      ? "paused"
      : r?.state === "submitted"
        ? r.review
        : (r?.state ?? "draft");
  return (
    <span className={`wb-state state-${state}`}>
      <i />
      {t(state as TextKey)}
    </span>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="wb-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
