import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  comparisonsByMessage,
  latestComparison,
  type SoftwareComparisonView,
} from "@/lib/software-comparison";
import { useStreamContext } from "@/providers/Stream";
import {
  ArtifactContent,
  ArtifactProvider,
  ArtifactTitle,
  useArtifactOpen,
} from "./artifact";
import { RegistrationPanel } from "./registration-panel";
import {
  SoftwareComparisonGrid,
  SoftwareComparisonPanel,
  showComparison,
} from "./software-comparison-panel";

vi.mock("@/providers/Stream", () => ({ useStreamContext: vi.fn() }));

// Real compare_software_availability output, 2026-11-08.
const COMPARE = {
  requested_software: ["pytorch", "gromacs", "notarealpkg"],
  requested_resources: ["delta", "expanse", "anvil"],
  all_resources_found: ["anvil", "delta", "deltaai"],
  comparison: [
    {
      software: "pytorch",
      found: true,
      available_on: ["anvil"],
      resource_count: 1,
    },
    {
      software: "gromacs",
      found: true,
      available_on: ["deltaai", "anvil", "delta"],
      resource_count: 3,
    },
    {
      software: "notarealpkg",
      found: false,
      available_on: [],
      resource_count: 0,
    },
  ],
  summary: {
    total_software_requested: 3,
    software_found: 2,
    software_not_found: ["notarealpkg"],
  },
};

const DETAILS = {
  software_name: "pytorch",
  found: true,
  details: {
    name: "pytorch",
    documentation: "https://pytorch.org/docs/stable/",
    versions_by_resource: {
      anvil: ["21.09-py3", "21.06-py3", "20.12-py3", "1.10.0", " 1.10.0"],
    },
  },
};

function tool(name: string, id: string, body: unknown): Message[] {
  return [
    { type: "ai", content: "", tool_calls: [{ id, name, args: {} }] },
    {
      type: "tool",
      name,
      tool_call_id: id,
      content: typeof body === "string" ? body : JSON.stringify(body),
    },
  ] as Message[];
}

const comparison = (id = "cmp1", body: unknown = COMPARE) =>
  tool("compare_software_availability", id, body);
const details = () => tool("get_software_details", "d1", DETAILS);
const registration = (id = "reg1") =>
  tool("register_for_event", id, { status: "preview", data: {} });

function view(messages: Message[]): SoftwareComparisonView {
  return latestComparison(messages)!;
}

/** The cell for this software on this resource, whichever way the grid runs. */
function cellText(software: string, resource: string) {
  const table = screen.getByRole("table");
  const headers = within(table)
    .getAllByRole("columnheader")
    .map((h) => h.textContent);
  const [rowName, column] =
    headers[0] === "Resource" ? [resource, software] : [software, resource];
  const row = within(table).getByRole("row", {
    name: new RegExp(`^${rowName}\\b`),
  });
  return within(row).getAllByRole("cell")[headers.indexOf(column) - 1]
    .textContent;
}

