import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it, vi } from "vitest";
import { latestResourceComparison } from "@/lib/resource-comparison";
import { useStreamContext } from "@/providers/Stream";
import anvilSet from "@/lib/fixtures/compare-resources/gpu-anvil-stampede3-jetstream2.json";
import deltaSet from "@/lib/fixtures/compare-resources/gpu-delta-bridges2-expanse.json";
import ambiguous from "@/lib/fixtures/compare-resources/delta-ambiguous.json";
import {
  ArtifactContent,
  ArtifactProvider,
  ArtifactTitle,
  useArtifactOpen,
} from "./artifact";
import {
  ResourceComparisonPanel,
  ResourceComparisonTable,
  showResourceComparison,
} from "./resource-comparison-panel";
import { SoftwareComparisonPanel } from "./software-comparison-panel";

vi.mock("@/providers/Stream", () => ({ useStreamContext: vi.fn() }));

const turn = (
  question: string,
  calls: [string, unknown][],
  answer = `a-${question}`,
): Message[] => [
  { id: `h-${question}`, type: "human", content: question },
  ...calls.map(
    ([id, body]) =>
      ({
        id: `t-${id}`,
        type: "tool",
        name: "compare_resources",
        tool_call_id: id,
        content: JSON.stringify(body),
      }) as Message,
  ),
  { id: answer, type: "ai", content: "answer" },
];

const view = (body: unknown) =>
  latestResourceComparison(turn("q", [["c1", body]]))!;

const column = (name: string) => {
  const headers = screen.getAllByRole("columnheader");
  return headers.findIndex((h) => h.textContent?.startsWith(name));
};

const cell = (rowLabel: string, resource: string) => {
  const row = screen.getByRole("rowheader", { name: rowLabel }).closest("tr")!;
  return within(row).getAllByRole("cell")[column(resource)];
};

describe("ResourceComparisonTable", () => {
  it("puts each resource in a column, linked to its documentation", () => {
    render(<ResourceComparisonTable view={view(anvilSet)} />);

    const link = screen.getByRole("link", { name: "Jetstream2 GPU" });
    expect(link.getAttribute("href")).toBe(
      "https://support.access-ci.org/documentation/resources/jetstream2",
    );
    expect(
      screen.getAllByRole("columnheader").map((h) => h.textContent),
    ).toEqual(["Anvil GPU", "Stampede3", "Jetstream2 GPU"]);
  });

  it("says Not documented for a gap, never no", () => {
    render(<ResourceComparisonTable view={view(anvilSet)} />);

    expect(cell("Storage", "Jetstream2 GPU").textContent).toBe(
      "Not documented",
    );
    expect(cell("Software", "Jetstream2 GPU").textContent).toBe(
      "Not documented",
    );
    expect(cell("Log in", "Jetstream2 GPU").textContent).toBe("Not documented");
    expect(cell("Log in", "Stampede3").textContent).not.toMatch(/OnDemand/);
    expect(cell("Separate account", "Jetstream2 GPU").textContent).toBe(
      "Not required",
    );
    expect(cell("Multi-factor login", "Anvil GPU").textContent).toBe(
      "Required",
    );
  });

  it("shows queues with their limits and folds a long list", () => {
    render(<ResourceComparisonTable view={view(deltaSet)} />);

    const queues = cell("Queues", "Delta GPU");
    expect(within(queues).getByText("gpuA100x4")).toBeTruthy();
    const shown = queues.querySelector("ul")!;
    expect(within(shown).getAllByRole("listitem")).toHaveLength(3);
    expect(within(shown).getAllByText("Up to 48 h per job")).toHaveLength(3);
    expect(within(queues).getByText("9 more")).toBeTruthy();
  });

  it("shows every queue when several share a name", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ResourceComparisonTable view={view(deltaSet)} />);

    const queues = cell("Queues", "Bridges-2 GPU");
    expect(within(queues).getAllByText("GPU-shared")).toHaveLength(4);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("leaves out the wait time row when no resource documents one", () => {
    render(<ResourceComparisonTable view={view(anvilSet)} />);

    expect(screen.queryByRole("rowheader", { name: "Wait times" })).toBeNull();
  });

  it("shows documented wait times with their date, and gaps for the rest", () => {
    const withWaits = structuredClone(anvilSet);
    (withWaits.items[0] as Record<string, unknown>).wait_times = {
      as_of: "2026-11-01",
      queues: [{ queue: "gpu", average_wait_hours: 2.5, job_count: 1200 }],
    };
    render(<ResourceComparisonTable view={view(withWaits)} />);

    const waits = cell("Wait times", "Anvil GPU");
    expect(waits.textContent).toContain("as of 2026-11-01");
    expect(waits.textContent).toContain("gpu 2.5 h (1,200 jobs)");
    expect(cell("Wait times", "Stampede3").textContent).toBe("Not documented");
  });

  it("explains names it couldn't place instead of leaving them out silently", () => {
    render(<ResourceComparisonTable view={view(ambiguous)} />);

    expect(
      screen.getByText(/Delta could mean Delta CPU, Delta GPU/),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Resource Documentation has nothing named Not A Resource.",
      ),
    ).toBeTruthy();
  });
});

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

