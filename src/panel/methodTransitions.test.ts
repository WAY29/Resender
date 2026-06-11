import { describe, expect, it } from "vitest";
import {
  ensureContentTypeHeader,
  removeAutoAddedEmptyContentType,
  syncAutoAddedContentTypeIndex
} from "./methodTransitions";

describe("ensureContentTypeHeader", () => {
  it("appends a Content-Type header when one is missing", () => {
    expect(
      ensureContentTypeHeader([{ name: "Authorization", value: "Bearer" }])
    ).toEqual({
      headers: [
        { name: "Authorization", value: "Bearer" },
        { name: "Content-Type", value: "" }
      ],
      addedIndex: 1
    });
  });

  it("reuses an existing Content-Type header ignoring case", () => {
    const headers = [{ name: "content-type", value: "application/json" }];

    expect(ensureContentTypeHeader(headers)).toEqual({
      headers,
      existingIndex: 0
    });
  });
});

describe("syncAutoAddedContentTypeIndex", () => {
  it("keeps tracking the empty auto-added Content-Type when earlier headers move", () => {
    const contentTypeHeader = { name: "Content-Type", value: "" };

    expect(
      syncAutoAddedContentTypeIndex(
        [
          { name: "X-Test", value: "1" },
          contentTypeHeader
        ],
        [contentTypeHeader],
        1
      )
    ).toBe(0);
  });

  it("stops tracking once the auto-added Content-Type gets a value", () => {
    expect(
      syncAutoAddedContentTypeIndex(
        [
          { name: "X-Test", value: "1" },
          { name: "Content-Type", value: "" }
        ],
        [
          { name: "X-Test", value: "1" },
          { name: "Content-Type", value: "application/json" }
        ],
        1
      )
    ).toBeUndefined();
  });
});

describe("removeAutoAddedEmptyContentType", () => {
  it("removes an auto-added empty Content-Type header", () => {
    expect(
      removeAutoAddedEmptyContentType(
        [
          { name: "Authorization", value: "Bearer" },
          { name: "Content-Type", value: "" }
        ],
        1
      )
    ).toEqual([{ name: "Authorization", value: "Bearer" }]);
  });

  it("keeps a Content-Type header after the user fills it", () => {
    const headers = [
      { name: "Authorization", value: "Bearer" },
      { name: "Content-Type", value: "application/json" }
    ];

    expect(removeAutoAddedEmptyContentType(headers, 1)).toBe(headers);
  });
});
