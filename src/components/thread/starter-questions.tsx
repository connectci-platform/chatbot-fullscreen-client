import { MessageSquare } from "lucide-react";
import { program } from "@/config/program";

/** Suggested first questions, shown before a conversation starts. */
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
      className="mt-4 flex flex-col gap-2"
    >
      <h2
        id="starter-questions-heading"
        className="text-muted-foreground text-sm"
      >
        Try asking
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {questions.map((question) => (
          <li key={question}>
            <button
              type="button"
              onClick={() => onAsk(question)}
              className="hover:bg-muted focus-visible:ring-ring flex h-full w-full cursor-pointer items-start gap-2 rounded-md border bg-white px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              <MessageSquare
                aria-hidden
                className="text-muted-foreground mt-0.5 size-4 shrink-0"
              />
              <span>{question}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
