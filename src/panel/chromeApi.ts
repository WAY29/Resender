import type { BodyCapture, HeaderPair, HookNetworkRecord, ResendDraft, ResendResult, SourceLocation } from "../types";

type InjectionResponse<T> = chrome.scripting.InjectionResult<T>[];

const MAIN_WORLD = "MAIN" as chrome.scripting.ExecutionWorld;

export function hasChromeDevTools(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.devtools?.network);
}

export function getInspectedTabId(): number | undefined {
  return chrome.devtools?.inspectedWindow?.tabId;
}

export function openSourceLocation(location: SourceLocation): boolean {
  if (!chrome.devtools?.panels?.openResource) {
    return false;
  }

  const lineNumber = location.lineNumber ?? 0;
  if (location.columnNumber === undefined) {
    chrome.devtools.panels.openResource(location.url, lineNumber);
  } else {
    chrome.devtools.panels.openResource(location.url, lineNumber, location.columnNumber);
  }

  return true;
}

export async function installCaptureHook(bodyLimitBytes: number, captureEnabled = true): Promise<void> {
  const tabId = getInspectedTabId();
  if (tabId === undefined) {
    throw new Error("No inspected tab is available.");
  }

  await executeScript({
    target: { tabId, allFrames: true },
    world: MAIN_WORLD,
    func: installHookInPage as (...args: unknown[]) => void,
    args: [bodyLimitBytes, captureEnabled]
  });
}

export async function configureCaptureHook(options: { bodyLimitBytes?: number; captureEnabled?: boolean }): Promise<void> {
  const tabId = getInspectedTabId();
  if (tabId === undefined) {
    return;
  }

  await executeScript({
    target: { tabId, allFrames: true },
    world: MAIN_WORLD,
    func: configureHookInPage as (...args: unknown[]) => void,
    args: [options]
  });
}

export async function drainCaptureHook(): Promise<Array<HookNetworkRecord & { frameId?: number }>> {
  const tabId = getInspectedTabId();
  if (tabId === undefined) {
    return [];
  }

  const results = await executeScript<HookNetworkRecord[]>({
    target: { tabId, allFrames: true },
    world: MAIN_WORLD,
    func: drainHookInPage
  });

  return results.flatMap((result) =>
    (result.result ?? []).map((record) => ({
      ...record,
      frameId: result.frameId
    }))
  );
}

export async function resendFromPage(
  draft: ResendDraft,
  frameId?: number
): Promise<ResendResult> {
  const tabId = getInspectedTabId();
  if (tabId === undefined) {
    throw new Error("No inspected tab is available.");
  }

  const target: chrome.scripting.InjectionTarget =
    frameId === undefined ? { tabId } : { tabId, frameIds: [frameId] };

  const [result] = await executeScript<ResendResult>({
    target,
    world: MAIN_WORLD,
    func: resendInPage as unknown as (...args: unknown[]) => ResendResult,
    args: [draft]
  });

  if (!result?.result) {
    throw new Error("The inspected page did not return a resend result.");
  }

  return result.result;
}

function executeScript<T>(
  injection: chrome.scripting.ScriptInjection<unknown[], T>
): Promise<InjectionResponse<T>> {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(injection, (results) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve((results ?? []) as InjectionResponse<T>);
    });
  });
}

