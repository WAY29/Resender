import { describe, expect, it } from "vitest";
import {
  formatCodeTextWithPrettier,
  shouldDisableCodeFormatting,
  shouldDisableCodeHighlighting,
  tokenizeCode
} from "./codeView";

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

  it("formats x-javascript with lazy-loaded Prettier", async () => {
    await expect(formatCodeTextWithPrettier("const a=1", "application/x-javascript")).resolves.toBe("const a = 1;\n");
  });

  it("skips formatting for large code bodies before disabling highlighting", async () => {
    const largeButHighlightableBody = `const a=1;\n${"x".repeat(40_001)}`;

    await expect(formatCodeTextWithPrettier(largeButHighlightableBody, "application/javascript")).resolves.toBe(largeButHighlightableBody);
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

  it("highlights JavaScript when content types include charset", () => {
    const [line] = tokenizeCode("const answer = 42;", "application/javascript;charset=utf-8");

    expect(line.tokens).toEqual(
      expect.arrayContaining([
        { kind: "keyword", text: "const" },
        { kind: "number", text: "42" }
      ])
    );
  });

  it("highlights x-javascript with Prism token classes", () => {
    const [line] = tokenizeCode("const answer = 42;", "application/x-javascript");

    expect(line.tokens).toEqual(
      expect.arrayContaining([
        { kind: "keyword", text: "const" },
        { kind: "number", text: "42" }
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

  it("keeps syntax highlighting for large but still highlightable code bodies", () => {
    const highlightedLargeLine = `const a = 1;${"x".repeat(40_001)}`;
    const [line] = tokenizeCode(highlightedLargeLine, "application/javascript");

    expect(line.tokens).toEqual(
      expect.arrayContaining([
        { kind: "keyword", text: "const" },
        { kind: "number", text: "1" }
      ])
    );
  });

  it("falls back to plain text tokenization for very large code bodies", () => {
    const largeLine = `const a = 1;${"x".repeat(120_001)}`;
    const [line] = tokenizeCode(largeLine, "application/javascript");

    expect(line.tokens).toEqual([{ kind: "plain", text: largeLine }]);
  });
});

describe("rich code view guard", () => {
  it("disables formatting before disabling highlighting", () => {
    expect(shouldDisableCodeFormatting("x".repeat(40_001))).toBe(true);
    expect(shouldDisableCodeHighlighting("x".repeat(40_001))).toBe(false);
  });

  it("disables highlighting past the larger size threshold", () => {
    expect(shouldDisableCodeHighlighting("x".repeat(120_001))).toBe(true);
    expect(shouldDisableCodeHighlighting("short")).toBe(false);
  });
});