describe("ResourceComparisonPanel", () => {
  const stream = vi.mocked(useStreamContext);
  const tree = () => (
    <ArtifactProvider>
      <Slots />
      <SoftwareComparisonPanel />
      <ResourceComparisonPanel />
    </ArtifactProvider>
  );
  const useMessages = (messages: Message[]) =>
    stream.mockReturnValue({ messages, isLoading: false } as never);

  it("opens with one table for all of an answer's comparisons", () => {
    useMessages([]);
    const { rerender } = render(tree());

    useMessages(
      turn("gpus", [
        ["c1", anvilSet],
        ["c2", deltaSet],
      ]),
    );
    rerender(tree());

    expect(screen.getByText("panel open")).toBeTruthy();
    expect(screen.getByText("Resource comparison")).toBeTruthy();
    expect(screen.getAllByRole("columnheader")).toHaveLength(6);
  });

  it("doesn't open for a failed comparison", () => {
    useMessages(turn("gpus", [["c1", { status: "error", error: "boom" }]]));
    render(tree());

    expect(screen.getByText("panel closed")).toBeTruthy();
  });

  it("reopens an earlier answer's table when asked", () => {
    useMessages([
      ...turn("first", [["c1", anvilSet]]),
      ...turn("second", [["c2", deltaSet]]),
    ]);
    render(tree());
    expect(screen.getByRole("link", { name: "Delta GPU" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(screen.getByText("panel closed")).toBeTruthy();

    act(() => showResourceComparison("c1"));

    expect(screen.getByText("panel open")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Anvil GPU" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Delta GPU" })).toBeNull();
  });

  it("hands the panel to a software comparison that comes after it", () => {
    const software = {
      requested_software: ["gromacs"],
      requested_resources: ["delta"],
      all_resources_found: ["delta"],
      comparison: [
        { software: "gromacs", found: true, available_on: ["delta"] },
      ],
    };
    useMessages(turn("gpus", [["c1", anvilSet]]));
    const { rerender } = render(tree());
    expect(screen.getByText("Resource comparison")).toBeTruthy();

    useMessages([
      ...turn("gpus", [["c1", anvilSet]]),
      { id: "h2", type: "human", content: "gromacs?" },
      {
        id: "t-s1",
        type: "tool",
        name: "compare_software_availability",
        tool_call_id: "s1",
        content: JSON.stringify(software),
      } as Message,
    ]);
    rerender(tree());

    expect(screen.getByText("Software availability")).toBeTruthy();
    expect(screen.queryByText("Resource comparison")).toBeNull();
  });
});
