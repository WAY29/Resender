import type { FilterState, HeaderPair, NetworkRecord, ResourceType } from "../types";
import { findHeader } from "./headers";

export const supportedFilterKeys = [
  "domain",
  "has-response-header",
  "response-header-set-cookie",
  "larger-than",
  "method",
  "mime-type",
  "resource-type",
  "scheme",
  "set-cookie-domain",
  "set-cookie-name",
  "set-cookie-value",
  "status-code",
  "url"
] as const;

export const unsupportedFilterKeys = [
  "cookie-domain",
  "cookie-name",
  "cookie-path",
  "cookie-value",
  "has-overrides",
  "is",
  "mixed-content",
  "priority"
] as const;

export const filterValueSuggestions = {
  "larger-than": ["100", "10k", "1M"],
  "resource-type": [
    "document",
    "stylesheet",
    "script",
    "font",
    "image",
    "media",
    "fetch",
    "xhr",
    "websocket",
    "manifest",
    "wasm",
    "other"
  ],
  scheme: ["http", "https"]
} as const;

export type SupportedFilterKey = (typeof supportedFilterKeys)[number];
export type UnsupportedFilterKey = (typeof unsupportedFilterKeys)[number];
export type RecognizedFilterKey = SupportedFilterKey | UnsupportedFilterKey;
export type CanonicalResourceType = (typeof filterValueSuggestions)["resource-type"][number];

export type FilterIssueCode =
  | "unsupported-key"
  | "invalid-regex"
  | "invalid-larger-than"
  | "invalid-status-code"
  | "invalid-resource-type"
  | "invalid-property-value";

export type FilterNoticeCode = "approximate-larger-than";

export type FilterIssue = {
  code: FilterIssueCode;
  raw: string;
  start: number;
  end: number;
  negative: boolean;
  key?: string;
  value?: string;
};

export type FilterNotice = {
  code: FilterNoticeCode;
};

type PropertyMatcher =
  | { kind: "domain"; regex: RegExp }
  | { kind: "has-response-header"; headerName: string }
  | { kind: "response-header-set-cookie"; text: string }
  | { kind: "larger-than"; minBytes: number }
  | { kind: "method"; method: string }
  | { kind: "mime-type"; mimeType: string }
  | { kind: "resource-type"; resourceType: CanonicalResourceType }
  | { kind: "scheme"; scheme: string }
  | { kind: "set-cookie-domain"; domain: string }
  | { kind: "set-cookie-name"; name: string }
  | { kind: "set-cookie-value"; value: string }
  | { kind: "status-code"; statusCode: string }
  | { kind: "url"; text: string };

type TokenBase = {
  raw: string;
  start: number;
  end: number;
  negative: boolean;
};

type ParsedTextToken = TokenBase & {
  kind: "text";
  status: "valid" | "incomplete";
  text: string;
};

type ParsedRegexToken = TokenBase & {
  kind: "regex";
  status: "valid" | "invalid" | "incomplete";
  pattern: string;
  flags: string;
  regex?: RegExp;
  issue?: FilterIssue;
};

type ParsedPropertyToken = TokenBase & {
  kind: "property";
  status: "valid" | "invalid" | "unsupported" | "incomplete";
  key: string;
  value: string;
  matcher?: PropertyMatcher;
  issue?: FilterIssue;
};

export type ParsedFilterToken = ParsedTextToken | ParsedRegexToken | ParsedPropertyToken;

export type ParsedFilterQuery = {
  tokens: ParsedFilterToken[];
  issues: FilterIssue[];
};

export type FilterAutocompleteSuggestion = {
  id: string;
  kind: "key" | "value";
  label: string;
  description?: string;
  replacementStart: number;
  replacementEnd: number;
  replacementText: string;
  caret: number;
};

export type FilterAutocomplete = {
  suggestions: FilterAutocompleteSuggestion[];
};

type ScannedToken = {
  raw: string;
  start: number;
  end: number;
  negative: boolean;
};

type QuotedScanResult = {
  value: string;
  endIndex: number;
  closed: boolean;
};

type RegexScanResult = {
  pattern: string;
  endIndex: number;
  closed: boolean;
};

const supportedKeySet = new Set<string>(supportedFilterKeys);
const unsupportedKeySet = new Set<string>(unsupportedFilterKeys);
const recognizedKeySet = new Set<string>([...supportedFilterKeys, ...unsupportedFilterKeys]);

