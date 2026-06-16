import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FilterState, NetworkRecord } from "../types";
import { NetworkFilterBar } from "./filterBar";

afterEach(() => {
  cleanup();
});

describe("NetworkFilterBar", () => {
  it("shows unsupported token warnings", () => {
    renderBar({ query: "priority:high", invert: false, type: "all" });
    expect(screen.getByText(/Unsupported filter token/i)).toBeInTheDocument();
  });

  it("shows approximate larger-than notice for non-HAR records", () => {
    renderBar(
      { query: "larger-than:1k", invert: false, type: "all" },
      [record("hook", { source: "hook", sizeBytes: 10 })]
    );
    expect(screen.getByText(/may be approximate/i)).toBeInTheDocument();
  });

  it("opens autocomplete for supported keys and accepts with Enter", async () => {
    const user = userEvent.setup();
    const { onFilterChange } = renderBar({ query: "sta", invert: false, type: "all" });

    const input = screen.getByLabelText("Filter");
    await user.click(input);
    expect(screen.getByRole("listbox", { name: "Filter suggestions" })).toBeInTheDocument();

    await user.keyboard("{Enter}");

    expect(onFilterChange).toHaveBeenLastCalledWith({
      query: "status-code:",
      invert: false,
      type: "all"
    });
  });

  it("suggests new body keys from the input", async () => {
    const user = userEvent.setup();
    renderBar({ query: "bo", invert: false, type: "all" });

    const input = screen.getByLabelText("Filter");
    await user.click(input);

    expect(screen.getByRole("option", { name: "body:" })).toBeInTheDocument();
  });

  it("supports arrow navigation and Tab acceptance", async () => {
    const user = userEvent.setup();
    const { onFilterChange } = renderBar({ query: "resource-type:s", invert: false, type: "all" });

    const input = screen.getByLabelText("Filter");
    await user.click(input);
    expect(screen.getByRole("listbox", { name: "Filter suggestions" })).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Tab}");

    expect(onFilterChange).toHaveBeenCalled();
    expect(onFilterChange.mock.calls.at(-1)?.[0].query).toMatch(/^resource-type:/);
  });

  it("accepts suggestion by mouse", async () => {
    const user = userEvent.setup();
    const { onFilterChange } = renderBar({ query: "sta", invert: false, type: "all" });

    const input = screen.getByLabelText("Filter");
    await user.click(input);
    await user.click(screen.getByRole("option", { name: "status-code:" }));

    expect(onFilterChange).toHaveBeenLastCalledWith({
      query: "status-code:",
      invert: false,
      type: "all"
    });
  });

  it("closes autocomplete on Escape", async () => {
    const user = userEvent.setup();
    renderBar({ query: "sta", invert: false, type: "all" });

    const input = screen.getByLabelText("Filter");
    await user.click(input);
    expect(screen.getByRole("listbox", { name: "Filter suggestions" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox", { name: "Filter suggestions" })).not.toBeInTheDocument();
  });

  it("updates invert via checkbox", async () => {
    const user = userEvent.setup();
    const { onFilterChange } = renderBar({ query: "", invert: false, type: "all" });

    await user.click(screen.getByLabelText("Invert"));
    expect(onFilterChange).toHaveBeenLastCalledWith({ query: "", invert: true, type: "all" });
  });

  it("updates type chip selection", async () => {
    const user = userEvent.setup();
    const { onFilterChange } = renderBar({ query: "", invert: false, type: "all" });

    await user.click(screen.getByRole("button", { name: "JS" }));
    expect(onFilterChange).toHaveBeenLastCalledWith({ query: "", invert: false, type: "script" });
  });
});

function renderBar(
  filter: FilterState,
  records: NetworkRecord[] = [record("har")]
) {
  const onFilterChange = vi.fn();
  render(<NetworkFilterBar filter={filter} records={records} onFilterChange={onFilterChange} />);
  return { onFilterChange };
}

function record(name: string, overrides: Partial<NetworkRecord> = {}): NetworkRecord {
  return {
    id: name,
    source: "har",
    method: "GET",
    url: `https://example.test/${name}`,
    name,
    domain: "example.test",
    type: "fetch",
    sizeText: overrides.sizeBytes ? `${overrides.sizeBytes} B` : "-",
    startedAt: 1,
    requestHeaders: [],
    responseHeaders: [],
    requestBody: { kind: "empty", text: "", sizeBytes: 0 },
    responseBody: { kind: "empty", text: "", sizeBytes: 0 },
    ...overrides
  };
}