describe("SoftwareComparisonGrid", () => {
  it("shows software against resources with versions where known", () => {
    render(
      <SoftwareComparisonGrid view={view([...details(), ...comparison()])} />,
    );

    // Four resources and three packages: resources run down the side.
    expect(
      screen.getAllByRole("columnheader").map((h) => h.textContent),
    ).toEqual(["Resource", "pytorch", "gromacs", "notarealpkg"]);
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual([
      "anvil",
      "delta",
      "deltaai",
      "expanse",
    ]);
    expect(cellText("pytorch", "anvil")).not.toContain("Listed");
    expect(cellText("pytorch", "anvil")).toContain("21.09-py3");
    expect(cellText("pytorch", "anvil")).toContain("1 more");
    expect(cellText("gromacs", "delta")).toContain("✓ Listed");
    expect(cellText("gromacs", "delta")).toContain("Version not given");
    expect(
      screen.getByRole("link", { name: "pytorch" }).getAttribute("href"),
    ).toBe("https://pytorch.org/docs/stable/");
  });

  it("names each gap honestly and never says unavailable", () => {
    render(<SoftwareComparisonGrid view={view(comparison())} />);

    expect(cellText("pytorch", "delta")).toBe("Not listed");
    expect(cellText("pytorch", "expanse")).toBe("Not indexed");
    expect(cellText("gromacs", "expanse")).toBe("Not indexed");
    expect(screen.getByText(/may not be covered yet/)).toBeTruthy();
    expect(screen.getByText(/It may still be installed/)).toBeTruthy();

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\bnot available\b|\bunavailable on\b|✗/i);
    expect(text).toContain("doesn't mean it's unavailable everywhere");
  });

  it("says it couldn't check when the server's lookup failed", () => {
    render(
      <SoftwareComparisonGrid
        view={view(
          comparison("c", {
            requested_software: ["gromacs"],
            requested_resources: ["anvil", "expanse"],
            all_resources_found: ["anvil"],
            comparison: [
              {
                software: "gromacs",
                found: true,
                available_on: ["anvil"],
                resource_count: 1,
                resource_status: { anvil: "listed", expanse: "lookup_failed" },
              },
            ],
            resources_not_indexed: [],
            resources_lookup_failed: ["expanse"],
          }),
        )}
      />,
    );

    expect(cellText("gromacs", "expanse")).toBe("Couldn't check");
    expect(
      screen.getByText(/Checking this resource's software list failed/),
    ).toBeTruthy();
    expect(screen.queryByText("Not indexed")).toBeNull();
    expect(screen.queryByText("Not listed")).toBeNull();
  });

  it("leaves out gap notes the grid doesn't need", () => {
    render(
      <SoftwareComparisonGrid
        view={view(
          comparison("c", {
            ...COMPARE,
            requested_resources: "all",
            all_resources_found: ["anvil"],
            comparison: [COMPARE.comparison[0]],
          }),
        )}
      />,
    );

    expect(screen.queryByText("Not listed")).toBeNull();
    expect(screen.queryByText("Not indexed")).toBeNull();
    expect(screen.queryByText(/didn't find/)).toBeNull();
  });

  it("explains an empty result instead of drawing an empty grid", () => {
    render(
      <SoftwareComparisonGrid
        view={view(
          comparison("c", {
            requested_software: ["notarealpkg"],
            requested_resources: "all",
            all_resources_found: [],
            comparison: [COMPARE.comparison[2]],
          }),
        )}
      />,
    );

    expect(screen.queryByRole("table")).toBeNull();
    expect(
      screen.getByText("The index returned no resources for notarealpkg."),
    ).toBeTruthy();
  });

  it("lists many resources down the side with their names pinned", () => {
    const many = Array.from({ length: 25 }, (_, i) => `resource-${i}`);
    render(
      <SoftwareComparisonGrid
        view={view(
          comparison("c", {
            ...COMPARE,
            requested_resources: "all",
            all_resources_found: many,
            comparison: [
              { ...COMPARE.comparison[1], available_on: many.slice(0, 5) },
            ],
          }),
        )}
      />,
    );

    const region = screen.getByRole("region", {
      name: "Software by resource",
    });
    expect(region.className).toContain("overflow-x-auto");
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(
      screen.getAllByRole("columnheader").map((h) => h.textContent),
    ).toEqual(["Resource", "gromacs"]);
    expect(screen.getAllByRole("rowheader")).toHaveLength(25);
    expect(
      screen.getByRole("rowheader", { name: "resource-0" }).className,
    ).toContain("sticky");
    expect(cellText("gromacs", "resource-0")).toContain("Listed");
    expect(cellText("gromacs", "resource-9")).toBe("Not listed");
  });

  it("fits the panel when resources run down the side", () => {
    render(<SoftwareComparisonGrid view={view(comparison())} />);

    expect(screen.getByRole("table").className).toContain("w-full");
    expect(screen.getByRole("table").className).not.toContain("min-w-max");
  });

  it("keeps software down the side when there are more packages than resources", () => {
    render(
      <SoftwareComparisonGrid
        view={view(
          comparison("c", {
            ...COMPARE,
            all_resources_found: ["delta"],
            requested_resources: ["delta"],
          }),
        )}
      />,
    );

    expect(
      screen.getAllByRole("columnheader").map((h) => h.textContent),
    ).toEqual(["Software", "delta"]);
    expect(
      screen.getByRole("rowheader", { name: "pytorch" }).className,
    ).toContain("sticky");
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

describe("SoftwareComparisonPanel", () => {
  const stream = vi.mocked(useStreamContext);
  const tree = () => (
    <ArtifactProvider>
      <Slots />
      <RegistrationPanel onConfirm={() => {}} />
      <SoftwareComparisonPanel />
    </ArtifactProvider>
  );
  const useMessages = (messages: Message[]) =>
    stream.mockReturnValue({ messages, isLoading: false } as never);

  it("stays closed without a comparison", () => {
    useMessages([]);
    render(tree());
    expect(screen.getByText("panel closed")).toBeTruthy();
  });

  it("opens with the grid when a comparison arrives", () => {
    useMessages([]);
    const { rerender } = render(tree());

    useMessages(comparison());
    rerender(tree());

    expect(screen.getByText("panel open")).toBeTruthy();
    expect(screen.getByText("Software availability")).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("comes back when a thread with a comparison is reopened", () => {
    useMessages(comparison());
    render(tree());
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("doesn't open for a failed comparison", () => {
    useMessages(
      comparison("c", {
        status: "error",
        executed: false,
        error: { code: "error", message: "SDS API error: 500" },
      }),
    );
    render(tree());
    expect(screen.getByText("panel closed")).toBeTruthy();
  });

  it("reopens a closed comparison, and an earlier one, when asked", () => {
    const older = {
      ...COMPARE,
      requested_software: ["gromacs"],
      comparison: [COMPARE.comparison[1]],
    };
    useMessages([...comparison("c1", older), ...comparison("c2")]);
    render(tree());
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(screen.getByText("panel closed")).toBeTruthy();

    act(() => showComparison("c1"));
    expect(screen.getByText("panel open")).toBeTruthy();
    const grid = screen.getByRole("table");
    expect(within(grid).queryByText("pytorch")).toBeNull();
    expect(within(grid).getByText("gromacs")).toBeTruthy();

    act(() => showComparison("c2"));
    expect(within(screen.getByRole("table")).getByText("pytorch")).toBeTruthy();
  });

  it("stays closed after the person closes it, until the next comparison", () => {
    useMessages(comparison("c1"));
    const { rerender } = render(tree());

    fireEvent.click(screen.getByRole("button", { name: "close" }));
    useMessages([...comparison("c1")]);
    rerender(tree());
    expect(screen.getByText("panel closed")).toBeTruthy();

    useMessages([...comparison("c1"), ...comparison("c2")]);
    rerender(tree());
    expect(screen.getByText("panel open")).toBeTruthy();
  });

  it("gives the panel to the newest step on reload", () => {
    useMessages([...registration(), ...comparison()]);
    const first = render(tree());
    expect(screen.getByText("Software availability")).toBeTruthy();
    first.unmount();

    useMessages([...comparison(), ...registration()]);
    render(tree());
    expect(screen.getByText("Not registered yet")).toBeTruthy();
    expect(screen.queryByText("Software availability")).toBeNull();
  });

  it("keeps the grid when a registration behind it is cancelled", () => {
    useMessages([...registration(), ...comparison()]);
    const { rerender } = render(tree());
    expect(screen.getByRole("table")).toBeTruthy();

    useMessages([
      ...registration(),
      ...comparison(),
      ...tool("cancel_registration", "cancel1", { status: "cancelled" }),
    ]);
    rerender(tree());

    expect(screen.getByText("panel open")).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("keeps a registration preview open when a comparison fails", () => {
    useMessages(registration());
    const { rerender } = render(tree());
    expect(screen.getByText("Not registered yet")).toBeTruthy();

    useMessages([
      ...registration(),
      ...comparison("bad", {
        status: "error",
        executed: false,
        error: { code: "error", message: "SDS API error: 500" },
      }),
    ]);
    rerender(tree());

    expect(screen.getByText("panel open")).toBeTruthy();
    expect(screen.getByText("Not registered yet")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("closes the grid when the thread has no comparison", () => {
    useMessages(comparison());
    const { rerender } = render(tree());

    useMessages([]);
    rerender(tree());

    expect(screen.getByText("panel closed")).toBeTruthy();
  });

  it("hands over when a newer step arrives in either order", () => {
    useMessages(registration());
    const { rerender } = render(tree());
    expect(screen.getByText("Not registered yet")).toBeTruthy();

    useMessages([...registration(), ...comparison()]);
    rerender(tree());
    expect(screen.getByText("Software availability")).toBeTruthy();

    useMessages([...registration(), ...comparison(), ...registration("reg2")]);
    rerender(tree());
    expect(screen.getByText("Not registered yet")).toBeTruthy();
    expect(screen.queryByText("Software availability")).toBeNull();
  });
});

describe("comparisonsByMessage", () => {
  it("keys each answer's newest good comparison by its last AI message", () => {
    const messages = [
      { id: "h1", type: "human", content: "q" },
      ...comparison("c1"),
      { id: "a1", type: "ai", content: "Here." },
      { id: "h2", type: "human", content: "q2" },
      ...comparison("bad", { status: "error", executed: false }),
      { id: "a2", type: "ai", content: "Sorry." },
      { id: "h3", type: "human", content: "q3" },
      { id: "a3", type: "ai", content: "No tools." },
    ] as Message[];
    const map = comparisonsByMessage(messages);
    expect([...map.entries()]).toEqual([["a1", "c1"]]);
  });
});