const resourceTypeAliases: Record<string, CanonicalResourceType> = {
  css: "stylesheet",
  doc: "document",
  document: "document",
  fetch: "fetch",
  font: "font",
  image: "image",
  img: "image",
  js: "script",
  manifest: "manifest",
  media: "media",
  other: "other",
  script: "script",
  stylesheet: "stylesheet",
  wasm: "wasm",
  websocket: "websocket",
  ws: "websocket",
  xhr: "xhr"
};

export function parseNetworkFilterQuery(query: string): ParsedFilterQuery {
  const tokens = scanFilterTokens(query).map((token) => parseScannedToken(query, token));
  return {
    tokens,
    issues: tokens.flatMap((token) => ("issue" in token && token.issue ? [token.issue] : []))
  };
}

export function getFilterNotices(
  parsedQuery: ParsedFilterQuery,
  records: NetworkRecord[]
): FilterNotice[] {
  const hasLargerThan = parsedQuery.tokens.some(
    (token) => token.kind === "property" && token.status === "valid" && token.key === "larger-than"
  );

  if (!hasLargerThan) {
    return [];
  }

  const hasApproximateSizes = records.some((record) => record.source !== "har");
  return hasApproximateSizes ? [{ code: "approximate-larger-than" }] : [];
}

export function matchesFilter(
  record: NetworkRecord,
  filter: FilterState,
  parsedQuery: ParsedFilterQuery = parseNetworkFilterQuery(filter.query)
): boolean {
  const typeMatches =
    filter.type === "all" ||
    (filter.type === "fetch-xhr" && (record.type === "fetch" || record.type === "xhr")) ||
    record.type === filter.type;

  const queryMatches = parsedQuery.tokens.every((token) => matchesParsedToken(record, token));
  const matched = typeMatches && queryMatches;
  return filter.invert ? !matched : matched;
}

export function getFilterAutocomplete(query: string, caret: number): FilterAutocomplete | null {
  const token = findTokenAtCaret(query, caret);
  if (!token) {
    return null;
  }

  const raw = token.raw;
  const negativePrefix = raw.startsWith("-") ? "-" : "";
  const core = negativePrefix ? raw.slice(1) : raw;
  if (!core || core.startsWith("/") || core.startsWith('"')) {
    if (raw === "-") {
      return buildKeySuggestions("", token.start, token.end, negativePrefix);
    }
    return null;
  }

  const caretOffsetInCore = Math.max(0, Math.min(core.length, caret - token.start - negativePrefix.length));
  const colonIndex = core.indexOf(":");
  if (colonIndex === -1 || caretOffsetInCore <= colonIndex) {
    const keyPrefix = core.slice(0, caretOffsetInCore).trim().toLowerCase();
    if (keyPrefix.length === 0 && raw !== "-") {
      return null;
    }
    return buildKeySuggestions(keyPrefix, token.start, token.end, negativePrefix);
  }

  const key = core.slice(0, colonIndex).toLowerCase();
  const suggestions = filterValueSuggestionsForKey(key as SupportedFilterKey);
  if (!suggestions || !supportedKeySet.has(key)) {
    return null;
  }

  const valueRawPrefix = core.slice(colonIndex + 1, caretOffsetInCore);
  const quoted = valueRawPrefix.startsWith('"');
  const valuePrefix = quoted ? decodePartialQuotedValue(valueRawPrefix.slice(1)) : valueRawPrefix;
  const filteredSuggestions = suggestions
    .filter((value) => value.toLowerCase().startsWith(valuePrefix.toLowerCase()))
    .map((value) => {
      const replacementText = `${negativePrefix}${key}:${quoted ? `"${value}"` : value}`;
      return {
        id: `value:${key}:${value}`,
        kind: "value" as const,
        label: value,
        replacementStart: token.start,
        replacementEnd: token.end,
        replacementText,
        caret: token.start + replacementText.length
      };
    });

  return filteredSuggestions.length > 0 ? { suggestions: filteredSuggestions } : null;
}

export function applyFilterAutocompleteSuggestion(
  query: string,
  suggestion: FilterAutocompleteSuggestion
): { query: string; caret: number } {
  const nextQuery =
    query.slice(0, suggestion.replacementStart) +
    suggestion.replacementText +
    query.slice(suggestion.replacementEnd);

  return {
    query: nextQuery,
    caret: suggestion.replacementStart + suggestion.replacementText.length
  };
}

