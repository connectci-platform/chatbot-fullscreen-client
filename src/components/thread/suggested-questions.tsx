import { useId } from "react";

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
  className,
}: {
  heading: string;
  questions: string[];
  onAsk: (question: string) => void;
  /** While a reply is running; keeps focus on the button, unlike `disabled`. */
  disabled?: boolean;
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
        className="text-muted-foreground mb-1 pl-4 text-sm"
      >
        {heading}
      </h2>
      <ul className="flex flex-col">
        {questions.map((question) => (
          <li key={question}>
            <button
              type="button"
              aria-disabled={disabled || undefined}
              onClick={() => {
                if (!disabled) onAsk(question);
              }}
              className="text-brand hover:border-primary hover:bg-primary/10 focus-visible:border-primary focus-visible:bg-primary/10 focus-visible:ring-brand w-full cursor-pointer border-l-4 border-transparent py-2 pr-3 pl-3 text-left text-[15px] transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset aria-disabled:cursor-not-allowed aria-disabled:opacity-60 motion-reduce:transition-none"
            >
              {question}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
