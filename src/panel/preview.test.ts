import { describe, expect, it } from "vitest";
import type { BodyCapture } from "../types";
import {
  buildBase64ImageDataUrl,
  buildPreviewSrcDoc,
  buildSvgDataUrl,
  describeJsonValue,
  getDefaultPreviewScale,
  getFittedPreviewScale,
  getJsonChildren,
  getPreviewImageSrc,
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

  it("classifies har base64 gif bodies for image preview", () => {
    expect(
      getPreviewModel({
        kind: "text",
        text: "R0lGODlhAQABAIAAAAUEBA==",
        mimeType: "image/gif",
        encoding: "base64"
      })
    ).toEqual({
      kind: "image",
      dataUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==",
      mimeType: "image/gif"
    });
  });

  it("does not preview non-base64 image bodies", () => {
    expect(
      getPreviewModel({
        kind: "text",
        text: "not-base64-image",
        mimeType: "image/png"
      })
    ).toEqual({
      kind: "text",
      text: "not-base64-image",
      mimeType: "image/png"
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

  it("builds a data url for base64 image previews", () => {
    expect(buildBase64ImageDataUrl("image/gif", "R0lG\nODlh")).toBe("data:image/gif;base64,R0lGODlh");
  });

  it("returns a thumbnail src for svg and base64 image previews", () => {
    expect(getPreviewImageSrc(getPreviewModel(textBody("<svg></svg>", "image/svg+xml")))).toBe(
      "data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E"
    );
    expect(
      getPreviewImageSrc(
        getPreviewModel({
          kind: "text",
          text: "R0lGODlhAQABAIAAAAUEBA==",
          mimeType: "image/gif",
          encoding: "base64"
        })
      )
    ).toBe("data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==");
  });

  it("does not return a thumbnail src for non-image previews", () => {
    expect(getPreviewImageSrc(getPreviewModel(textBody("hello", "text/plain")))).toBeUndefined();
  });
});

describe("preview scale helpers", () => {
  it("uses a smaller default scale for svg previews", () => {
    expect(getDefaultPreviewScale("image/svg+xml")).toBe(0.75);
    expect(getDefaultPreviewScale("text/html")).toBe(1);
  });

  it("fits oversized content into the available preview area", () => {
    expect(
      getFittedPreviewScale({
        containerWidth: 500,
        containerHeight: 300,
        contentWidth: 1000,
        contentHeight: 600,
        defaultScale: 1
      })
    ).toBe(0.46);
  });

  it("supports separate horizontal and vertical chrome deductions", () => {
    expect(
      getFittedPreviewScale({
        containerWidth: 500,
        containerHeight: 300,
        contentWidth: 1000,
        contentHeight: 600,
        defaultScale: 1,
        horizontalPadding: 40,
        verticalPadding: 60
      })
    ).toBe(0.4);
  });

  it("does not upscale smaller content beyond the default scale", () => {
    expect(
      getFittedPreviewScale({
        containerWidth: 800,
        containerHeight: 600,
        contentWidth: 200,
        contentHeight: 100,
        defaultScale: 0.75
      })
    ).toBe(0.75);
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
