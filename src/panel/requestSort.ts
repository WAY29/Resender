import type { NetworkRecord } from "../types";

export type SortColumn =
  | "name"
  | "method"
  | "domain"
  | "status"
  | "type"
  | "initiator"
  | "size"
  | "time";

export type SortDirection = "desc" | "asc";

export type SortState = {
  column: SortColumn;
  direction: SortDirection;
} | null;

export function nextSortState(current: SortState, column: SortColumn): SortState {
  if (!current || current.column !== column) {
    return { column, direction: "desc" };
  }

  if (current.direction === "desc") {
    return { column, direction: "asc" };
  }

  return null;
}

export function sortRecords(records: NetworkRecord[], sort: SortState): NetworkRecord[] {
  const indexed = records.map((record, index) => ({ record, index }));

  if (!sort) {
    return indexed
      .sort((left, right) => left.record.startedAt - right.record.startedAt || left.index - right.index)
      .map((entry) => entry.record);
  }

  return indexed
    .sort((left, right) => {
      const result = compareValues(getSortValue(left.record, sort.column), getSortValue(right.record, sort.column));
      return (sort.direction === "desc" ? -result : result) || left.index - right.index;
    })
    .map((entry) => entry.record);
}

function getSortValue(record: NetworkRecord, column: SortColumn): string | number | undefined {
  switch (column) {
    case "name":
      return record.name;
    case "method":
      return record.method;
    case "domain":
      return record.domain;
    case "status":
      return record.status;
    case "type":
      return record.type;
    case "initiator":
      return record.initiator;
    case "size":
      return record.sizeBytes;
    case "time":
      return record.timeMs;
  }
}

function compareValues(left: string | number | undefined, right: string | number | undefined): number {
  if (left === undefined && right === undefined) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}
