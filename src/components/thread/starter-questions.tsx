import { program } from "@/config/program";
import { SuggestedQuestions } from "./suggested-questions";

/** Suggested first questions, shown before a conversation starts. */
export function StarterQuestions({
  onAsk,
  questions = program.starterQuestions,
}: {
  onAsk: (question: string) => void;
  questions?: string[];
}) {
  return (
    <SuggestedQuestions
      heading="Try asking"
      questions={questions}
      onAsk={onAsk}
      className="mt-6"
    />
  );
}