function installHookInPage(bodyLimitBytes: number, captureEnabled = true) {
  type PageHeaderPair = { name: string; value: string };
  type PageBodyCapture = {
    kind:
      | "empty"
      | "text"
      | "json"
      | "form"
      | "binary"
      | "stream"
      | "too-large"
      | "unavailable"
      | "error";
    text?: string;
    sizeBytes?: number;
    mimeType?: string;
    encoding?: string;
    reason?: string;
  };
  type PageRecord = {
    hookId: string;
    protocol: "fetch" | "xhr";
    method: string;
    url: string;
    status?: number;
    statusText?: string;
    requestHeaders: PageHeaderPair[];
    responseHeaders: PageHeaderPair[];
    requestBody: PageBodyCapture;
    responseBody: PageBodyCapture;
    startedAtEpochMs: number;
    timeMs?: number;
    frameUrl?: string;
    credentials?: RequestCredentials;
    error?: string;
    resent?: boolean;
    resendId?: string;
  };

  type HookState = {
    version: number;
    bodyLimitBytes: number;
    captureEnabled: boolean;
    records: PageRecord[];
    sequence: number;
    nextResendId?: string;
    drain: () => PageRecord[];
    configure: (options: { bodyLimitBytes?: number; captureEnabled?: boolean }) => void;
    markNextResend: (resendId: string) => void;
  };

  const hookedWindow = window as Window & { __RESENDER_HOOK__?: HookState };

  if (hookedWindow.__RESENDER_HOOK__?.version === 1) {
    hookedWindow.__RESENDER_HOOK__.configure({ bodyLimitBytes, captureEnabled });
    return;
  }

  const originalFetch = window.fetch.bind(window);
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalSend = XMLHttpRequest.prototype.send;
  const encoder = new TextEncoder();

  const state: HookState = {
    version: 1,
    bodyLimitBytes,
    captureEnabled,
    records: [],
    sequence: 0,
    drain() {
      return this.records.splice(0, this.records.length);
    },
    configure(options) {
      if (typeof options.bodyLimitBytes === "number" && options.bodyLimitBytes > 0) {
        this.bodyLimitBytes = options.bodyLimitBytes;
      }
      if (typeof options.captureEnabled === "boolean") {
        this.captureEnabled = options.captureEnabled;
        if (!options.captureEnabled) {
          this.records.splice(0, this.records.length);
        }
      }
    },
    markNextResend(resendId) {
      this.nextResendId = resendId;
    }
  };

  function nextHookId(prefix: string): string {
    state.sequence += 1;
    return `${prefix}:${Date.now()}:${state.sequence}`;
  }

  function byteLength(text: string): number {
    return encoder.encode(text).byteLength;
  }

  function emptyBody(): PageBodyCapture {
    return { kind: "empty", text: "", sizeBytes: 0 };
  }

  function unavailableBody(reason: string): PageBodyCapture {
    return { kind: "unavailable", reason };
  }

  function textBody(text: string, mimeType?: string): PageBodyCapture {
    return {
      kind: mimeType?.toLowerCase().includes("json") ? "json" : "text",
      text,
      mimeType,
      sizeBytes: byteLength(text)
    };
  }

  function isTextualMime(mimeType?: string | null): boolean {
    if (!mimeType) return true;
    const lower = mimeType.toLowerCase();
    return (
      lower.startsWith("text/") ||
      lower.includes("json") ||
      lower.includes("xml") ||
      lower.includes("javascript") ||
      lower.includes("x-www-form-urlencoded")
    );
  }

  function headersFromObject(input?: HeadersInit): PageHeaderPair[] {
    if (!input) return [];

    try {
      if (input instanceof Headers) {
        return Array.from(input.entries()).map(([name, value]) => ({ name, value }));
      }

      if (Array.isArray(input)) {
        return input.map(([name, value]) => ({ name, value }));
      }

      return Object.entries(input).map(([name, value]) => ({ name, value: String(value) }));
    } catch {
      return [];
    }
  }

  function mergeHeaders(first: PageHeaderPair[], second: PageHeaderPair[]): PageHeaderPair[] {
    const byName = new Map<string, PageHeaderPair>();
    for (const header of first) byName.set(header.name.toLowerCase(), header);
    for (const header of second) byName.set(header.name.toLowerCase(), header);
    return Array.from(byName.values());
  }

  function headersFromResponse(headers: Headers): PageHeaderPair[] {
    return Array.from(headers.entries()).map(([name, value]) => ({ name, value }));
  }

  function parseRawResponseHeaders(rawHeaders: string): PageHeaderPair[] {
    return rawHeaders
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(":");
        return separator === -1
          ? { name: line.trim(), value: "" }
          : {
              name: line.slice(0, separator).trim(),
              value: line.slice(separator + 1).trim()
            };
      });
  }

  async function bodyToText(body: unknown, mimeType?: string | null): Promise<PageBodyCapture> {
    if (body === undefined || body === null) {
      return emptyBody();
    }

    if (typeof body === "string") {
      const sizeBytes = byteLength(body);
      if (sizeBytes > state.bodyLimitBytes) {
        return { kind: "too-large", sizeBytes, reason: "Request body exceeded the configured limit." };
      }
      return textBody(body, mimeType ?? undefined);
    }

    if (body instanceof URLSearchParams) {
      const text = body.toString();
      const sizeBytes = byteLength(text);
      if (sizeBytes > state.bodyLimitBytes) {
        return { kind: "too-large", sizeBytes, reason: "Request body exceeded the configured limit." };
      }
      return { ...textBody(text, "application/x-www-form-urlencoded"), kind: "form" };
    }

    if (typeof FormData !== "undefined" && body instanceof FormData) {
      const lines: string[] = [];
      for (const [name, value] of body.entries()) {
        if (value instanceof File) {
          lines.push(`${name}=[File name="${value.name}" type="${value.type}" size=${value.size}]`);
        } else {
          lines.push(`${name}=${value}`);
        }
      }
      const text = lines.join("\n");
      const sizeBytes = byteLength(text);
      if (sizeBytes > state.bodyLimitBytes) {
        return { kind: "too-large", sizeBytes, reason: "FormData summary exceeded the configured limit." };
      }
      return { ...textBody(text, "multipart/form-data"), kind: "form" };
    }

    if (body instanceof Blob) {
      if (body.size > state.bodyLimitBytes) {
        return { kind: "too-large", sizeBytes: body.size, mimeType: body.type, reason: "Blob exceeded the configured limit." };
      }

      if (!isTextualMime(body.type || mimeType)) {
        return { kind: "binary", sizeBytes: body.size, mimeType: body.type, reason: "Blob is not a text body." };
      }

      return textBody(await body.text(), body.type || mimeType || undefined);
    }

    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      const bytes = body instanceof ArrayBuffer ? new Uint8Array(body) : new Uint8Array(body.buffer);
      if (bytes.byteLength > state.bodyLimitBytes) {
        return { kind: "too-large", sizeBytes: bytes.byteLength, reason: "ArrayBuffer exceeded the configured limit." };
      }

      if (!isTextualMime(mimeType)) {
        return { kind: "binary", sizeBytes: bytes.byteLength, mimeType: mimeType ?? undefined, reason: "ArrayBuffer is not a text body." };
      }

      return textBody(new TextDecoder().decode(bytes), mimeType ?? undefined);
    }

    if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
      return { kind: "stream", reason: "Streaming request bodies are not editable yet." };
    }

    return unavailableBody(`Unsupported request body type: ${Object.prototype.toString.call(body)}`);
  }

  async function requestBodyFromFetch(input: RequestInfo | URL, init?: RequestInit): Promise<PageBodyCapture> {
    const contentType =
      headersFromObject(init?.headers).find((header) => header.name.toLowerCase() === "content-type")?.value ??
      (input instanceof Request ? input.headers.get("content-type") : undefined);

    if (init?.body !== undefined) {
      return bodyToText(init.body, contentType);
    }

    if (input instanceof Request) {
      try {
        return bodyToText(await input.clone().text(), contentType);
      } catch {
        return unavailableBody("The Request body could not be cloned.");
      }
    }

    return emptyBody();
  }

  async function responseBodyFromFetch(response: Response): Promise<PageBodyCapture> {
    const mimeType = response.headers.get("content-type");
    const contentLength = Number(response.headers.get("content-length") ?? "");

    if (!isTextualMime(mimeType)) {
      return { kind: "binary", mimeType: mimeType ?? undefined, sizeBytes: contentLength || undefined, reason: "Response is not text." };
    }

    if (Number.isFinite(contentLength) && contentLength > state.bodyLimitBytes) {
      return { kind: "too-large", mimeType: mimeType ?? undefined, sizeBytes: contentLength, reason: "Response body exceeded the configured limit." };
    }

    try {
      const text = await response.text();
      const sizeBytes = byteLength(text);
      if (sizeBytes > state.bodyLimitBytes) {
        return { kind: "too-large", mimeType: mimeType ?? undefined, sizeBytes, reason: "Response body exceeded the configured limit." };
      }
      return textBody(text, mimeType ?? undefined);
    } catch (error) {
      return { kind: "error", reason: error instanceof Error ? error.message : String(error) };
    }
  }

  window.fetch = async function resenderFetch(input: RequestInfo | URL, init?: RequestInit) {
    const hookId = nextHookId("fetch");
    const startedAtEpochMs = Date.now();
    const startedAt = performance.now();
    const request = input instanceof Request ? input : undefined;
    const method = init?.method ?? request?.method ?? "GET";
    const url = request?.url ?? String(input);
    const credentials = init?.credentials ?? request?.credentials ?? "same-origin";
    const initHeaders = headersFromObject(init?.headers);
    const requestHeaders = mergeHeaders(request ? headersFromObject(request.headers) : [], initHeaders);
    const requestBodyPromise = requestBodyFromFetch(input, init);
    const resendId = state.nextResendId;
    state.nextResendId = undefined;
    const shouldCapture = state.captureEnabled || Boolean(resendId);

    try {
      const response = await originalFetch(input, init);
      const responseClone = response.clone();

      Promise.all([requestBodyPromise, responseBodyFromFetch(responseClone)]).then(
        ([requestBody, responseBody]) => {
          if (!shouldCapture) return;
          state.records.push({
            hookId,
            protocol: "fetch",
            method,
            url,
            status: response.status,
            statusText: response.statusText,
            requestHeaders,
            responseHeaders: headersFromResponse(response.headers),
            requestBody,
            responseBody,
            startedAtEpochMs,
            timeMs: performance.now() - startedAt,
            frameUrl: location.href,
            credentials,
            resent: Boolean(resendId),
            resendId
          });
        }
      );

      return response;
    } catch (error) {
      const requestBody = await requestBodyPromise;
      if (shouldCapture) {
        state.records.push({
          hookId,
          protocol: "fetch",
          method,
          url,
          requestHeaders,
          responseHeaders: [],
          requestBody,
          responseBody: { kind: "error", reason: error instanceof Error ? error.message : String(error) },
          startedAtEpochMs,
          timeMs: performance.now() - startedAt,
          frameUrl: location.href,
          credentials,
          error: error instanceof Error ? error.message : String(error),
          resent: Boolean(resendId),
          resendId
        });
      }
      throw error;
    }
  };

  XMLHttpRequest.prototype.open = function resenderOpen(method: string, url: string | URL) {
    const xhr = this as XMLHttpRequest & {
      __RESENDER_XHR__?: {
        hookId: string;
        method: string;
        url: string;
        requestHeaders: PageHeaderPair[];
        startedAtEpochMs?: number;
        startedAt?: number;
      };
    };

    xhr.__RESENDER_XHR__ = {
      hookId: nextHookId("xhr"),
      method,
      url: String(url),
      requestHeaders: []
    };

    return originalOpen.apply(this, arguments as unknown as Parameters<typeof originalOpen>);
  };

  XMLHttpRequest.prototype.setRequestHeader = function resenderSetRequestHeader(name: string, value: string) {
    const xhr = this as XMLHttpRequest & {
      __RESENDER_XHR__?: { requestHeaders: PageHeaderPair[] };
    };
    xhr.__RESENDER_XHR__?.requestHeaders.push({ name, value });
    return originalSetRequestHeader.apply(this, [name, value]);
  };

  XMLHttpRequest.prototype.send = function resenderSend(body?: Document | XMLHttpRequestBodyInit | null) {
    const xhr = this as XMLHttpRequest & {
      __RESENDER_XHR__?: {
        hookId: string;
        method: string;
        url: string;
        requestHeaders: PageHeaderPair[];
        startedAtEpochMs?: number;
        startedAt?: number;
      };
    };
    const meta = xhr.__RESENDER_XHR__;

    if (!meta) {
      return originalSend.apply(this, arguments as unknown as Parameters<typeof originalSend>);
    }

    meta.startedAtEpochMs = Date.now();
    meta.startedAt = performance.now();
    const contentType = meta.requestHeaders.find((header) => header.name.toLowerCase() === "content-type")?.value;
    const requestBodyPromise = bodyToText(body, contentType);
    const shouldCapture = state.captureEnabled;

    xhr.addEventListener("loadend", () => {
      requestBodyPromise.then((requestBody) => {
        if (!shouldCapture) return;
        let responseBody: PageBodyCapture;

        try {
          if (xhr.responseType === "" || xhr.responseType === "text") {
            const responseText = xhr.responseText ?? "";
            const sizeBytes = byteLength(responseText);
            const responseMime = xhr.getResponseHeader("content-type") ?? undefined;
            responseBody =
              sizeBytes > state.bodyLimitBytes
                ? { kind: "too-large", sizeBytes, mimeType: responseMime, reason: "Response body exceeded the configured limit." }
                : textBody(responseText, responseMime);
          } else {
            responseBody = {
              kind: "binary",
              reason: `XHR responseType "${xhr.responseType}" is not text.`,
              mimeType: xhr.getResponseHeader("content-type") ?? undefined
            };
          }
        } catch (error) {
          responseBody = { kind: "error", reason: error instanceof Error ? error.message : String(error) };
        }

        state.records.push({
          hookId: meta.hookId,
          protocol: "xhr",
          method: meta.method,
          url: new URL(meta.url, location.href).href,
          status: xhr.status,
          statusText: xhr.statusText,
          requestHeaders: meta.requestHeaders,
          responseHeaders: parseRawResponseHeaders(xhr.getAllResponseHeaders()),
          requestBody,
          responseBody,
          startedAtEpochMs: meta.startedAtEpochMs ?? Date.now(),
          timeMs: meta.startedAt === undefined ? undefined : performance.now() - meta.startedAt,
          frameUrl: location.href,
          credentials: xhr.withCredentials ? "include" : "same-origin"
        });
      });
    });

    return originalSend.apply(this, arguments as unknown as Parameters<typeof originalSend>);
  };

  Object.defineProperty(hookedWindow, "__RESENDER_HOOK__", {
    value: state,
    configurable: false,
    enumerable: false,
    writable: false
  });
}

