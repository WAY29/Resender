import type {
  BodyCapture,
  HeaderPair,
  HookNetworkRecord,
  NetworkRecord,
  ResendDraft,
  ResendResult,
  ResourceType,
  SourceLocation
} from "../types";
import { findHeader } from "./headers";
import { formatBytes, getDisplayName, getDomain } from "./format";

type HarHeader = {
  name: string;
  value: string;
};

type HarEntryLike = {
  startedDateTime?: string;
  time?: number;
  request: {
    method: string;
    url: string;
    headers?: HarHeader[];
    postData?: {
      mimeType?: string;
      text?: string;
      params?: Array<{ name: string; value?: string }>;
    };
  };
  response: {
    status?: number;
    statusText?: string;
    headers?: HarHeader[];
    redirectURL?: string;
    content?: {
      mimeType?: string;
      size?: number;
    };
    bodySize?: number;
  };
  _resourceType?: string | null;
  _transferSize?: number;
  _resourceSize?: number;
  _encodedDataLength?: number;
  _initiator?:
    | string
    | null
    | {
    type?: string;
    url?: string | null;
    lineNumber?: number | null;
    columnNumber?: number | null;
    stack?: HarInitiatorStack;
  };
};

type HarInitiatorStack = {
  callFrames?: HarInitiatorCallFrame[];
  parent?: HarInitiatorStack | null;
};

type HarInitiatorCallFrame = {
  url?: string | null;
  lineNumber?: number | null;
  columnNumber?: number | null;
};

export function emptyBody(): BodyCapture {
  return { kind: "empty", text: "", sizeBytes: 0 };
}

export function unavailableBody(reason: string): BodyCapture {
  return { kind: "unavailable", reason };
}

export function textBody(text: string, mimeType?: string, encoding?: string): BodyCapture {
  return {
    kind: mimeType?.toLowerCase().includes("json") ? "json" : "text",
    text,
    mimeType,
    encoding,
    sizeBytes: new TextEncoder().encode(text).byteLength
  };
}

export function normaliseHarEntry(
  entry: HarEntryLike,
  id: string
): NetworkRecord {
  const startedAt = entry.startedDateTime
    ? new Date(entry.startedDateTime).getTime()
    : Date.now();
  const requestHeaders = entry.request.headers ?? [];
  const responseHeaders = entry.response.headers ?? [];
  const requestBody = normaliseHarRequestBody(entry);
  const resourceType = inferResourceType(entry);
  const sizeBytes = inferResponseSize(entry);
  const initiator = inferInitiator(entry);
  const redirectTargetUrl = inferRedirectTargetUrl(entry.request.url, responseHeaders, entry.response);
  const status = normaliseStatus(entry.response.status, redirectTargetUrl);

  return {
    id,
    source: "har",
    method: entry.request.method,
    url: entry.request.url,
    name: getDisplayName(entry.request.url),
    domain: getDomain(entry.request.url),
    status,
    statusText: status === 301 && entry.response.status === 0 ? "Redirect" : entry.response.statusText,
    type: resourceType,
    initiator: initiator?.label,
    initiatorLocation: initiator?.location,
    sizeBytes,
    sizeText: formatBytes(sizeBytes),
    timeMs: entry.time,
    startedAt,
    requestHeaders,
    responseHeaders,
    requestBody,
    responseBody: unavailableBody("Response body has not been loaded from DevTools yet."),
    redirectTargetUrl,
    unsupportedReason: inferUnsupportedReason(resourceType, requestBody)
  };
}

export function applyHarResponseBody(
  record: NetworkRecord,
  content: string | undefined,
  encoding: string | undefined
): NetworkRecord {
  if (content === undefined || content === null) {
    return {
      ...record,
      responseBody: unavailableBody("DevTools did not return response content for this request.")
    };
  }

  const mimeType = findHeader(record.responseHeaders, "content-type");
  const responseBody = textBodyFromHarContent(content, mimeType, encoding);
  const sizeBytes = mergeSizeBytes(record.sizeBytes, responseBody.sizeBytes);

  return {
    ...record,
    sizeBytes,
    sizeText: formatBytes(sizeBytes),
    responseBody
  };
}