export function moveFilterAutocompleteIndex(
  currentIndex: number,
  suggestionCount: number,
  direction: "next" | "previous"
): number {
  if (suggestionCount <= 0) {
    return 0;
  }

  if (direction === "next") {
    return (currentIndex + 1) % suggestionCount;
  }

  return (currentIndex - 1 + suggestionCount) % suggestionCount;
}

function buildKeySuggestions(
  prefix: string,
  replacementStart: number,
  replacementEnd: number,
  negativePrefix: string
): FilterAutocomplete | null {
  const suggestions = supportedFilterKeys
    .filter((key) => key.startsWith(prefix))
    .map((key) => {
      const replacementText = `${negativePrefix}${key}:`;
      return {
        id: `key:${key}`,
        kind: "key" as const,
        label: `${key}:`,
        replacementStart,
        replacementEnd,
        replacementText,
        caret: replacementStart + replacementText.length
      };
    });

  return suggestions.length > 0 ? { suggestions } : null;
}

function filterValueSuggestionsForKey(
  key: SupportedFilterKey
): readonly string[] | undefined {
  return key in filterValueSuggestions
    ? filterValueSuggestions[key as keyof typeof filterValueSuggestions]
    : undefined;
}

function findTokenAtCaret(query: string, caret: number): ScannedToken | undefined {
  return scanFilterTokens(query).find((token) => caret >= token.start && caret <= token.end);
}

function scanFilterTokens(query: string): ScannedToken[] {
  const tokens: ScannedToken[] = [];
  let index = 0;

  while (index < query.length) {
    while (index < query.length && isWhitespace(query[index])) {
      index += 1;
    }

    if (index >= query.length) {
      break;
    }

    const token = scanFilterToken(query, index);
    tokens.push(token);
    index = token.end;
  }

  return tokens;
}

function scanFilterToken(query: string, start: number): ScannedToken {
  const length = query.length;
  let index = start;
  const negative = query[index] === "-" && index + 1 < length && !isWhitespace(query[index + 1]);
  if (negative) {
    index += 1;
  }

  if (index >= length) {
    return {
      raw: query.slice(start, length),
      start,
      end: length,
      negative
    };
  }

  if (query[index] === '"') {
    const quoted = scanQuotedValue(query, index);
    index = quoted.endIndex;
    if (quoted.closed) {
      while (index < length && !isWhitespace(query[index])) {
        index += 1;
      }
    }

    return {
      raw: query.slice(start, index),
      start,
      end: index,
      negative
    };
  }

  if (query[index] === "/") {
    const regex = scanRegexValue(query, index);
    index = regex.endIndex;
    if (regex.closed) {
      while (index < length && !isWhitespace(query[index])) {
        index += 1;
      }
    }

    return {
      raw: query.slice(start, index),
      start,
      end: index,
      negative
    };
  }

  let sawColon = false;
  while (index < length && !isWhitespace(query[index])) {
    if (query[index] === ":" && !sawColon) {
      sawColon = true;
      index += 1;
      if (index < length && query[index] === '"') {
        const quoted = scanQuotedValue(query, index);
        index = quoted.endIndex;
        if (quoted.closed) {
          while (index < length && !isWhitespace(query[index])) {
            index += 1;
          }
        }
        break;
      }
      continue;
    }

    index += 1;
  }

  return {
    raw: query.slice(start, index),
    start,
    end: index,
    negative
  };
}