function configureHookInPage(options: { bodyLimitBytes?: number; captureEnabled?: boolean }) {
  const hookedWindow = window as Window & {
    __RESENDER_HOOK__?: { configure: (options: { bodyLimitBytes?: number; captureEnabled?: boolean }) => void };
  };
  hookedWindow.__RESENDER_HOOK__?.configure(options);
}

function drainHookInPage() {
  const hookedWindow = window as Window & {
    __RESENDER_HOOK__?: { drain: () => HookNetworkRecord[] };
  };
  return hookedWindow.__RESENDER_HOOK__?.drain() ?? [];
}

async function resendInPage(draft: ResendDraft): Promise<ResendResult> {
  function headersToRecord(headers: HeaderPair[]): Record<string, string> {
    return headers.reduce<Record<string, string>>((accumulator, header) => {
      accumulator[header.name] = header.value;
      return accumulator;
    }, {});
  }

  function isTextualMime(mimeType?: string | null): boolean {
    if (!mimeType) return true;
    const lower = mimeType.toLowerCase();
    return (
      lower.startsWith("text/") ||
      lower.includes("json") ||
      lower.includes("xml") ||
      lower.includes("javascript") ||
      lower.includes("x-www-form-urlencoded")
    );
  }

  async function readResponseBody(response: Response): Promise<BodyCapture> {
    const mimeType = response.headers.get("content-type");
    const contentLength = Number(response.headers.get("content-length") ?? "");

    if (!isTextualMime(mimeType)) {
      return {
        kind: "binary",
        mimeType: mimeType ?? undefined,
        sizeBytes: Number.isFinite(contentLength) ? contentLength : undefined,
        reason: "Response is not text."
      };
    }

    if (Number.isFinite(contentLength) && contentLength > draft.bodyLimitBytes) {
      return {
        kind: "too-large",
        mimeType: mimeType ?? undefined,
        sizeBytes: contentLength,
        reason: "Response body exceeded the configured limit."
      };
    }

    try {
      const text = await response.text();
      const sizeBytes = new TextEncoder().encode(text).byteLength;
      if (sizeBytes > draft.bodyLimitBytes) {
        return {
          kind: "too-large",
          mimeType: mimeType ?? undefined,
          sizeBytes,
          reason: "Response body exceeded the configured limit."
        };
      }

      return {
        kind: mimeType?.toLowerCase().includes("json") ? "json" : "text",
        text,
        mimeType: mimeType ?? undefined,
        sizeBytes
      };
    } catch (error) {
      return { kind: "error", reason: error instanceof Error ? error.message : String(error) };
    }
  }

  const hookedWindow = window as Window & {
    __RESENDER_HOOK__?: { markNextResend: (resendId: string) => void };
  };
  hookedWindow.__RESENDER_HOOK__?.markNextResend(draft.resendId);

  const method = draft.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD" && draft.body.length > 0;
  const startedAtEpochMs = Date.now();
  const startedAt = performance.now();

  try {
    const response = await fetch(draft.url, {
      method,
      headers: headersToRecord(draft.headers),
      body: hasBody ? draft.body : undefined,
      credentials: draft.credentials
    });

    return {
      id: draft.resendId,
      method,
      url: response.url || draft.url,
      status: response.status,
      statusText: response.statusText,
      responseHeaders: Array.from(response.headers.entries()).map(([name, value]) => ({
        name,
        value
      })),
      responseBody: await readResponseBody(response.clone()),
      startedAtEpochMs,
      timeMs: performance.now() - startedAt,
      frameUrl: location.href,
      resendId: draft.resendId
    };
  } catch (error) {
    return {
      id: draft.resendId,
      method,
      url: draft.url,
      responseHeaders: [],
      responseBody: { kind: "error", reason: error instanceof Error ? error.message : String(error) },
      startedAtEpochMs,
      timeMs: performance.now() - startedAt,
      frameUrl: location.href,
      error: error instanceof Error ? error.message : String(error),
      resendId: draft.resendId
    };
  }
}

export const __resendInPageForTest = resendInPage;
