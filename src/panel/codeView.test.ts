import { describe, expect, it } from "vitest";
import { formatCodeTextWithPrettier, tokenizeCode } from "./codeView";

describe("code view formatting", () => {
  it("pretty prints JSON bodies", async () => {
    await expect(formatCodeTextWithPrettier('{"a":1,"b":true}', "application/json")).resolves.toBe(
      '{\n  "a": 1,\n  "b": true\n}'
    );
  });

  it("keeps invalid JSON unchanged", async () => {
    await expect(formatCodeTextWithPrettier("{broken", "application/json")).resolves.toBe("{broken");
  });

  it("formats CSS with lazy-loaded Prettier", async () => {
    await expect(formatCodeTextWithPrettier("body{color:red}", "text/css")).resolves.toContain("color: red;");
  });

  it("formats JavaScript with lazy-loaded Prettier", async () => {
    await expect(formatCodeTextWithPrettier("const a=1", "application/javascript")).resolves.toBe("const a = 1;\n");
  });
});

describe("code tokenization", () => {
  it("classifies common JSON tokens", () => {
    const [line] = tokenizeCode('  "ok": true, "name": "resender", "count": 2, "none": null', "application/json");

    expect(line.tokens).toEqual(
      expect.arrayContaining([
        { kind: "property", text: '"ok"' },
        { kind: "boolean", text: "true" },
        { kind: "property", text: '"name"' },
        { kind: "string", text: '"resender"' },
        { kind: "number", text: "2" },
        { kind: "keyword", text: "null" }
      ])
    );
  });

  it("falls back to plain text for form-urlencoded bodies", () => {
    const [line] = tokenizeCode("a=b&c=d", "application/x-www-form-urlencoded");

    expect(line.tokens).toEqual([{ kind: "plain", text: "a=b&c=d" }]);
  });

  it("highlights CSS with Prism token classes", () => {
    const [line] = tokenizeCode("body { color: red; margin: 0; }", "text/css");

    expect(line.tokens).toEqual(
      expect.arrayContaining([
        { kind: "property", text: "color" },
        { kind: "property", text: "margin" },
        { kind: "selector", text: "body" },
        { kind: "punctuation", text: ":" }
      ])
    );
  });

  it("highlights JavaScript with Prism token classes", () => {
    const [line] = tokenizeCode('const ok = true; let count = 2; const name = "resender";', "application/javascript");

    expect(line.tokens).toEqual(
      expect.arrayContaining([
        { kind: "keyword", text: "const" },
        { kind: "keyword", text: "let" },
        { kind: "boolean", text: "true" },
        { kind: "number", text: "2" },
        { kind: "string", text: '"resender"' }
      ])
    );
  });

  it("highlights HTML with Prism token classes", () => {
    const [line] = tokenizeCode('<div class="box">hi</div>', "text/html");

    expect(line.tokens).toEqual(
      expect.arrayContaining([
        { kind: "tag", text: "<" },
        { kind: "tag", text: "div" },
        { kind: "attr-name", text: "class" },
        { kind: "attr-value", text: "box" },
        { kind: "tag", text: "</" }
      ])
    );
  });
});
