import { describe, expect, it } from "vitest";
import {
  isForbiddenRequestHeader,
  isProtectedRequestHeader,
  parseHeaderBlock,
  removeHeaderAt,
  splitEditableHeaders,
  upsertHeaderValue
} from "./headers";

describe("header parsing", () => {
  it("parses colon separated header lines", () => {
    expect(parseHeaderBlock("Authorization: Bearer abc\nX-Test: one:two")).toEqual([
      { name: "Authorization", value: "Bearer abc" },
      { name: "X-Test", value: "one:two" }
    ]);
  });

  it("keeps header names without a value editable", () => {
    expect(parseHeaderBlock("X-Empty")).toEqual([{ name: "X-Empty", value: "" }]);
  });
});

describe("header row editing", () => {
  it("updates one header value without mutating the original list", () => {
    const headers = [
      { name: "A", value: "1" },
      { name: "B", value: "2" }
    ];

    expect(upsertHeaderValue(headers, 1, "next")).toEqual([
      { name: "A", value: "1" },
      { name: "B", value: "next" }
    ]);
    expect(headers[1].value).toBe("2");
  });

  it("removes a header by index", () => {
    expect(
      removeHeaderAt(
        [
          { name: "A", value: "1" },
          { name: "B", value: "2" }
        ],
        0
      )
    ).toEqual([{ name: "B", value: "2" }]);
  });
});

describe("forbidden request headers", () => {
  it("blocks browser controlled headers", () => {
    expect(isForbiddenRequestHeader("Cookie")).toBe(true);
    expect(isForbiddenRequestHeader("Sec-Fetch-Mode")).toBe(true);
    expect(isForbiddenRequestHeader("Proxy-Authorization")).toBe(true);
  });

  it("allows application controlled headers", () => {
    expect(isForbiddenRequestHeader("Authorization")).toBe(false);
    expect(isForbiddenRequestHeader("X-Request-Id")).toBe(false);
  });

  it("protects only pseudo headers", () => {
    expect(isProtectedRequestHeader(":authority")).toBe(true);
    expect(isProtectedRequestHeader(":method")).toBe(true);
    expect(isProtectedRequestHeader("Cookie")).toBe(false);
    expect(isProtectedRequestHeader("Sec-Fetch-Mode")).toBe(false);
    expect(isProtectedRequestHeader("Authorization")).toBe(false);
  });

  it("skips only pseudo headers before resend", () => {
    expect(
      splitEditableHeaders([
        { name: ":authority", value: "example.test" },
        { name: "Cookie", value: "sid=1" },
        { name: "Authorization", value: "Bearer token" }
      ])
    ).toEqual({
      editable: [
        { name: "Cookie", value: "sid=1" },
        { name: "Authorization", value: "Bearer token" }
      ],
      skipped: [{ name: ":authority", value: "example.test" }]
    });
  });
});