export function normaliseHookRecord(
  record: HookNetworkRecord,
  frameId?: number
): NetworkRecord {
  const type = record.protocol === "xhr" ? "xhr" : "fetch";

  return {
    id: `hook:${record.hookId}`,
    source: "hook",
    method: record.method,
    url: record.url,
    name: getDisplayName(record.url),
    domain: getDomain(record.url),
    status: record.status,
    statusText: record.statusText,
    type,
    initiator: record.protocol,
    sizeBytes: record.responseBody.sizeBytes,
    sizeText: formatBytes(record.responseBody.sizeBytes),
    timeMs: record.timeMs,
    startedAt: record.startedAtEpochMs,
    frameId,
    frameUrl: record.frameUrl,
    requestHeaders: record.requestHeaders,
    responseHeaders: record.responseHeaders,
    requestBody: record.requestBody,
    responseBody: record.responseBody,
    credentials: record.credentials,
    unsupportedReason: inferUnsupportedReason(type, record.requestBody),
    resent: record.resent,
    resendId: record.resendId
  };
}

export function normaliseResendResult(
  result: ResendResult,
  draft: ResendDraft,
  parentId?: string
): NetworkRecord {
  const requestBody =
    draft.body.length > 0 ? textBody(draft.body, findHeader(draft.headers, "content-type")) : emptyBody();

  return {
    id: `resend:${result.resendId}`,
    source: "resend",
    method: result.method,
    url: result.url,
    name: getDisplayName(result.url),
    domain: getDomain(result.url),
    status: result.status,
    statusText: result.statusText,
    type: "fetch",
    initiator: "Resender",
    sizeBytes: result.responseBody.sizeBytes,
    sizeText: formatBytes(result.responseBody.sizeBytes),
    timeMs: result.timeMs,
    startedAt: result.startedAtEpochMs,
    frameUrl: result.frameUrl,
    requestHeaders: draft.headers,
    responseHeaders: result.responseHeaders,
    requestBody,
    responseBody: result.error
      ? { kind: "error", reason: result.error }
      : result.responseBody,
    credentials: draft.credentials,
    parentId,
    resent: true,
    resendId: result.resendId
  };
}

export function mergeRecords(existing: NetworkRecord, incoming: NetworkRecord): NetworkRecord {
  const sizeBytes = mergeSizeBytes(existing.sizeBytes, incoming.sizeBytes);
  const initiator = mergeInitiator(existing.initiator, incoming.initiator);

  return {
    ...existing,
    ...incoming,
    id: existing.id,
    source: existing.source === "har" && incoming.source === "hook" ? "har" : incoming.source,
    initiator,
    initiatorLocation: mergeInitiatorLocation(existing, incoming, initiator),
    sizeBytes,
    sizeText: formatBytes(sizeBytes),
    requestHeaders:
      incoming.requestHeaders.length > 0 ? incoming.requestHeaders : existing.requestHeaders,
    responseHeaders:
      incoming.responseHeaders.length > 0 ? incoming.responseHeaders : existing.responseHeaders,
    requestBody:
      incoming.requestBody.kind !== "unavailable" ? incoming.requestBody : existing.requestBody,
    responseBody:
      incoming.responseBody.kind !== "unavailable" ? incoming.responseBody : existing.responseBody,
    resent: existing.resent || incoming.resent,
    resendId: existing.resendId ?? incoming.resendId,
    parentId: existing.parentId ?? incoming.parentId,
    redirectSourceId: existing.redirectSourceId ?? incoming.redirectSourceId,
    redirectTargetId: existing.redirectTargetId ?? incoming.redirectTargetId,
    redirectTargetUrl: existing.redirectTargetUrl ?? incoming.redirectTargetUrl
  };
}

export function findMergeTarget(
  records: NetworkRecord[],
  incoming: NetworkRecord
): NetworkRecord | undefined {
  if (incoming.resendId) {
    const byResendId = records.find((record) => record.resendId === incoming.resendId);
    if (byResendId) {
      return byResendId;
    }
  }

  if (incoming.source === "har") {
    return findSameRequestNear(records, incoming, "resend");
  }

  if (incoming.source === "resend") {
    return findSameRequestNear(records, incoming, "har");
  }

  return findSameRequestNear(records, incoming, "har");
}

