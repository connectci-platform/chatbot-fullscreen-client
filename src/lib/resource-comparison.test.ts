import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it } from "vitest";
import {
  latestResourceComparison,
  resourceComparisonFor,
  resourceComparisonsByMessage,
} from "./resource-comparison";
import { newestPanelStep } from "./software-comparison";
// Real compare_resources output from the local compute-resources server on
// 2026-11-11: the three calls the deployed agent made for "which resources
// have GPUs", and one with an ambiguous and an unknown name.
import anvilSet from "./fixtures/compare-resources/gpu-anvil-stampede3-jetstream2.json";
import acesSet from "./fixtures/compare-resources/gpu-aces-deltaai-derecho.json";
import deltaSet from "./fixtures/compare-resources/gpu-delta-bridges2-expanse.json";
import ambiguous from "./fixtures/compare-resources/delta-ambiguous.json";

const human = (id: string, text = "q"): Message => ({
  id,
  type: "human",
  content: text,
});
const ai = (id: string): Message => ({ id, type: "ai", content: "answer" });
const tool = (
  id: string,
  body: unknown,
  name = "compare_resources",
  status?: "error",
): Message =>
  ({
    id: `t-${id}`,
    type: "tool",
    name,
    tool_call_id: id,
    content: typeof body === "string" ? body : JSON.stringify(body),
    ...(status ? { status } : {}),
  }) as Message;

describe("latestResourceComparison", () => {
  it("merges every comparison in the answer into one table, in call order", () => {
    const view = latestResourceComparison([
      human("h1", "Which resources have GPUs?"),
      tool("c1", anvilSet),
      tool("c2", acesSet),
      tool("c3", deltaSet),
      ai("a1"),
    ]);

    expect(view?.key).toBe("c3");
    expect(view?.resources.map((r) => r.name)).toEqual([
      "Anvil GPU",
      "Stampede3",
      "Jetstream2 GPU",
      "ACES",
      "DeltaAI",
      "Derecho-GPU",
      "Delta GPU",
      "Bridges-2 GPU",
      "Expanse GPU",
    ]);
  });

  it("keeps what the documentation leaves out as null, never as no", () => {
    const view = latestResourceComparison([human("h1"), tool("c1", anvilSet)]);
    const jetstream = view!.resources.find((r) => r.name === "Jetstream2 GPU")!;

    expect(jetstream.sshHosts).toBeNull();
    expect(jetstream.filesystems).toBeNull();
    expect(jetstream.softwareUrl).toBeNull();
    expect(jetstream.ondemandUrl).toBeNull();
    expect(jetstream.queues).toEqual([
      expect.objectContaining({
        name: "Indiana Jetstream2 GPU",
        maxWallTimeHours: null,
      }),
    ]);
    expect(jetstream.mfaRequired).toBe(true);
    expect(jetstream.accountRequired).toBe(false);
    expect(jetstream.citationUrl).toBe(
      "https://support.access-ci.org/documentation/resources/jetstream2",
    );
  });

  it("lists names that matched several resources or none", () => {
    const view = latestResourceComparison([human("h1"), tool("c1", ambiguous)]);

    expect(view?.resources.map((r) => r.name)).toEqual(["Expanse GPU"]);
    expect(view?.unresolved).toEqual([
      { name: "Delta", matches: ["Delta CPU", "Delta GPU"] },
      { name: "Not A Resource", matches: [] },
    ]);
  });

  it("shows a resource compared twice in one answer once, with the newest result", () => {
    const renamed = structuredClone(deltaSet);
    renamed.items[2].organization = "SDSC, newer";

    const view = latestResourceComparison([
      human("h1"),
      tool("c1", ambiguous),
      tool("c2", renamed),
    ]);

    const names = view!.resources.map((r) => r.name);
    expect(names).toEqual(["Expanse GPU", "Delta GPU", "Bridges-2 GPU"]);
    expect(view!.resources[0].organization).toBe("SDSC, newer");
  });

  it("reads the wait times a resource documents", () => {
    const withWaits = structuredClone(anvilSet);
    (withWaits.items[0] as Record<string, unknown>).wait_times = {
      as_of: "2026-11-01",
      queues: [
        { queue: "gpu", average_wait_hours: 2.5, job_count: 120 },
        { queue: "gpu-debug", average_wait_hours: null, job_count: 3 },
      ],
    };

    const view = latestResourceComparison([human("h1"), tool("c1", withWaits)]);

    expect(view!.resources[0].waitTimes).toEqual({
      asOf: "2026-11-01",
      queues: [
        { queue: "gpu", averageWaitHours: 2.5, jobCount: 120 },
        { queue: "gpu-debug", averageWaitHours: null, jobCount: 3 },
      ],
    });
    expect(view!.resources[1].waitTimes).toBeNull();
  });

  it("takes the newest answer that compared resources, not an earlier one", () => {
    const view = latestResourceComparison([
      human("h1"),
      tool("c1", anvilSet),
      ai("a1"),
      human("h2"),
      tool("c2", deltaSet),
      ai("a2"),
      human("h3"),
      ai("a3"),
    ]);

    expect(view?.key).toBe("c2");
    expect(view?.resources).toHaveLength(3);
    expect(view?.resources[0].name).toBe("Delta GPU");
  });

  it("skips failed, unreadable and empty results", () => {
    expect(
      latestResourceComparison([
        human("h1"),
        tool("c1", anvilSet, "compare_resources", "error"),
        tool("c2", "not json"),
        tool("c3", { error: "boom", status: "error" }),
        tool("c4", { total: 0, items: [], unresolved: [] }),
      ]),
    ).toBeNull();
  });

  it("ignores other tools' results", () => {
    expect(
      latestResourceComparison([
        human("h1"),
        tool("c1", anvilSet, "search_resources"),
      ]),
    ).toBeNull();
  });
});

describe("resourceComparisonFor", () => {
  const messages = [
    human("h1"),
    tool("c1", anvilSet),
    tool("c2", acesSet),
    ai("a1"),
    human("h2"),
    tool("c3", deltaSet),
    ai("a2"),
  ];

  it("returns the whole answer's table for any of its calls", () => {
    const view = resourceComparisonFor(messages, "c1");

    expect(view?.key).toBe("c2");
    expect(view?.resources).toHaveLength(6);
  });

  it("returns null for a key it doesn't hold", () => {
    expect(resourceComparisonFor(messages, "nope")).toBeNull();
  });
});

describe("resourceComparisonsByMessage", () => {
  it("maps each answer to its table's key", () => {
    const map = resourceComparisonsByMessage([
      human("h1"),
      ai("a0"),
      tool("c1", anvilSet),
      tool("c2", acesSet),
      ai("a1"),
      human("h2"),
      ai("a2"),
    ]);

    expect([...map]).toEqual([["a1", "c2"]]);
  });
});

describe("newestPanelStep", () => {
  it("gives the panel to a resource comparison that comes after a software one", () => {
    const software = {
      requested_software: ["gromacs"],
      requested_resources: ["delta"],
      all_resources_found: ["delta"],
      comparison: [
        { software: "gromacs", found: true, available_on: ["delta"] },
      ],
    };

    expect(
      newestPanelStep([
        human("h1"),
        tool("s1", software, "compare_software_availability"),
        ai("a1"),
        human("h2"),
        tool("c1", anvilSet),
        ai("a2"),
      ]),
    ).toBe("resources");
    expect(
      newestPanelStep([
        human("h1"),
        tool("c1", anvilSet),
        ai("a1"),
        human("h2"),
        tool("s1", software, "compare_software_availability"),
        ai("a2"),
      ]),
    ).toBe("comparison");
  });
});
