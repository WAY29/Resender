import { describe, expect, it } from "vitest";
import { getDisplayName, getDomain } from "./format";
import { i18n } from "./i18n";

describe("display name formatting", () => {
  it("keeps data urls intact for request names", () => {
    const dataUrl = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=";
    expect(getDisplayName(dataUrl)).toBe(dataUrl);
  });
});

describe("domain formatting", () => {
  it("marks chrome extension requests as extension-loaded", () => {
    expect(getDomain("chrome-extension://abcdefghijklmnop/icon.png")).toBe(i18n.extensionDomain);
  });

  it("keeps normal web hosts unchanged", () => {
    expect(getDomain("https://example.test/path")).toBe("example.test");
  });

  it("keeps data urls without a domain label", () => {
    expect(getDomain("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toBe("");
  });
});
