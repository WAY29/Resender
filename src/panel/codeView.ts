import Prism from "prismjs";
import "prismjs/components/prism-json.js";

export type CodeTokenKind = string;

export type CodeToken = {
  kind: CodeTokenKind;
  text: string;
};

export type CodeLine = {
  lineNumber: number;
  tokens: CodeToken[];
};

type PrettierModule = {
  format: (source: string, options: { parser: string; plugins: object[]; tabWidth?: number }) => Promise<string>;
};

type PrettierConfig = {
  parser: string;
  loadPlugins: () => Promise<object[]>;
};

const prettierPluginLoaders = {
  babel: () => import("prettier/plugins/babel"),
  estree: () => import("prettier/plugins/estree"),
  html: () => import("prettier/plugins/html"),
  postcss: () => import("prettier/plugins/postcss")
} as const;

let prettierModulePromise: Promise<PrettierModule> | undefined;
const prettierPluginPromises = new Map<keyof typeof prettierPluginLoaders, Promise<object>>();

export async function formatCodeTextWithPrettier(text: string, mimeType?: string): Promise<string> {
  const config = getPrettierConfig(mimeType, text);
  if (!config) {
    return formatFallback(text, mimeType);
  }

  try {
    const [prettier, plugins] = await Promise.all([loadPrettier(), config.loadPlugins()]);
    return await prettier.format(text, {
      parser: config.parser,
      plugins,
      tabWidth: 2
    });
  } catch {
    return formatFallback(text, mimeType);
  }
}

export function tokenizeCode(text: string, mimeType?: string): CodeLine[] {
  const language = languageFromMimeType(mimeType, text);
  if (!language) {
    return text.split(/\r?\n/).map((line, index) => ({
      lineNumber: index + 1,
      tokens: [{ kind: "plain", text: line }]
    }));
  }

  const grammar = Prism.languages[language];
  if (!grammar) {
    return text.split(/\r?\n/).map((line, index) => ({
      lineNumber: index + 1,
      tokens: [{ kind: "plain", text: line }]
    }));
  }

  return tokensToLines(Prism.tokenize(text, grammar));
}

export function warmPrettierForMimeType(mimeType?: string, text?: string): Promise<void> {
  const config = getPrettierConfig(mimeType, text);
  if (!config) {
    return Promise.resolve();
  }

  return Promise.all([loadPrettier(), config.loadPlugins()]).then(() => undefined);
}

function formatFallback(text: string, mimeType?: string): string {
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

function simplifyContentType(mimeType?: string): string {
  return mimeType?.split(";")[0].trim().toLowerCase() ?? "";
}

function languageFromMimeType(mimeType?: string, text?: string): string | undefined {
  const contentType = simplifyContentType(mimeType);
  if (!contentType) {
    const trimmed = text?.trim() ?? "";
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return "json";
    }
    return undefined;
  }

  if (contentType === "application/x-www-form-urlencoded") {
    return undefined;
  }

  if (contentType.includes("json")) {
    return "json";
  }

  if (contentType === "text/css") {
    return "css";
  }

  if (
    contentType === "text/javascript" ||
    contentType === "application/javascript" ||
    contentType.includes("ecmascript")
  ) {
    return "javascript";
  }

  if (
    contentType === "text/html" ||
    contentType === "application/xml" ||
    contentType === "text/xml" ||
    contentType.endsWith("+xml") ||
    contentType === "image/svg+xml"
  ) {
    return "markup";
  }

  return undefined;
}

function tokensToLines(tokens: Array<string | Prism.Token>): CodeLine[] {
  const lines: CodeLine[] = [{ lineNumber: 1, tokens: [] }];
  appendPrismTokens(lines, tokens, ["plain"]);

  return lines.map((line) => ({
    lineNumber: line.lineNumber,
    tokens: line.tokens.length > 0 ? line.tokens : [{ kind: "plain", text: "" }]
  }));
}

function appendPrismTokens(
  lines: CodeLine[],
  tokens: Array<string | Prism.Token>,
  typeStack: string[]
) {
  tokens.forEach((token) => {
    if (typeof token === "string") {
      appendText(lines, token, typeStack);
      return;
    }

    const nextTypeStack = [
      normalizeTokenType(token.type),
      ...aliasesToKinds(token.alias),
      ...typeStack
    ];
    const content = Array.isArray(token.content) ? token.content : [token.content];
    appendPrismTokens(lines, content, nextTypeStack);
  });
}

function appendText(lines: CodeLine[], text: string, typeStack: string[]) {
  const parts = text.split("\n");

  parts.forEach((part, index) => {
    if (index > 0) {
      lines.push({ lineNumber: lines.length + 1, tokens: [] });
    }

    if (part.length === 0) {
      return;
    }

    lines[lines.length - 1].tokens.push({
      kind: pickDisplayKind(typeStack),
      text: part
    });
  });
}

function aliasesToKinds(alias: string | string[] | undefined): string[] {
  if (!alias) {
    return [];
  }

  return Array.isArray(alias) ? alias.map(normalizeTokenType) : [normalizeTokenType(alias)];
}

function normalizeTokenType(kind: string): string {
  return kind.toLowerCase().replace(/\s+/g, "-");
}

function pickDisplayKind(kinds: string[]): string {
  const preferredKinds = [
    "property",
    "attr-name",
    "attr-value",
    "selector",
    "string",
    "number",
    "color",
    "function",
    "keyword",
    "boolean",
    "tag",
    "operator",
    "punctuation",
    "plain"
  ];

  for (const kind of preferredKinds) {
    if (kinds.includes(kind)) {
      return kind;
    }
  }

  return kinds[0] ?? "plain";
}

function getPrettierConfig(mimeType?: string, text?: string): PrettierConfig | undefined {
  const contentType = simplifyContentType(mimeType);
  const trimmed = text?.trim() ?? "";

  if (contentType.includes("json") || (!contentType && (trimmed.startsWith("{") || trimmed.startsWith("[")))) {
    return {
      parser: "json",
      loadPlugins: () => loadPrettierPlugins(["estree"])
    };
  }

  if (
    contentType === "text/javascript" ||
    contentType === "application/javascript" ||
    contentType.includes("ecmascript")
  ) {
    return {
      parser: "babel",
      loadPlugins: () => loadPrettierPlugins(["babel", "estree"])
    };
  }

  if (contentType === "text/css") {
    return {
      parser: "css",
      loadPlugins: () => loadPrettierPlugins(["postcss"])
    };
  }

  if (contentType === "text/html" || contentType === "image/svg+xml") {
    return {
      parser: "html",
      loadPlugins: () => loadPrettierPlugins(["html"])
    };
  }

  if (
    contentType === "application/xml" ||
    contentType === "text/xml" ||
    contentType.endsWith("+xml")
  ) {
    return {
      parser: "html",
      loadPlugins: () => loadPrettierPlugins(["html"])
    };
  }

  return undefined;
}

function loadPrettier(): Promise<PrettierModule> {
  prettierModulePromise ??= import("prettier/standalone") as Promise<PrettierModule>;
  return prettierModulePromise;
}

function loadPrettierPlugins(pluginNames: Array<keyof typeof prettierPluginLoaders>): Promise<object[]> {
  return Promise.all(pluginNames.map(loadPrettierPlugin));
}

function loadPrettierPlugin(pluginName: keyof typeof prettierPluginLoaders): Promise<object> {
  const existing = prettierPluginPromises.get(pluginName);
  if (existing) {
    return existing;
  }

  const promise = prettierPluginLoaders[pluginName]().then((module) => module as object);
  prettierPluginPromises.set(pluginName, promise);
  return promise;
}
