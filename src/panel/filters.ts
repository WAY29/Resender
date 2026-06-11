import type { FilterState, NetworkRecord } from "../types";

export function matchesFilter(record: NetworkRecord, filter: FilterState): boolean {
  const query = filter.query.trim().toLowerCase();
  const typeMatches =
    filter.type === "all" ||
    (filter.type === "fetch-xhr" && (record.type === "fetch" || record.type === "xhr")) ||
    record.type === filter.type;

  const textMatches =
    query.length === 0 ||
    [
      record.name,
      record.url,
      record.domain,
      record.method,
      String(record.status ?? ""),
      record.initiator ?? ""
    ].some((value) => value.toLowerCase().includes(query));

  const matched = typeMatches && textMatches;
  return filter.invert ? !matched : matched;
}
