import { fireEvent, render, screen } from "@testing-library/react";
import type { Message } from "@langchain/langgraph-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmMessage, type Registration } from "@/lib/registration";
import { useStreamContext } from "@/providers/Stream";
import {
  ArtifactContent,
  ArtifactProvider,
  ArtifactTitle,
  useArtifactOpen,
} from "./artifact";
import { RegistrationDetails, RegistrationPanel } from "./registration-panel";

vi.mock("@/providers/Stream", () => ({ useStreamContext: vi.fn() }));

const preview: Registration = {
  key: "9372:preview",
  status: "preview",
  outcome: "seat",
  seatsRemaining: null,
  actionable: true,
  event: {
    title: "Introduction to GPU Programming",
    start: "2026-11-20T18:00:00Z",
    end: "2026-11-20T20:00:00Z",
    location: "Online",
    url: "https://support.access-ci.org/events/9372",
  },
};

function show(registration: Registration, busy = false) {
  const onConfirm = vi.fn();
  render(
    <RegistrationDetails
      registration={registration}
      busy={busy}
      onConfirm={onConfirm}
      timeZone="America/New_York"
    />,
  );
  return onConfirm;
}

describe("RegistrationDetails", () => {
  it("shows what would be submitted, and that nothing has happened yet", () => {
    show(preview);

    expect(screen.getByText("Not registered yet")).toBeTruthy();
    expect(screen.getByText("Introduction to GPU Programming")).toBeTruthy();
    expect(
      screen.getByText("November 20, 2026, 1:00 PM – 3:00 PM EST"),
    ).toBeTruthy();
    expect(screen.getByText("Online")).toBeTruthy();
    expect(screen.getByText("A seat is available")).toBeTruthy();
    expect(
      screen.getByText(
        "The organizer reviews each registration. You'll get an email once you're approved.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("Nothing is submitted until you confirm."),
    ).toBeTruthy();
  });

  it("confirms through the callback", () => {
    const onConfirm = show(preview);

    fireEvent.click(
      screen.getByRole("button", { name: "Confirm registration" }),
    );

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("can't be confirmed while the assistant is working", () => {
    show(preview, true);

    const button = screen.getByRole("button", {
      name: "Confirm registration",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("shows the seats left when it knows them", () => {
    show({
      ...preview,
      seatsRemaining: 39,
      event: { title: "Workshop", capacity: 40 },
    });

    expect(screen.getByText("39 of 40 seats left")).toBeTruthy();
  });

  it("offers no button once the preview is out of date", () => {
    show({ ...preview, actionable: false });

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("A seat is available")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "Nothing has been submitted.",
    );
  });

  it("says it's checking, not that nothing was submitted, while a reply runs", () => {
    show({ ...preview, actionable: false }, true);

    const status = screen.getByRole("status").textContent;
    expect(status).toContain("Checking with the assistant");
    expect(status).not.toContain("Nothing has been submitted");
  });

  it("doesn't claim a seat when the outcome is unknown", () => {
    show({ ...preview, outcome: null });

    expect(screen.queryByText("A seat is available")).toBeNull();
    expect(screen.getByText("Ready to submit")).toBeTruthy();
  });

  it("names the event in the confirmation message", () => {
    expect(confirmMessage(preview)).toBe(
      "Yes, please confirm my registration for Introduction to GPU Programming.",
    );
    expect(confirmMessage({ ...preview, event: null })).toBe(
      "Yes, please confirm.",
    );
  });

  it("moves focus to the heading when Confirm goes away", () => {
    const props = { busy: false, onConfirm: vi.fn() };
    const { rerender } = render(
      <RegistrationDetails
        registration={preview}
        {...props}
      />,
    );

    rerender(
      <RegistrationDetails
        registration={{ ...preview, status: "registered" }}
        {...props}
      />,
    );

    expect(document.activeElement?.tagName).toBe("H2");
  });

  it("offers the waitlist when the event is full", () => {
    show({ ...preview, outcome: "waitlist" });

    expect(screen.getByText("This event is full")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join waitlist" })).toBeTruthy();
  });

  it("shows a finished registration with no button", () => {
    show({ ...preview, status: "registered", outcome: null });

    expect(screen.getByText("Awaiting approval")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Registration submitted",
    );
    expect(screen.getByRole("status").textContent).not.toContain(
      "You are registered",
    );
    expect(
      screen.getByText("○ The organizer reviews your registration"),
    ).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "View the event page" })
        .getAttribute("href"),
    ).toBe(preview.event?.url);
  });

  it("says so when the person is on the waitlist", () => {
    show({ ...preview, status: "waitlisted", outcome: null });

    expect(screen.getByRole("status").textContent).toContain(
      "Added to the waitlist",
    );
    expect(
      screen.getByText("○ You get an email if you're approved"),
    ).toBeTruthy();
    expect(screen.queryByText(/confirmation email/)).toBeNull();
  });

  it("still works when the event's details aren't in the conversation", () => {
    show({ ...preview, event: null });

    expect(screen.getByText("Event registration")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Confirm registration" }),
    ).toBeTruthy();
  });

  it("leaves out a link and rows it has no data for", () => {
    show({
      ...preview,
      status: "already_registered",
      outcome: null,
      event: { title: "Workshop" },
    });

    expect(screen.getByRole("status").textContent).toContain(
      "You've already registered for this event",
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText("When")).toBeNull();
    expect(screen.queryByText("Where")).toBeNull();
  });
});

function toolMessages(status: string, callId = "c1"): Message[] {
  return [
    {
      type: "ai",
      content: "",
      tool_calls: [
        {
          id: callId,
          name: "register_for_event",
          args: { eventinstance_id: "9372" },
        },
      ],
    },
    {
      type: "tool",
      name: "register_for_event",
      tool_call_id: callId,
      content: JSON.stringify({
        status,
        data: { outcome_if_confirmed: "seat" },
      }),
    },
  ] as Message[];
}

function Slots() {
  const [open, close] = useArtifactOpen();
  return (
    <>
      <p>{open ? "panel open" : "panel closed"}</p>
      <button
        type="button"
        onClick={close}
      >
        close
      </button>
      <ArtifactTitle />
      <ArtifactContent />
    </>
  );
}

describe("RegistrationPanel", () => {
  const stream = vi.mocked(useStreamContext);
  const onConfirm = vi.fn();
  const tree = () => (
    <ArtifactProvider>
      <Slots />
      <RegistrationPanel onConfirm={onConfirm} />
    </ArtifactProvider>
  );
  const useMessages = (messages: Message[], isLoading = false) =>
    stream.mockReturnValue({ messages, isLoading } as never);

  beforeEach(() => {
    onConfirm.mockClear();
  });

  it("stays closed for a conversation with no registration", () => {
    useMessages([]);

    render(tree());

    expect(screen.getByText("panel closed")).toBeTruthy();
  });

  it("opens on a preview and confirms with a chat message", () => {
    useMessages(toolMessages("preview"));

    render(tree());
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm registration" }),
    );

    expect(screen.getByText("panel open")).toBeTruthy();
    expect(onConfirm).toHaveBeenCalledWith("Yes, please confirm.", []);
  });

  it("sends the confirm block when the preview carries an id", () => {
    const id = "c".repeat(32);
    const messages = toolMessages("preview");
    const tool = messages[1] as { content: string };
    tool.content = JSON.stringify({
      ...JSON.parse(tool.content),
      preview_id: id,
    });
    useMessages(messages);

    render(tree());
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm registration" }),
    );

    expect(onConfirm).toHaveBeenCalledWith("Yes, please confirm.", [
      { type: "confirm", preview_ids: [id] },
    ]);
  });

  it("closes when the conversation has no registration", () => {
    useMessages(toolMessages("preview"));
    const { rerender } = render(tree());

    useMessages([]);
    rerender(tree());

    expect(screen.getByText("panel closed")).toBeTruthy();
  });

  it("stays closed after the person closes it, until the next step", () => {
    useMessages(toolMessages("preview"));
    const { rerender } = render(tree());

    fireEvent.click(screen.getByRole("button", { name: "close" }));
    useMessages([...toolMessages("preview")]);
    rerender(tree());
    expect(screen.getByText("panel closed")).toBeTruthy();

    useMessages([
      ...toolMessages("preview"),
      ...toolMessages("registered", "c2"),
    ]);
    rerender(tree());
    expect(screen.getByText("panel open")).toBeTruthy();
  });
});
