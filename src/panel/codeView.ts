export type CodeTokenKind =
  | "plain"
  | "property"
  | "string"
  | "number"
  | "boolean"
  | "null";

export type CodeToken = {
  kind: CodeTokenKind;
  text: string;
};

export type CodeLine = {
  lineNumber: number;
  tokens: CodeToken[];
};

export function formatCodeText(text: string, mimeType?: string): string {
  const trimmed = text.trim();
  const contentType = simplifyContentType(mimeType);
  const looksJson =
    contentType.includes("json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");

  if (!looksJson || trimmed.length === 0) {
    return text;
  }

  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function tokenizeCode(text: string, mimeType?: string): CodeLine[] {
  const lines = text.split(/\r?\n/);

  return lines.map((line, index) => ({
    lineNumber: index + 1,
    tokens: tokenizeLine(line, mimeType)
  }));
}

function tokenizeLine(line: string, mimeType?: string): CodeToken[] {
  const contentType = simplifyContentType(mimeType);

  if (contentType === "application/x-www-form-urlencoded") {
    return tokenizeFormUrlEncodedLine(line);
  }

  if (isCssMimeType(contentType)) {
    return tokenizeCssLine(line);
  }

  if (isJavaScriptMimeType(contentType)) {
    return tokenizeJavaScriptLine(line);
  }

  if (isHtmlMimeType(contentType) || isXmlMimeType(contentType)) {
    return tokenizeMarkupLine(line);
  }

  const tokens: CodeToken[] = [];
  const pattern =
    /("(?:\\.|[^"\\])*"(?=\s*:))|("(?:\\.|[^"\\])*")|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(true|false)\b|\bnull\b/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > cursor) {
      tokens.push({ kind: "plain", text: line.slice(cursor, match.index) });
    }

    const text = match[0];
    if (match[1]) {
      tokens.push({ kind: "property", text });
    } else if (match[2]) {
      tokens.push({ kind: "string", text });
    } else if (match[3]) {
      tokens.push({ kind: "number", text });
    } else if (match[4]) {
      tokens.push({ kind: "boolean", text });
    } else {
      tokens.push({ kind: "null", text });
    }

    cursor = match.index + text.length;
  }

  if (cursor < line.length) {
    tokens.push({ kind: "plain", text: line.slice(cursor) });
  }

  return tokens.length > 0 ? tokens : [{ kind: "plain", text: line }];
}

function tokenizeFormUrlEncodedLine(line: string): CodeToken[] {
  if (line.length === 0) {
    return [{ kind: "plain", text: line }];
  }

  const tokens: CodeToken[] = [];
  const segments = line.split("&");

  segments.forEach((segment, index) => {
    if (index > 0) {
      tokens.push({ kind: "plain", text: "&" });
    }

    const separatorIndex = segment.indexOf("=");
    if (separatorIndex === -1) {
      tokens.push({ kind: "property", text: segment });
      return;
    }

    tokens.push({ kind: "property", text: segment.slice(0, separatorIndex) });
    tokens.push({ kind: "plain", text: "=" });
    tokens.push({ kind: "string", text: segment.slice(separatorIndex + 1) });
  });

  return tokens;
}

function simplifyContentType(mimeType?: string): string {
  return mimeType?.split(";")[0].trim().toLowerCase() ?? "";
}

function isCssMimeType(mimeType: string): boolean {
  return mimeType === "text/css";
}

function isJavaScriptMimeType(mimeType: string): boolean {
  return mimeType === "text/javascript" || mimeType === "application/javascript" || mimeType.includes("ecmascript");
}

function isHtmlMimeType(mimeType: string): boolean {
  return mimeType === "text/html";
}

function isXmlMimeType(mimeType: string): boolean {
  return mimeType === "application/xml" || mimeType === "text/xml" || mimeType.endsWith("+xml");
}

