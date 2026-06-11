import { describe, expect, it } from "vitest";
import type { NetworkRecord } from "../types";
import { parseImportedRecords } from "./importExport";

describe("parseImportedRecords", () => {
  it("reads records from a Resender export payload", () => {
    const exported = {
      tool: "Resender",
      records: [record("har:1")]
    };

    expect(parseImportedRecords(JSON.stringify(exported))).toEqual(exported.records);
  });

  it("also accepts a raw records array", () => {
    const records = [record("har:1"), record("har:2")];

    expect(parseImportedRecords(JSON.stringify(records))).toEqual(records);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseImportedRecords("{")).toThrow("not valid JSON");
  });

  it("rejects payloads without valid records", () => {
    expect(() => parseImportedRecords(JSON.stringify({ records: [{ id: "missing-fields" }] }))).toThrow(
      "Record 1 is not a valid Resender request."
    );
  });
});

function record(id: string): NetworkRecord {
  return {
    id,
    source: "har",
    method: "GET",
    url: `https://example.test/${id}`,
    name: id,
    domain: "example.test",
    type: "fetch",
    sizeText: "-",
    startedAt: 1,
    requestHeaders: [],
    responseHeaders: [],
    requestBody: { kind: "empty", text: "", sizeBytes: 0 },
    responseBody: { kind: "empty", text: "", sizeBytes: 0 }
  };
}
