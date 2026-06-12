import { describe, expect, it } from "vitest";
import type { NetworkRecord } from "../types";
import {
  buildRequestCopyText,
  buildRequestListCopyText,
  getRequestCopySupport,
  multipartCopyUnsupportedReason
} from "./requestCopy";

describe("requestCopy", () => {
  it("builds browser fetch from a captured JSON request", () => {
    const text = buildRequestCopyText(
      record({
        method: "POST",
        url: "https://api.example.test/users",
        credentials: "include",
        requestHeaders: [
          { name: "Content-Type", value: "application/json" },
          { name: "Authorization", value: "Bearer token" },
          { name: "Cookie", value: "sid=1" }
        ],
        requestBody: { kind: "json", text: '{"name":"Ada"}', mimeType: "application/json", sizeBytes: 14 }
      }),
      "fetch"
    );

    expect(text).toBe(`fetch("https://api.example.test/users", {
  "headers": {
    "authorization": "Bearer token",
    "content-type": "application/json"
  },
  "body": "{\\"name\\":\\"Ada\\"}",
  "method": "POST",
  "mode": "cors",
  "credentials": "include"
});`);
  });

  it("sets browser fetch credentials to omit when no credential headers exist", () => {
    expect(
      buildRequestCopyText(
        record({
          method: "GET",
          url: "https://api.example.test/users"
        }),
        "fetch"
      )
    ).toBe(`fetch("https://api.example.test/users", {
  "body": null,
  "method": "GET",
  "mode": "cors",
  "credentials": "omit"
});`);
  });

  it("builds Node.js fetch and preserves Cookie plus Referer headers", () => {
    const text = buildRequestCopyText(
      record({
        method: "GET",
        url: "https://api.example.test/users?role=admin",
        requestHeaders: [
          { name: "Accept", value: "application/json" },
          { name: "Cookie", value: "sid=1" },
          { name: "Referer", value: "https://app.example.test/" }
        ]
      }),
      "fetch-node"
    );

    expect(text).toBe(`fetch("https://api.example.test/users?role=admin", {
  "headers": {
    "accept": "application/json",
    "cookie": "sid=1",
    "Referer": "https://app.example.test/"
  },
  "body": null,
  "method": "GET"
});`);
  });

  it("strips unsafe headers from browser fetch output", () => {
    const text = buildRequestCopyText(
      record({
        requestHeaders: [
          { name: "Cookie", value: "sid=1" },
          { name: "User-Agent", value: "UA" },
          { name: "Origin", value: "https://app.example.test" },
          { name: "X-Test", value: "1" }
        ]
      }),
      "fetch"
    );

    expect(text).toContain('"x-test": "1"');
    expect(text).not.toContain("Cookie");
    expect(text).not.toContain("User-Agent");
    expect(text).not.toContain("Origin");
  });

  it("generates curl headers with empty values using semicolon syntax", () => {
    expect(
      buildRequestCopyText(
        record({
          url: "http://localhost",
          requestHeaders: [
            { name: "header-with-value", value: "some value" },
            { name: "no-value-header", value: "" }
          ]
        }),
        "curl-bash"
      )
    ).toBe(`curl --url 'http://localhost' \\
  -H 'header-with-value: some value' \\
  -H 'no-value-header;'`);
  });

  it("strips internal pseudo headers from curl output", () => {
    expect(
      buildRequestCopyText(
        record({
          url: "http://localhost",
          requestHeaders: [
            { name: ":host", value: "h" },
            { name: "version", value: "v" }
          ]
        }),
        "curl-bash"
      )
    ).toBe("curl --url 'http://localhost'");

    expect(
      buildRequestCopyText(
        record({
          url: "http://localhost",
          requestHeaders: [{ name: "authority", value: "www.example.com" }]
        }),
        "curl-bash"
      )
    ).toBe("curl --url 'http://localhost'");
  });

  it("uses -b for cookie headers containing an equal sign", () => {
    expect(
      buildRequestCopyText(
        record({
          url: "http://localhost",
          requestHeaders: [{ name: "cookie", value: 'eva="Sg4="' }]
        }),
        "curl-bash"
      )
    ).toBe(`curl --url 'http://localhost' -b 'eva="Sg4="'`);

    expect(
      buildRequestCopyText(
        record({
          url: "http://localhost",
          requestHeaders: [{ name: "cookie", value: 'eva="Sg4="' }]
        }),
        "curl-cmd"
      )
    ).toBe('curl --url ^"http://localhost^" -b ^"eva=^\\^"Sg4=^\\^"^"');
  });

  it("falls back to -H for cookie headers without an equal sign", () => {
    expect(
      buildRequestCopyText(
        record({
          url: "http://localhost",
          requestHeaders: [{ name: "cookie", value: "namelesscookie" }]
        }),
        "curl-bash"
      )
    ).toBe(`curl --url 'http://localhost' -H 'cookie: namelesscookie'`);

    expect(
      buildRequestCopyText(
        record({
          url: "http://localhost",
          requestHeaders: [{ name: "cookie", value: "namelesscookie" }]
        }),
        "curl-cmd"
      )
    ).toBe('curl --url ^"http://localhost^" -H ^"cookie: namelesscookie^"');
  });

  it("uses -b for nameless cookies containing an equal sign", () => {
    expect(
      buildRequestCopyText(
        record({
          url: "http://localhost",
          requestHeaders: [{ name: "cookie", value: "\\\\attacker.com\\share\\leak=foo" }]
        }),
        "curl-bash"
      )
    ).toBe(String.raw`curl --url 'http://localhost' -b '\\attacker.com\share\leak=foo'`);
  });

  it("escapes percent signs for cmd curl output", () => {
    expect(
      buildRequestCopyText(
        record({
          url: "http://localhost",
          requestHeaders: [{ name: "cookie", value: "eva=%22Sg4%3D%22" }]
        }),
        "curl-cmd"
      )
    ).toBe('curl --url ^"http://localhost^" -b ^"eva=^%^22Sg4^%^3D^%^22^"');
  });

  it("escapes newlines and ampersands in curl output", () => {
    expect(
      buildRequestCopyText(
        record({
          url: "http://localhost",
          requestHeaders: [{ name: "cookie", value: "query=evil\n\n & cmd /c calc.exe \n\n" }]
        }),
        "curl-bash"
      )
    ).toBe(String.raw`curl --url 'http://localhost' -b $'query=evil\n\n & cmd /c calc.exe \n\n'`);

    expect(
      buildRequestCopyText(
        record({
          url: "http://localhost",
          requestHeaders: [{ name: "cookie", value: "query=evil\n\n & cmd /c calc.exe \n\n" }]
        }),
        "curl-cmd"
      )
    ).toBe('curl --url ^"http://localhost^" -b ^"query=evil^\n\n^\n\n ^& cmd /c calc.exe ^\n\n^\n\n^"');
  });

  it("escapes CRLF in curl output", () => {
    expect(
      buildRequestCopyText(
        record({
          url: "http://localhost",
          requestHeaders: [{ name: "cookie", value: "query=evil\r\n & cmd /c calc.exe \n\n" }]
        }),
        "curl-bash"
      )
    ).toBe(String.raw`curl --url 'http://localhost' -b $'query=evil\r\n & cmd /c calc.exe \n\n'`);
  });

  it("sanitizes tabs and vertical whitespace in cmd curl output", () => {
    expect(
      buildRequestCopyText(
        record({
          url: "http://localhost",
          requestHeaders: [{ name: "cookie", value: "query=evil\t\v\f\r\n & cmd /c calc.exe \n\n" }]
        }),
        "curl-cmd"
      )
    ).toBe('curl --url ^"http://localhost^" -b ^"query=evil   ^\n\n ^& cmd /c calc.exe ^\n\n^\n\n^"');

    expect(
      buildRequestCopyText(
        record({
          url: "http://localhost",
          requestHeaders: [{ name: "cookie", value: "query=evil\t\v\f\r\n & cmd /c calc.exe \n\n" }]
        }),
        "curl-bash"
      )
    ).toBe(String.raw`curl --url 'http://localhost' -b $'query=evil\u0009\u000b\u000c\r\n & cmd /c calc.exe \n\n'`);
  });

  it("escapes CR only in curl output", () => {
    expect(
      buildRequestCopyText(
        record({
          url: "http://localhost",
          requestHeaders: [{ name: "cookie", value: "query=evil\r & cmd /c calc.exe" }]
        }),
        "curl-bash"
      )
    ).toBe(String.raw`curl --url 'http://localhost' -b $'query=evil\r & cmd /c calc.exe'`);
  });

  it("escapes multiline and control characters in bash curl output", () => {
    expect(
      buildRequestCopyText(
        record({
          method: "POST",
          url: "http://localhost",
          requestHeaders: [{ name: "Content-Type", value: "application/binary" }],
          requestBody: { kind: "text", text: "1234\r\n00\u0002\u0003\u0004\u0005'\"!", mimeType: "application/binary", sizeBytes: 14 }
        }),
        "curl-bash"
      )
    ).toBe(`curl --url 'http://localhost' \\
  -H 'Content-Type: application/binary' \\
  --data-raw $'1234\\r\\n00\\u0002\\u0003\\u0004\\u0005\\'"\\u0021'`);
  });

  it("preserves URLs starting with a dash by using --url", () => {
    expect(buildRequestCopyText(record({ url: "-http://example.com/" }), "curl-bash")).toBe(
      "curl --url '-http://example.com/'"
    );
    expect(buildRequestCopyText(record({ url: "-http://example.com/" }), "curl-cmd")).toBe(
      'curl --url ^"-http://example.com/^"'
    );
  });

  it("escapes brackets in URLs for curl output", () => {
    expect(buildRequestCopyText(record({ url: "http://example.com/?a=[]{}" }), "curl-bash")).toBe(
      "curl --url 'http://example.com/?a=\\[\\]\\{\\}'"
    );
    expect(buildRequestCopyText(record({ url: "http://example.com/?a=[]{}" }), "curl-cmd")).toBe(
      'curl --url ^"http://example.com/?a=^\\[^\\]^\\{^\\}^"'
    );
  });

  it("uses --data-raw for POST request bodies", () => {
    expect(
      buildRequestCopyText(
        record({
          method: "POST",
          url: "http://localhost",
          requestBody: { kind: "text", text: "123", mimeType: "text/plain", sizeBytes: 3 }
        }),
        "curl-bash"
      )
    ).toBe(`curl --url 'http://localhost' --data-raw '123'`);

    expect(
      buildRequestCopyText(
        record({
          method: "POST",
          url: "http://localhost",
          requestHeaders: [{ name: "Content-Type", value: "application/x-www-form-urlencoded" }],
          requestBody: { kind: "text", text: "1&b", mimeType: "application/x-www-form-urlencoded", sizeBytes: 3 }
        }),
        "curl-bash"
      )
    ).toBe(`curl --url 'http://localhost' \\
  -H 'Content-Type: application/x-www-form-urlencoded' \\
  --data-raw '1&b'`);
  });

  it("uses --data-raw for request bodies that start with at-sign", () => {
    expect(
      buildRequestCopyText(
        record({
          method: "POST",
          url: "http://localhost",
          requestHeaders: [{ name: "Content-Type", value: "application/x-www-form-urlencoded" }],
          requestBody: { kind: "text", text: "@/etc/passwd", mimeType: "application/x-www-form-urlencoded", sizeBytes: 11 }
        }),
        "curl-bash"
      )
    ).toBe(`curl --url 'http://localhost' \\
  -H 'Content-Type: application/x-www-form-urlencoded' \\
  --data-raw '@/etc/passwd'`);

    expect(
      buildRequestCopyText(
        record({
          method: "POST",
          url: "http://localhost",
          requestHeaders: [{ name: "Content-Type", value: "application/x-www-form-urlencoded" }],
          requestBody: { kind: "text", text: "@/etc/passwd", mimeType: "application/x-www-form-urlencoded", sizeBytes: 11 }
        }),
        "curl-cmd"
      )
    ).toBe('curl --url ^"http://localhost^" ^\n  -H ^"Content-Type: application/x-www-form-urlencoded^" ^\n  --data-raw ^"^@/etc/passwd^"');
  });

  it("escapes JSON bodies for cmd curl output", () => {
    expect(
      buildRequestCopyText(
        record({
          method: "POST",
          url: "http://localhost",
          requestHeaders: [{ name: "Content-Type", value: "application/json" }],
          requestBody: { kind: "json", text: '{"a":1}', mimeType: "application/json", sizeBytes: 7 }
        }),
        "curl-cmd"
      )
    ).toBe('curl --url ^"http://localhost^" ^\n  -H ^"Content-Type: application/json^" ^\n  --data-raw ^"^{^\\^"a^\\^":1^}^"');
  });

  it("escapes unusual methods in curl output", () => {
    expect(buildRequestCopyText(record({ url: "http://localhost", method: "|evilcommand|" }), "curl-bash")).toBe(
      "curl --url 'http://localhost' -X '|evilcommand|'"
    );
    expect(buildRequestCopyText(record({ url: "http://localhost", method: "|evilcommand|" }), "curl-cmd")).toBe(
      'curl --url ^"http://localhost^" -X ^"^|evilcommand^|^"'
    );
  });

  it("builds PowerShell curl using request session for cookie and user-agent", () => {
    const text = buildRequestCopyText(
      record({
        method: "POST",
        url: "https://api.example.test/quotes",
        requestHeaders: [
          { name: "User-Agent", value: "UA/1.0" },
          { name: "Cookie", value: "sid=1" },
          { name: "Content-Type", value: "application/json" },
          { name: "X-Test", value: "O'Hara" }
        ],
        requestBody: { kind: "text", text: "it's fine", mimeType: "text/plain", sizeBytes: 9 }
      }),
      "powershell"
    );

    expect(text).toContain('$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession');
    expect(text).toContain('$session.UserAgent = "UA/1.0"');
    expect(text).toContain('$session.Cookies.SetCookies');
    expect(text).toContain('-WebSession $session');
    expect(text).toContain('-ContentType "application/json"');
    expect(text).toContain('-Body "it\'s fine"');
    expect(text).toContain('"X-Test"="O\'Hara"');
  });

  it("encodes non-ascii PowerShell bodies as UTF-8 bytes", () => {
    const text = buildRequestCopyText(
      record({
        method: "POST",
        requestBody: { kind: "text", text: "你好", mimeType: "text/plain", sizeBytes: 6 }
      }),
      "powershell"
    );

    expect(text).toContain("-Body ([System.Text.Encoding]::UTF8.GetBytes(");
  });

  it("joins copied request lists using DevTools-style separators", () => {
    const records = [
      record({ url: "url-a", name: "a" }),
      record({ url: "url-b", name: "b" })
    ];

    expect(buildRequestListCopyText(records, "url")).toBe("url-a\nurl-b");
    expect(buildRequestListCopyText(records, "curl-bash")).toBe("curl --url 'url-a' ;\ncurl --url 'url-b'");
    expect(buildRequestListCopyText(records, "fetch")).toBe(`fetch("url-a", {
  "body": null,
  "method": "GET",
  "mode": "cors",
  "credentials": "omit"
}); ;
fetch("url-b", {
  "body": null,
  "method": "GET",
  "mode": "cors",
  "credentials": "omit"
});`);
    expect(buildRequestListCopyText(records, "powershell")).toBe(
      'Invoke-WebRequest -UseBasicParsing -Uri "url-a";\r\nInvoke-WebRequest -UseBasicParsing -Uri "url-b"'
    );
  });

  it("rejects multipart form copies", () => {
    expect(
      getRequestCopySupport(
        record({
          method: "POST",
          requestBody: {
            kind: "form",
            text: 'file=[File name="avatar.png" type="image/png" size=12]',
            mimeType: "multipart/form-data",
            sizeBytes: 12
          }
        }),
        "curl-bash"
      )
    ).toEqual({ supported: false, reason: multipartCopyUnsupportedReason });
  });

  it("rejects unavailable request bodies", () => {
    expect(
      getRequestCopySupport(
        record({
          method: "POST",
          requestBody: { kind: "too-large", reason: "Request body exceeded the configured limit.", sizeBytes: 999999 }
        }),
        "fetch"
      )
    ).toEqual({ supported: false, reason: "Request body exceeded the configured limit." });
  });
});

function record(overrides: Partial<NetworkRecord>): NetworkRecord {
  return {
    id: "record-1",
    source: "har",
    method: "GET",
    url: "https://example.test/path",
    name: "path",
    domain: "example.test",
    type: "fetch",
    sizeText: "-",
    startedAt: 1,
    requestHeaders: [],
    responseHeaders: [],
    requestBody: { kind: "empty", text: "", sizeBytes: 0 },
    responseBody: { kind: "empty", text: "", sizeBytes: 0 },
    ...overrides
  };
}
