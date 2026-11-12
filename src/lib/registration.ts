import type { Message } from "@langchain/langgraph-sdk";

const REGISTER_TOOL = "register_for_event";
const CANCEL_TOOL = "cancel_registration";
const EVENT_TOOLS = new Set(["search_events", "get_event"]);

export type RegistrationStatus =
  "preview" | "registered" | "waitlisted" | "already_registered";

export interface RegistrationEvent {
  title: string;
  start?: string;
  end?: string;
  location?: string;
  url?: string;
  capacity?: number;
}

export interface Registration {
  /** Changes when the panel has something new to show. */
  key: string;
  status: RegistrationStatus;
  outcome: "seat" | "waitlist" | null;
  /** Null when the event has no limit or the result didn't say. */
  seatsRemaining: number | null;
  event: RegistrationEvent | null;
  /** Whether a preview can still be confirmed from the panel. */
  actionable: boolean;
  /** The agent's id for this preview, when it stamps one. */
  previewId?: string;
}

const STATUSES = new Set<string>([
  "preview",
  "registered",
  "waitlisted",
  "already_registered",
]);

function parseJson(
  content: Message["content"],
): Record<string, unknown> | null {
  if (typeof content !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function eventIdFor(messages: Message[], toolCallId: string): string | null {
  for (const message of messages) {
    if (message.type !== "ai") continue;
    const call = message.tool_calls?.find((c) => c.id === toolCallId);
    const id = call?.args?.eventinstance_id;
    if (id !== undefined && id !== null) return String(id);
  }
  return null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toEvent(item: Record<string, unknown>): RegistrationEvent | null {
  const title = text(item.title);
  if (!title) return null;
  const registration = item.access_registration as
    Record<string, unknown> | undefined;
  return {
    title,
    start: text(item.start_date),
    end: text(item.end_date),
    location: text(item.location),
    url: text(item.url),
    capacity: count(registration?.capacity) ?? undefined,
  };
}

/** The newest details the conversation holds for this event. */
function findEvent(
  messages: Message[],
  eventId: string,
): RegistrationEvent | null {
  for (const message of [...messages].reverse()) {
    if (message.type !== "tool" || !EVENT_TOOLS.has(message.name ?? "")) {
      continue;
    }
    const result = parseJson(message.content);
    if (!result) continue;
    const items = Array.isArray(result.items) ? result.items : [result];
    for (const item of items as Record<string, unknown>[]) {
      if (String(item?.id) === eventId) {
        const event = toEvent(item);
        if (event) return event;
      }
    }
  }
  return null;
}

/**
 * The conversation's latest registration step, read from the tool results it
 * already holds, so the panel comes back when a thread is reopened. A refused
 * or failed call adds no step, but it does end a preview: the conversation has
 * moved on, and "yes" could now mean something else.
 */
export function latestRegistration(messages: Message[]): Registration | null {
  let actionable = true;
  for (const message of [...messages].reverse()) {
    if (message.type === "human") actionable = false;
    if (message.type !== "tool") continue;
    if (message.name === CANCEL_TOOL) {
      if (parseJson(message.content)?.status === "cancelled") return null;
      continue;
    }
    if (message.name !== REGISTER_TOOL) continue;

    const result = parseJson(message.content);
    const status = result?.status;
    if (typeof status !== "string" || !STATUSES.has(status)) {
      actionable = false;
      continue;
    }

    const eventId = eventIdFor(messages, message.tool_call_id);
    const data = result?.data as Record<string, unknown> | undefined;
    const outcome = data?.outcome_if_confirmed;
    return {
      key: message.tool_call_id,
      status: status as RegistrationStatus,
      outcome: outcome === "seat" || outcome === "waitlist" ? outcome : null,
      seatsRemaining: count(data?.seats_remaining),
      event: eventId ? findEvent(messages, eventId) : null,
      actionable: status === "preview" && actionable,
      previewId:
        typeof result?.preview_id === "string" ? result.preview_id : undefined,
    };
  }
  return null;
}

/** "39 of 40 seats left", or null when the count isn't known. */
export function seatsText(registration: Registration): string | null {
  const left = registration.seatsRemaining;
  if (left === null) return null;
  const capacity = registration.event?.capacity;
  if (capacity) return `${left} of ${capacity} seats left`;
  return left === 1 ? "1 seat left" : `${left} seats left`;
}

/** The chat message Confirm sends, naming the event it applies to. */
export function confirmMessage(registration: Registration): string {
  const title = registration.event?.title;
  return title
    ? `Yes, please confirm my registration for ${title}.`
    : "Yes, please confirm.";
}

/** "November 20, 2026, 1:00 PM – 3:00 PM EST" in the reader's time zone. */
export function formatEventTime(
  start?: string,
  end?: string,
  timeZone?: string,
): string | null {
  if (!start) return null;
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return null;
  const date = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone,
  }).format(startDate);
  const time = (value: Date, zone: boolean) =>
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
      timeZoneName: zone ? "short" : undefined,
    }).format(value);
  const endDate = end ? new Date(end) : null;
  if (!endDate || Number.isNaN(endDate.getTime())) {
    return `${date}, ${time(startDate, true)}`;
  }
  return `${date}, ${time(startDate, false)} – ${time(endDate, true)}`;
}
