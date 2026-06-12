import { describe, expect, it } from "vitest";
import type { FilterState, NetworkRecord } from "../types";
import { appendFilterToken, buildDomainFilter, buildHideFromListFilter, buildMethodFilter } from "./requestContextMenu";

describe("requestContextMenu filters", () => {
  const record: NetworkRecord = {
    id: "1",
    source: "har",
    method: "POST",
    url: "https://api.example.test/v1/user list?x=1",
    name: "user list",
    domain: "api.example.test",
    type: "fetch",
    sizeText: "-",
    startedAt: 1,
    requestHeaders: [],
    responseHeaders: [],
    requestBody: { kind: "empty", text: "", sizeBytes: 0 },
    responseBody: { kind: "empty", text: "", sizeBytes: 0 }
  };

  it("builds domain and method filters", () => {
    expect(buildDomainFilter(record)).toBe("domain:api.example.test");
    expect(buildMethodFilter(record)).toBe("method:POST");
  });

  it("quotes hide-from-list URL filters", () => {
    expect(buildHideFromListFilter(record)).toBe('-url:"https://api.example.test/v1/user list?x=1"');
  });

  it("appends tokens to the existing query", () => {
    const filter: FilterState = { query: "status-code:200", invert: false, type: "all" };
    expect(appendFilterToken(filter, buildDomainFilter(record))).toEqual({
      query: "status-code:200 domain:api.example.test",
      invert: false,
      type: "all"
    });
  });

  it("starts a fresh query when empty", () => {
    const filter: FilterState = { query: "", invert: false, type: "all" };
    expect(appendFilterToken(filter, buildMethodFilter(record)).query).toBe("method:POST");
  });
});