function tokenizeCssLine(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  const pattern = /([a-zA-Z-]+)(?=\s*:)|((?<=:\s*)(?:[a-zA-Z-]+|#[0-9a-fA-F]{3,8}\b))|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(-?\b\d+(?:\.\d+)?(?:[a-zA-Z%]+)?\b)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > cursor) {
      tokens.push({ kind: "plain", text: line.slice(cursor, match.index) });
    }

    if (match[1]) {
      tokens.push({ kind: "property", text: match[1] });
    } else if (match[2]) {
      tokens.push({ kind: "string", text: match[2] });
    } else if (match[3]) {
      tokens.push({ kind: "string", text: match[3] });
    } else {
      tokens.push({ kind: "number", text: match[4] });
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < line.length) {
    tokens.push({ kind: "plain", text: line.slice(cursor) });
  }

  return tokens.length > 0 ? tokens : [{ kind: "plain", text: line }];
}

function tokenizeJavaScriptLine(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  const pattern = /(\b(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|new|class|extends|import|export|from|async|await|try|catch|finally|throw)\b)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(true|false|null|undefined)\b/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > cursor) {
      tokens.push({ kind: "plain", text: line.slice(cursor, match.index) });
    }

    if (match[1]) {
      tokens.push({ kind: "boolean", text: match[1] });
    } else if (match[2]) {
      tokens.push({ kind: "string", text: match[2] });
    } else if (match[3]) {
      tokens.push({ kind: "number", text: match[3] });
    } else if (match[4] === "null") {
      tokens.push({ kind: "null", text: match[4] });
    } else {
      tokens.push({ kind: "boolean", text: match[4] });
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < line.length) {
    tokens.push({ kind: "plain", text: line.slice(cursor) });
  }

  return tokens.length > 0 ? tokens : [{ kind: "plain", text: line }];
}

function tokenizeMarkupLine(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  const tagPattern = /<\/?[a-zA-Z][^>]*>|>/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(line)) !== null) {
    if (match.index > cursor) {
      tokens.push({ kind: "plain", text: line.slice(cursor, match.index) });
    }

    tokens.push(...tokenizeMarkupTag(match[0]));
    cursor = match.index + match[0].length;
  }

  if (cursor < line.length) {
    tokens.push({ kind: "plain", text: line.slice(cursor) });
  }

  return tokens.length > 0 ? tokens : [{ kind: "plain", text: line }];
}

function tokenizeMarkupTag(tag: string): CodeToken[] {
  if (tag === ">") {
    return [{ kind: "boolean", text: tag }];
  }

  if (/^<\/[a-zA-Z][^>]*>$/.test(tag)) {
    return [{ kind: "boolean", text: tag }];
  }

  const closingBracketIndex = tag.endsWith(">") ? tag.length - 1 : tag.length;
  const tagBody = tag.slice(0, closingBracketIndex);
  const tagNameMatch = /^<\/?[^\s/>]+/.exec(tagBody);

  if (!tagNameMatch) {
    return [{ kind: "boolean", text: tag }];
  }

  const tokens: CodeToken[] = [{ kind: "boolean", text: tagNameMatch[0] }];
  const attrs = tagBody.slice(tagNameMatch[0].length);
  const attrPattern = /(\s+)|([:\w-]+)(\s*=\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s"'>/]+)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = attrPattern.exec(attrs)) !== null) {
    if (match.index > cursor) {
      tokens.push({ kind: "plain", text: attrs.slice(cursor, match.index) });
    }

    if (match[1]) {
      tokens.push({ kind: "plain", text: match[1] });
    } else {
      tokens.push({ kind: "property", text: match[2] });
      tokens.push({ kind: "plain", text: match[3] });
      tokens.push({ kind: "string", text: match[4] });
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < attrs.length) {
    tokens.push({ kind: "plain", text: attrs.slice(cursor) });
  }

  if (tag.endsWith(">")) {
    tokens.push({ kind: "boolean", text: ">" });
  }

  return tokens;
}