export function linkRedirectRecords(records: NetworkRecord[]): NetworkRecord[] {
  const inferredRecords = records.map((record) => {
    if (record.status !== 0 || record.redirectTargetUrl || !isChromeExtensionUrl(record.url)) {
      return record;
    }

    const target = records.find((candidate) => isLikelyExtensionRedirectTarget(record, candidate));
    return target
      ? {
          ...record,
          status: 301,
          statusText: "Redirect",
          redirectTargetUrl: target.url
        }
      : record;
  });

  const linkedRecords = inferredRecords.map((record) => {
    if (!isRedirectStatus(record.status) || !record.redirectTargetUrl) {
      return record;
    }

    const target = inferredRecords.find((candidate) => {
      const closeInTime = candidate.startedAt >= record.startedAt && candidate.startedAt - record.startedAt < 5000;
      return (
        candidate.id !== record.id &&
        candidate.method === record.method &&
        candidate.url === record.redirectTargetUrl &&
        candidate.initiator === record.initiator &&
        closeInTime
      );
    });

    return target
      ? { ...record, redirectTargetId: target.id }
      : record;
  }).map((record, _, linkedRecords) => {
    const source = linkedRecords.find((candidate) => candidate.redirectTargetId === record.id);
    return source ? { ...record, redirectSourceId: source.id } : record;
  });

  return inferStylesheetInitiators(linkedRecords);
}

function isLikelyExtensionRedirectTarget(source: NetworkRecord, candidate: NetworkRecord): boolean {
  const closeInTime = candidate.startedAt >= source.startedAt && candidate.startedAt - source.startedAt < 1000;
  if (
    source.id === candidate.id ||
    source.method !== candidate.method ||
    candidate.status === undefined ||
    candidate.status < 200 ||
    candidate.status >= 400 ||
    !closeInTime ||
    !isChromeExtensionUrl(candidate.url)
  ) {
    return false;
  }

  const sourceUrl = parseUrl(source.url);
  const candidateUrl = parseUrl(candidate.url);
  if (!sourceUrl || !candidateUrl) {
    return false;
  }

  return (
    sourceUrl.pathname === candidateUrl.pathname &&
    sourceUrl.search === candidateUrl.search &&
    source.name === candidate.name &&
    source.initiator === candidate.initiator &&
    source.responseHeaders.length === 0
  );
}

function isChromeExtensionUrl(url: string): boolean {
  return url.startsWith("chrome-extension://");
}

function parseUrl(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

function findSameRequestNear(
  records: NetworkRecord[],
  incoming: NetworkRecord,
  source?: NetworkRecord["source"]
): NetworkRecord | undefined {
  return records.find((record) => {
    const closeInTime = Math.abs(record.startedAt - incoming.startedAt) < 3000;
    const sameRequest = record.method === incoming.method && record.url === incoming.url && closeInTime;
    const sameSource = source === undefined || record.source === source;
    return sameSource && sameRequest;
  });
}

function normaliseHarRequestBody(entry: HarEntryLike): BodyCapture {
  const postData = entry.request.postData;
  if (!postData) {
    return entry.request.method === "GET" || entry.request.method === "HEAD"
      ? emptyBody()
      : unavailableBody("Payload unavailable: capture was enabled after request started.");
  }

  if (postData.text !== undefined) {
    return textBody(postData.text, postData.mimeType);
  }

  if (postData.params?.length) {
    const text = postData.params
      .map((param) => `${encodeURIComponent(param.name)}=${encodeURIComponent(param.value ?? "")}`)
      .join("&");
    return { ...textBody(text, postData.mimeType), kind: "form" };
  }

  return unavailableBody("DevTools HAR did not include a request payload.");
}

function inferResourceType(entry: HarEntryLike): ResourceType {
  const rawType = entry._resourceType?.toLowerCase();
  if (rawType === "xhr") return "xhr";
  if (rawType === "fetch") return "fetch";
  if (rawType === "document") return "document";
  if (rawType === "stylesheet") return "css";
  if (rawType === "script") return "script";
  if (rawType === "font") return "font";
  if (rawType === "image") return "image";
  if (rawType === "media") return "media";
  if (rawType === "manifest") return "manifest";
  if (rawType === "websocket") return "websocket";
  if (rawType === "wasm") return "wasm";

  const mimeType = entry.response.content?.mimeType?.toLowerCase() ?? "";
  if (mimeType.includes("javascript")) return "script";
  if (mimeType.includes("css")) return "css";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("font/")) return "font";
  if (mimeType.startsWith("audio/") || mimeType.startsWith("video/")) return "media";
  if (mimeType.includes("html")) return "document";

  return "other";
}