function parseScannedToken(query: string, token: ScannedToken): ParsedFilterToken {
  const core = token.negative ? token.raw.slice(1) : token.raw;
  if (core.length === 0 || token.raw === "-") {
    return {
      ...token,
      kind: "text",
      status: "incomplete",
      text: ""
    };
  }

  if (core.startsWith('"')) {
    const quoted = scanQuotedValue(core, 0);
    if (!quoted.closed) {
      return {
        ...token,
        kind: "text",
        status: "incomplete",
        text: quoted.value
      };
    }

    if (quoted.endIndex !== core.length) {
      return {
        ...token,
        kind: "text",
        status: "valid",
        text: core
      };
    }

    return {
      ...token,
      kind: "text",
      status: "valid",
      text: quoted.value
    };
  }

  if (core.startsWith("/")) {
    return parseRegexToken(token, core);
  }

  const colonIndex = core.indexOf(":");
  if (colonIndex <= 0) {
    return {
      ...token,
      kind: "text",
      status: "valid",
      text: core
    };
  }

  const key = core.slice(0, colonIndex).toLowerCase();
  const rawValue = core.slice(colonIndex + 1);
  const valueResult = readTokenValue(rawValue);

  if (!recognizedKeySet.has(key)) {
    const text = valueResult.kind === "quoted" && valueResult.complete ? `${key}:${valueResult.value}` : core;
    return {
      ...token,
      kind: "text",
      status: "valid",
      text
    };
  }

  if (rawValue.length === 0 || (valueResult.kind === "quoted" && !valueResult.complete)) {
    const incompleteAtEnd = token.end === query.length;
    if (incompleteAtEnd) {
      return {
        ...token,
        kind: "property",
        status: "incomplete",
        key,
        value: valueResult.value
      };
    }

    return invalidPropertyToken(token, key, valueResult.value, "invalid-property-value");
  }

  if (valueResult.kind === "quoted" && valueResult.trailing.length > 0) {
    return invalidPropertyToken(token, key, valueResult.value, "invalid-property-value");
  }

  const value = valueResult.value;
  if (unsupportedKeySet.has(key)) {
    return {
      ...token,
      kind: "property",
      status: "unsupported",
      key,
      value,
      issue: createIssue(token, "unsupported-key", key, value)
    };
  }

  return parseSupportedPropertyToken(token, key as SupportedFilterKey, value);
}

function parseRegexToken(token: ScannedToken, core: string): ParsedRegexToken {
  const regex = scanRegexValue(core, 0);
  if (!regex.closed) {
    return {
      ...token,
      kind: "regex",
      status: "incomplete",
      pattern: regex.pattern,
      flags: ""
    };
  }

  const flags = core.slice(regex.endIndex);
  try {
    return {
      ...token,
      kind: "regex",
      status: "valid",
      pattern: regex.pattern,
      flags,
      regex: new RegExp(regex.pattern, flags)
    };
  } catch {
    return {
      ...token,
      kind: "regex",
      status: "invalid",
      pattern: regex.pattern,
      flags,
      issue: createIssue(token, "invalid-regex")
    };
  }
}

function parseSupportedPropertyToken(
  token: ScannedToken,
  key: SupportedFilterKey,
  value: string
): ParsedPropertyToken {
  switch (key) {
    case "domain": {
      const pattern = value
        .split("*")
        .map(escapeForRegExp)
        .join(".*");
      return validPropertyToken(token, key, value, {
        kind: "domain",
        regex: new RegExp(`^${pattern}$`, "i")
      });
    }
    case "has-response-header":
      return validPropertyToken(token, key, value, {
        kind: "has-response-header",
        headerName: value.toLowerCase()
      });
    case "response-header-set-cookie":
      return validPropertyToken(token, key, value, {
        kind: "response-header-set-cookie",
        text: value.toLowerCase()
      });
    case "larger-than": {
      const minBytes = parseSizeFilterValue(value);
      return minBytes === undefined
        ? invalidPropertyToken(token, key, value, "invalid-larger-than")
        : validPropertyToken(token, key, value, { kind: "larger-than", minBytes });
    }
    case "method":
      return validPropertyToken(token, key, value, { kind: "method", method: value.toLowerCase() });
    case "mime-type":
      return validPropertyToken(token, key, value, {
        kind: "mime-type",
        mimeType: simplifyContentType(value)
      });
    case "resource-type": {
      const resourceType = normalizeResourceTypeValue(value);
      return resourceType === undefined
        ? invalidPropertyToken(token, key, value, "invalid-resource-type")
        : validPropertyToken(token, key, value, { kind: "resource-type", resourceType });
    }
    case "scheme":
      return validPropertyToken(token, key, value, { kind: "scheme", scheme: value.toLowerCase() });
    case "set-cookie-domain":
      return validPropertyToken(token, key, value, {
        kind: "set-cookie-domain",
        domain: value.toLowerCase()
      });
    case "set-cookie-name":
      return validPropertyToken(token, key, value, {
        kind: "set-cookie-name",
        name: value.toLowerCase()
      });
    case "set-cookie-value":
      return validPropertyToken(token, key, value, {
        kind: "set-cookie-value",
        value: value.toLowerCase()
      });
    case "status-code":
      return /^\d+$/.test(value)
        ? validPropertyToken(token, key, value, { kind: "status-code", statusCode: value })
        : invalidPropertyToken(token, key, value, "invalid-status-code");
    case "url":
      return validPropertyToken(token, key, value, { kind: "url", text: value.toLowerCase() });
  }
}

