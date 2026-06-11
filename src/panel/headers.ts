import type { HeaderPair } from "../types";

const forbiddenExactHeaders = new Set([
  "accept-charset",
  "accept-encoding",
  "access-control-request-headers",
  "access-control-request-method",
  "connection",
  "content-length",
  "cookie",
  "cookie2",
  "date",
  "dnt",
  "expect",
  "host",
  "keep-alive",
  "origin",
  "permissions-policy",
  "referer",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "via"
]);

export function parseHeaderBlock(input: string): HeaderPair[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(":");
      if (separator === -1) {
        return { name: line, value: "" };
      }

      return {
        name: line.slice(0, separator).trim(),
        value: line.slice(separator + 1).trim()
      };
    })
    .filter((header) => header.name.length > 0);
}

export function formatHeaderBlock(headers: HeaderPair[]): string {
  return headers.map((header) => `${header.name}: ${header.value}`).join("\n");
}

export function upsertHeaderValue(
  headers: HeaderPair[],
  index: number,
  nextValue: string
): HeaderPair[] {
  return headers.map((header, candidateIndex) =>
    candidateIndex === index ? { ...header, value: nextValue } : header
  );
}

export function removeHeaderAt(headers: HeaderPair[], index: number): HeaderPair[] {
  return headers.filter((_, candidateIndex) => candidateIndex !== index);
}

export function isContentTypeHeader(name: string): boolean {
  return name.trim().toLowerCase() === "content-type";
}

export function isForbiddenRequestHeader(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return (
    forbiddenExactHeaders.has(lower) ||
    lower.startsWith("proxy-") ||
    lower.startsWith("sec-")
  );
}

export function isProtectedRequestHeader(name: string): boolean {
  return name.trim().startsWith(":");
}

export function splitEditableHeaders(headers: HeaderPair[]): {
  editable: HeaderPair[];
  skipped: HeaderPair[];
} {
  const editable: HeaderPair[] = [];
  const skipped: HeaderPair[] = [];

  for (const header of headers) {
    if (isProtectedRequestHeader(header.name)) {
      skipped.push(header);
    } else {
      editable.push(header);
    }
  }

  return { editable, skipped };
}

export function headersToRecord(headers: HeaderPair[]): Record<string, string> {
  return headers.reduce<Record<string, string>>((accumulator, header) => {
    accumulator[header.name] = header.value;
    return accumulator;
  }, {});
}

export function findHeader(headers: HeaderPair[], name: string): string | undefined {
  const lower = name.toLowerCase();
  return headers.find((header) => header.name.toLowerCase() === lower)?.value;
}

export function findHeaderIndex(headers: HeaderPair[], name: string): number {
  const lower = name.toLowerCase();
  return headers.findIndex((header) => header.name.toLowerCase() === lower);
}
