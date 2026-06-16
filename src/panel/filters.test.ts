import { describe, expect, it } from "vitest";
import type { FilterState, NetworkRecord } from "../types";
import {
  applyFilterAutocompleteSuggestion,
  getFilterAutocomplete,
  getFilterNotices,
  matchesFilter,
  moveFilterAutocompleteIndex,
  parseNetworkFilterQuery
} from "./filters";

describe("parseNetworkFilterQuery", () => {
  const chromiumParserCases = [
    { query: "plain text", expectedTokens: [{ kind: "text", text: "plain", negative: false }, { kind: "text", text: "text", negative: false }] },
    { query: "single:value", expectedTokens: [{ kind: "text", text: "single:value", negative: false }] },
    { query: "-single:value", expectedTokens: [{ kind: "text", text: "single:value", negative: true }] },
    { query: "one:foo two:bar", expectedTokens: [{ kind: "text", text: "one:foo", negative: false }, { kind: "text", text: "two:bar", negative: false }] },
    { query: "-one:foo two:bar", expectedTokens: [{ kind: "text", text: "one:foo", negative: true }, { kind: "text", text: "two:bar", negative: false }] },
    { query: "-one:foo -two:bar", expectedTokens: [{ kind: "text", text: "one:foo", negative: true }, { kind: "text", text: "two:bar", negative: true }] },
    { query: "one:foo -two:bar", expectedTokens: [{ kind: "text", text: "one:foo", negative: false }, { kind: "text", text: "two:bar", negative: true }] },
    { query: "bar key foo", expectedTokens: [{ kind: "text", text: "bar", negative: false }, { kind: "text", text: "key", negative: false }, { kind: "text", text: "foo", negative: false }] },
    {
      query: "bar status-code:200",
      expectedTokens: [
        { kind: "text", text: "bar", negative: false },
        { kind: "property", key: "status-code", value: "200", negative: false }
      ]
    },
    {
      query: "bar status-code:200 baz",
      expectedTokens: [
        { kind: "text", text: "bar", negative: false },
        { kind: "property", key: "status-code", value: "200", negative: false },
        { kind: "text", text: "baz", negative: false }
      ]
    },
    {
      query: "bar status-code:200 yek:roo baz",
      expectedTokens: [
        { kind: "text", text: "bar", negative: false },
        { kind: "property", key: "status-code", value: "200", negative: false },
        { kind: "text", text: "yek:roo", negative: false },
        { kind: "text", text: "baz", negative: false }
      ]
    },
    {
      query: "bar status-code:200 -yek:roo baz",
      expectedTokens: [
        { kind: "text", text: "bar", negative: false },
        { kind: "property", key: "status-code", value: "200", negative: false },
        { kind: "text", text: "yek:roo", negative: true },
        { kind: "text", text: "baz", negative: false }
      ]
    },
    {
      query: "bar baz status-code:200 goo zoo",
      expectedTokens: [
        { kind: "text", text: "bar", negative: false },
        { kind: "text", text: "baz", negative: false },
        { kind: "property", key: "status-code", value: "200", negative: false },
        { kind: "text", text: "goo", negative: false },
        { kind: "text", text: "zoo", negative: false }
      ]
    },
    {
      query: "bar status-code:2:00",
      expectedTokens: [
        { kind: "text", text: "bar", negative: false },
        { kind: "property", key: "status-code", value: "2:00", negative: false }
      ]
    },
    {
      query: "bar :status-code:200 baz",
      expectedTokens: [
        { kind: "text", text: "bar", negative: false },
        { kind: "text", text: ":status-code:200", negative: false },
        { kind: "text", text: "baz", negative: false }
      ]
    },
    {
      query: "bar -:status-code:200 baz",
      expectedTokens: [
        { kind: "text", text: "bar", negative: false },
        { kind: "text", text: ":status-code:200", negative: true },
        { kind: "text", text: "baz", negative: false }
      ]
    },
    {
      query: "bar status-code:-200 baz",
      expectedTokens: [
        { kind: "text", text: "bar", negative: false },
        { kind: "property", key: "status-code", value: "-200", negative: false },
        { kind: "text", text: "baz", negative: false }
      ]
    }
  ] as const;

  it.each(chromiumParserCases)("matches Chromium parser baseline for $query", ({ query, expectedTokens }) => {
    const parsed = parseNetworkFilterQuery(query);

    expect(
      parsed.tokens.map((token) => {
        if (token.kind === "property") {
          return { kind: token.kind, key: token.key, value: token.value, negative: token.negative };
        }

        if (token.kind === "text") {
          return { kind: token.kind, text: token.text, negative: token.negative };
        }

        return { kind: token.kind, text: token.pattern, negative: token.negative };
      })
    ).toEqual(expectedTokens);
  });

  it("parses supported DevTools-style property filters including body fields and quoted phrases", () => {
    const parsed = parseNetworkFilterQuery('status-code:200 method:"GET" body:admin response-body:"user list"');

    expect(parsed.issues).toHaveLength(0);
    expect(parsed.tokens).toMatchObject([
      { kind: "property", key: "status-code", value: "200" },
      { kind: "property", key: "method", value: "GET" },
      { kind: "property", key: "body", value: "admin" },
      { kind: "property", key: "response-body", value: "user list" }
    ]);
  });

  it("treats unknown keys as plain text", () => {
    const parsed = parseNetworkFilterQuery("foo:bar");
    expect(parsed.issues).toHaveLength(0);
    expect(parsed.tokens[0]).toMatchObject({ kind: "text", text: "foo:bar" });
  });

  it("supports quoted property values and bare quoted phrases", () => {
    const parsed = parseNetworkFilterQuery('url:"/api users" -"user list"');
    expect(parsed.issues).toHaveLength(0);
    expect(parsed.tokens).toMatchObject([
      { kind: "property", key: "url", value: "/api users", negative: false },
      { kind: "text", text: "user list", negative: true }
    ]);
  });

  it("supports escaped quotes and backslashes in quoted tokens", () => {
    const parsed = parseNetworkFilterQuery('"say \\\"hello\\\" \\\\o/"');
    expect(parsed.issues).toHaveLength(0);
    expect(parsed.tokens[0]).toMatchObject({ kind: "text", text: 'say "hello" \\o/' });
  });

  it("flags unsupported keys without failing the whole parse", () => {
    const parsed = parseNetworkFilterQuery("priority:high status-code:200");

    expect(parsed.issues).toEqual([
      expect.objectContaining({ code: "unsupported-key", key: "priority", value: "high" })
    ]);
    expect(parsed.tokens).toHaveLength(2);
  });

  it("flags invalid numeric and enum property values", () => {
    expect(parseNetworkFilterQuery("larger-than:abc").issues).toEqual([
      expect.objectContaining({ code: "invalid-larger-than", key: "larger-than", value: "abc" })
    ]);
    expect(parseNetworkFilterQuery("status-code:ok").issues).toEqual([
      expect.objectContaining({ code: "invalid-status-code", key: "status-code", value: "ok" })
    ]);
    expect(parseNetworkFilterQuery("resource-type:fetch-xhr").issues).toEqual([
      expect.objectContaining({ code: "invalid-resource-type", key: "resource-type", value: "fetch-xhr" })
    ]);
    expect(parseNetworkFilterQuery('method:"GET"tail').issues).toEqual([
      expect.objectContaining({ code: "invalid-property-value", key: "method", value: "GET" })
    ]);
  });

  it("flags invalid regex but keeps the token isolated", () => {
    const parsed = parseNetworkFilterQuery("/api(/ status-code:200");
    expect(parsed.issues).toEqual([expect.objectContaining({ code: "invalid-regex" })]);
    expect(parsed.tokens).toHaveLength(2);
  });

  it("accepts standard JS regex flags", () => {
    const parsed = parseNetworkFilterQuery("/api/gi");
    expect(parsed.issues).toHaveLength(0);
    expect(parsed.tokens[0]).toMatchObject({ kind: "regex", flags: "gi", status: "valid" });
  });

  it("keeps incomplete trailing tokens quiet while editing", () => {
    expect(parseNetworkFilterQuery('status-code:200 method:').issues).toHaveLength(0);
    expect(parseNetworkFilterQuery('status-code:200 method:').tokens[1]).toMatchObject({
      kind: "property",
      status: "incomplete",
      key: "method"
    });

    expect(parseNetworkFilterQuery('"unterminated').issues).toHaveLength(0);
    expect(parseNetworkFilterQuery('"unterminated').tokens[0]).toMatchObject({
      kind: "text",
      status: "incomplete"
    });

    expect(parseNetworkFilterQuery('/unterminated').issues).toHaveLength(0);
    expect(parseNetworkFilterQuery('/unterminated').tokens[0]).toMatchObject({
      kind: "regex",
      status: "incomplete"
    });
  });
});

