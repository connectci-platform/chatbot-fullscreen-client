"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  latestComparison,
  newestPanelStep,
  type ComparisonCell,
  type SoftwareComparisonView,
} from "@/lib/software-comparison";
import { cn } from "@/lib/utils";
import { useStreamContext } from "@/providers/Stream";
import { useArtifact } from "./artifact";

const SHOWN_VERSIONS = 3;

const GAP_HELP = {
  not_listed:
    "The index covers this resource but doesn't list this software. It may still be installed, so check the resource's documentation or ask its support team.",
  not_indexed:
    "The index returned nothing for this resource, so it may not be covered yet. This says nothing about what is installed there.",
  lookup_failed:
    "Checking this resource's software list failed, so nothing is known about it here. Ask again later or check the resource's documentation.",
};

const GAP_TEXT = {
  not_listed: "Not listed",
  not_indexed: "Not indexed",
  lookup_failed: "Couldn't check",
};

function Versions({ versions }: { versions: string[] }) {
  if (versions.length === 0) {
    return <span className="text-muted-foreground">Version not given</span>;
  }
  const shown = versions.slice(0, SHOWN_VERSIONS);
  const rest = versions.slice(SHOWN_VERSIONS);
  return (
    <>
      <ul className="flex flex-col">
        {shown.map((v) => (
          <li key={v}>{v}</li>
        ))}
      </ul>
      {rest.length > 0 && (
        <details>
          <summary className="cursor-pointer underline">
            {rest.length} more
          </summary>
          <ul className="flex flex-col">
            {rest.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Cell({ cell }: { cell: ComparisonCell }) {
  if (cell.status === "listed") {
    // Versions already show the software is listed, so the tick is only
    // needed when the index gives none.
    return (
      <td className="border-b px-3 py-2 align-top">
        {cell.versions.length === 0 ? (
          <>
            <span className="font-semibold text-teal-800 dark:text-teal-300">
              ✓ Listed
            </span>
            <div className="mt-1 text-xs">
              <Versions versions={cell.versions} />
            </div>
          </>
        ) : (
          /* Build names such as 29aug2024_update2-kokkos-cuda have no spaces,
             so let them break anywhere rather than widen the column. */
          <div className="[overflow-wrap:anywhere]">
            <Versions versions={cell.versions} />
          </div>
        )}
      </td>
    );
  }
  return (
    <td className="text-muted-foreground border-b px-3 py-2 align-top">
      {cell.status === "not_listed" ? (
        GAP_TEXT.not_listed
      ) : (
        <em>{GAP_TEXT[cell.status]}</em>
      )}
    </td>
  );
}

const CORNER = "bg-background sticky left-0 z-10 border-r border-b px-3 py-2";
const ROW_HEADER =
  "bg-background sticky left-0 z-10 max-w-[10rem] border-r border-b px-3 py-2 align-top break-words";

function SoftwareName({
  row,
}: {
  row: SoftwareComparisonView["rows"][number];
}) {
  return row.documentation ? (
    <a
      href={row.documentation}
      target="_blank"
      rel="noopener noreferrer"
      className="underline"
    >
      {row.software}
    </a>
  ) : (
    row.software
  );
}

export function SoftwareComparisonGrid({
  view,
}: {
  view: SoftwareComparisonView;
}) {
  const gaps = new Set(
    view.rows.flatMap((row) => row.cells.map((cell) => cell.status)),
  );
  const names = view.rows.map((row) => row.software).join(", ");
  // The panel is narrow, so the longer list runs down the side. Usually that's
  // the resources: a few packages compared across many systems.
  const resourcesDown = view.resources.length > view.rows.length;
  const gapsShown = (
    ["not_listed", "not_indexed", "lookup_failed"] as const
  ).filter((gap) => gaps.has(gap));

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      <p className="text-muted-foreground text-sm">
        From the ACCESS Software Discovery index. The grid shows only what the
        index returned.
      </p>

      {view.resources.length === 0 ? (
        <p className="bg-muted rounded-md border p-4 text-sm">
          The index returned no resources for {names}.
        </p>
      ) : (
        <div
          role="region"
          aria-label="Software by resource"
          tabIndex={0}
          className="max-w-full overflow-x-auto rounded-md border"
        >
          <table
            className={cn(
              "border-collapse text-left text-sm",
              // Resources down the side leaves a few package columns, which
              // fit the panel. Resources across can need to scroll.
              resourcesDown ? "w-full" : "min-w-max",
            )}
          >
            <caption className="sr-only">Where the index lists {names}</caption>
            {resourcesDown ? (
              <>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className={CORNER}
                    >
                      Resource
                    </th>
                    {view.rows.map((row) => (
                      <th
                        key={row.software}
                        scope="col"
                        className="border-b px-3 py-2 align-bottom whitespace-nowrap"
                      >
                        <SoftwareName row={row} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.resources.map((resource, i) => (
                    <tr key={resource.name}>
                      <th
                        scope="row"
                        className={ROW_HEADER}
                      >
                        {resource.name}
                      </th>
                      {view.rows.map((row) => (
                        <Cell
                          key={row.software}
                          cell={row.cells[i]}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </>
            ) : (
              <>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className={CORNER}
                    >
                      Software
                    </th>
                    {view.resources.map((resource) => (
                      <th
                        key={resource.name}
                        scope="col"
                        className="border-b px-3 py-2 align-bottom whitespace-nowrap"
                      >
                        {resource.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((row) => (
                    <tr key={row.software}>
                      <th
                        scope="row"
                        className={ROW_HEADER}
                      >
                        <SoftwareName row={row} />
                      </th>
                      {row.cells.map((cell, i) => (
                        <Cell
                          key={view.resources[i].name}
                          cell={cell}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </table>
        </div>
      )}

      {view.notFound.length > 0 && (
        <p className="text-sm">
          The index didn&apos;t find {view.notFound.join(", ")} on any resource
          it covers. That doesn&apos;t mean it&apos;s unavailable everywhere.
        </p>
      )}

      {gapsShown.length > 0 && (
        <dl className="flex flex-col gap-2 text-sm">
          {gapsShown.map((gap) => (
            <div key={gap}>
              <dt className="font-semibold">{GAP_TEXT[gap]}</dt>
              <dd className="text-muted-foreground">{GAP_HELP[gap]}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * Opens the side panel when the conversation reaches a new software
 * comparison, unless a registration step is newer.
 */
export function SoftwareComparisonPanel() {
  const stream = useStreamContext();
  const view = useMemo(
    () => latestComparison(stream.messages),
    [stream.messages],
  );
  const [Artifact, { open, setOpen }] = useArtifact();
  const shownKey = useRef<string | null>(null);

  const key = view?.key ?? null;
  const owns = useMemo(
    () => newestPanelStep(stream.messages) === "comparison",
    [stream.messages],
  );
  useEffect(() => {
    if (key === shownKey.current) return;
    shownKey.current = key;
    if (key === null) {
      if (open) setOpen(false);
    } else if (owns) {
      setOpen(true);
    }
  }, [key, owns, open, setOpen]);

  if (!view) return null;
  return (
    <Artifact title="Software availability">
      <SoftwareComparisonGrid view={view} />
    </Artifact>
  );
}
