import { APP_NAME } from "./branding";

describe("branding", () => {
  it("exports the expected product name", () => {
    expect(APP_NAME).toBe("ACCESS Assistant");
  });
});