describe("matchesFilter", () => {
  const defaultFilterState: FilterState = {
    query: "",
    invert: false,
    type: "all"
  };

  const scriptRecord = record("app.js?build=42", {
    type: "script",
    url: "https://cdn.example.test/assets/app.js?build=42",
    domain: "cdn.example.test",
    responseHeaders: [
      { name: "content-type", value: "application/javascript; charset=utf-8" },
      { name: "cache-control", value: "public, max-age=60" },
      { name: "set-cookie", value: "session=abc; Domain=example.test; Path=/" }
    ],
    responseBody: { kind: "text", text: 'console.log("App ready")', sizeBytes: 24 },
    status: 200,
    sizeBytes: 4096
  });

  const apiRecord = record("users", {
    type: "fetch",
    method: "POST",
    url: "https://api.example.test/v1/users/list",
    domain: "api.example.test",
    requestBody: { kind: "json", text: '{"role":"Admin","include":"profile"}', sizeBytes: 36 },
    responseBody: { kind: "json", text: '{"message":"user list created","id":1}', sizeBytes: 40 },
    responseHeaders: [{ name: "content-type", value: "application/json" }],
    status: 201,
    sizeBytes: 900,
    source: "hook"
  });

  const imageRecord = record("logo.png", {
    type: "image",
    url: "http://static.example.test/assets/logo.png",
    domain: "static.example.test",
    responseHeaders: [{ name: "content-type", value: "image/png" }],
    status: 304,
    sizeBytes: 1200
  });

  it("matches bare text against path plus name only", () => {
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "assets/app.js" })).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "cdn.example.test/assets" })).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "GET" })).toBe(false);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "cache-control" })).toBe(false);
  });

  it("supports quoted phrases as text tokens", () => {
    const recordWithPhrase = record("user-list", {
      url: "https://example.test/api/user%20list/results"
    });
    expect(matchesFilter(recordWithPhrase, { ...defaultFilterState, query: '"user list"' })).toBe(true);
    expect(matchesFilter(recordWithPhrase, { ...defaultFilterState, query: '-"user list"' })).toBe(false);
  });

  it("supports standard JS regex flags and resets regex state across records", () => {
    const parsed = parseNetworkFilterQuery("/app|users/g");
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "/app|users/g" }, parsed)).toBe(true);
    expect(matchesFilter(apiRecord, { ...defaultFilterState, query: "/app|users/g" }, parsed)).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "/APP\\.JS/i" })).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "/APP\\.JS/" })).toBe(false);
  });

  it("supports negative text and negative regex tokens", () => {
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "-build=42" })).toBe(false);
    expect(matchesFilter(apiRecord, { ...defaultFilterState, query: "-build=42" })).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "-/users/" })).toBe(true);
    expect(matchesFilter(apiRecord, { ...defaultFilterState, query: "-/users/" })).toBe(false);
  });

  it.each([
    "cookie-domain:example.test",
    "cookie-name:session",
    "cookie-path:/",
    "cookie-value:abc",
    "has-overrides:yes",
    "is:running",
    "mixed-content:all",
    "priority:high"
  ])("treats unsupported token %s as warning + no match", (query) => {
    const parsed = parseNetworkFilterQuery(query);
    expect(parsed.issues).toEqual([expect.objectContaining({ code: "unsupported-key" })]);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query }, parsed)).toBe(false);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: `-${query}` })).toBe(true);
  });

  it("matches each supported property token", () => {
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "status-code:200" })).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "method:get" })).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "mime-type:application/javascript" })).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "resource-type:script" })).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "resource-type:js" })).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "scheme:https" })).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "domain:*.example.test" })).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "url:build=42" })).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: 'url:"assets/app.js?build=42"' })).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "larger-than:1k" })).toBe(true);
    expect(matchesFilter(apiRecord, { ...defaultFilterState, query: "larger-than:1k" })).toBe(false);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "has-response-header:content-type" })).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "response-header-set-cookie:session=abc" })).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "set-cookie-domain:example.test" })).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "set-cookie-name:session" })).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "set-cookie-value:abc" })).toBe(true);
    expect(matchesFilter(apiRecord, { ...defaultFilterState, query: "body:admin" })).toBe(true);
    expect(matchesFilter(apiRecord, { ...defaultFilterState, query: 'response-body:"user list"' })).toBe(true);
  });

  it("supports canonical resource types and one-to-one aliases only", () => {
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "resource-type:stylesheet" })).toBe(false);
    expect(matchesFilter(imageRecord, { ...defaultFilterState, query: "resource-type:img" })).toBe(true);
    expect(matchesFilter(imageRecord, { ...defaultFilterState, query: "resource-type:image" })).toBe(true);
    expect(matchesFilter(apiRecord, { ...defaultFilterState, query: "resource-type:fetch-xhr" })).toBe(false);
  });

  it("treats unsupported and invalid positive tokens as no-match", () => {
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "priority:high" })).toBe(false);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "is:running" })).toBe(false);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "larger-than:abc" })).toBe(false);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "status-code:ok" })).toBe(false);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "/api(/" })).toBe(false);
  });

  it("lets negative invalid or unsupported tokens collapse to a no-op match", () => {
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "-larger-than:abc" })).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "-priority:high" })).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "-/api(/" })).toBe(true);
  });

  it("supports negative property filters", () => {
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "-method:post" })).toBe(true);
    expect(matchesFilter(apiRecord, { ...defaultFilterState, query: "-method:post" })).toBe(false);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "-scheme:https" })).toBe(false);
    expect(matchesFilter(imageRecord, { ...defaultFilterState, query: "-scheme:https" })).toBe(true);
  });

  it("supports multi-token AND combinations across text, regex, and properties", () => {
    expect(
      matchesFilter(scriptRecord, {
        ...defaultFilterState,
        query: 'app.js status-code:200 mime-type:application/javascript domain:*.example.test /build=42/'
      })
    ).toBe(true);

    expect(
      matchesFilter(scriptRecord, {
        ...defaultFilterState,
        query: 'app.js status-code:404'
      })
    ).toBe(false);
  });

  it("fails the whole positive conjunction when an unsupported token is mixed in", () => {
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "status-code:200 priority:high" })).toBe(false);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "status-code:200 -priority:high" })).toBe(true);
  });

  it("supports fetch-xhr type chip semantics separately from query grammar", () => {
    expect(matchesFilter(apiRecord, { ...defaultFilterState, query: "status-code:201", type: "fetch-xhr" })).toBe(true);
    expect(matchesFilter(scriptRecord, { ...defaultFilterState, query: "status-code:200", type: "fetch-xhr" })).toBe(false);
  });

  it("combines query, type chips, and invert in the agreed order", () => {
    expect(
      matchesFilter(scriptRecord, {
        query: "status-code:200",
        invert: false,
        type: "script"
      })
    ).toBe(true);

    expect(
      matchesFilter(scriptRecord, {
        query: "status-code:200",
        invert: false,
        type: "image"
      })
    ).toBe(false);

    expect(
      matchesFilter(scriptRecord, {
        query: "status-code:200",
        invert: true,
        type: "script"
      })
    ).toBe(false);

    expect(
      matchesFilter(scriptRecord, {
        query: "status-code:404",
        invert: true,
        type: "script"
      })
    ).toBe(true);
  });
});

