import { describe, expect, it } from "vitest";
import type { NetworkRecord } from "../types";
import { i18n } from "./i18n";
import {
  applyHarResponseBody,
  findRecordBySelectionId,
  findMergeTarget,
  linkRedirectRecords,
  mergeRecords,
  normaliseHarEntry
} from "./records";

describe("normaliseHarEntry", () => {
  it("preserves initiator source locations from HAR call frames", () => {
    const record = normaliseHarEntry(
      {
        startedDateTime: "2026-01-01T00:00:00.000Z",
        time: 12,
        request: {
          method: "GET",
          url: "https://example.test/api",
          headers: []
        },
        response: {
          status: 200,
          statusText: "OK",
          headers: [],
          content: { size: 24 }
        },
        _resourceType: "fetch",
        _initiator: {
          type: "script",
          stack: {
            callFrames: [
              {
                url: "https://example.test/assets/app.js",
                lineNumber: 12,
                columnNumber: 8
              }
            ]
          }
        }
      },
      "har:test"
    );

    expect(record.initiator).toBe("app.js:13");
    expect(record.initiatorLocation).toEqual({
      url: "https://example.test/assets/app.js",
      lineNumber: 12,
      columnNumber: 8
    });
  });

  it("normalises DevTools zero-status redirect entries to 301 with a target URL", () => {
    const record = normaliseHarEntry(
      {
        startedDateTime: "2026-01-01T00:00:00.000Z",
        time: 3,
        request: {
          method: "GET",
          url: "https://example.test/old",
          headers: []
        },
        response: {
          status: 0,
          statusText: "",
          redirectURL: "https://example.test/new",
          headers: []
        },
        _resourceType: "fetch"
      },
      "har:redirect"
    );

    expect(record.status).toBe(301);
    expect(record.statusText).toBe("Redirect");
    expect(record.redirectTargetUrl).toBe("https://example.test/new");
  });

  it("uses Chrome DevTools private transfer size fields before negative HAR body sizes", () => {
    const record = normaliseHarEntry(
      {
        startedDateTime: "2026-01-01T00:00:00.000Z",
        time: 3,
        request: {
          method: "GET",
          url: "https://example.test/app.js",
          headers: []
        },
        response: {
          status: 200,
          statusText: "OK",
          headers: [],
          bodySize: -1,
          content: { size: -1 }
        },
        _resourceType: "script",
        _transferSize: 1024,
        _resourceSize: 4096
      },
      "har:size"
    );

    expect(record.sizeBytes).toBe(1024);
    expect(record.sizeText).toBe("1.0 KB");
  });

  it("falls back to non-negative HAR content sizes", () => {
    const record = normaliseHarEntry(
      {
        startedDateTime: "2026-01-01T00:00:00.000Z",
        time: 3,
        request: {
          method: "GET",
          url: "https://example.test/style.css",
          headers: []
        },
        response: {
          status: 200,
          statusText: "OK",
          headers: [],
          bodySize: -1,
          content: { size: 174080 }
        },
        _resourceType: "stylesheet"
      },
      "har:content-size"
    );

    expect(record.sizeBytes).toBe(174080);
    expect(record.sizeText).toBe("170 KB");
  });

  it("prefers positive resource sizes over zero transfer sizes", () => {
    const record = normaliseHarEntry(
      {
        startedDateTime: "2026-01-01T00:00:00.000Z",
        time: 3,
        request: {
          method: "GET",
          url: "chrome-extension://example-extension/content-scripts/selection.css",
          headers: []
        },
        response: {
          status: 200,
          statusText: "OK",
          headers: [],
          bodySize: -1,
          content: { size: -1 }
        },
        _resourceType: "stylesheet",
        _transferSize: 0,
        _resourceSize: 174080
      },
      "har:resource-size"
    );

    expect(record.sizeBytes).toBe(174080);
    expect(record.sizeText).toBe("170 KB");
  });

  it("uses DevTools response content to backfill missing HAR sizes", () => {
    const record = normaliseHarEntry(
      {
        startedDateTime: "2026-01-01T00:00:00.000Z",
        time: 3,
        request: {
          method: "GET",
          url: "https://example.test/style.css",
          headers: []
        },
        response: {
          status: 200,
          statusText: "OK",
          headers: [{ name: "content-type", value: "text/css" }],
          bodySize: -1,
          content: { size: -1 }
        },
        _resourceType: "stylesheet"
      },
      "har:missing-size"
    );

    const updated = applyHarResponseBody(record, "body { color: red; }", "");

    expect(updated.sizeBytes).toBe(20);
    expect(updated.sizeText).toBe("20 B");
  });

  it("keeps HAR response mime types when DevTools omits response headers", () => {
    const record = normaliseHarEntry(
      {
        startedDateTime: "2026-01-01T00:00:00.000Z",
        time: 3,
        request: {
          method: "GET",
          url: "https://example.test/app.js",
          headers: []
        },
        response: {
          status: 200,
          statusText: "OK",
          headers: [],
          content: { mimeType: "application/javascript;charset=utf-8", size: -1 }
        },
        _resourceType: "script"
      },
      "har:missing-response-header"
    );

    expect(record.responseBody).toMatchObject({
      kind: "unavailable",
      mimeType: "application/javascript;charset=utf-8"
    });

    const updated = applyHarResponseBody(record, "const answer = 42;", "");

    expect(updated.responseBody).toMatchObject({
      kind: "text",
      mimeType: "application/javascript;charset=utf-8",
      text: "const answer = 42;"
    });
  });

  it("uses top-level initiator URLs when no stack call frame exists", () => {
    const record = normaliseHarEntry(
      {
        startedDateTime: "2026-01-01T00:00:00.000Z",
        time: 3,
        request: {
          method: "GET",
          url: "https://example.test/asset.svg",
          headers: []
        },
        response: {
          status: 200,
          statusText: "OK",
          headers: []
        },
        _resourceType: "image",
        _initiator: {
          type: "script",
          url: "https://example.test/post",
          lineNumber: 4,
          columnNumber: 2
        }
      },
      "har:initiator"
    );

    expect(record.initiator).toBe("post:5");
    expect(record.initiatorLocation).toEqual({
      url: "https://example.test/post",
      lineNumber: 4,
      columnNumber: 2
    });
  });

  it("uses parent stack frames when the immediate initiator stack is empty", () => {
    const record = normaliseHarEntry(
      {
        startedDateTime: "2026-01-01T00:00:00.000Z",
        time: 3,
        request: {
          method: "GET",
          url: "https://example.test/icon.svg",
          headers: []
        },
        response: {
          status: 200,
          statusText: "OK",
          headers: []
        },
        _resourceType: "image",
        _initiator: {
          type: "other",
          stack: {
            callFrames: [],
            parent: {
              callFrames: [
                {
                  url: "https://example.test/assets/sidebar.js",
                  lineNumber: 31,
                  columnNumber: 4
                }
              ]
            }
          }
        }
      },
      "har:parent-initiator"
    );

    expect(record.initiator).toBe("sidebar.js:32");
    expect(record.initiatorLocation).toEqual({
      url: "https://example.test/assets/sidebar.js",
      lineNumber: 31,
      columnNumber: 4
    });
  });
});

