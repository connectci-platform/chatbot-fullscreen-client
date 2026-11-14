"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  latestResourceComparison,
  resourceComparisonFor,
  type ComparedResource,
  type ResourceComparisonView,
} from "@/lib/resource-comparison";
import { newestPanelStep } from "@/lib/software-comparison";
import { useStreamContext } from "@/providers/Stream";
import { cn } from "@/lib/utils";
import { useArtifact } from "./artifact";

const SHOWN = 3;

function NotDocumented() {
  return <em className="text-muted-foreground">Not documented</em>;
}

/**
 * The first few items, then the rest behind "n more". Items are keyed by
 * position: documentation can repeat a name, such as two GPU-shared queues.
 */
function Clipped({ items }: { items: ReactNode[] }) {
  const rest = items.slice(SHOWN);
  return (
    <>
      <ul className="flex flex-col gap-1.5">{items.slice(0, SHOWN)}</ul>
      {rest.length > 0 && (
        <details className="mt-1.5">
          <summary className="hover:text-brand cursor-pointer underline hover:no-underline">
            {rest.length} more
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1.5">{rest}</ul>
        </details>
      )}
    </>
  );
}

const STATUS: Record<string, string> = {
  production: "In production",
  "pre-production": "Pre-production",
  "post-production": "Post-production (retiring)",
};

const required = (value: boolean | null) =>
  value === null ? <NotDocumented /> : value ? "Required" : "Not required";

