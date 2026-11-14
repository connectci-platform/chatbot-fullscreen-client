import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContentBlocksPreview } from "./ContentBlocksPreview";

describe("ContentBlocksPreview", () => {
  it("shows a text file as a chip with its name", () => {
    render(
      <ContentBlocksPreview
        blocks={[
          {
            type: "file",
            mimeType: "text/plain",
            data: btoa("echo hi\n"),
            metadata: { filename: "job.sh" },
          },
        ]}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByText("job.sh")).toBeTruthy();
    expect(screen.queryByText("Unsupported file type")).toBeNull();
  });

  it("shows a stored file that Edit put back by its name, and removes it", () => {
    const onRemove = vi.fn();
    const id = "a".repeat(32);
    render(
      <ContentBlocksPreview
        blocks={[{ type: "attachment", id }]}
        sharedFiles={
          new Map([
            [
              id,
              {
                type: "attachment",
                id,
                kind: "pdf",
                name: "report.pdf",
                pages: 3,
                size: 2048,
              },
            ],
          ])
        }
        onRemove={onRemove}
      />,
    );
    expect(screen.getByText("report.pdf")).toBeTruthy();
    expect(screen.getByText("2 KB · 3 pages")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove report.pdf" }));
    expect(onRemove).toHaveBeenCalledWith(0);
  });

  it("names a stored file it can't look up generically", () => {
    render(
      <ContentBlocksPreview
        blocks={[{ type: "attachment", id: "b".repeat(32) }]}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByText("Shared file")).toBeTruthy();
  });
});
