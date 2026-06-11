import { describe, expect, it } from "vitest";
import type { NetworkRecord } from "../types";
import { nextSortState, sortRecords } from "./requestSort";

describe("request sort state", () => {
  it("cycles a column through descending, ascending, and unsorted", () => {
    const descending = nextSortState(null, "name");
    expect(descending).toEqual({ column: "name", direction: "desc" });

    const ascending = nextSortState(descending, "name");
    expect(ascending).toEqual({ column: "name", direction: "asc" });

    expect(nextSortState(ascending, "name")).toBeNull();
  });

  it("starts descending when switching columns", () => {
    expect(nextSortState({ column: "name", direction: "asc" }, "status")).toEqual({
      column: "status",
      direction: "desc"
    });
  });
});

describe("request sorting", () => {
  it("sorts by numeric columns", () => {
    expect(sortRecords([record("a", { status: 200 }), record("b", { status: 404 })], {
      column: "status",
      direction: "desc"
    }).map((item) => item.name)).toEqual(["b", "a"]);
  });

  it("sorts by text columns with numeric collation", () => {
    expect(sortRecords([record("file-10"), record("file-2")], {
      column: "name",
      direction: "asc"
    }).map((item) => item.name)).toEqual(["file-2", "file-10"]);
  });

  it("falls back to capture order when unsorted", () => {
    expect(sortRecords([record("b", { startedAt: 2 }), record("a", { startedAt: 1 })], null).map((item) => item.name))
      .toEqual(["a", "b"]);
  });
});

function record(name: string, overrides: Partial<NetworkRecord> = {}): NetworkRecord {
  return {
    id: name,
    source: "har",
    method: "GET",
    url: `https://example.test/${name}`,
    name,
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
