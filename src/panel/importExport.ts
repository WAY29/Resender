import type { BodyCapture, HeaderPair, NetworkRecord, RecordSource, ResourceType } from "../types";

const recordSources: RecordSource[] = ["har", "hook", "resend"];
const resourceTypes: ResourceType[] = [
  "fetch",
  "xhr",
  "document",
  "css",
  "script",
  "font",
  "image",
  "media",
  "manifest",
  "websocket",
  "wasm",
  "other"
];

export function parseImportedRecords(text: string): NetworkRecord[] {
  let payload: unknown;

  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }

  const records = Array.isArray(payload)
    ? payload
    : isObject(payload) && Array.isArray(payload.records)
      ? payload.records
      : undefined;

  if (!records) {
    throw new Error("The selected file does not contain exported Resender records.");
  }

  return records.map((record, index) => {
    if (!isNetworkRecord(record)) {
      throw new Error(`Record ${index + 1} is not a valid Resender request.`);
    }

    return record;
  });
}

function isNetworkRecord(value: unknown): value is NetworkRecord {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    recordSources.includes(value.source as RecordSource) &&
    typeof value.method === "string" &&
    typeof value.url === "string" &&
    typeof value.name === "string" &&
    typeof value.domain === "string" &&
    resourceTypes.includes(value.type as ResourceType) &&
    typeof value.sizeText === "string" &&
    typeof value.startedAt === "number" &&
    Array.isArray(value.requestHeaders) &&
    value.requestHeaders.every(isHeaderPair) &&
    Array.isArray(value.responseHeaders) &&
    value.responseHeaders.every(isHeaderPair) &&
    isBodyCapture(value.requestBody) &&
    isBodyCapture(value.responseBody)
  );
}

function isHeaderPair(value: unknown): value is HeaderPair {
  return isObject(value) && typeof value.name === "string" && typeof value.value === "string";
}

function isBodyCapture(value: unknown): value is BodyCapture {
  return isObject(value) && typeof value.kind === "string";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
