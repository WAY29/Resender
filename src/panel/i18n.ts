import type { FilterType, ResourceType } from "../types";
import type { SortColumn } from "./requestSort";

type Locale = "en" | "zh";
type FilterLabelId = Exclude<FilterType, "fetch" | "xhr">;

type RequestColumnConfig = {
  id: SortColumn;
  label: string;
  defaultWidth: number;
  minWidth: number;
};

const messages = {
  en: {
    extensionDomain: "[Extension]",
    filters: {
      all: "All",
      "fetch-xhr": "Fetch/XHR",
      document: "Doc",
      css: "CSS",
      script: "JS",
      font: "Font",
      image: "Img",
      media: "Media",
      manifest: "Manifest",
      websocket: "WS",
      wasm: "Wasm",
      other: "Other"
    } satisfies Record<FilterLabelId, string>,
    columns: {
      name: "Name",
      method: "Method",
      domain: "Domain",
      status: "Status",
      type: "Type",
      initiator: "Initiator",
      size: "Size",
      time: "Time"
    } satisfies Record<SortColumn, string>,
    resourceTypes: {
      fetch: "Fetch",
      xhr: "XHR",
      document: "Document",
      css: "Stylesheet",
      script: "Script",
      font: "Font",
      image: "Image",
      media: "Media",
      manifest: "Manifest",
      websocket: "WebSocket",
      wasm: "Wasm",
      other: "Other"
    } satisfies Record<ResourceType, string>,
    status: {
      openInDevTools: "Open this page as a Chrome DevTools panel to capture requests.",
      captureEnabled: "Capture enabled for the inspected tab. Earlier request bodies may be unavailable.",
      captureInjectionFailed: (message: string) => `Capture injection failed: ${message}`,
      capturePollingFailed: (message: string) => `Capture polling failed: ${message}`,
      updateLimitFailed: (message: string) => `Could not update capture limit: ${message}`
    },
    toolbar: {
      startCapture: "Start capture",
      stopCapture: "Stop capture",
      clear: "Clear",
      dismiss: "Dismiss",
      preserveLog: "Preserve log",
      import: "Import",
      export: "Export",
      settings: "Settings",
      bodyLimit: "Body limit",
      focusResponseAfterResend: "Show Response after resend",
      filter: "Filter",
      filterPlaceholder: "Filter",
      invert: "Invert",
      moreFilters: "More filters"
    },
    table: {
      resizeListDetails: "Resize request list and details",
      resizeColumn: (label: string) => `Resize ${label} column`,
      sortColumn: (label: string, state: string) => `${label} sort ${state}`,
      noRequests: "No requests captured yet.",
      resentRequest: "Resent request",
      jumpToRedirectedRequest: "Jump to redirected request",
      jumpToRedirectSource: "Jump to redirect source"
    },
    details: {
      closeDetails: "Close details",
      headers: "Headers",
      payload: "Payload",
      response: "Response",
      sendEditedRequest: "Send edited request",
      send: "Send",
      sending: "Sending...",
      general: "General",
      requestUrl: "Request URL",
      requestMethod: "Request Method",
      convert: "Convert",
      cancel: "Cancel",
      credentials: "Credentials",
      statusCode: "Status Code",
      resourceType: "Resource Type",
      frame: "Frame",
      requestHeaders: "Request Headers",
      responseHeaders: "Response Headers",
      getQuery: "GET Query",
      requestBody: "Request Body",
      format: "Format",
      switchToGetClearsBody: "Switching to GET will clear Request Body.",
      originalPayloadUnavailable: "Original payload is not available. You can still enter a new body.",
      editRequestBody: "Edit request body",
      noBody: "No body.",
      bodyUnavailable: "Body is not available.",
      addHeader: "Add header",
      addQueryParam: "Add query parameter",
      commonHeaderValues: "Common values",
      customHeaderValue: "Custom",
      save: "Save",
      readonly: "readonly",
      editHeader: (name: string) => `Edit ${name}`,
      editQueryParam: (name: string) => `Edit query parameter ${name}`,
      removeHeader: (name: string) => `Remove ${name}`,
      removeQueryParam: (name: string) => `Remove query parameter ${name}`,
      noHeadersCaptured: "No headers captured.",
      size: "Size"
    },
    reason: {
      responseNotLoaded: "Response body has not been loaded from DevTools yet.",
      responseContentMissing: "DevTools did not return response content for this request.",
      payloadLateCapture: "Payload unavailable: capture was enabled after request started.",
      harPayloadMissing: "DevTools HAR did not include a request payload.",
      requestBodyTooLarge: "Request body exceeded the configured limit.",
      responseBodyTooLarge: "Response body exceeded the configured limit.",
      formDataTooLarge: "FormData summary exceeded the configured limit.",
      blobTooLarge: "Blob exceeded the configured limit.",
      blobNotText: "Blob is not a text body.",
      arrayBufferTooLarge: "ArrayBuffer exceeded the configured limit.",
      arrayBufferNotText: "ArrayBuffer is not a text body.",
      streamingBody: "Streaming request bodies are not editable yet.",
      requestCloneFailed: "The Request body could not be cloned.",
      responseNotText: "Response is not text.",
      bodyNotEditable: "This request body is not editable because it is binary, streaming, or over the configured limit.",
      unsupportedRequestBodyType: (type: string) => `Unsupported request body type: ${type}`,
      xhrResponseNotText: (type: string) => `XHR responseType "${type}" is not text.`,
      resourceReadonly: (type: string) => `${type} requests are not editable yet.`
    }
  },
  zh: {
    extensionDomain: "[扩展]",
    filters: {
      all: "全部",
      "fetch-xhr": "Fetch/XHR",
      document: "文档",
      css: "CSS",
      script: "JS",
      font: "字体",
      image: "图片",
      media: "媒体",
      manifest: "清单",
      websocket: "套接字",
      wasm: "Wasm",
      other: "其他"
    } satisfies Record<FilterLabelId, string>,
    columns: {
      name: "名称",
      method: "方法",
      domain: "域名",
      status: "状态",
      type: "类型",
      initiator: "发起方",
      size: "大小",
      time: "耗时"
    } satisfies Record<SortColumn, string>,
    resourceTypes: {
      fetch: "Fetch",
      xhr: "XHR",
      document: "文档",
      css: "样式表",
      script: "脚本",
      font: "字体",
      image: "图片",
      media: "媒体",
      manifest: "清单",
      websocket: "WebSocket",
      wasm: "Wasm",
      other: "其他"
    } satisfies Record<ResourceType, string>,
    status: {
      openInDevTools: "请在 Chrome DevTools 面板中打开此页面以捕获请求",
      captureEnabled: "已为当前检查的标签页启用捕获。较早的请求体可能不可用",
      captureInjectionFailed: (message: string) => `捕获脚本注入失败：${message}`,
      capturePollingFailed: (message: string) => `捕获轮询失败：${message}`,
      updateLimitFailed: (message: string) => `无法更新捕获大小限制：${message}`
    },
    toolbar: {
      startCapture: "开始捕获",
      stopCapture: "停止捕获",
      clear: "清空",
      dismiss: "关闭",
      preserveLog: "保留日志",
      import: "导入",
      export: "导出",
      settings: "设置",
      bodyLimit: "正文限制",
      focusResponseAfterResend: "重放后显示 Response",
      filter: "过滤",
      filterPlaceholder: "过滤",
      invert: "反转",
      moreFilters: "更多过滤条件"
    },
    table: {
      resizeListDetails: "调整请求列表和详情宽度",
      resizeColumn: (label: string) => `调整 ${label} 列宽`,
      sortColumn: (label: string, state: string) => `${label} 排序 ${state}`,
      noRequests: "还没有捕获到请求",
      resentRequest: "重放请求",
      jumpToRedirectedRequest: "跳转到重定向后的请求",
      jumpToRedirectSource: "跳转到重定向来源"
    },
    details: {
      closeDetails: "关闭详情",
      headers: "Headers",
      payload: "Payload",
      response: "Response",
      sendEditedRequest: "发送编辑后的请求",
      send: "发送",
      sending: "发送中...",
      general: "常规",
      requestUrl: "请求 URL",
      requestMethod: "请求方法",
      convert: "转换",
      cancel: "取消",
      credentials: "凭据",
      statusCode: "状态码",
      resourceType: "资源类型",
      frame: "Frame",
      requestHeaders: "Request Headers",
      responseHeaders: "Response Headers",
      getQuery: "GET Query",
      requestBody: "Request Body",
      format: "Format",
      switchToGetClearsBody: "切换到 GET 会清空 Request Body",
      originalPayloadUnavailable: "原始 Payload 不可用。你仍然可以输入新的请求体",
      editRequestBody: "编辑请求 Body",
      noBody: "无正文",
      bodyUnavailable: "正文不可用",
      addHeader: "添加 Header",
      addQueryParam: "添加 Query 参数",
      commonHeaderValues: "常见值",
      customHeaderValue: "自定义",
      save: "保存",
      readonly: "只读",
      editHeader: (name: string) => `编辑 ${name}`,
      editQueryParam: (name: string) => `编辑 Query 参数 ${name}`,
      removeHeader: (name: string) => `删除 ${name}`,
      removeQueryParam: (name: string) => `删除 Query 参数 ${name}`,
      noHeadersCaptured: "未捕获到 Headers",
      size: "大小"
    },
    reason: {
      responseNotLoaded: "响应正文尚未从 DevTools 加载",
      responseContentMissing: "DevTools 没有返回此请求的响应内容",
      payloadLateCapture: "Payload 不可用：捕获是在请求开始后启用的",
      harPayloadMissing: "DevTools HAR 未包含请求 Payload",
      requestBodyTooLarge: "请求正文超过配置的大小限制",
      responseBodyTooLarge: "响应正文超过配置的大小限制",
      formDataTooLarge: "FormData 摘要超过配置的大小限制",
      blobTooLarge: "Blob 超过配置的大小限制",
      blobNotText: "Blob 不是文本正文",
      arrayBufferTooLarge: "ArrayBuffer 超过配置的大小限制",
      arrayBufferNotText: "ArrayBuffer 不是文本正文",
      streamingBody: "流式请求体暂不可编辑",
      requestCloneFailed: "无法克隆 Request body",
      responseNotText: "响应不是文本",
      bodyNotEditable: "此请求体不可编辑，因为它是二进制、流式或超过了配置的大小限制",
      unsupportedRequestBodyType: (type: string) => `不支持的请求体类型：${type}`,
      xhrResponseNotText: (type: string) => `XHR responseType "${type}" 不是文本`,
      resourceReadonly: (type: string) => `${type} 请求暂不可编辑`
    }
  }
};

