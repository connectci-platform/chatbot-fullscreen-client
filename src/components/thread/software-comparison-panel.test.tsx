import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it, vi } from "vitest";
import {
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

function cellText(software: string, resource: string) {
  const table = screen.getByRole("table");
  const headers = within(table)
    .getAllByRole("columnheader")
    .map((h) => h.textContent);
  const row = within(table).getByRole("row", { name: new RegExp(software) });
  return within(row).getAllByRole("cell")[headers.indexOf(resource) - 1]
    .textContent;
}

describe("SoftwareComparisonGrid", () => {
  it("shows software against resources with versions where known", () => {
    render(
      <SoftwareComparisonGrid view={view([...details(), ...comparison()])} />,
    );

    expect(
      screen.getAllByRole("columnheader").map((h) => h.textContent),
    ).toEqual(["Software", "anvil", "delta", "deltaai", "expanse"]);
    expect(cellText("pytorch", "anvil")).toContain("✓ Listed");
    expect(cellText("pytorch", "anvil")).toContain("21.09-py3");
    expect(cellText("pytorch", "anvil")).toContain("1 more");
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

  it("scrolls many resources sideways with the software column pinned", () => {
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
    expect(screen.getAllByRole("columnheader")).toHaveLength(26);
    expect(
      screen.getByRole("rowheader", { name: "gromacs" }).className,
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
