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

  it("highlights form-urlencoded keys and values separately", () => {
    const [line] = tokenizeCode("a=b&c=d", "application/x-www-form-urlencoded");

    expect(line.tokens).toEqual([
      { kind: "property", text: "a" },
      { kind: "plain", text: "=" },
      { kind: "string", text: "b" },
      { kind: "plain", text: "&" },
      { kind: "property", text: "c" },
      { kind: "plain", text: "=" },
      { kind: "string", text: "d" }
    ]);
  });

  it("also highlights form-urlencoded when the Content-Type includes charset", () => {
    const [line] = tokenizeCode(
      "a=b&c=d",
      "application/x-www-form-urlencoded; charset=UTF-8"
    );

    expect(line.tokens[0]).toEqual({ kind: "property", text: "a" });
    expect(line.tokens[2]).toEqual({ kind: "string", text: "b" });
  });

  it("highlights CSS bodies using CSS token classes", () => {
    const [line] = tokenizeCode("body { color: red; margin: 0; }", "text/css");

    expect(line.tokens).toEqual(
      expect.arrayContaining([
        { kind: "property", text: "color" },
        { kind: "string", text: "red" },
        { kind: "property", text: "margin" },
        { kind: "number", text: "0" }
      ])
    );
  });

  it("highlights JavaScript bodies using JavaScript token classes", () => {
    const [line] = tokenizeCode('const ok = true; let count = 2; const name = "resender";', "application/javascript");

    expect(line.tokens).toEqual(
      expect.arrayContaining([
        { kind: "boolean", text: "const" },
        { kind: "boolean", text: "let" },
        { kind: "boolean", text: "true" },
        { kind: "number", text: "2" },
        { kind: "string", text: '"resender"' }
      ])
    );
  });

  it("highlights HTML bodies using tag-aware token classes", () => {
    const [line] = tokenizeCode('<div class="box">hi</div>', "text/html");

    expect(line.tokens).toEqual([
      { kind: "boolean", text: "<div" },
      { kind: "plain", text: " " },
      { kind: "property", text: "class" },
      { kind: "plain", text: "=" },
      { kind: "string", text: '"box"' },
      { kind: "boolean", text: ">" },
      { kind: "plain", text: "hi" },
      { kind: "boolean", text: "</div>" }
    ]);
  });
});
