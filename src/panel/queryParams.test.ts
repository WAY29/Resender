import { describe, expect, it } from "vitest";
import {
  normaliseUrlQueryEncoding,
  parseQueryParams,
  replaceUrlQuery
} from "./queryParams";

describe("query parameter parsing", () => {
  it("decodes query pairs from a URL", () => {
    expect(
      parseQueryParams("https://example.test/search?q=hello%20world&tag=a%2Bb&tag=%E4%BD%A0%E5%A5%BD#result")
    ).toEqual([
      { name: "q", value: "hello world" },
      { name: "tag", value: "a+b" },
      { name: "tag", value: "你好" }
    ]);
  });
});

describe("query parameter updates", () => {
  it("rebuilds a URL with encoded query values and preserved hash", () => {
    expect(
      replaceUrlQuery("/api/items?page=1#top", [
        { name: "search", value: "a b" },
        { name: "redirect", value: "/a path?x=1" }
      ])
    ).toBe("/api/items?search=a+b&redirect=%2Fa+path%3Fx%3D1#top");
  });

  it("removes the query string when there are no parameters left", () => {
    expect(replaceUrlQuery("https://example.test/api?q=1#done", [])).toBe(
      "https://example.test/api#done"
    );
  });

  it("normalises manually entered query strings before send", () => {
    expect(
      normaliseUrlQueryEncoding("https://example.test/api?q=hello world&redirect=/a path")
    ).toBe("https://example.test/api?q=hello+world&redirect=%2Fa+path");
  });
});
