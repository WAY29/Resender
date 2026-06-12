import { describe, expect, it } from "vitest";
import { isWindowsPlatform } from "./platform";

describe("isWindowsPlatform", () => {
  it("detects Windows platforms", () => {
    expect(isWindowsPlatform("Win32")).toBe(true);
    expect(isWindowsPlatform("Windows x64")).toBe(true);
  });

  it("does not treat non-Windows platforms as Windows", () => {
    expect(isWindowsPlatform("MacIntel")).toBe(false);
    expect(isWindowsPlatform("Linux x86_64")).toBe(false);
  });
});
