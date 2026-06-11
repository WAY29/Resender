import { describe, expect, it } from "vitest";
import { getDomain } from "./format";
import { i18n } from "./i18n";

describe("domain formatting", () => {
  it("marks chrome extension requests as extension-loaded", () => {
    expect(getDomain("chrome-extension://abcdefghijklmnop/icon.png")).toBe(i18n.extensionDomain);
  });

  it("keeps normal web hosts unchanged", () => {
    expect(getDomain("https://example.test/path")).toBe("example.test");
  });
});