export const i18n = messages[detectLocale()];

export function getFilterTypes(): Array<{ id: FilterType; label: string }> {
  return filterLabelIds.map((id) => ({ id, label: i18n.filters[id] }));
}

export function getRequestColumns(): RequestColumnConfig[] {
  const columns: Array<Omit<RequestColumnConfig, "label">> = [
    { id: "name", defaultWidth: 320, minWidth: 140 },
    { id: "method", defaultWidth: 86, minWidth: 64 },
    { id: "domain", defaultWidth: 170, minWidth: 96 },
    { id: "status", defaultWidth: 78, minWidth: 62 },
    { id: "type", defaultWidth: 92, minWidth: 70 },
    { id: "initiator", defaultWidth: 160, minWidth: 96 },
    { id: "size", defaultWidth: 86, minWidth: 64 },
    { id: "time", defaultWidth: 80, minWidth: 64 }
  ];

  return columns.map((column) => ({
    ...column,
    label: i18n.columns[column.id]
  }));
}

export function translateReason(reason: string | undefined): string | undefined {
  if (!reason) {
    return reason;
  }

  const exact = reasonMap.get(reason);
  if (exact) {
    return exact;
  }

  const unsupported = /^Unsupported request body type: (.+)$/.exec(reason);
  if (unsupported) {
    return i18n.reason.unsupportedRequestBodyType(unsupported[1]);
  }

  const xhrNotText = /^XHR responseType "(.+)" is not text\.$/.exec(reason);
  if (xhrNotText) {
    return i18n.reason.xhrResponseNotText(xhrNotText[1]);
  }

  const resourceReadonly = /^(.+) requests are not editable yet\.$/.exec(reason);
  if (resourceReadonly) {
    return i18n.reason.resourceReadonly(resourceReadonly[1]);
  }

  const legacyResourceReadonly = /^(.+) requests are listed for context but are not editable in the MVP\.$/.exec(reason);
  if (legacyResourceReadonly) {
    return i18n.reason.resourceReadonly(legacyResourceReadonly[1]);
  }

  return reason;
}

