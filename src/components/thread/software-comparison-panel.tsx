"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  latestComparison,
  newestPanelStep,
  type ComparisonCell,
  type SoftwareComparisonView,
} from "@/lib/software-comparison";
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
    return (
      <td className="border-b px-3 py-2 align-top">
        <span className="font-semibold text-teal-800 dark:text-teal-300">
          ✓ Listed
        </span>
        <div className="mt-1 text-xs break-words">
          <Versions versions={cell.versions} />
        </div>
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

export function SoftwareComparisonGrid({
  view,
}: {
  view: SoftwareComparisonView;
}) {
  const gaps = new Set(
    view.rows.flatMap((row) => row.cells.map((cell) => cell.status)),
  );
  const names = view.rows.map((row) => row.software).join(", ");
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
          <table className="min-w-max border-collapse text-left text-sm">
            <caption className="sr-only">Where the index lists {names}</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="bg-background sticky left-0 z-10 border-r border-b px-3 py-2"
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
                    className="bg-background sticky left-0 z-10 max-w-[10rem] border-r border-b px-3 py-2 align-top break-words"
                  >
                    {row.documentation ? (
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
                    )}
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
