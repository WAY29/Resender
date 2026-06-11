import type { HeaderPair } from "../types";
import { isContentTypeHeader, removeHeaderAt } from "./headers";

export function ensureContentTypeHeader(headers: HeaderPair[]): {
  headers: HeaderPair[];
  addedIndex?: number;
  existingIndex?: number;
} {
  const existingIndex = headers.findIndex((header) => isContentTypeHeader(header.name));
  if (existingIndex !== -1) {
    return { headers, existingIndex };
  }

  return {
    headers: [...headers, { name: "Content-Type", value: "" }],
    addedIndex: headers.length
  };
}

export function syncAutoAddedContentTypeIndex(
  previousHeaders: HeaderPair[],
  nextHeaders: HeaderPair[],
  autoAddedIndex: number | undefined
): number | undefined {
  if (autoAddedIndex === undefined) {
    return undefined;
  }

  const trackedHeader = previousHeaders[autoAddedIndex];
  if (!trackedHeader || !isContentTypeHeader(trackedHeader.name) || trackedHeader.value.length > 0) {
    return undefined;
  }

  const sameReferenceIndex = nextHeaders.indexOf(trackedHeader);
  if (sameReferenceIndex !== -1) {
    return sameReferenceIndex;
  }

  const exactMatches = nextHeaders
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => isContentTypeHeader(header.name) && header.value === "");

  return exactMatches.length === 1 ? exactMatches[0].index : undefined;
}

export function removeAutoAddedEmptyContentType(
  headers: HeaderPair[],
  autoAddedIndex: number | undefined
): HeaderPair[] {
  if (autoAddedIndex === undefined) {
    return headers;
  }

  const trackedHeader = headers[autoAddedIndex];
  if (!trackedHeader || !isContentTypeHeader(trackedHeader.name) || trackedHeader.value.length > 0) {
    return headers;
  }

  return removeHeaderAt(headers, autoAddedIndex);
}