function hours(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} h`;
}

/** A hostname that wraps after its dots rather than mid-word. */
function breakable(host: string): ReactNode {
  return host.split(/(?<=\.)/).map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <wbr />}
      {part}
    </Fragment>
  ));
}

interface Row {
  label: string;
  cell: (resource: ComparedResource) => ReactNode;
}

const ROWS: Row[] = [
  {
    label: "Organization",
    cell: (r) => r.organization ?? <NotDocumented />,
  },
  {
    label: "Status",
    cell: (r) =>
      r.status ? (STATUS[r.status] ?? r.status) : <NotDocumented />,
  },
  { label: "Multi-factor login", cell: (r) => required(r.mfaRequired) },
  { label: "Separate account", cell: (r) => required(r.accountRequired) },
  {
    label: "Log in",
    cell: (r) => {
      const items: ReactNode[] = [];
      if (r.ondemandUrl) {
        items.push(
          <li key="ondemand">
            <a
              href={r.ondemandUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open OnDemand
            </a>
          </li>,
        );
      }
      for (const [i, host] of (r.sshHosts ?? []).entries()) {
        items.push(
          <li key={`ssh-${i}`}>
            SSH <code className="text-xs">{breakable(host)}</code>
          </li>,
        );
      }
      return items.length > 0 ? <Clipped items={items} /> : <NotDocumented />;
    },
  },
  {
    label: "File transfer",
    cell: (r) =>
      r.transferMethods && r.transferMethods.length > 0 ? (
        <Clipped
          items={r.transferMethods.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        />
      ) : (
        <NotDocumented />
      ),
  },
  {
    label: "Queues",
    cell: (r) =>
      r.queues && r.queues.length > 0 ? (
        <Clipped
          items={r.queues.map((q, i) => (
            <li key={i}>
              <span className="font-semibold [overflow-wrap:anywhere]">
                {q.name}
              </span>
              {q.summary && (
                <span className="text-muted-foreground block text-xs">
                  {q.summary}
                </span>
              )}
              {q.maxWallTimeHours !== null && (
                <span className="text-muted-foreground block text-xs">
                  Up to {hours(q.maxWallTimeHours)} per job
                </span>
              )}
            </li>
          ))}
        />
      ) : (
        <NotDocumented />
      ),
  },
  {
    label: "Wait times",
    cell: (r) =>
      r.waitTimes ? (
        <>
          <p className="text-muted-foreground text-xs">
            Average, as of {r.waitTimes.asOf}
          </p>
          <Clipped
            items={r.waitTimes.queues.map((q, i) => (
              <li key={i}>
                <span className="[overflow-wrap:anywhere]">{q.queue}</span>{" "}
                {q.averageWaitHours === null ? (
                  <NotDocumented />
                ) : (
                  hours(q.averageWaitHours)
                )}
                {q.jobCount !== null && (
                  <span className="text-muted-foreground text-xs">
                    {" "}
                    ({q.jobCount.toLocaleString("en-US")} jobs)
                  </span>
                )}
              </li>
            ))}
          />
        </>
      ) : (
        <NotDocumented />
      ),
  },
  {
    label: "Storage",
    cell: (r) =>
      r.filesystems && r.filesystems.length > 0 ? (
        <Clipped
          items={r.filesystems.map((f, i) => (
            <li key={i}>
              {f.name}
              {f.summary && (
                <span className="text-muted-foreground block text-xs">
                  {f.summary}
                </span>
              )}
            </li>
          ))}
        />
      ) : (
        <NotDocumented />
      ),
  },
  {
    label: "Software",
    cell: (r) =>
      r.softwareUrl ? (
        <a
          href={r.softwareUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Software list
        </a>
      ) : (
        <NotDocumented />
      ),
  },
];

// Separate borders: collapsed ones scroll away from a sticky header.
const ROW_HEADER =
  "bg-background sticky left-0 z-10 border-r border-b px-3 py-2.5 text-left align-top font-semibold";
const CELL =
  "border-r border-b px-3 py-2.5 align-top [overflow-wrap:anywhere] last:border-r-0";
const HEAD =
  "bg-muted sticky top-0 z-20 border-r border-b px-3 py-2.5 text-left align-bottom font-semibold last:border-r-0";
// The label column, and the narrowest a resource column gets before the
// table scrolls sideways: two resources fit the panel, more scroll.
const LABEL_REM = 7;
const COLUMN_REM = 11;

export function ResourceComparisonTable({
  view,
}: {
  view: ResourceComparisonView;
}) {
  // Wait times are rarely documented: a row of gaps says nothing, so it shows
  // only when a resource has some.
  const rows = view.resources.some((r) => r.waitTimes)
    ? ROWS
    : ROWS.filter((row) => row.label !== "Wait times");
  const names = view.resources.map((r) => r.name).join(", ");
  const ambiguous = view.unresolved.filter((u) => u.matches.length > 0);
  const unmatched = view.unresolved.filter((u) => u.matches.length === 0);

  return (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-6">
      <p className="text-muted-foreground shrink-0 text-sm">
        From ACCESS Resource Documentation. Not documented means the
        documentation doesn&apos;t cover it, not that the resource lacks it.
      </p>

      <div
        role="region"
        aria-label="Resources side by side"
        tabIndex={0}
        // Scrolls both ways itself, so the header row and the label column
        // stay in view.
        className="min-h-0 max-w-full flex-1 overflow-auto rounded-md border"
      >
        <table
          className="w-full table-fixed border-separate border-spacing-0 text-left text-sm"
          style={{
            minWidth: `${LABEL_REM + COLUMN_REM * view.resources.length}rem`,
          }}
        >
          <caption className="sr-only">Comparing {names}</caption>
          <colgroup>
            <col style={{ width: `${LABEL_REM}rem` }} />
          </colgroup>
          <thead>
            <tr>
              <td className={cn(HEAD, "left-0 z-30 border-r")} />
              {view.resources.map((r) => (
                <th
                  key={r.id}
                  scope="col"
                  className={HEAD}
                >
                  {r.citationUrl ? (
                    <a
                      href={r.citationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {r.name}
                    </a>
                  ) : (
                    r.name
                  )}
                  {!r.detailsAvailable && (
                    <span className="text-muted-foreground block text-xs font-normal">
                      Only its listing could be read
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th
                  scope="row"
                  className={ROW_HEADER}
                >
                  {row.label}
                </th>
                {view.resources.map((r) => (
                  <td
                    key={r.id}
                    className={CELL}
                  >
                    {row.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ambiguous.map((u) => (
        <p
          key={u.name}
          className="shrink-0 text-sm"
        >
          {u.name} could mean {u.matches.join(", ")}, so it isn&apos;t in the
          table. Ask about one of them by name.
        </p>
      ))}
      {unmatched.length > 0 && (
        <p className="shrink-0 text-sm">
          Resource Documentation has nothing named{" "}
          {unmatched.map((u) => u.name).join(", ")}.
        </p>
      )}
    </div>
  );
}

const SHOW_RESOURCES = "resource-comparison:show";

/** Opens the panel on the resource table holding this call (its tool_call_id). */
export function showResourceComparison(key: string): void {
  window.dispatchEvent(
    new CustomEvent<string>(SHOW_RESOURCES, { detail: key }),
  );
}

/**
 * Opens the side panel when the conversation reaches a new resource
 * comparison, unless another panel's step is newer, and on an earlier one
 * picked with `showResourceComparison`.
 */
export function ResourceComparisonPanel() {
  const stream = useStreamContext();
  const latest = useMemo(
    () => latestResourceComparison(stream.messages),
    [stream.messages],
  );
  const [Artifact, { open, setOpen }] = useArtifact();
  const shownKey = useRef<string | null>(null);

  const key = latest?.key ?? null;
  // A picked table holds only until a newer one arrives.
  const [picked, setPicked] = useState<{
    key: string;
    latestKey: string | null;
  } | null>(null);
  const pickedView = useMemo(
    () =>
      picked && picked.latestKey === key
        ? resourceComparisonFor(stream.messages, picked.key)
        : null,
    [picked, key, stream.messages],
  );
  const view = pickedView ?? latest;

  useEffect(() => {
    const onShow = (event: Event) => {
      setPicked({ key: (event as CustomEvent<string>).detail, latestKey: key });
      setOpen(true);
    };
    window.addEventListener(SHOW_RESOURCES, onShow);
    return () => window.removeEventListener(SHOW_RESOURCES, onShow);
  }, [key, setOpen]);
  const owns = useMemo(
    () => newestPanelStep(stream.messages) === "resources",
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
    <Artifact title="Resource comparison">
      <ResourceComparisonTable view={view} />
    </Artifact>
  );
}
