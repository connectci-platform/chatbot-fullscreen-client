import type { Message } from "@langchain/langgraph-sdk";

export interface Preview {
  previewId: string;
  tool: string;
  data: Record<string, unknown>;
  /** Nothing would change, so there is nothing to confirm. */
  noChanges: boolean;
}

export interface ConfirmBlock {
  type: "confirm";
  preview_ids: string[];
}

const PREVIEW_ID = /^[0-9a-f]{32}$/;

/** The most ids the agent accepts in one confirm. */
export const MAX_CONFIRM_IDS = 10;

export function isPreviewId(value: unknown): value is string {
  return typeof value === "string" && PREVIEW_ID.test(value);
}

export const PREVIEW_TITLES: Record<string, string> = {
  register_for_event: "Register for this event",
  cancel_registration: "Cancel your registration",
  create_event: "Create this event",
  update_event: "Update this event",
  delete_event: "Cancel this event series",
  restore_event: "Restore this event",
  send_for_review: "Send this event for review",
  cancel_occurrence: "Cancel this occurrence",
  restore_occurrence: "Restore this occurrence",
  edit_occurrence: "Edit this occurrence",
  add_occurrence: "Add an occurrence",
  create_announcement: "Post this announcement",
  update_announcement: "Update this announcement",
  delete_announcement: "Delete this announcement",
  create_support_ticket: "Open this support ticket",
  create_login_ticket: "Open this login help ticket",
  report_security_incident: "Report this security incident",
};

/** "some_tool" becomes "Some tool". */
export function previewTitle(tool: string): string {
  if (PREVIEW_TITLES[tool]) return PREVIEW_TITLES[tool];
  const words = tool.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Change";
}

export function confirmBlock(ids: string[]): ConfirmBlock {
  return { type: "confirm", preview_ids: ids };
}

function parse(content: Message["content"]): Record<string, unknown> | null {
  if (typeof content !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Whether the card's Confirm covers this preview. A change with no preview id,
 * or one the card shows only as a note, isn't in what the card sends.
 */
export function cardConfirms(
  previewId: string | undefined,
  previews: Preview[],
): boolean {
  return (
    !!previewId &&
    previews.some((p) => p.previewId === previewId && !p.noChanges)
  );
}

/**
 * A human message that answers a card: a click on Confirm, or Cancel. A click
 * carries a confirm block as sent; the agent stores it with the ids moved to
 * additional_kwargs.confirm, which is how it reads back from the thread.
 */
function endsCard(message: Message): boolean {
  const { content } = message;
  const stored = (
    message.additional_kwargs as { confirm?: unknown } | undefined
  )?.confirm;
  if (Array.isArray(stored) && stored.length > 0) return true;
  if (
    typeof content !== "string" &&
    content.some((b) => (b.type as string) === "confirm")
  )
    return true;
  const text =
    typeof content === "string"
      ? content
      : content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[.!]+$/, "") === "cancel"
  );
}

/**
 * Write-tool previews the user hasn't answered yet: those of the newest turn
 * that staged any, in order. They stay through typed replies, which can't
 * confirm them, and end when the user clicks Confirm or Cancel, or a later
 * turn stages its own. The agent keeps a preview claimable for a day; past
 * that, Confirm tells the user it expired.
 */
export function pendingPreviews(messages: Message[]): Preview[] {
  let previews: Preview[] = [];
  let newTurn = true;
  for (const message of messages) {
    if (message.type === "human") {
      if (endsCard(message)) previews = [];
      newTurn = true;
      continue;
    }
    const preview = asPreview(message);
    if (!preview) continue;
    if (newTurn) previews = [];
    newTurn = false;
    // Identical calls in one step share an id; the card shows it once.
    if (!previews.some((p) => p.previewId === preview.previewId))
      previews.push(preview);
  }
  return previews;
}

function asPreview(message: Message): Preview | null {
  if (message.type !== "tool") return null;
  const result = parse(message.content);
  const id = result?.preview_id;
  if (
    result?.status !== "preview" ||
    result.executed !== false ||
    !isPreviewId(id) ||
    !Object.hasOwn(PREVIEW_TITLES, message.name ?? "")
  )
    return null;
  const data = result.data;
  return {
    noChanges:
      result.no_changes === true ||
      (!!data &&
        typeof data === "object" &&
        (data as Record<string, unknown>).no_changes === true),
    previewId: id,
    tool: message.name ?? "",
    data:
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {},
  };
}

export interface PreviewRow {
  label: string;
  /** Plain text. Long text is shown in full. */
  value: string;
}

const FLAG_NOTES: Record<string, string> = {
  detail_unavailable: "Current details couldn't be loaded.",
  current_state_unavailable: "The current state couldn't be loaded.",
  registrants_notified_on_commit:
    "Registrants will be emailed about this change.",
  registrants_may_be_notified: "Registrants may be emailed about this change.",
  dates_incomplete: "Not all of this series' dates could be loaded.",
  no_changes: "This doesn't change anything.",
};

const HIDDEN = new Set(["preview_id", "status", "action"]);

function humanize(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  nbsp: " ",
};

/**
 * HTML from a body field as the text a reader sees. A link keeps its target
 * and an image its source, since the card is what the user approves.
 */
export function htmlText(html: string): string {
  if (!/<\/?[a-z][^>]*>/i.test(html)) return html;
  const attr = (tag: string, name: string) =>
    new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i")
      .exec(tag)
      ?.slice(1)
      .find((v) => v !== undefined);
  return html
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (tag, text: string) => {
      const href = attr(tag, "href");
      return href ? `${text} (${href})` : text;
    })
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const src = attr(tag, "src");
      return src ? `[image: ${src}]` : "[image]";
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|ul|ol|blockquote)>/gi, "\n\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e])
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function scalar(value: unknown): string {
  if (value === null || value === undefined || value === "") return "none";
  if (typeof value === "string") return htmlText(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) {
    return value.map(scalar).join(", ") || "none";
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function isChange(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).field === "string"
  );
}

function changeRow(change: Record<string, unknown>): PreviewRow {
  const old = change.old_unavailable === true ? "unknown" : scalar(change.old);
  return {
    label: humanize(change.field as string),
    value: `${old} → ${scalar(change.new)}`,
  };
}

/** Flags turned into short sentences, plus any rows for the rest of data. */
export function previewDetails(data: Record<string, unknown>): {
  notes: string[];
  rows: PreviewRow[];
} {
  const notes: string[] = [];
  const rows: PreviewRow[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (HIDDEN.has(key)) continue;
    // A time the user can read stands in for its UTC form: start_local for
    // start_date, shown as "Start".
    const local = key.match(/^(.*)_local$/)?.[1];
    if (local && typeof value === "string" && value) {
      rows.push({ label: humanize(local), value });
      continue;
    }
    const dated = key.match(/^(.*)_date$/)?.[1];
    if (
      dated &&
      typeof data[`${dated}_local`] === "string" &&
      data[`${dated}_local`]
    )
      continue;
    if (key in FLAG_NOTES) {
      if (value === true) notes.push(FLAG_NOTES[key]);
      continue;
    }
    if (Array.isArray(value) && value.length > 0 && value.every(isChange)) {
      rows.push(...value.map(changeRow));
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [inner, innerValue] of Object.entries(value)) {
        rows.push({
          label: `${humanize(key)} ${inner.replace(/[_-]+/g, " ")}`,
          value: scalar(innerValue),
        });
      }
    } else {
      rows.push({ label: humanize(key), value: scalar(value) });
    }
  }
  return { notes, rows };
}
