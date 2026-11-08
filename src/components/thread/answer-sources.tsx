"use client";

import { useMemo, useState, type ComponentProps } from "react";
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
 * h6. Links leave the chat for the documentation site.
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
      className="text-primary font-medium underline underline-offset-4"
    />
  ),
};

export function SourceDetails({ source }: { source: AnswerSource }) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <div>
        <h2 className="text-xl font-bold">{source.label}</h2>
        <p className="text-muted-foreground text-sm">{source.host}</p>
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
        className="inline-flex w-fit items-center gap-1 text-sm font-semibold underline"
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
  const [Artifact, { setOpen }] = useArtifact();
  const [selected, setSelected] = useState<AnswerSource | null>(null);

  if (!result || streaming) return null;

  if (!result.sources.length) {
    return result.citesNoSource ? (
      <p className="text-muted-foreground text-sm">
        This answer doesn&apos;t cite a documentation source.
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
          <li key={source.url}>
            <button
              type="button"
              onClick={() => {
                setSelected(source);
                setOpen(true);
              }}
              className="hover:bg-muted flex max-w-xs cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm"
            >
              <FileText
                aria-hidden
                className="size-4 shrink-0"
              />
              <span className="truncate font-medium">{source.label}</span>
              <span className="text-muted-foreground shrink-0">
                {source.host}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <Artifact title="Source">
          <SourceDetails source={selected} />
        </Artifact>
      )}
    </div>
  );
}
