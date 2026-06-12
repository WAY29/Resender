import type { BodyCapture, HeaderPair, NetworkRecord } from "../types";

export type RequestCopyFormat =
  | "url"
  | "curl-bash"
  | "curl-cmd"
  | "powershell"
  | "fetch"
  | "fetch-node";

export type RequestCopySupport =
  | { supported: true }
  | {
      supported: false;
      reason: string;
    };

export const multipartCopyUnsupportedReason = "Multipart form uploads are not reusable as copied commands yet.";
export const requestBodyTextUnavailableReason = "This request body was not captured as reusable text.";

const curlIgnoredHeaders = new Set([
  "accept-encoding",
  "host",
  "method",
  "path",
  "scheme",
  "version",
  "authority",
  "protocol"
]);

const fetchIgnoredHeaders = new Set([
  "method",
  "path",
  "scheme",
  "version",
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
  "referer",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "via",
  "user-agent"
]);

const powerShellIgnoredHeaders = new Set([
  "host",
  "connection",
  "proxy-connection",
  "content-length",
  "expect",
  "range",
  "content-type",
  "user-agent",
  "cookie"
]);

const credentialHeaderNames = new Set(["cookie", "authorization"]);

type SupportedRequestBody =
  | { supported: true; text: string }
  | { supported: false; reason: string };

export function getRequestCopySupport(
  record: NetworkRecord,
  format: Exclude<RequestCopyFormat, "url">
): RequestCopySupport {
  void format;
  return getReusableRequestBody(record.requestBody);
}

export function buildRequestCopyText(record: NetworkRecord, format: RequestCopyFormat): string {
  switch (format) {
    case "url":
      return record.url;
    case "curl-bash":
      return buildCurlCommand(record, "unix");
    case "curl-cmd":
      return buildCurlCommand(record, "win");
    case "powershell":
      return buildPowerShellCommand(record);
    case "fetch":
      return buildFetchCall(record, "browser");
    case "fetch-node":
      return buildFetchCall(record, "node");
  }
}

export function buildRequestListCopyText(records: NetworkRecord[], format: RequestCopyFormat): string {
  switch (format) {
    case "url":
      return records.map((record) => record.url).join("\n");
    case "curl-bash":
      return records.map((record) => buildCurlCommand(record, "unix")).join(" ;\n");
    case "curl-cmd":
      return records.map((record) => buildCurlCommand(record, "win")).join(" &\r\n");
    case "powershell":
      return records.map((record) => buildPowerShellCommand(record)).join(";\r\n");
    case "fetch":
      return records.map((record) => buildFetchCall(record, "browser")).join(" ;\n");
    case "fetch-node":
      return records.map((record) => buildFetchCall(record, "node")).join(" ;\n");
  }
}

function buildFetchCall(record: NetworkRecord, style: "browser" | "node"): string {
  const headerData = new Headers();

  for (const header of record.requestHeaders) {
    const name = header.name;
    if (!fetchIgnoredHeaders.has(name.toLowerCase()) && !name.includes(":")) {
      headerData.append(name, header.value);
    }
  }

  const headers: Record<string, string> = {};
  for (const [name, value] of headerData) {
    headers[name] = value;
  }

  const referrerHeader = findHeader(record.requestHeaders, "referer");
  const requestBody = getReusableRequestBody(record.requestBody);
  const options: {
    headers?: Record<string, string>;
    referrer?: string;
    body: string | null;
    method: string;
    mode?: "cors";
    credentials?: "include" | "omit";
  } = {
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    referrer: referrerHeader,
    body: requestBody.supported && requestBody.text.length > 0 ? requestBody.text : null,
    method: record.method,
    mode: "cors"
  };

  if (style === "node") {
    const extraHeaders: Record<string, string> = {};
    const cookieHeader = findHeaderPair(record.requestHeaders, "cookie");

    delete options.mode;
    if (cookieHeader) {
      extraHeaders.cookie = cookieHeader.value;
    }
    if (referrerHeader) {
      delete options.referrer;
      extraHeaders.Referer = referrerHeader;
    }
    if (Object.keys(extraHeaders).length > 0) {
      options.headers = { ...(options.headers ?? {}), ...extraHeaders };
    }
  } else {
    options.credentials = inferBrowserFetchCredentials(record);
  }

  return `fetch(${JSON.stringify(record.url)}, ${JSON.stringify(options, null, 2)});`;
}

function buildCurlCommand(record: NetworkRecord, platform: "unix" | "win"): string {
  const escapeString = platform === "win" ? escapeStringWin : escapeStringPosix;
  const requestBody = getReusableRequestBody(record.requestBody);
  const ignoredHeaders = new Set(curlIgnoredHeaders);
  const command: string[] = [];
  const data: string[] = [];
  let inferredMethod = "GET";

  command.push(`--url ${escapeString(record.url).replace(/[[{}\]]/g, "\\$&")}`);

  if (requestBody.supported && requestBody.text.length > 0) {
    data.push(`--data-raw ${escapeString(requestBody.text)}`);
    ignoredHeaders.add("content-length");
    inferredMethod = "POST";
  }

  if (record.method !== inferredMethod) {
    command.push(`-X ${escapeString(record.method)}`);
  }

  for (const header of record.requestHeaders) {
    const name = header.name.replace(/^:/, "");
    if (ignoredHeaders.has(name.toLowerCase())) {
      continue;
    }

    const value = header.value;
    if (!value.trim()) {
      command.push(`-H ${escapeString(`${name};`)}`);
    } else if (name.toLowerCase() === "cookie" && value.includes("=")) {
      command.push(`-b ${escapeString(value)}`);
    } else {
      command.push(`-H ${escapeString(`${name}: ${value}`)}`);
    }
  }

  command.push(...data);

  const separator = command.length >= 3 ? (platform === "win" ? " ^\n  " : " \\\n  ") : " ";
  return `curl ${command.join(separator)}`;
}

