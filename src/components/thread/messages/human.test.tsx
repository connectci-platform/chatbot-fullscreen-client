import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@langchain/langgraph-sdk";
import { HumanMessage } from "./human";

vi.mock("@/providers/Stream", () => ({
  useStreamContext: () => ({ apiUrl: "http://agent", threadId: "t1" }),
}));
const get = vi.hoisted(() => vi.fn<(path: string) => Promise<Response>>());
vi.mock("@/lib/thread-attachments", () => ({ threadGet: () => get }));

const humanMessage: Message = {
  id: "human-1",
  type: "human",
  content: "What is ACCESS?",
};

const PNG = "iVBORw0KGgo=";
let n = 0;
const nextId = () => (n++).toString(16).padStart(32, "b");

function question(content: unknown[]): Message {
  return {
    id: "h",
    type: "human",
    content: content as Message["content"],
  };
}

describe("HumanMessage", () => {
  beforeEach(() => get.mockReset());

  it("has no Copy or Edit button", () => {
    render(<HumanMessage message={humanMessage} />);
    expect(screen.getByText("What is ACCESS?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy content" })).toBeNull();
  });

  it("shows only the word Confirm for a confirm block", () => {
    const { container } = render(
      <HumanMessage
        message={question([
          { type: "text", text: "Confirm" },
          { type: "confirm", preview_ids: ["a".repeat(32)] },
        ])}
      />,
    );
    expect(container.textContent).toBe("Confirm");
  });

  it("shows a stored image as a thumbnail from the attachments endpoint", async () => {
    const id = nextId();
    get.mockResolvedValue(
      new Response(
        JSON.stringify({ kind: "image", mime_type: "image/png", base64: PNG }),
      ),
    );
    render(
      <HumanMessage
        message={question([
          { type: "text", text: "What is this error?" },
          {
            type: "attachment",
            id,
            kind: "image",
            name: "Screenshot.png",
            mime_type: "image/png",
            width: 1600,
            height: 1000,
          },
        ])}
      />,
    );
    const img = await screen.findByAltText("Screenshot.png");
    expect(img.getAttribute("src")).toBe(`data:image/png;base64,${PNG}`);
    expect(get).toHaveBeenCalledWith(`attachments/${id}`);
    expect(screen.getByText("What is this error?")).toBeTruthy();
  });

  it("says a stored image that is gone is no longer available", async () => {
    get.mockResolvedValue(new Response("", { status: 404 }));
    render(
      <HumanMessage
        message={question([
          {
            type: "attachment",
            id: nextId(),
            kind: "image",
            name: "Screenshot.png",
          },
        ])}
      />,
    );
    expect(await screen.findByText("Image no longer available")).toBeTruthy();
    expect(screen.getByText("Screenshot.png")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("doesn't call an image gone when it only failed to load", async () => {
    get.mockResolvedValue(new Response("", { status: 500 }));
    render(
      <HumanMessage
        message={question([
          {
            type: "attachment",
            id: nextId(),
            kind: "image",
            name: "Screenshot.png",
          },
        ])}
      />,
    );
    expect(await screen.findByText("Couldn't load this image")).toBeTruthy();
    expect(screen.getByText("Screenshot.png")).toBeTruthy();
    expect(screen.queryByText("Image no longer available")).toBeNull();
  });

  it("shows a stored PDF as a chip with its name, size and pages, without fetching", () => {
    render(
      <HumanMessage
        message={question([
          {
            type: "attachment",
            id: nextId(),
            kind: "pdf",
            name: "job-report.pdf",
            size: 1572864,
            pages: 12,
            est_tokens: 4000,
          },
        ])}
      />,
    );
    expect(screen.getByText("job-report.pdf")).toBeTruthy();
    expect(screen.getByText("1.5 MB · 12 pages")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("shows a stored text file as a chip with its size", () => {
    render(
      <HumanMessage
        message={question([
          {
            type: "attachment",
            id: nextId(),
            kind: "text",
            name: "job.slurm",
            size: 2048,
          },
        ])}
      />,
    );
    expect(screen.getByText("job.slurm")).toBeTruthy();
    expect(screen.getByText("2 KB")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("shows a just-sent text file as a chip", () => {
    render(
      <HumanMessage
        message={question([
          {
            type: "file",
            mimeType: "text/plain",
            data: btoa("#!/bin/bash\n"),
            metadata: { filename: "job.sh" },
          },
        ])}
      />,
    );
    expect(screen.getByText("job.sh")).toBeTruthy();
    expect(screen.getByText("12 B")).toBeTruthy();
  });

  it("shows a just-sent image from its own data", () => {
    render(
      <HumanMessage
        message={question([
          {
            type: "image",
            mimeType: "image/png",
            data: PNG,
            metadata: { name: "pasted.png" },
          },
        ])}
      />,
    );
    expect(screen.getByAltText("pasted.png").getAttribute("src")).toContain(
      `data:image/png;base64,${PNG}`,
    );
    expect(get).not.toHaveBeenCalled();
  });

  it("doesn't show the agent's not-shared notes as the person's words", () => {
    const { container } = render(
      <HumanMessage
        message={question([
          { type: "text", text: "Why did my job fail?" },
          {
            type: "text",
            text: "[Not shared: notes.docx isn't a supported file.]",
          },
        ])}
      />,
    );
    expect(container.textContent).toBe("Why did my job fail?");
  });
});
