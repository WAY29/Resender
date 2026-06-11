import { describe, expect, it } from "vitest";
import type { BodyCapture } from "../types";
import {
  buildPreviewSrcDoc,
  buildSvgDataUrl,
  describeJsonValue,
  getDefaultPreviewScale,
  getJsonChildren,
  getPreviewModel,
  isJsonComposite
} from "./preview";

function textBody(text: string, mimeType?: string, kind: BodyCapture["kind"] = "text"): BodyCapture {
  return { kind, text, mimeType };
}

describe("getPreviewModel", () => {
  it("classifies html bodies for iframe preview", () => {
    expect(getPreviewModel(textBody("<h1>ok</h1>", "text/html"))).toEqual({
      kind: "html",
      text: "<h1>ok</h1>",
      mimeType: "text/html"
    });
  });

  it("classifies svg bodies for image preview", () => {
    expect(getPreviewModel(textBody("<svg viewBox=\"0 0 10 10\"></svg>", "image/svg+xml"))).toEqual({
      kind: "svg",
      text: "<svg viewBox=\"0 0 10 10\"></svg>",
      mimeType: "image/svg+xml"
    });
  });

  it("parses json bodies into tree data", () => {
    const preview = getPreviewModel(textBody('{"ok":true,"items":[1,2]}', "application/json", "json"));

    expect(preview.kind).toBe("json");
    if (preview.kind !== "json") {
      throw new Error("Expected json preview");
    }

    expect(preview.value).toEqual({ ok: true, items: [1, 2] });
  });

  it("falls back to text preview for invalid json payloads", () => {
    expect(getPreviewModel(textBody("{broken", "application/json", "json"))).toEqual({
      kind: "text",
      text: "{broken",
      mimeType: "application/json"
    });
  });

  it("returns unavailable for binary bodies", () => {
    expect(getPreviewModel({ kind: "binary", mimeType: "image/png", reason: "Response is not text." })).toEqual({
      kind: "unavailable",
      bodyKind: "binary",
      reason: "Response is not text.",
      sizeBytes: undefined
    });
  });
});

describe("buildPreviewSrcDoc", () => {
  it("injects a base tag into documents with a head", () => {
    expect(buildPreviewSrcDoc("<html><head><title>x</title></head><body>ok</body></html>", "https://example.test/path/")).toContain(
      '<head><base href="https://example.test/path/">'
    );
  });

  it("wraps fragments in a full document", () => {
    expect(buildPreviewSrcDoc("<main>ok</main>", "https://example.test/")).toBe(
      '<!doctype html><html><head><base href="https://example.test/"></head><body><main>ok</main></body></html>'
    );
  });

  it("builds a data url for svg previews", () => {
    expect(buildSvgDataUrl("<svg></svg>")).toBe("data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E");
  });
});

describe("preview scale helpers", () => {
  it("uses a smaller default scale for svg previews", () => {
    expect(getDefaultPreviewScale("image/svg+xml")).toBe(0.75);
    expect(getDefaultPreviewScale("text/html")).toBe(1);
  });
});

describe("json helpers", () => {
  it("describes composite and scalar values", () => {
    expect(describeJsonValue([1, 2])).toBe("Array(2)");
    expect(describeJsonValue({ ok: true })).toBe("Object(1)");
    expect(describeJsonValue("ok")).toBe('"ok"');
    expect(describeJsonValue(null)).toBe("null");
  });

  it("returns children for arrays and objects", () => {
    expect(getJsonChildren(["a", "b"])).toEqual([
      { key: "0", value: "a" },
      { key: "1", value: "b" }
    ]);
    expect(getJsonChildren({ ok: true })).toEqual([{ key: "ok", value: true }]);
  });

  it("detects composite values", () => {
    expect(isJsonComposite([1])).toBe(true);
    expect(isJsonComposite({ ok: true })).toBe(true);
    expect(isJsonComposite("ok")).toBe(false);
  });
});
