import { program } from "@/config/program";

/**
 * Suggested first questions, shown before a conversation starts. They read as
 * lines the visitor might type, so they stay plain text in the brand teal; the
 * yellow bar on hover and focus marks the one being chosen.
 */
export function StarterQuestions({
  onAsk,
  questions = program.starterQuestions,
}: {
  onAsk: (question: string) => void;
  questions?: string[];
}) {
  if (!questions.length) return null;
  return (
    <section
      aria-labelledby="starter-questions-heading"
      className="mt-6"
    >
      <h2
        id="starter-questions-heading"
        className="text-muted-foreground mb-1 text-sm"
      >
        Try asking
      </h2>
      <ul className="flex flex-col">
        {questions.map((question) => (
          <li key={question}>
            <button
              type="button"
              onClick={() => onAsk(question)}
              className="text-brand hover:border-primary hover:bg-primary/10 focus-visible:border-primary focus-visible:bg-primary/10 focus-visible:ring-brand w-full cursor-pointer border-l-4 border-transparent py-2 pr-3 pl-3 text-left text-[15px] transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none"
            >
              {question}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