describe("getFilterNotices", () => {
  it("surfaces approximate larger-than notice for non-HAR records", () => {
    const parsed = parseNetworkFilterQuery("larger-than:1k");
    expect(getFilterNotices(parsed, [record("hook", { source: "hook", sizeBytes: 10 })])).toEqual([
      { code: "approximate-larger-than" }
    ]);
  });

  it("stays quiet when larger-than is absent", () => {
    const parsed = parseNetworkFilterQuery("status-code:200");
    expect(getFilterNotices(parsed, [record("har")])).toEqual([]);
  });
});

describe("filter autocomplete", () => {
  it("suggests supported keys for the current token", () => {
    const autocomplete = getFilterAutocomplete("sta", 3);
    expect(autocomplete?.suggestions[0]).toMatchObject({ label: "status-code:" });
  });

  it("suggests keys for negative tokens", () => {
    const autocomplete = getFilterAutocomplete("-sta", 4);
    expect(autocomplete?.suggestions[0]).toMatchObject({ replacementText: "-status-code:" });
  });

  it("suggests only supported keys, not unsupported official keys", () => {
    const autocomplete = getFilterAutocomplete("pr", 2);
    expect(autocomplete).toBeNull();
  });

  it("suggests static values for supported keys", () => {
    const resourceTypeAutocomplete = getFilterAutocomplete("resource-type:s", "resource-type:s".length);
    expect(resourceTypeAutocomplete?.suggestions.map((suggestion) => suggestion.label)).toContain("script");
    expect(resourceTypeAutocomplete?.suggestions.map((suggestion) => suggestion.label)).toContain("stylesheet");

    const schemeAutocomplete = getFilterAutocomplete("scheme:h", "scheme:h".length);
    expect(schemeAutocomplete?.suggestions.map((suggestion) => suggestion.label)).toEqual(["http", "https"]);
  });

  it("suggests body filter keys", () => {
    const bodyAutocomplete = getFilterAutocomplete("bo", 2);
    expect(bodyAutocomplete?.suggestions[0]).toMatchObject({ label: "body:" });

    const responseBodyAutocomplete = getFilterAutocomplete("response-b", "response-b".length);
    expect(responseBodyAutocomplete?.suggestions[0]).toMatchObject({ label: "response-body:" });
  });

  it("replaces only the current token when applying a suggestion", () => {
    const autocomplete = getFilterAutocomplete("status-code:200 sta", "status-code:200 sta".length);
    const suggestion = autocomplete!.suggestions[0];
    const applied = applyFilterAutocompleteSuggestion("status-code:200 sta", suggestion);
    expect(applied.query).toBe("status-code:200 status-code:");
    expect(applied.caret).toBe(applied.query.length);
  });

  it("supports quoted value suggestions", () => {
    const autocomplete = getFilterAutocomplete('resource-type:"s', 'resource-type:"s'.length);
    expect(autocomplete?.suggestions.map((suggestion) => suggestion.replacementText)).toEqual(
      expect.arrayContaining(['resource-type:"script"', 'resource-type:"stylesheet"'])
    );
  });

  it("supports autocomplete inside a middle token only", () => {
    const query = "status-code:200 met domain:example.test";
    const caret = query.indexOf("met") + 3;
    const autocomplete = getFilterAutocomplete(query, caret);
    expect(autocomplete?.suggestions[0]).toMatchObject({ replacementText: "method:" });
  });

  it("cycles selection indices in both directions", () => {
    expect(moveFilterAutocompleteIndex(0, 3, "next")).toBe(1);
    expect(moveFilterAutocompleteIndex(0, 3, "previous")).toBe(2);
  });
});

function record(
  name: string,
  overrides: Partial<NetworkRecord> = {}
): NetworkRecord {
  return {
    id: name,
    source: "har",
    method: "GET",
    url: `https://example.test/${name}`,
    name,
    domain: "example.test",
    type: "fetch",
    sizeText: overrides.sizeBytes ? `${overrides.sizeBytes} B` : "-",
    startedAt: 1,
    requestHeaders: [],
    responseHeaders: [],
    requestBody: { kind: "empty", text: "", sizeBytes: 0 },
    responseBody: { kind: "empty", text: "", sizeBytes: 0 },
    ...overrides
  };
}
