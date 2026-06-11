import type { HeaderPair } from "../types";

type UrlParts = {
  prefix: string;
  query: string;
  hash: string;
};

function splitUrl(url: string): UrlParts {
  const hashIndex = url.indexOf("#");
  const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : url.slice(hashIndex);
  const queryIndex = beforeHash.indexOf("?");

  if (queryIndex === -1) {
    return {
      prefix: beforeHash,
      query: "",
      hash
    };
  }

  return {
    prefix: beforeHash.slice(0, queryIndex),
    query: beforeHash.slice(queryIndex + 1),
    hash
  };
}

export function parseQueryParams(url: string): HeaderPair[] {
  const { query } = splitUrl(url);
  return Array.from(new URLSearchParams(query).entries()).map(([name, value]) => ({
    name,
    value
  }));
}

export function replaceUrlQuery(url: string, params: HeaderPair[]): string {
  const { prefix, hash } = splitUrl(url);
  const query = new URLSearchParams(
    params
      .filter((param) => param.name.trim().length > 0)
      .map((param) => [param.name, param.value])
  ).toString();

  return `${prefix}${query.length > 0 ? `?${query}` : ""}${hash}`;
}

export function normaliseUrlQueryEncoding(url: string): string {
  return replaceUrlQuery(url, parseQueryParams(url));
}
