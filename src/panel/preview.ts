import type { BodyCapture } from "../types";

export type PreviewKind =
  | "empty"
  | "svg"
  | "html"
  | "json"
  | "text"
  | "unavailable";

export type PreviewModel =
  | { kind: "empty" }
  | { kind: "svg"; text: string; mimeType?: string }
  | { kind: "html"; text: string; mimeType?: string }
  | { kind: "json"; value: JsonValue; text: string; mimeType?: string }
  | { kind: "text"; text: string; mimeType?: string }
  | { kind: "unavailable"; bodyKind: BodyCapture["kind"]; reason?: string; sizeBytes?: number };

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function getPreviewModel(body: BodyCapture): PreviewModel {
  if (body.kind === "empty") {
    return { kind: "empty" };
  }

  if (body.kind !== "text" && body.kind !== "json" && body.kind !== "form") {
    return {
      kind: "unavailable",
      bodyKind: body.kind,
      reason: body.reason,
      sizeBytes: body.sizeBytes
    };
  }

  const text = body.text ?? "";
  const mimeType = body.mimeType;
  const contentType = simplifyContentType(mimeType);

  if (body.kind === "json" || contentType.includes("json") || looksLikeJson(text)) {
    const parsed = parseJsonValue(text);
    if (parsed !== undefined) {
      return { kind: "json", value: parsed, text, mimeType };
    }
  }

  if (contentType === "image/svg+xml") {
    return { kind: "svg", text, mimeType };
  }

  if (isHtmlPreviewMime(contentType)) {
    return { kind: "html", text, mimeType };
  }

  return { kind: "text", text, mimeType };
}

export function buildPreviewSrcDoc(source: string, baseUrl: string): string {
  const baseTag = `<base href="${escapeHtmlAttribute(baseUrl)}">`;
  if (/<head(?:\s[^>]*)?>/i.test(source)) {
    return source.replace(/<head(?:\s[^>]*)?>/i, (match) => `${match}${baseTag}`);
  }

  if (/<html(?:\s[^>]*)?>/i.test(source)) {
    return source.replace(/<html(?:\s[^>]*)?>/i, (match) => `${match}<head>${baseTag}</head>`);
  }

  return `<!doctype html><html><head>${baseTag}</head><body>${source}</body></html>`;
}

export function buildSvgDataUrl(source: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

export function getDefaultPreviewScale(mimeType?: string): number {
  return simplifyContentType(mimeType) === "image/svg+xml" ? 0.75 : 1;
}

export function describeJsonValue(value: JsonValue): string {
  if (Array.isArray(value)) {
    return value.length === 0 ? "[]" : `Array(${value.length})`;
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "object") {
    const size = Object.keys(value).length;
    return size === 0 ? "{}" : `Object(${size})`;
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  return String(value);
}

export function isJsonComposite(value: JsonValue): value is JsonValue[] | { [key: string]: JsonValue } {
  return Array.isArray(value) || (value !== null && typeof value === "object");
}

export function getJsonChildren(
  value: JsonValue
): Array<{ key: string; value: JsonValue }> {
  if (Array.isArray(value)) {
    return value.map((child, index) => ({ key: String(index), value: child }));
  }

  if (value !== null && typeof value === "object") {
    return Object.entries(value).map(([key, child]) => ({ key, value: child }));
  }

  return [];
}

function parseJsonValue(text: string): JsonValue | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return undefined;
  }
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function isHtmlPreviewMime(contentType: string): boolean {
  return contentType === "text/html";
}

function simplifyContentType(mimeType?: string): string {
  return mimeType?.split(";")[0].trim().toLowerCase() ?? "";
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