function buildPowerShellCommand(record: NetworkRecord): string {
  const command: string[] = [];
  const requestBody = getReusableRequestBody(record.requestBody);
  const session = generatePowerShellSession(record);

  command.push(`-Uri ${escapeStringPowerShell(record.url)}`);

  if (record.method !== "GET") {
    command.push(`-Method ${escapeStringPowerShell(record.method)}`);
  }

  if (session) {
    command.push("-WebSession $session");
  }

  const headerNameValuePairs: string[] = [];
  for (const header of record.requestHeaders) {
    const name = header.name.replace(/^:/, "");
    if (powerShellIgnoredHeaders.has(name.toLowerCase())) {
      continue;
    }
    headerNameValuePairs.push(`${escapeStringPowerShell(name)}=${escapeStringPowerShell(header.value)}`);
  }

  if (headerNameValuePairs.length > 0) {
    command.push(`-Headers @{\n  ${headerNameValuePairs.join("\n  ")}\n}`);
  }

  const contentType = findHeader(record.requestHeaders, "content-type");
  if (contentType) {
    command.push(`-ContentType ${escapeStringPowerShell(contentType)}`);
  }

  if (requestBody.supported && requestBody.text.length > 0) {
    const body = escapeStringPowerShell(requestBody.text);
    if (/[^\x20-\x7E]/.test(requestBody.text)) {
      command.push(`-Body ([System.Text.Encoding]::UTF8.GetBytes(${body}))`);
    } else {
      command.push(`-Body ${body}`);
    }
  }

  const prelude = session ?? "";
  return prelude + "Invoke-WebRequest -UseBasicParsing " + command.join(command.length >= 3 ? " `\n" : " ");
}

function generatePowerShellSession(record: NetworkRecord): string | null {
  const steps: string[] = [];
  const userAgent = findHeader(record.requestHeaders, "user-agent");
  const cookie = findHeader(record.requestHeaders, "cookie");

  if (userAgent) {
    steps.push(`$session.UserAgent = ${escapeStringPowerShell(userAgent)}`);
  }

  if (cookie) {
    steps.push(
      `$session.Cookies.SetCookies((New-Object System.Uri(${escapeStringPowerShell(record.url)})), ${escapeStringPowerShell(cookie)})`
    );
  }

  if (steps.length === 0) {
    return null;
  }

  return "$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession\n" + steps.join("\n") + "\n";
}

function inferBrowserFetchCredentials(record: NetworkRecord): "include" | "omit" {
  if (record.credentials === "include") {
    return "include";
  }

  return record.requestHeaders.some((header) => credentialHeaderNames.has(header.name.toLowerCase()))
    ? "include"
    : "omit";
}

function getReusableRequestBody(body: BodyCapture): SupportedRequestBody {
  switch (body.kind) {
    case "empty":
      return { supported: true, text: "" };
    case "text":
    case "json":
      return typeof body.text === "string"
        ? { supported: true, text: body.text }
        : { supported: false, reason: requestBodyTextUnavailableReason };
    case "form": {
      const mimeType = body.mimeType?.toLowerCase() ?? "";
      if (mimeType.includes("multipart/form-data")) {
        return { supported: false, reason: multipartCopyUnsupportedReason };
      }

      return typeof body.text === "string"
        ? { supported: true, text: body.text }
        : { supported: false, reason: requestBodyTextUnavailableReason };
    }
    case "binary":
    case "stream":
    case "too-large":
    case "unavailable":
    case "error":
      return { supported: false, reason: body.reason ?? requestBodyTextUnavailableReason };
  }
}

function findHeader(headers: HeaderPair[], name: string): string | undefined {
  return findHeaderPair(headers, name)?.value;
}

function findHeaderPair(headers: HeaderPair[], name: string): HeaderPair | undefined {
  const lower = name.toLowerCase();
  return headers.find((header) => header.name.toLowerCase() === lower);
}

function escapeStringWin(str: string): string {
  const encapsChars = '^"';
  return (
    encapsChars +
    str
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/[^a-zA-Z0-9\s_\-:=+~'\/.',?;()*`]/g, "^$&")
      .replace(/%(?=[a-zA-Z0-9_])/g, "%^")
      .replace(/[^ -~\r\n]/g, " ")
      .replace(/\r?\n|\r/g, "^\n\n") +
    encapsChars
  );
}

function escapeStringPosix(str: string): string {
  function escapeCharacter(character: string): string {
    const code = character.charCodeAt(0);
    let hexString = code.toString(16);
    while (hexString.length < 4) {
      hexString = "0" + hexString;
    }
    return "\\u" + hexString;
  }

  if (/[\0-\x1F\x7F-\x9F!]|'/.test(str)) {
    return (
      "$'" +
      str
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/[\0-\x1F\x7F-\x9F!]/g, escapeCharacter) +
      "'"
    );
  }

  return `'${str}'`;
}

function escapeStringPowerShell(str: string): string {
  return (
    '"' +
    str.replace(/[`\$"]/g, "`$&").replace(/[^\x20-\x7E]/g, (character) => `$([char]${character.charCodeAt(0)})`) +
    '"'
  );
}
