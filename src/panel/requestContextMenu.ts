import type { FilterState, NetworkRecord } from "../types";

export function appendFilterToken(current: FilterState, token: string): FilterState {
  const nextQuery = current.query.trim().length === 0 ? token : `${current.query} ${token}`;
  return { ...current, query: nextQuery };
}

export function buildDomainFilter(record: NetworkRecord): string {
  return `domain:${quoteFilterValueIfNeeded(record.domain)}`;
}

export function buildMethodFilter(record: NetworkRecord): string {
  return `method:${quoteFilterValueIfNeeded(record.method)}`;
}

export function buildHideFromListFilter(record: NetworkRecord): string {
  return `-url:${quoteFilterValueIfNeeded(record.url)}`;
}

function quoteFilterValueIfNeeded(value: string): string {
  if (/^[^\s"\\]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/(["\\])/g, "\\$1")}"`;
}
