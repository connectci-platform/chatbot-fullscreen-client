"use client";

import "./markdown-styles.css";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import {
  FC,
  isValidElement,
  memo,
  type ComponentProps,
  useMemo,
  useState,
} from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { SyntaxHighlighter } from "@/components/thread/syntax-highlighter";

import { TooltipIconButton } from "@/components/thread/tooltip-icon-button";
import { cn } from "@/lib/utils";
import { markdownBlocks } from "@/lib/markdown-blocks";
import { isSameOriginSrc, linkHost } from "@/lib/link-trust";
import { OffsiteLink } from "./offsite-link";

import "katex/dist/katex.min.css";

interface CodeHeaderProps {
  language?: string;
  code: string;
}

const useCopyToClipboard = ({
  copiedDuration = 3000,
}: {
  copiedDuration?: number;
} = {}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const copyToClipboard = (value: string) => {
    if (!value) return;

    navigator.clipboard.writeText(value).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), copiedDuration);
    });
  };

  return { isCopied, copyToClipboard };
};

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const onCopy = () => {
    if (!code || isCopied) return;
    copyToClipboard(code);
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-t-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
      <span className="lowercase [&>span]:text-xs">{language}</span>
      <TooltipIconButton
        tooltip="Copy"
        onClick={onCopy}
      >
        {!isCopied && <CopyIcon />}
        {isCopied && <CheckIcon />}
      </TooltipIconButton>
    </div>
  );
};

/**
 * Web links open in a new tab, so following one doesn't leave the chat. In-page
 * anchors and mailto: links stay as they are.
 */
function newTabProps(href: string | undefined) {
  return href && /^(https?:)?\/\//i.test(href)
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};
}

/**
 * The page's origin, for telling this site's images from another's. With no
 * window (server rendering) no absolute URL counts as this site's, so only
 * relative paths load there.
 */
function pageOrigin() {
  return typeof window === "undefined"
    ? "https://server-render.invalid"
    : window.location.origin;
}

