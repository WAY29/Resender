import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResendDraft } from "../types";
import { __resendInPageForTest } from "./chromeApi";

describe("resendInPage injection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs detached from module scope", async () => {
    const detached = new Function(
      `return (${__resendInPageForTest.toString()});`
    )() as typeof __resendInPageForTest;
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        statusText: "Created",
        headers: {
          "content-type": "application/json",
          "x-test": "1"
        }
      });
    });
    const draft: ResendDraft = {
      method: "POST",
      url: "https://example.test/api",
      headers: [{ name: "Authorization", value: "Bearer token" }],
      body: JSON.stringify({ hello: "world" }),
      credentials: "include",
      bodyLimitBytes: 1024 * 1024,
      resendId: "test-resend"
    };

    vi.stubGlobal("fetch", fetchMock);

    const result = await detached(draft);

    expect(fetchMock).toHaveBeenCalledWith("https://example.test/api", {
      method: "POST",
      headers: { Authorization: "Bearer token" },
      body: JSON.stringify({ hello: "world" }),
      credentials: "include"
    });
    expect(result.status).toBe(201);
    expect(result.responseHeaders).toContainEqual({ name: "content-type", value: "application/json" });
    expect(result.responseBody).toMatchObject({
      kind: "json",
      text: JSON.stringify({ ok: true })
    });
  });
});
