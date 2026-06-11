import { describe, expect, it } from "vitest";
import { formatCodeText, tokenizeCode } from "./codeView";

describe("code view formatting", () => {
  it("pretty prints JSON bodies", () => {
    expect(formatCodeText('{"a":1,"b":true}', "application/json")).toBe(
      '{\n  "a": 1,\n  "b": true\n}'
    );
  });

  it("keeps invalid JSON unchanged", () => {
    expect(formatCodeText("{broken", "application/json")).toBe("{broken");
  });
});

describe("code tokenization", () => {
  it("classifies common JSON tokens", () => {
    const [line] = tokenizeCode('  "ok": true, "name": "resender", "count": 2, "none": null');

    expect(line.tokens).toEqual(
      expect.arrayContaining([
        { kind: "property", text: '"ok"' },
        { kind: "boolean", text: "true" },
        { kind: "property", text: '"name"' },
        { kind: "string", text: '"resender"' },
        { kind: "number", text: "2" },
        { kind: "null", text: "null" }
      ])
    );
  });
});
