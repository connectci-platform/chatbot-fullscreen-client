import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { access } from "@/config/programs/access";
import { StarterQuestions } from "./starter-questions";

describe("StarterQuestions", () => {
  it("offers the program's questions as buttons under a heading", () => {
    render(<StarterQuestions onAsk={() => {}} />);

    expect(screen.getByRole("region", { name: "Try asking" })).toBeTruthy();
    for (const question of access.starterQuestions) {
      expect(screen.getByRole("button", { name: question })).toBeTruthy();
    }
  });

  it("asks the question that was clicked, exactly as written", () => {
    const onAsk = vi.fn();
    render(
      <StarterQuestions
        onAsk={onAsk}
        questions={["First?", "Second?"]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Second?" }));

    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onAsk).toHaveBeenCalledWith("Second?");
  });

  it("renders nothing when a program has no questions", () => {
    const { container } = render(
      <StarterQuestions
        onAsk={() => {}}
        questions={[]}
      />,
    );

    expect(container.innerHTML).toBe("");
  });
});
