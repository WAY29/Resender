import { i18n } from "./i18n";

export function formatBytes(value?: number): string {
  if (value === undefined || Number.isNaN(value) || value < 0) {
    return "-";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatDuration(value?: number): string {
  if (value === undefined || Number.isNaN(value)) {
    return "-";
  }

  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }

  return `${(value / 1000).toFixed(2)} s`;
}

export function getDisplayName(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "data:") {
      return url;
    }

    return `${parsed.pathname.split("/").filter(Boolean).at(-1) ?? parsed.hostname}${parsed.search}`;
  } catch {
    return url;
  }
}

export function getDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "chrome-extension:" ? i18n.extensionDomain : parsed.host;
  } catch {
    return "";
  }
}

export function prettyPrintBody(text: string, mimeType?: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return text;
  }

  const looksJson =
    mimeType?.toLowerCase().includes("json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");

  if (!looksJson) {
    return text;
  }

  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
