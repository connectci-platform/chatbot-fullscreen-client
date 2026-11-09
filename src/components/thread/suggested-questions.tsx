import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Questions the visitor can ask with one click. They read as lines the
 * visitor might type, so they stay plain text in the brand teal; the yellow
 * bar on hover and focus marks the one being chosen.
 */
export function SuggestedQuestions({
  heading,
  questions,
  onAsk,
  disabled = false,
  compact = false,
  className,
}: {
  heading: string;
  questions: string[];
  onAsk: (question: string) => void;
  /** While a reply is running; keeps focus on the button, unlike `disabled`. */
  disabled?: boolean;
  /**
   * Inside an answer: the question text lines up with the answer's text, with
   * the hover bar hanging in the margin, and the lines sit closer together.
   */
  compact?: boolean;
  className?: string;
}) {
  const headingId = useId();
  if (!questions.length) return null;
  return (
    <section
      aria-labelledby={headingId}
      className={className}
    >
      <h2
        id={headingId}
        className={cn(
          "text-muted-foreground mb-1 text-sm",
          compact ? "mt-1" : "pl-4",
        )}
      >
        {heading}
      </h2>
      <ul className={cn("flex flex-col", compact && "-ml-4")}>
        {questions.map((question) => (
          <li key={question}>
            <button
              type="button"
              aria-disabled={disabled || undefined}
              onClick={() => {
                if (!disabled) onAsk(question);
              }}
              className={cn(
                "hover:text-brand hover:border-primary hover:bg-primary/10 focus-visible:border-primary focus-visible:bg-primary/10 focus-visible:ring-brand w-full cursor-pointer border-l-4 border-transparent pr-3 pl-3 text-left text-black underline transition-colors hover:no-underline focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset aria-disabled:cursor-not-allowed aria-disabled:opacity-60 motion-reduce:transition-none",
                compact ? "py-1 text-base" : "py-2 text-[15px]",
              )}
            >
              {question}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