function inferInitiator(entry: HarEntryLike): { label: string; location?: SourceLocation } | undefined {
  if (!entry._initiator) {
    return undefined;
  }

  if (typeof entry._initiator === "string") {
    return { label: entry._initiator };
  }

  const frame = findInitiatorFrame(entry._initiator.stack);
  if (frame?.url) {
    const lineNumber = frame.lineNumber ?? undefined;
    const columnNumber = frame.columnNumber ?? undefined;
    const line = lineNumber !== undefined ? `:${lineNumber + 1}` : "";
    return {
      label: `${getDisplayName(frame.url)}${line}`,
      location: {
        url: frame.url,
        lineNumber,
        columnNumber
      }
    };
  }

  if (entry._initiator.url) {
    const lineNumber = entry._initiator.lineNumber ?? undefined;
    const columnNumber = entry._initiator.columnNumber ?? undefined;
    const line = lineNumber !== undefined ? `:${lineNumber + 1}` : "";
    return {
      label: `${getDisplayName(entry._initiator.url)}${line}`,
      location: {
        url: entry._initiator.url,
        lineNumber,
        columnNumber
      }
    };
  }

  return entry._initiator.type ? { label: entry._initiator.type } : undefined;
}

function inferResponseSize(entry: HarEntryLike): number | undefined {
  return firstPositive(
    entry._transferSize,
    entry._encodedDataLength,
    entry.response.bodySize,
    entry.response.content?.size,
    entry._resourceSize
  ) ?? firstNonNegative(
    entry._transferSize,
    entry._encodedDataLength,
    entry.response.bodySize,
    entry.response.content?.size,
    entry._resourceSize
  );
}

function firstPositive(...values: Array<number | undefined>): number | undefined {
  return values.find((value) => value !== undefined && Number.isFinite(value) && value > 0);
}

function firstNonNegative(...values: Array<number | undefined>): number | undefined {
  return values.find((value) => value !== undefined && Number.isFinite(value) && value >= 0);
}

function findInitiatorFrame(stack: HarInitiatorStack | undefined, depth = 0): HarInitiatorCallFrame | undefined {
  if (!stack || depth > 10) {
    return undefined;
  }

  const frame = stack.callFrames?.find((callFrame) => callFrame.url);
  return frame ?? findInitiatorFrame(stack.parent ?? undefined, depth + 1);
}

function textBodyFromHarContent(content: string, mimeType?: string, encoding?: string): BodyCapture {
  const body = textBody(content, mimeType, encoding);
  if (encoding !== "base64") {
    return body;
  }

  return {
    ...body,
    sizeBytes: base64ByteLength(content)
  };
}

function base64ByteLength(value: string): number {
  const normalised = value.replace(/\s/g, "");
  if (!normalised) {
    return 0;
  }

  const padding = normalised.endsWith("==") ? 2 : normalised.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((normalised.length * 3) / 4) - padding);
}

function mergeSizeBytes(existing: number | undefined, incoming: number | undefined): number | undefined {
  if (isPositiveSize(incoming)) {
    return incoming;
  }

  if (isPositiveSize(existing)) {
    return existing;
  }

  if (isNonNegativeSize(incoming)) {
    return incoming;
  }

  return existing;
}

