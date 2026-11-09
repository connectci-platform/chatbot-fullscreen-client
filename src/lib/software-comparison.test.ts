import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it } from "vitest";
import {
  latestComparison,
  newestPanelStep,
  type SoftwareComparisonView,
} from "./software-comparison";

// Real compare_software_availability output from the public connector,
// 2026-11-08, for pytorch, gromacs and a made-up name on delta, expanse and
// anvil. Expanse is not in all_resources_found: it isn't indexed.
const COMPARE_REQUESTED = {
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

// Real output with no resources named.
const COMPARE_ALL = {
  requested_software: ["pytorch", "gromacs"],
  requested_resources: "all",
  all_resources_found: [
    "aces",
    "anvil",
    "bridges-2",
    "delta",
    "deltaai",
    "kyric",
    "stampede3",
  ],
  comparison: [
    {
      software: "pytorch",
      found: true,
      available_on: ["aces", "bridges-2", "anvil"],
      resource_count: 3,
    },
    {
      software: "gromacs",
      found: true,
      available_on: [
        "aces",
        "bridges-2",
        "delta",
        "stampede3",
        "anvil",
        "kyric",
        "deltaai",
      ],
      resource_count: 7,
    },
  ],
  summary: {
    total_software_requested: 2,
    software_found: 2,
    software_not_found: [],
  },
};

// Trimmed real get_software_details output for pytorch. Note the duplicate
// " 1.10.0" with a leading space, as the index returns it.
const DETAILS_PYTORCH = {
  software_name: "pytorch",
  found: true,
  details: {
    name: "pytorch",
    description: "PyTorch is an optimized tensor library.",
    versions: ["2.9.1-cuda-12.6.0", "1.13.1", "1.10.0", " 1.10.0"],
    documentation: "https://pytorch.org/docs/stable/",
    website: "https://pytorch.org/",
    available_on_resources: ["aces", "bridges-2", "anvil"],
    resource_ids: ["aces.tamu.access-ci.org"],
    versions_by_resource: {
      aces: ["2.9.1-cuda-12.6.0", "2.7.1-cuda-12.6.0"],
      "bridges-2": ["1.13.1"],
      anvil: ["21.09-py3", "1.10.0", " 1.10.0"],
    },
  },
  other_matches: [{ name: "pytorch-conda", resources: ["delta"] }],
};

const ERROR = {
  status: "error",
  executed: false,
  error: { code: "error", message: "SDS API error: 500" },
};

let seq = 0;
function call(name: string, args: unknown, id = `c${++seq}`): Message[] {
  return [
    {
      type: "ai",
      content: "",
      tool_calls: [{ id, name, args }],
    } as Message,
  ];
}

function result(
  name: string,
  body: unknown,
  id: string,
  extra: Record<string, unknown> = {},
): Message {
  return {
    type: "tool",
    name,
    tool_call_id: id,
    content: typeof body === "string" ? body : JSON.stringify(body),
    ...extra,
  } as Message;
}

function compare(body: unknown, id = "cmp1", extra = {}): Message[] {
  return [
    ...call("compare_software_availability", {}, id),
    result("compare_software_availability", body, id, extra),
  ];
}

function cell(view: SoftwareComparisonView, software: string, rp: string) {
  const row = view.rows.find((r) => r.software === software);
  return row?.cells[view.resources.findIndex((r) => r.name === rp)];
}

describe("latestComparison", () => {
  it("is empty when the conversation has no comparison", () => {
    expect(latestComparison([])).toBeNull();
    expect(
      latestComparison([result("get_software_details", DETAILS_PYTORCH, "d1")]),
    ).toBeNull();
  });

  it("builds a grid of software against resources", () => {
    const view = latestComparison(compare(COMPARE_ALL))!;

    expect(view.key).toBe("cmp1");
    expect(view.rows.map((r) => r.software)).toEqual(["pytorch", "gromacs"]);
    expect(view.resources.map((r) => r.name)).toEqual(
      COMPARE_ALL.all_resources_found,
    );
    expect(cell(view, "pytorch", "aces")?.status).toBe("listed");
    expect(cell(view, "pytorch", "delta")?.status).toBe("not_listed");
    expect(cell(view, "gromacs", "kyric")?.status).toBe("listed");
  });

  it("marks a requested resource with no results as not indexed", () => {
    const view = latestComparison(compare(COMPARE_REQUESTED))!;

    expect(view.resources.map((r) => [r.name, r.coverage])).toEqual([
      ["anvil", "indexed"],
      ["delta", "indexed"],
      ["deltaai", "indexed"],
      ["expanse", "not_indexed"],
    ]);
    expect(cell(view, "gromacs", "expanse")?.status).toBe("not_indexed");
    expect(cell(view, "pytorch", "expanse")?.status).toBe("not_indexed");
    // Delta is indexed, it just doesn't list pytorch.
    expect(cell(view, "pytorch", "delta")?.status).toBe("not_listed");
    expect(cell(view, "notarealpkg", "anvil")?.status).toBe("not_listed");
  });

  it("matches requested resource ids and spellings to what the index returned", () => {
    const view = latestComparison(
      compare({
        ...COMPARE_REQUESTED,
        requested_resources: ["Bridges2", "anvil.purdue.access-ci.org"],
        all_resources_found: ["anvil", "bridges-2"],
        comparison: [
          {
            software: "pytorch",
            found: true,
            available_on: ["anvil", "bridges-2"],
            resource_count: 2,
          },
        ],
      }),
    )!;

    expect(view.resources.map((r) => r.name)).toEqual(["anvil", "bridges-2"]);
    expect(view.resources.every((r) => r.coverage === "indexed")).toBe(true);
  });

  it("does not call anything unindexed when nothing at all was found", () => {
    const view = latestComparison(
      compare({
        requested_software: ["notarealpkg"],
        requested_resources: ["delta", "expanse"],
        all_resources_found: [],
        comparison: [
          {
            software: "notarealpkg",
            found: false,
            available_on: [],
            resource_count: 0,
          },
        ],
        summary: {},
      }),
    )!;

    expect(view.resources.map((r) => [r.name, r.coverage])).toEqual([
      ["delta", "unknown"],
      ["expanse", "unknown"],
    ]);
    expect(cell(view, "notarealpkg", "expanse")?.status).toBe("not_listed");
    expect(view.notFound).toEqual(["notarealpkg"]);
  });

  it("handles an empty result with no resources to show", () => {
    const view = latestComparison(
      compare({
        requested_software: ["notarealpkg"],
        requested_resources: "all",
        all_resources_found: [],
        comparison: [
          {
            software: "notarealpkg",
            found: false,
            available_on: [],
            resource_count: 0,
          },
        ],
      }),
    )!;

    expect(view.resources).toEqual([]);
    expect(view.rows[0].cells).toEqual([]);
    expect(view.notFound).toEqual(["notarealpkg"]);
  });

  it("adds versions from details already in the conversation", () => {
    const view = latestComparison([
      ...call("get_software_details", { software_name: "pytorch" }, "d1"),
      result("get_software_details", DETAILS_PYTORCH, "d1"),
      ...compare(COMPARE_ALL),
    ])!;

    expect(cell(view, "pytorch", "bridges-2")).toEqual({
      status: "listed",
      versions: ["1.13.1"],
    });
    // Trimmed and de-duplicated, in the index's order.
    expect(cell(view, "pytorch", "anvil")).toEqual({
      status: "listed",
      versions: ["21.09-py3", "1.10.0"],
    });
    expect(view.rows[0].documentation).toBe("https://pytorch.org/docs/stable/");
  });

  it("adds versions from search results too", () => {
    const view = latestComparison([
      result(
        "search_software",
        {
          total: 1,
          items: [
            {
              name: "GROMACS",
              versions_by_resource: { delta: ["2024.1"] },
            },
          ],
        },
        "s1",
      ),
      ...compare(COMPARE_ALL),
    ])!;

    expect(cell(view, "gromacs", "delta")).toEqual({
      status: "listed",
      versions: ["2024.1"],
    });
  });

  it("takes versions from the comparison itself", () => {
    const view = latestComparison(
      compare({
        ...COMPARE_ALL,
        comparison: [
          COMPARE_ALL.comparison[0],
          {
            ...COMPARE_ALL.comparison[1],
            versions_by_resource: {
              delta: ["2026.1-cuda", " 2025.2 ", "2025.2"],
            },
          },
        ],
      }),
    )!;

    expect(cell(view, "gromacs", "delta")).toEqual({
      status: "listed",
      versions: ["2026.1-cuda", "2025.2"],
    });
    expect(cell(view, "gromacs", "aces")).toEqual({
      status: "listed",
      versions: [],
    });
  });

  it("prefers the comparison's versions over an earlier lookup's", () => {
    const view = latestComparison([
      result(
        "search_software",
        {
          total: 1,
          items: [
            { name: "GROMACS", versions_by_resource: { delta: ["2024.1"] } },
          ],
        },
        "s1",
      ),
      ...compare({
        ...COMPARE_ALL,
        comparison: [
          COMPARE_ALL.comparison[0],
          {
            ...COMPARE_ALL.comparison[1],
            versions_by_resource: { delta: ["2026.1"] },
          },
        ],
      }),
    ])!;

    expect(cell(view, "gromacs", "delta")).toEqual({
      status: "listed",
      versions: ["2026.1"],
    });
  });

  it("leaves versions empty where the tools gave none", () => {
    const view = latestComparison(compare(COMPARE_ALL))!;

    expect(cell(view, "gromacs", "aces")).toEqual({
      status: "listed",
      versions: [],
    });
  });

  it("never adds a resource or version the comparison didn't list", () => {
    const view = latestComparison([
      result(
        "get_software_details",
        {
          ...DETAILS_PYTORCH,
          details: {
            ...DETAILS_PYTORCH.details,
            versions_by_resource: { delta: ["9.9"] },
          },
        },
        "d1",
      ),
      ...compare(COMPARE_ALL),
    ])!;

    expect(cell(view, "pytorch", "delta")).toEqual({ status: "not_listed" });
  });

  it("uses only details for the exact software name", () => {
    const view = latestComparison([
      result(
        "get_software_details",
        {
          software_name: "pytorch",
          found: true,
          details: {
            name: "pytorch-conda",
            versions_by_resource: { anvil: ["0.1"] },
          },
        },
        "d1",
      ),
      ...compare(COMPARE_ALL),
    ])!;

    expect(cell(view, "pytorch", "anvil")).toEqual({
      status: "listed",
      versions: [],
    });
  });

  it("shows the newest comparison", () => {
    const view = latestComparison([
      ...compare(COMPARE_ALL, "old"),
      ...compare(COMPARE_REQUESTED, "new"),
    ])!;

    expect(view.key).toBe("new");
  });

  it("skips a failed or refused call and keeps the last good grid", () => {
    const messages = [
      ...compare(COMPARE_ALL, "good"),
      ...compare(ERROR, "failed"),
      ...compare("Tool call was rejected by the user.", "refused"),
      ...compare(COMPARE_ALL, "flagged", { status: "error" }),
    ];

    expect(latestComparison(messages)?.key).toBe("good");
    expect(latestComparison(compare(ERROR))).toBeNull();
  });

  it("reads results sent as content blocks", () => {
    const view = latestComparison(
      compare("unused", "blocks").map((m) =>
        m.type === "tool"
          ? ({
              ...m,
              content: [{ type: "text", text: JSON.stringify(COMPARE_ALL) }],
            } as Message)
          : m,
      ),
    );

    expect(view?.key).toBe("blocks");
  });

  it("handles a grid with many resources", () => {
    const many = Array.from({ length: 30 }, (_, i) => `rp${i}`);
    const view = latestComparison(
      compare({
        ...COMPARE_ALL,
        all_resources_found: many,
        comparison: [
          {
            software: "gcc",
            found: true,
            available_on: many,
            resource_count: 30,
          },
        ],
      }),
    )!;

    expect(view.resources).toHaveLength(30);
    expect(view.rows[0].cells.every((c) => c.status === "listed")).toBe(true);
  });
});

// Real output from the md-3023-gaps server, 2026-11-08, for GROMACS on
// delta, expanse and anvil. It says what each gap means itself.
const GAP_NOTE =
  "not_listed means the package isn't in that resource's software list, not that it can't be used. not_indexed means no software list exists for that resource, so nothing is known about its software. lookup_failed means the check for that resource's list failed. None of these mean the software is unavailable; point the user to the resource's documentation or support.";
const COMPARE_WITH_STATUS = {
  requested_software: ["gromacs"],
  requested_resources: ["delta", "expanse", "anvil"],
  all_resources_found: ["anvil", "delta", "deltaai"],
  comparison: [
    {
      software: "gromacs",
      found: true,
      available_on: ["delta", "anvil", "deltaai"],
      resource_count: 3,
      resource_status: {
        anvil: "listed",
        delta: "listed",
        deltaai: "listed",
        expanse: "not_indexed",
      },
    },
  ],
  resources_not_indexed: ["expanse"],
  resources_lookup_failed: [],
  gap_note: GAP_NOTE,
  summary: {
    total_software_requested: 1,
    software_found: 1,
    software_not_found: [],
  },
};

function withStatus(
  available_on: string[],
  resource_status: Record<string, string>,
  extra: Record<string, unknown> = {},
) {
  return {
    requested_software: ["pytorch"],
    requested_resources: Object.keys(resource_status),
    all_resources_found: available_on,
    comparison: [
      {
        software: "pytorch",
        found: available_on.length > 0,
        available_on,
        resource_count: available_on.length,
        resource_status,
      },
    ],
    resources_not_indexed: [],
    resources_lookup_failed: [],
    gap_note: GAP_NOTE,
    ...extra,
  };
}

describe("latestComparison with the server's resource_status", () => {
  it("reads each gap from the server", () => {
    const view = latestComparison(compare(COMPARE_WITH_STATUS))!;

    expect(view.resources.map((r) => [r.name, r.coverage])).toEqual([
      ["anvil", "indexed"],
      ["delta", "indexed"],
      ["deltaai", "indexed"],
      ["expanse", "not_indexed"],
    ]);
    expect(cell(view, "gromacs", "delta")?.status).toBe("listed");
    expect(cell(view, "gromacs", "expanse")?.status).toBe("not_indexed");
  });

  it("trusts the server over the inference for a resource with a list", () => {
    // Expanse has a software list without pytorch. Inference alone would
    // have called it not indexed.
    const view = latestComparison(
      compare(
        withStatus(["anvil"], { anvil: "listed", expanse: "not_listed" }),
      ),
    )!;

    expect(view.resources.map((r) => [r.name, r.coverage])).toEqual([
      ["anvil", "indexed"],
      ["expanse", "indexed"],
    ]);
    expect(cell(view, "pytorch", "expanse")).toEqual({ status: "not_listed" });
  });

  it("says a lookup failed rather than guessing", () => {
    const view = latestComparison(
      compare(
        withStatus(
          ["anvil"],
          { anvil: "listed", expanse: "lookup_failed" },
          { resources_lookup_failed: ["expanse"] },
        ),
      ),
    )!;

    expect(view.resources[1]).toEqual({
      name: "expanse",
      coverage: "lookup_failed",
    });
    expect(cell(view, "pytorch", "expanse")).toEqual({
      status: "lookup_failed",
    });
  });

  it("calls a resource unindexed when the server checked, even with no results", () => {
    const view = latestComparison(
      compare(
        withStatus(
          [],
          { delta: "not_listed", expanse: "not_indexed" },
          { resources_not_indexed: ["expanse"] },
        ),
      ),
    )!;

    expect(view.resources.map((r) => [r.name, r.coverage])).toEqual([
      ["delta", "indexed"],
      ["expanse", "not_indexed"],
    ]);
    expect(cell(view, "pytorch", "delta")?.status).toBe("not_listed");
    expect(cell(view, "pytorch", "expanse")?.status).toBe("not_indexed");
  });

  it("still adds versions to cells the server lists", () => {
    const view = latestComparison([
      result(
        "get_software_details",
        {
          software_name: "gromacs",
          found: true,
          details: {
            name: "gromacs",
            versions_by_resource: { delta: ["2026.1-cuda", "2025.2"] },
          },
        },
        "d1",
      ),
      ...compare(COMPARE_WITH_STATUS),
    ])!;

    expect(cell(view, "gromacs", "delta")).toEqual({
      status: "listed",
      versions: ["2026.1-cuda", "2025.2"],
    });
  });
});

describe("newestPanelStep", () => {
  const registration = [
    ...call("register_for_event", { eventinstance_id: "1" }, "reg"),
    result("register_for_event", { status: "preview" }, "reg"),
  ];
  const cancelled = [
    ...call("cancel_registration", {}, "cancel"),
    result("cancel_registration", { status: "cancelled" }, "cancel"),
  ];

  it("is empty when neither panel has anything to show", () => {
    expect(newestPanelStep([])).toBeNull();
    expect(newestPanelStep([...registration, ...cancelled])).toBeNull();
  });

  it("is the comparison when there is no registration", () => {
    expect(newestPanelStep(compare(COMPARE_ALL))).toBe("comparison");
  });

  it("is the comparison when it is the newer step", () => {
    expect(newestPanelStep([...registration, ...compare(COMPARE_ALL)])).toBe(
      "comparison",
    );
  });

  it("is the registration when it is the newer step", () => {
    expect(newestPanelStep([...compare(COMPARE_ALL), ...registration])).toBe(
      "registration",
    );
  });

  it("falls back to the comparison when the registration is cancelled", () => {
    expect(
      newestPanelStep([...registration, ...compare(COMPARE_ALL), ...cancelled]),
    ).toBe("comparison");
  });

  it("is the chart when a chart result is the newest step", () => {
    const chart = {
      type: "tool",
      name: "get_chart_data",
      tool_call_id: "chart1",
      content: "chart",
      artifact: {
        structured_content: {
          chart: {
            version: 1,
            realm: "Jobs",
            statistic: "job_count",
            group_by: "resource",
            dataset_type: "aggregate",
            requested: { start: "2026-01-01", end: "2026-01-31" },
            counted: { start: "2026-01-01", end: "2026-01-31" },
            last_period_incomplete: false,
            measure: {
              label: "Jobs",
              description: "Jobs.",
              kind: "total",
              missing: "zero",
            },
            dimension: { name: "resource", ordered: false },
            filters: { notes: [] },
            categories: [
              { name: "A", value: 1 },
              { name: "B", value: 2 },
            ],
            has_more: false,
            ranked_by: "value",
            link: "https://xdmod.access-ci.org/",
            source: "XDMoD",
            retrieved: "2026-11-09",
          },
        },
      },
    } as unknown as Message;
    const ai = { id: "a", type: "ai", content: "" } as Message;
    expect(
      newestPanelStep([...registration, ...compare(COMPARE_ALL), chart, ai]),
    ).toBe("chart");
    expect(newestPanelStep([chart, ai, ...compare(COMPARE_ALL)])).toBe(
      "comparison",
    );
  });

  it("stays with the registration when a newer comparison failed", () => {
    expect(newestPanelStep([...registration, ...compare(ERROR, "bad")])).toBe(
      "registration",
    );
  });
});
