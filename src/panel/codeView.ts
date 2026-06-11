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
  const looksJson =
    mimeType?.toLowerCase().includes("json") ||
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

export function tokenizeCode(text: string): CodeLine[] {
  const lines = text.split(/\r?\n/);

  return lines.map((line, index) => ({
    lineNumber: index + 1,
    tokens: tokenizeLine(line)
  }));
}

function tokenizeLine(line: string): CodeToken[] {
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
