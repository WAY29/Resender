export type HeaderPair = {
  name: string;
  value: string;
};

export type BodyKind =
  | "empty"
  | "text"
  | "json"
  | "form"
  | "binary"
  | "stream"
  | "too-large"
  | "unavailable"
  | "error";

export type BodyCapture = {
  kind: BodyKind;
  text?: string;
  sizeBytes?: number;
  mimeType?: string;
  encoding?: string;
  reason?: string;
};

export type RecordSource = "har" | "hook" | "resend";

export type ResourceType =
  | "fetch"
  | "xhr"
  | "document"
  | "css"
  | "script"
  | "font"
  | "image"
  | "media"
  | "manifest"
  | "websocket"
  | "wasm"
  | "other";

export type SourceLocation = {
  url: string;
  lineNumber?: number;
  columnNumber?: number;
};

export type NetworkRecord = {
  id: string;
  source: RecordSource;
  method: string;
  url: string;
  name: string;
  domain: string;
  status?: number;
  statusText?: string;
  type: ResourceType;
  initiator?: string;
  initiatorLocation?: SourceLocation;
  sizeBytes?: number;
  sizeText: string;
  timeMs?: number;
  startedAt: number;
  frameId?: number;
  frameUrl?: string;
  requestHeaders: HeaderPair[];
  responseHeaders: HeaderPair[];
  requestBody: BodyCapture;
  responseBody: BodyCapture;
  credentials?: RequestCredentials;
  unsupportedReason?: string;
  resent?: boolean;
  resendId?: string;
  parentId?: string;
  redirectSourceId?: string;
  redirectTargetId?: string;
  redirectTargetUrl?: string;
};

export type HookNetworkRecord = {
  hookId: string;
  protocol: "fetch" | "xhr";
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  requestHeaders: HeaderPair[];
  responseHeaders: HeaderPair[];
  requestBody: BodyCapture;
  responseBody: BodyCapture;
  startedAtEpochMs: number;
  timeMs?: number;
  frameUrl?: string;
  credentials?: RequestCredentials;
  error?: string;
  resent?: boolean;
  resendId?: string;
};

export type ResendDraft = {
  method: string;
  url: string;
  headers: HeaderPair[];
  body: string;
  credentials: RequestCredentials;
  bodyLimitBytes: number;
  resendId: string;
};

export type ResendResult = {
  id: string;
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  responseHeaders: HeaderPair[];
  responseBody: BodyCapture;
  startedAtEpochMs: number;
  timeMs?: number;
  frameUrl?: string;
  error?: string;
  resendId: string;
};

export type FilterType = "all" | "fetch-xhr" | ResourceType;

export type FilterState = {
  query: string;
  invert: boolean;
  type: FilterType;
};