function validPropertyToken(
  token: ScannedToken,
  key: string,
  value: string,
  matcher: PropertyMatcher
): ParsedPropertyToken {
  return {
    ...token,
    kind: "property",
    status: "valid",
    key,
    value,
    matcher
  };
}

function invalidPropertyToken(
  token: ScannedToken,
  key: string,
  value: string,
  code: Exclude<FilterIssueCode, "unsupported-key" | "invalid-regex">
): ParsedPropertyToken {
  return {
    ...token,
    kind: "property",
    status: "invalid",
    key,
    value,
    issue: createIssue(token, code, key, value)
  };
}

function createIssue(
  token: ScannedToken,
  code: FilterIssueCode,
  key?: string,
  value?: string
): FilterIssue {
  return {
    code,
    raw: token.raw,
    start: token.start,
    end: token.end,
    negative: token.negative,
    key,
    value
  };
}

function matchesParsedToken(record: NetworkRecord, token: ParsedFilterToken): boolean {
  if (token.status === "incomplete") {
    return true;
  }

  const baseMatch = (() => {
    if (token.kind === "text") {
      return stringIncludesCaseInsensitive(getTextFilterTarget(record), token.text);
    }

    if (token.kind === "regex") {
      if (token.status !== "valid") {
        return false;
      }

      token.regex!.lastIndex = 0;
      return token.regex!.test(getTextFilterTarget(record));
    }

    if (token.status !== "valid") {
      return false;
    }

    return matchesProperty(record, token.matcher!);
  })();

  return token.negative ? !baseMatch : baseMatch;
}

function matchesProperty(record: NetworkRecord, matcher: PropertyMatcher): boolean {
  switch (matcher.kind) {
    case "domain":
      return matcher.regex.test(record.domain);
    case "has-response-header":
      return record.responseHeaders.some((header) => header.name.toLowerCase() === matcher.headerName);
    case "response-header-set-cookie":
      return getSetCookieHeaders(record.responseHeaders).some((value) =>
        stringIncludesCaseInsensitive(value, matcher.text)
      );
    case "larger-than":
      return typeof record.sizeBytes === "number" && record.sizeBytes >= matcher.minBytes;
    case "method":
      return record.method.toLowerCase() === matcher.method;
    case "mime-type":
      return simplifyContentType(getRecordMimeType(record)) === matcher.mimeType;
    case "resource-type":
      return canonicalResourceTypeForRecord(record.type) === matcher.resourceType;
    case "scheme":
      return getRecordScheme(record.url) === matcher.scheme;
    case "set-cookie-domain":
      return getParsedSetCookies(record.responseHeaders).some((cookie) => cookie.domain?.toLowerCase() === matcher.domain);
    case "set-cookie-name":
      return getParsedSetCookies(record.responseHeaders).some((cookie) => cookie.name.toLowerCase() === matcher.name);
    case "set-cookie-value":
      return getParsedSetCookies(record.responseHeaders).some((cookie) => cookie.value.toLowerCase() === matcher.value);
    case "status-code":
      return String(record.status ?? "") === matcher.statusCode;
    case "url":
      return stringIncludesCaseInsensitive(record.url, matcher.text);
  }
}

function getTextFilterTarget(record: NetworkRecord): string {
  try {
    const parsed = new URL(record.url);
    if (["data:", "blob:", "about:"].includes(parsed.protocol)) {
      return record.url;
    }

    return decodeURI(`${parsed.host}${parsed.pathname}${parsed.search}`);
  } catch {
    return record.url;
  }
}

function getRecordMimeType(record: NetworkRecord): string {
  return (
    record.responseBody.mimeType ??
    findHeader(record.responseHeaders, "content-type") ??
    record.requestBody.mimeType ??
    findHeader(record.requestHeaders, "content-type") ??
    ""
  );
}

function simplifyContentType(value: string | undefined): string {
  return value?.split(";")[0].trim().toLowerCase() ?? "";
}

function getRecordScheme(url: string): string {
  try {
    return new URL(url).protocol.replace(/:$/, "").toLowerCase();
  } catch {
    return "";
  }
}

function getSetCookieHeaders(headers: HeaderPair[]): string[] {
  return headers
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value);
}