function isPositiveSize(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function isNonNegativeSize(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function mergeInitiator(existing: string | undefined, incoming: string | undefined): string | undefined {
  if (isSpecificInitiator(incoming)) {
    return incoming;
  }

  if (isSpecificInitiator(existing)) {
    return existing;
  }

  return incoming ?? existing;
}

function mergeInitiatorLocation(
  existing: NetworkRecord,
  incoming: NetworkRecord,
  initiator: string | undefined
): SourceLocation | undefined {
  if (initiator === incoming.initiator && incoming.initiatorLocation) {
    return incoming.initiatorLocation;
  }

  if (initiator === existing.initiator && existing.initiatorLocation) {
    return existing.initiatorLocation;
  }

  return incoming.initiatorLocation ?? existing.initiatorLocation;
}

function isSpecificInitiator(value: string | undefined): value is string {
  if (!value) {
    return false;
  }

  return !["other", "script", "parser", "fetch", "xhr", "xmlhttprequest"].includes(value.toLowerCase());
}

function inferStylesheetInitiators(records: NetworkRecord[]): NetworkRecord[] {
  const stylesheetRefs = records
    .filter((record) => record.type === "css" && typeof record.responseBody.text === "string")
    .flatMap((record) => extractStylesheetReferences(record));

  if (stylesheetRefs.length === 0) {
    return records;
  }

  return records.map((record) => {
    if (isSpecificInitiator(record.initiator) || !["font", "image", "media"].includes(record.type)) {
      return record;
    }

    const ref = stylesheetRefs.find((candidate) => candidate.url === record.url);
    if (!ref) {
      return record;
    }

    return {
      ...record,
      initiator: `${ref.source.name}:${ref.lineNumber + 1}`,
      initiatorLocation: {
        url: ref.source.url,
        lineNumber: ref.lineNumber,
        columnNumber: ref.columnNumber
      }
    };
  });
}

function extractStylesheetReferences(record: NetworkRecord): Array<{
  url: string;
  source: NetworkRecord;
  lineNumber: number;
  columnNumber: number;
}> {
  const text = record.responseBody.text ?? "";
  const references: Array<{
    url: string;
    source: NetworkRecord;
    lineNumber: number;
    columnNumber: number;
  }> = [];
  const pattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^'")]*?))\s*\)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const rawUrl = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!rawUrl || rawUrl.startsWith("data:") || rawUrl.startsWith("#")) {
      continue;
    }

    try {
      const location = offsetToLocation(text, match.index);
      references.push({
        url: new URL(rawUrl, record.url).href,
        source: record,
        lineNumber: location.lineNumber,
        columnNumber: location.columnNumber
      });
    } catch {
      // Ignore malformed CSS URLs; DevTools will still show the original initiator value.
    }
  }

  return references;
}

function offsetToLocation(text: string, offset: number): { lineNumber: number; columnNumber: number } {
  let lineNumber = 0;
  let lineStart = 0;

  for (let index = 0; index < offset; index += 1) {
    if (text[index] === "\n") {
      lineNumber += 1;
      lineStart = index + 1;
    }
  }

  return {
    lineNumber,
    columnNumber: offset - lineStart
  };
}

function inferRedirectTargetUrl(
  requestUrl: string,
  responseHeaders: HeaderPair[],
  response: HarEntryLike["response"]
): string | undefined {
  const rawLocation = response.redirectURL || findHeader(responseHeaders, "location");
  const hasRedirectSignal = isRedirectStatus(response.status) || (response.status === 0 && Boolean(rawLocation));

  if (!hasRedirectSignal || !rawLocation) {
    return undefined;
  }

  try {
    return new URL(rawLocation, requestUrl).href;
  } catch {
    return rawLocation;
  }
}

function isRedirectStatus(status?: number): boolean {
  return status !== undefined && status >= 300 && status < 400;
}

function normaliseStatus(status: number | undefined, redirectTargetUrl: string | undefined): number | undefined {
  if (status === 0 && redirectTargetUrl) {
    return 301;
  }

  return status;
}

function inferUnsupportedReason(type: ResourceType, body: BodyCapture): string | undefined {
  if (["websocket", "media", "font", "image"].includes(type)) {
    return `${type} requests are not editable yet.`;
  }

  if (body.kind === "binary" || body.kind === "stream" || body.kind === "too-large") {
    return "This request body is not editable because it is binary, streaming, or over the configured limit.";
  }

  return undefined;
}
