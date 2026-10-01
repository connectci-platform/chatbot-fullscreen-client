import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button";

describe("Button", () => {
  it("renders the default variant with ACCESS brand styling", () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole("button", { name: "Click me" });

    expect(button.className).toContain("bg-[#fec340]");
    expect(button.className).toContain("uppercase");
    expect(button.className).toContain("border-2");
  });

  it("applies different classes for the secondary variant than the default", () => {
    const { rerender } = render(<Button>Default</Button>);
    const defaultClassName = screen.getByRole("button").className;

    rerender(<Button variant="secondary">Secondary</Button>);
    const secondaryClassName = screen.getByRole("button").className;

    expect(secondaryClassName).not.toBe(defaultClassName);
    expect(secondaryClassName).toContain("bg-secondary");
  });

  it("fires the onClick handler when clicked", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Submit</Button>);

    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