function getParsedSetCookies(headers: HeaderPair[]): Array<{ name: string; value: string; domain?: string; path?: string }> {
  return getSetCookieHeaders(headers)
    .map((value) => parseSetCookieHeader(value))
    .filter((cookie): cookie is { name: string; value: string; domain?: string; path?: string } => cookie !== undefined);
}

function parseSetCookieHeader(value: string): { name: string; value: string; domain?: string; path?: string } | undefined {
  const parts = value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }

  const [pair, ...attributes] = parts;
  const separator = pair.indexOf("=");
  if (separator <= 0) {
    return undefined;
  }

  const cookie = {
    name: pair.slice(0, separator).trim(),
    value: pair.slice(separator + 1).trim(),
    domain: undefined as string | undefined,
    path: undefined as string | undefined
  };

  for (const attribute of attributes) {
    const attributeSeparator = attribute.indexOf("=");
    if (attributeSeparator === -1) {
      continue;
    }

    const attributeName = attribute.slice(0, attributeSeparator).trim().toLowerCase();
    const attributeValue = attribute.slice(attributeSeparator + 1).trim();
    if (attributeName === "domain") {
      cookie.domain = attributeValue;
    }
    if (attributeName === "path") {
      cookie.path = attributeValue;
    }
  }

  return cookie;
}

function parseSizeFilterValue(value: string): number | undefined {
  const normalised = value.trim().toLowerCase();
  if (!normalised) {
    return undefined;
  }

  let multiplier = 1;
  let numericPart = normalised;
  if (normalised.endsWith("k")) {
    multiplier = 1024;
    numericPart = normalised.slice(0, -1);
  } else if (normalised.endsWith("m")) {
    multiplier = 1024 * 1024;
    numericPart = normalised.slice(0, -1);
  }

  const quantity = Number(numericPart);
  if (!Number.isFinite(quantity) || quantity < 0) {
    return undefined;
  }

  return quantity * multiplier;
}

function normalizeResourceTypeValue(value: string): CanonicalResourceType | undefined {
  return resourceTypeAliases[value.trim().toLowerCase()];
}

function canonicalResourceTypeForRecord(type: ResourceType): CanonicalResourceType {
  switch (type) {
    case "css":
      return "stylesheet";
    case "document":
      return "document";
    case "fetch":
      return "fetch";
    case "font":
      return "font";
    case "image":
      return "image";
    case "manifest":
      return "manifest";
    case "media":
      return "media";
    case "other":
      return "other";
    case "script":
      return "script";
    case "wasm":
      return "wasm";
    case "websocket":
      return "websocket";
    case "xhr":
      return "xhr";
  }
}

function readTokenValue(rawValue: string):
  | { kind: "plain"; value: string }
  | { kind: "quoted"; value: string; complete: boolean; trailing: string } {
  if (!rawValue.startsWith('"')) {
    return { kind: "plain", value: rawValue };
  }

  const quoted = scanQuotedValue(rawValue, 0);
  return {
    kind: "quoted",
    value: quoted.value,
    complete: quoted.closed,
    trailing: quoted.closed ? rawValue.slice(quoted.endIndex) : ""
  };
}

function scanQuotedValue(value: string, startIndex: number): QuotedScanResult {
  let index = startIndex + 1;
  let decoded = "";

  while (index < value.length) {
    const char = value[index];
    if (char === "\\") {
      const next = value[index + 1];
      if (next === '"' || next === "\\") {
        decoded += next;
        index += 2;
        continue;
      }

      decoded += "\\";
      if (next !== undefined) {
        decoded += next;
        index += 2;
        continue;
      }

      index += 1;
      continue;
    }

    if (char === '"') {
      return {
        value: decoded,
        endIndex: index + 1,
        closed: true
      };
    }

    decoded += char;
    index += 1;
  }

  return {
    value: decoded,
    endIndex: value.length,
    closed: false
  };
}

function decodePartialQuotedValue(value: string): string {
  return scanQuotedValue(`"${value}`, 0).value;
}

function scanRegexValue(value: string, startIndex: number): RegexScanResult {
  let index = startIndex + 1;

  while (index < value.length) {
    const char = value[index];
    if (char === "\\") {
      index += 2;
      continue;
    }

    if (char === "/") {
      return {
        pattern: value.slice(startIndex + 1, index),
        endIndex: index + 1,
        closed: true
      };
    }

    index += 1;
  }

  return {
    pattern: value.slice(startIndex + 1),
    endIndex: value.length,
    closed: false
  };
}

function stringIncludesCaseInsensitive(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.toLowerCase());
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}