const defaultComponents: any = {
  h1: ({ className, ...props }: { className?: string }) => (
    <h1
      className={cn(
        "text-heading mt-6 mb-3 scroll-m-20 text-4xl leading-[1.2] font-medium first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }: { className?: string }) => (
    <h2
      className={cn(
        "text-heading mt-6 mb-3 scroll-m-20 text-2xl leading-[1.2] font-bold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }: { className?: string }) => (
    <h3
      className={cn(
        "text-brand-dark mt-5 mb-3 scroll-m-20 text-xl leading-[1.2] font-bold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }: { className?: string }) => (
    <h4
      className={cn(
        "text-heading mt-4 mb-2 scroll-m-20 text-lg leading-[1.2] font-bold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h5: ({ className, ...props }: { className?: string }) => (
    <h5
      className={cn(
        "text-heading mt-4 mb-2 text-base font-bold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h6: ({ className, ...props }: { className?: string }) => (
    <h6
      className={cn(
        "text-heading my-4 text-base font-bold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  p: ({ className, ...props }: { className?: string }) => (
    <p
      className={cn("mt-5 mb-5 leading-7 first:mt-0 last:mb-0", className)}
      {...props}
    />
  ),
  a: ({
    className,
    node: _node,
    ...props
  }: ComponentProps<"a"> & { node?: unknown }) => (
    <OffsiteLink
      className={cn("font-medium", className)}
      {...props}
      {...newTabProps(props.href)}
    />
  ),
  // An image is fetched as soon as the answer renders, so one from another
  // site could carry conversation data out with no click. Only this site's
  // own images load. Same-site paths must never redirect off-site (no open
  // redirects, no remote patterns in next.config), or this check is moot.
  // Another site's image becomes its alt text and the host it's from.
  img: ({ src, alt }: { src?: unknown; alt?: string }) => {
    const source = typeof src === "string" ? src : "";
    if (source && isSameOriginSrc(source, pageOrigin())) {
      return (
        <img
          src={source}
          alt={alt ?? ""}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      );
    }
    // Plain text, not a link: the image may already sit inside one.
    const host = linkHost(source);
    return (
      <span>
        {alt || "image"}
        {host && (
          <span className="text-muted-foreground"> (image from {host})</span>
        )}
      </span>
    );
  },
  blockquote: ({ className, ...props }: { className?: string }) => (
    <blockquote
      className={cn("border-l-2 pl-6 italic", className)}
      {...props}
    />
  ),
  ul: ({ className, ...props }: { className?: string }) => (
    <ul
      className={cn("my-5 ml-6 list-disc [&>li]:mt-2", className)}
      {...props}
    />
  ),
  ol: ({ className, ...props }: { className?: string }) => (
    <ol
      className={cn("my-5 ml-6 list-decimal [&>li]:mt-2", className)}
      {...props}
    />
  ),
  hr: ({ className, ...props }: { className?: string }) => (
    <hr
      className={cn("my-5 border-b", className)}
      {...props}
    />
  ),
  table: ({ className, ...props }: { className?: string }) => (
    // A wide table scrolls inside its own box instead of widening the chat.
    <div className="my-5 overflow-x-auto">
      <table
        className={cn("w-full border-separate border-spacing-0", className)}
        {...props}
      />
    </div>
  ),
  th: ({ className, ...props }: { className?: string }) => (
    <th
      className={cn(
        "bg-muted px-4 py-2 text-left font-bold first:rounded-tl-lg last:rounded-tr-lg [&[align=center]]:text-center [&[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }: { className?: string }) => (
    <td
      className={cn(
        "border-b border-l px-4 py-2 text-left last:border-r [&[align=center]]:text-center [&[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }: { className?: string }) => (
    <tr
      className={cn(
        "m-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-bl-lg [&:last-child>td:last-child]:rounded-br-lg",
        className,
      )}
      {...props}
    />
  ),
  sup: ({ className, ...props }: { className?: string }) => (
    <sup
      className={cn("[&>a]:text-xs [&>a]:no-underline", className)}
      {...props}
    />
  ),
  pre: ({ children }: { children?: React.ReactNode }) => {
    const { className, children: text } = (
      isValidElement(children) ? children.props : {}
    ) as { className?: string; children?: React.ReactNode };
    const label = /language-(\w+)/.exec(className || "")?.[1];
    const code = String(text ?? "").replace(/\n$/, "");

    return (
      <div className="max-w-4xl overflow-x-auto rounded-lg bg-black text-white">
        <CodeHeader
          language={label ?? "code"}
          code={code}
        />
        {/* Answers here are mostly commands, so unlabeled blocks are shell. */}
        <SyntaxHighlighter
          language={label ?? "bash"}
          className={className}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    );
  },
  code: ({ className, ...props }: { className?: string }) => (
    <code
      className={cn("rounded font-semibold", className)}
      {...props}
    />
  ),
};

const WITH_MATH = { remark: [remarkGfm, remarkMath], rehype: [rehypeKatex] };
const WITHOUT_MATH = { remark: [remarkGfm], rehype: [] };

/**
 * One block of the text. Memoized on its text, so while an answer streams
 * only the block still being written is parsed again on each token: parsing
 * the whole answer every time froze the page for long answers.
 */
const MarkdownBlock = memo(function MarkdownBlock({
  text,
  components,
  math,
}: {
  text: string;
  components: Components;
  math: boolean;
}) {
  const plugins = math ? WITH_MATH : WITHOUT_MATH;
  return (
    <ReactMarkdown
      remarkPlugins={plugins.remark}
      rehypePlugins={plugins.rehype}
      components={components}
    >
      {text}
    </ReactMarkdown>
  );
});

const MarkdownTextImpl: FC<{
  children: string;
  /** Replaces the default renderer for these elements. */
  components?: Components;
  /** Off for quoted text, where "$HOME and $PROJECT" isn't math. */
  math?: boolean;
}> = ({ children, components, math = true }) => {
  const merged = useMemo(
    () =>
      components ? { ...defaultComponents, ...components } : defaultComponents,
    [components],
  );
  const blocks = useMemo(() => markdownBlocks(children), [children]);
  // The blocks render as siblings, with no wrapper of their own, so
  // first:/last: margins apply across the whole text as before.
  return (
    <div className="markdown-content">
      {blocks.map((block, i) => (
        <MarkdownBlock
          key={i}
          text={block}
          components={merged}
          math={math}
        />
      ))}
    </div>
  );
};

export const MarkdownText = memo(MarkdownTextImpl);
