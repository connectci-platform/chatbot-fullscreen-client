"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import type { Components } from "react-markdown";
import type { Message } from "@langchain/langgraph-sdk";
import { ExternalLink, FileText } from "lucide-react";
import { answerSources, type AnswerSource } from "@/lib/answer-sources";
import { useStreamContext } from "@/providers/Stream";
import { useArtifact } from "./artifact";
import { MarkdownText } from "./markdown-text";

type HeadingProps = ComponentProps<"h4"> & { node?: unknown };

/**
 * Passage headings sit below the panel's own h2 title and h3 "Excerpt", so
 * screen readers hear them inside the excerpt: h1 becomes h4, h2 h5, the rest
 * h6. Links leave the chat for the documentation site. Images aren't
 * loaded from the documentation's servers; they become a link instead.
 */
const PASSAGE_COMPONENTS: Components = {
  h1: ({ node: _node, ...props }: HeadingProps) => (
    <h4
      className="mt-4 mb-2 font-bold first:mt-0"
      {...props}
    />
  ),
  h2: ({ node: _node, ...props }: HeadingProps) => (
    <h5
      className="mt-4 mb-2 font-semibold first:mt-0"
      {...props}
    />
  ),
  ...Object.fromEntries(
    (["h3", "h4", "h5", "h6"] as const).map((tag) => [
      tag,
      ({ node: _node, ...props }: HeadingProps) => (
        <h6
          className="mt-4 mb-2 font-semibold first:mt-0"
          {...props}
        />
      ),
    ]),
  ),
  a: ({ node: _node, ...props }: ComponentProps<"a"> & { node?: unknown }) => (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium"
    />
  ),
  img: ({ src, alt }: ComponentProps<"img">) => {
    const label = `Image: ${alt || "untitled"}`;
    return typeof src === "string" && src ? (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
      >
        {label}
      </a>
    ) : (
      <span>{label}</span>
    );
  },
};

const NO_SOURCE = {
  unlinked: "This answer doesn't link any of the documentation it retrieved.",
  "not-retrieved": "No documentation was retrieved for this answer.",
} as const;

export function SourceDetails({
  source,
  id,
}: {
  source: AnswerSource;
  id?: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Opening a source, or switching to another, takes the reader to it.
  useEffect(() => heading.current?.focus(), [source.key]);

  return (
    <div
      id={id}
      className="flex h-full flex-col gap-4 overflow-y-auto p-6"
    >
      <div>
        <h2
          ref={heading}
          tabIndex={-1}
          className="text-lg font-bold break-words outline-none"
        >
          {source.title}
        </h2>
        {source.linkText && (
          <p className="text-muted-foreground text-sm">
            Linked as: {source.linkText}
          </p>
        )}
      </div>
      <section aria-labelledby="source-excerpt">
        <h3
          id="source-excerpt"
          className="font-semibold"
        >
          Excerpt
        </h3>
        <p className="text-muted-foreground text-sm">
          {source.passages.length === 1
            ? "The passage the documentation search returned from this page."
            : "The passages the documentation search returned from this page."}
        </p>
        {source.passages.map((passage) => (
          <blockquote
            key={passage}
            className="bg-muted mt-3 overflow-x-auto rounded-md border-l-4 p-4 text-sm"
          >
            <MarkdownText
              components={PASSAGE_COMPONENTS}
              math={false}
            >
              {passage}
            </MarkdownText>
          </blockquote>
        ))}
      </section>
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit items-center gap-1 text-sm font-semibold"
      >
        Open page
        <ExternalLink
          aria-hidden
          className="size-4"
        />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </div>
  );
}

/**
 * The documentation pages behind an answer. Selecting one opens the side
 * panel with the passage the answer was written from.
 */
export function AnswerSources({
  message,
  streaming,
}: {
  message: Message | undefined;
  streaming: boolean;
}) {
  const { messages } = useStreamContext();
  const result = useMemo(
    () => (message ? answerSources(messages, message) : null),
    [messages, message],
  );
  const [Artifact, { open, setOpen }] = useArtifact();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const panelId = `source-panel-${useId()}`;
  const chips = useRef(new Map<string, HTMLButtonElement>());
  const selected =
    result?.sources.find((source) => source.key === selectedKey) ?? null;

  // The answer was edited or regenerated and no longer cites the open source:
  // close the panel rather than leave it empty.
  const stale = selectedKey !== null && !selected;
  useEffect(() => {
    if (stale && open) setOpen(false);
  }, [stale, open, setOpen]);

  // Gone altogether, as when an answer is regenerated.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(
    () => () => {
      if (openRef.current) setOpen(false);
    },
    [setOpen],
  );

  // Closing the panel returns focus to the chip that opened it, unless the
  // reader has already moved on somewhere else.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open && selectedKey) {
      const active = document.activeElement;
      const lost =
        !active ||
        active === document.body ||
        !!document.getElementById(panelId)?.contains(active);
      if (lost) chips.current.get(selectedKey)?.focus();
    }
    wasOpen.current = open;
  }, [open, selectedKey, panelId]);

  if (!result || streaming) return null;

  if (!result.sources.length) {
    return result.noSource ? (
      <p className="text-muted-foreground text-sm">
        {NO_SOURCE[result.noSource]}
      </p>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-2">
      <h3
        id={`sources-${message?.id}`}
        className="text-sm font-semibold"
      >
        Sources
      </h3>
      <ul
        aria-labelledby={`sources-${message?.id}`}
        className="flex flex-wrap gap-2"
      >
        {result.sources.map((source) => (
          <li key={source.key}>
            <button
              type="button"
              ref={(el) => {
                if (el) chips.current.set(source.key, el);
                else chips.current.delete(source.key);
              }}
              aria-expanded={open && selectedKey === source.key}
              aria-controls={panelId}
              onClick={() => {
                setSelectedKey(source.key);
                setOpen(true);
              }}
              className="hover:bg-muted flex max-w-xs cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm"
            >
              <FileText
                aria-hidden
                className="size-4 shrink-0"
              />
              <span className="truncate font-medium">{source.chipLabel}</span>
              <span className="text-muted-foreground shrink-0">
                {source.host}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <Artifact title="Source">
          <SourceDetails
            id={panelId}
            source={selected}
          />
        </Artifact>
      )}
    </div>
  );
}