describe("mergeRecords", () => {
  it("keeps concrete sizes and initiators when a later record only has fallback values", () => {
    const existing = record("har:existing", {
      initiator: "sidebar.js:32",
      initiatorLocation: {
        url: "https://example.test/assets/sidebar.js",
        lineNumber: 31,
        columnNumber: 4
      },
      sizeBytes: 4096,
      sizeText: "4.0 KB"
    });
    const incoming = record("har:incoming", {
      initiator: "other",
      sizeBytes: -1,
      sizeText: "-"
    });

    expect(mergeRecords(existing, incoming)).toEqual(
      expect.objectContaining({
        initiator: "sidebar.js:32",
        initiatorLocation: {
          url: "https://example.test/assets/sidebar.js",
          lineNumber: 31,
          columnNumber: 4
        },
        sizeBytes: 4096,
        sizeText: "4.0 KB"
      })
    );
  });
});

describe("findMergeTarget", () => {
  it("merges DevTools HAR captures into an existing resend row for the same final URL", () => {
    const resend = record("resend:1", {
      source: "resend",
      method: "GET",
      url: "https://example.test/final",
      startedAt: 1000,
      resendId: "1",
      resent: true
    });
    const har = record("har:1", {
      source: "har",
      method: "GET",
      url: "https://example.test/final",
      startedAt: 1200,
      initiator: "Resender"
    });

    expect(findMergeTarget([resend], har)).toBe(resend);
  });

  it("links a redirect response to the following request when DevTools emits redirect pairs", () => {
    const redirect = record("har:redirect", {
      method: "GET",
      url: "https://example.test/old",
      status: 301,
      redirectTargetUrl: "https://example.test/new",
      responseHeaders: [{ name: "location", value: "https://example.test/new" }],
      initiator: "app.js:10",
      startedAt: 1000
    });
    const final = record("har:final", {
      method: "GET",
      url: "https://example.test/new",
      status: 200,
      initiator: "app.js:10",
      startedAt: 1100
    });

    expect(linkRedirectRecords([redirect, final])).toEqual([
      expect.objectContaining({ id: "har:redirect", redirectTargetId: "har:final" }),
      expect.objectContaining({ id: "har:final", redirectSourceId: "har:redirect" })
    ]);
  });

  it("does not link redirect candidates with different initiators", () => {
    const redirect = record("har:redirect", {
      method: "GET",
      url: "https://example.test/old",
      status: 301,
      redirectTargetUrl: "https://example.test/new",
      initiator: "app.js:10",
      startedAt: 1000
    });
    const unrelated = record("har:unrelated", {
      method: "GET",
      url: "https://example.test/new",
      status: 200,
      initiator: "other.js:2",
      startedAt: 1100
    });

    const [linkedRedirect, linkedUnrelated] = linkRedirectRecords([redirect, unrelated]);

    expect(linkedRedirect).not.toHaveProperty("redirectTargetId");
    expect(linkedUnrelated).not.toHaveProperty("redirectSourceId");
  });

  it("links ordinary zero-status and success pairs for the same request url", () => {
    const pending = record("har:pending", {
      method: "GET",
      url: "https://assets.example.test/img/icon-lock.gif",
      name: "icon-lock.gif",
      type: "image",
      status: 0,
      statusText: "",
      initiator: "index.js:41",
      responseHeaders: [],
      startedAt: 1000
    });
    const final = record("har:final", {
      method: "GET",
      url: "https://assets.example.test/img/icon-lock.gif",
      name: "icon-lock.gif",
      type: "image",
      status: 200,
      initiator: "index.js:41",
      startedAt: 1200
    });

    expect(linkRedirectRecords([pending, final])).toEqual([
      expect.objectContaining({
        id: "har:pending",
        status: 301,
        statusText: "Redirect",
        redirectTargetId: "har:final",
        redirectTargetUrl: final.url
      }),
      expect.objectContaining({ id: "har:final", redirectSourceId: "har:pending" })
    ]);
  });

  it("does not link ordinary zero-status and success pairs with different initiators", () => {
    const pending = record("har:pending", {
      method: "GET",
      url: "https://assets.example.test/img/icon-lock.gif",
      name: "icon-lock.gif",
      type: "image",
      status: 0,
      statusText: "",
      initiator: "index.js:41",
      responseHeaders: [],
      startedAt: 1000
    });
    const final = record("har:final", {
      method: "GET",
      url: "https://assets.example.test/img/icon-lock.gif",
      name: "icon-lock.gif",
      type: "image",
      status: 200,
      initiator: "other.js:2",
      startedAt: 1200
    });

    const [left, right] = linkRedirectRecords([pending, final]);

    expect(left).not.toHaveProperty("redirectTargetId");
    expect(right).not.toHaveProperty("redirectSourceId");
  });

  it("infers Chrome extension dynamic URL redirects from paired zero-status records", () => {
    const dynamicUrl = record("har:dynamic", {
      method: "GET",
      url: "chrome-extension://ca5f2f6e-1bb9-4b66-b4df-2955c41afe7d/content-scripts/selection.css",
      name: "selection.css",
      domain: i18n.extensionDomain,
      status: 0,
      statusText: "",
      initiator: "selection.js:2",
      responseHeaders: [],
      startedAt: 1000
    });
    const resolvedUrl = record("har:resolved", {
      method: "GET",
      url: "chrome-extension://modkelfkcfjpgbfmnbnllalkiogfofhb/content-scripts/selection.css",
      name: "selection.css",
      domain: i18n.extensionDomain,
      status: 200,
      initiator: "selection.js:2",
      startedAt: 1010
    });

    expect(linkRedirectRecords([dynamicUrl, resolvedUrl])).toEqual([
      expect.objectContaining({
        id: "har:dynamic",
        status: 301,
        statusText: "Redirect",
        redirectTargetId: "har:resolved",
        redirectTargetUrl: resolvedUrl.url
      }),
      expect.objectContaining({ id: "har:resolved", redirectSourceId: "har:dynamic" })
    ]);
  });

  it("infers stylesheet initiators for assets referenced by CSS url() values", () => {
    const stylesheet = record("har:css", {
      url: "chrome-extension://extension-id/css/sidebar.css",
      name: "sidebar.css",
      type: "css",
      responseBody: {
        kind: "text",
        text: ".lock {\n  background: url('../img/icon-lock.svg');\n}",
        sizeBytes: 52
      }
    });
    const image = record("har:image", {
      url: "chrome-extension://extension-id/img/icon-lock.svg",
      name: "icon-lock.svg",
      type: "image",
      initiator: "other"
    });

    expect(linkRedirectRecords([stylesheet, image])).toEqual([
      expect.objectContaining({ id: "har:css" }),
      expect.objectContaining({
        id: "har:image",
        initiator: "sidebar.css:2",
        initiatorLocation: {
          url: "chrome-extension://extension-id/css/sidebar.css",
          lineNumber: 1,
          columnNumber: 14
        }
      })
    ]);
  });
});

describe("findRecordBySelectionId", () => {
  it("resolves a resend selection to the row it was merged into", () => {
    const merged = record("hook:1", {
      source: "hook",
      resendId: "abc",
      resent: true
    });

    expect(findRecordBySelectionId([merged], "resend:abc")).toBe(merged);
  });
});

function record(id: string, overrides: Partial<NetworkRecord> = {}): NetworkRecord {
  return {
    id,
    source: "har",
    method: "GET",
    url: `https://example.test/${id}`,
    name: id,
    domain: "example.test",
    type: "fetch",
    sizeText: "-",
    startedAt: 0,
    requestHeaders: [],
    responseHeaders: [],
    requestBody: { kind: "empty", text: "", sizeBytes: 0 },
    responseBody: { kind: "empty", text: "", sizeBytes: 0 },
    ...overrides
  };
}