function detectLocale(): Locale {
  const language = getUiLanguage().toLowerCase();
  return language.startsWith("zh") ? "zh" : "en";
}

function getUiLanguage(): string {
  if (typeof chrome !== "undefined") {
    const chromeLanguage = chrome.i18n?.getUILanguage?.();
    if (chromeLanguage) {
      return chromeLanguage;
    }
  }

  return navigator.languages?.[0] ?? navigator.language ?? "en";
}

const reasonMap = new Map<string, string>([
  [messages.en.reason.responseNotLoaded, i18n.reason.responseNotLoaded],
  [messages.en.reason.responseContentMissing, i18n.reason.responseContentMissing],
  [messages.en.reason.payloadLateCapture, i18n.reason.payloadLateCapture],
  [messages.en.reason.harPayloadMissing, i18n.reason.harPayloadMissing],
  [messages.en.reason.requestBodyTooLarge, i18n.reason.requestBodyTooLarge],
  [messages.en.reason.responseBodyTooLarge, i18n.reason.responseBodyTooLarge],
  [messages.en.reason.formDataTooLarge, i18n.reason.formDataTooLarge],
  [messages.en.reason.blobTooLarge, i18n.reason.blobTooLarge],
  [messages.en.reason.blobNotText, i18n.reason.blobNotText],
  [messages.en.reason.arrayBufferTooLarge, i18n.reason.arrayBufferTooLarge],
  [messages.en.reason.arrayBufferNotText, i18n.reason.arrayBufferNotText],
  [messages.en.reason.streamingBody, i18n.reason.streamingBody],
  [messages.en.reason.requestCloneFailed, i18n.reason.requestCloneFailed],
  [messages.en.reason.responseNotText, i18n.reason.responseNotText],
  [messages.en.reason.bodyNotEditable, i18n.reason.bodyNotEditable]
]);

const filterLabelIds: FilterLabelId[] = [
  "all",
  "fetch-xhr",
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
