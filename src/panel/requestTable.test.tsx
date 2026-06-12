import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FilterState, NetworkRecord } from "../types";
import { RequestTable } from "./requestTable";
import * as platform from "./platform";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeText.mockClear();
  vi.spyOn(platform, "isWindowsPlatform").mockReturnValue(false);
});

describe("RequestTable context menu", () => {
  it("copies URL and appends filter tokens from the context menu", async () => {
    const user = userEvent.setup();
    const onFilterTokenAppend = vi.fn();
    const onStatus = vi.fn();

    render(
      <RequestTable
        records={[record()]}
        selectedId={undefined}
        filter={defaultFilter}
        onSelect={vi.fn()}
        onSortChange={vi.fn()}
        onColumnResize={vi.fn()}
        onFilterTokenAppend={onFilterTokenAppend}
        onStatus={onStatus}
        onCopyText={writeText}
        listWidthPercent={100}
        gridTemplate="34px 320px 86px 170px 78px 92px 160px 86px 80px"
        columnWidths={{
          name: 320,
          method: 86,
          domain: 170,
          status: 78,
          type: 92,
          initiator: 160,
          size: 86,
          time: 80
        }}
        sortState={null}
        isDetailsOpen={false}
      />
    );

    const row = screen.getByRole("button", { name: /users/i });
    await user.pointer([{ target: row, keys: "[MouseRight]" }]);

    await user.pointer([{ target: screen.getByText("Copy") }]);
    const copyUrl = await screen.findByRole("menuitem", { name: "Copy URL" });
    await user.click(copyUrl);
    expect(writeText).toHaveBeenCalledWith("https://api.example.test/users?role=admin");

    await user.pointer([{ target: row, keys: "[MouseRight]" }]);
    await user.pointer([{ target: screen.getByText("Filter") }]);
    await user.click(await screen.findByRole("menuitem", { name: "Filter by domain" }));
    expect(onFilterTokenAppend).toHaveBeenCalledWith("domain:api.example.test");

    await user.pointer([{ target: row, keys: "[MouseRight]" }]);
    await user.pointer([{ target: screen.getByText("Filter") }]);
    await user.click(await screen.findByRole("menuitem", { name: "Hide from list" }));
    expect(onFilterTokenAppend).toHaveBeenCalledWith('-url:https://api.example.test/users?role=admin');
  });

  it("copies all listed requests from the context menu", async () => {
    const user = userEvent.setup();
    render(
      <RequestTable
        records={[
          record({ id: "a-id", url: "url-a", name: "a", method: "GET" }),
          record({ id: "b-id", url: "url-b", name: "b", method: "GET" })
        ]}
        selectedId={undefined}
        filter={defaultFilter}
        onSelect={vi.fn()}
        onSortChange={vi.fn()}
        onColumnResize={vi.fn()}
        onFilterTokenAppend={vi.fn()}
        onStatus={vi.fn()}
        onCopyText={writeText}
        listWidthPercent={100}
        gridTemplate="34px 320px 86px 170px 78px 92px 160px 86px 80px"
        columnWidths={{
          name: 320,
          method: 86,
          domain: 170,
          status: 78,
          type: 92,
          initiator: 160,
          size: 86,
          time: 80
        }}
        sortState={null}
        isDetailsOpen={false}
      />
    );

    const row = screen.getAllByRole("button").find((element) => element.className.includes("request-item"))!;
    await user.pointer([{ target: row, keys: "[MouseRight]" }]);
    await user.pointer([{ target: screen.getByText("Copy") }]);
    await user.click(await screen.findByRole("menuitem", { name: "Copy all listed URLs" }));

    expect(writeText).toHaveBeenCalledWith("url-a\nurl-b");
  });

  it("hides cmd and PowerShell copy actions on non-Windows platforms", async () => {
    const user = userEvent.setup();
    render(
      <RequestTable
        records={[record()]}
        selectedId={undefined}
        filter={defaultFilter}
        onSelect={vi.fn()}
        onSortChange={vi.fn()}
        onColumnResize={vi.fn()}
        onFilterTokenAppend={vi.fn()}
        onStatus={vi.fn()}
        onCopyText={writeText}
        listWidthPercent={100}
        gridTemplate="34px 320px 86px 170px 78px 92px 160px 86px 80px"
        columnWidths={{
          name: 320,
          method: 86,
          domain: 170,
          status: 78,
          type: 92,
          initiator: 160,
          size: 86,
          time: 80
        }}
        sortState={null}
        isDetailsOpen={false}
      />
    );

    const row = screen.getByRole("button", { name: /users/i });
    await user.pointer([{ target: row, keys: "[MouseRight]" }]);
    await user.pointer([{ target: screen.getByText("Copy") }]);

    expect(screen.queryByRole("menuitem", { name: "Copy as cURL (cmd)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Copy as PowerShell" })).not.toBeInTheDocument();
  });

  it("shows cmd and PowerShell copy actions on Windows", async () => {
    vi.spyOn(platform, "isWindowsPlatform").mockReturnValue(true);
    const user = userEvent.setup();
    render(
      <RequestTable
        records={[record()]}
        selectedId={undefined}
        filter={defaultFilter}
        onSelect={vi.fn()}
        onSortChange={vi.fn()}
        onColumnResize={vi.fn()}
        onFilterTokenAppend={vi.fn()}
        onStatus={vi.fn()}
        onCopyText={writeText}
        listWidthPercent={100}
        gridTemplate="34px 320px 86px 170px 78px 92px 160px 86px 80px"
        columnWidths={{
          name: 320,
          method: 86,
          domain: 170,
          status: 78,
          type: 92,
          initiator: 160,
          size: 86,
          time: 80
        }}
        sortState={null}
        isDetailsOpen={false}
      />
    );

    const row = screen.getByRole("button", { name: /users/i });
    await user.pointer([{ target: row, keys: "[MouseRight]" }]);
    await user.pointer([{ target: screen.getByText("Copy") }]);

    expect(await screen.findByRole("menuitem", { name: "Copy as cURL (cmd)" })).toBeInTheDocument();
    expect(await screen.findByRole("menuitem", { name: "Copy as PowerShell" })).toBeInTheDocument();
  });

  it("disables unsupported copy formats and surfaces their reason", async () => {
    const user = userEvent.setup();
    render(
      <RequestTable
        records={[
          record({
            requestBody: {
              kind: "form",
              text: 'file=[File name="avatar.png" type="image/png" size=12]',
              mimeType: "multipart/form-data",
              sizeBytes: 12
            }
          })
        ]}
        selectedId={undefined}
        filter={defaultFilter}
        onSelect={vi.fn()}
        onSortChange={vi.fn()}
        onColumnResize={vi.fn()}
        onFilterTokenAppend={vi.fn()}
        onStatus={vi.fn()}
        onCopyText={writeText}
        listWidthPercent={100}
        gridTemplate="34px 320px 86px 170px 78px 92px 160px 86px 80px"
        columnWidths={{
          name: 320,
          method: 86,
          domain: 170,
          status: 78,
          type: 92,
          initiator: 160,
          size: 86,
          time: 80
        }}
        sortState={null}
        isDetailsOpen={false}
      />
    );

    const row = screen.getByRole("button", { name: /users/i });
    await user.pointer([{ target: row, keys: "[MouseRight]" }]);
    await user.pointer([{ target: screen.getByText("Copy") }]);

    const item = await screen.findByRole("menuitem", { name: "Copy as cURL (bash)" });
    expect(item).toBeDisabled();
    expect(item).toHaveAttribute("title", "Multipart form uploads are not reusable as copied commands yet.");
  });
});

const defaultFilter: FilterState = {
  query: "",
  invert: false,
  type: "all"
};

function record(overrides: Partial<NetworkRecord> = {}): NetworkRecord {
  return {
    id: "1",
    source: "har",
    method: "POST",
    url: "https://api.example.test/users?role=admin",
    name: "users",
    domain: "api.example.test",
    type: "fetch",
    sizeText: "128 B",
    startedAt: 1,
    requestHeaders: [{ name: "Content-Type", value: "application/json" }],
    responseHeaders: [],
    requestBody: { kind: "json", text: '{"hello":"world"}', mimeType: "application/json", sizeBytes: 17 },
    responseBody: { kind: "empty", text: "", sizeBytes: 0 },
    ...overrides
  };
}
