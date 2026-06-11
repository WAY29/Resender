import { describe, expect, it } from "vitest";
import type { NetworkRecord, ResourceType } from "../types";
import { getNetworkIconData } from "./networkIcons";

describe("network request icons", () => {
  it("uses the DevTools fetch/xhr file icon for fetch and xhr requests", () => {
    expect(getNetworkIconData(record({ type: "fetch" })).iconName).toBe("file-fetch-xhr");
    expect(getNetworkIconData(record({ type: "xhr" })).iconName).toBe("file-fetch-xhr");
  });

  it("uses the JSON icon for JSON responses except manifests", () => {
    expect(getNetworkIconData(record({ type: "fetch", mimeType: "application/json" }))).toMatchObject({
      iconName: "file-json",
      colorVar: "--icon-file-script"
    });

    expect(getNetworkIconData(record({ type: "manifest", mimeType: "application/json" }))).toMatchObject({
      iconName: "file-manifest",
      colorVar: "--icon-file-default"
    });
  });

  it("lets fetch requests inherit a more specific MIME-derived icon", () => {
    expect(getNetworkIconData(record({ type: "fetch", mimeType: "text/css" }))).toMatchObject({
      iconName: "file-stylesheet",
      colorVar: "--icon-file-styles"
    });
    expect(getNetworkIconData(record({ type: "fetch", mimeType: "image/png" }))).toMatchObject({
      iconName: "file-image",
      colorVar: "--icon-file-image"
    });
  });

  it("uses image icons when MIME says image even if the resource type is other", () => {
    expect(getNetworkIconData(record({ type: "other", mimeType: "image/svg+xml" }))).toMatchObject({
      iconName: "file-image",
      colorVar: "--icon-file-image"
    });
  });
});

function record(options: { type: ResourceType; mimeType?: string }): NetworkRecord {
  return {
    id: "id",
    source: "har",
    method: "GET",
    url: "https://example.test/resource",
    name: "resource",
    domain: "example.test",
    type: options.type,
    sizeText: "-",
    startedAt: 0,
    requestHeaders: [],
    responseHeaders: options.mimeType ? [{ name: "content-type", value: options.mimeType }] : [],
    requestBody: { kind: "empty", text: "", sizeBytes: 0 },
    responseBody: options.mimeType
      ? { kind: "text", text: "", mimeType: options.mimeType }
      : { kind: "empty", text: "", sizeBytes: 0 }
  };
}
