import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useMemo, useState } from "react";
import type { FilterState, NetworkRecord } from "../types";
import { matchesFilter, parseNetworkFilterQuery } from "./filters";
import { NetworkFilterBar } from "./filterBar";

afterEach(() => {
  cleanup();
});

describe("Network filter integration", () => {
  it("filters the visible request list by property query", async () => {
    const user = userEvent.setup();
    renderHarness(records);

    expect(screen.getByTestId("visible-names")).toHaveTextContent("app.js, users, logo.png");

    await user.type(screen.getByLabelText("Filter"), "status-code:200");
    expect(screen.getByTestId("visible-names")).toHaveTextContent("app.js");
  });

  it("keeps incomplete tokens neutral and warning-free", async () => {
    const user = userEvent.setup();
    renderHarness(records);

    await user.type(screen.getByLabelText("Filter"), "method:");
    expect(screen.getByTestId("visible-names")).toHaveTextContent("app.js, users, logo.png");
    expect(screen.queryByText(/Invalid filter token/i)).not.toBeInTheDocument();
  });

  it("lets type chips narrow results and invert flip the final result", async () => {
    const user = userEvent.setup();
    renderHarness(records);

    await user.type(screen.getByLabelText("Filter"), "status-code:200");
    await user.click(screen.getByRole("button", { name: "JS" }));
    expect(screen.getByTestId("visible-names")).toHaveTextContent("app.js");

    await user.click(screen.getByLabelText("Invert"));
    expect(screen.getByTestId("visible-names")).toHaveTextContent("users, logo.png");
  });

  it("surfaces unsupported tokens and empties positive matches", async () => {
    const user = userEvent.setup();
    renderHarness(records);

    await user.type(screen.getByLabelText("Filter"), "priority:high");
    expect(screen.getByText(/Unsupported filter token/i)).toBeInTheDocument();
    expect(screen.getByTestId("visible-names")).toHaveTextContent("none");
  });

  it("treats negative unsupported tokens as a no-op on results", async () => {
    const user = userEvent.setup();
    renderHarness(records);

    await user.type(screen.getByLabelText("Filter"), "-priority:high");
    expect(screen.getByText(/Unsupported filter token/i)).toBeInTheDocument();
    expect(screen.getByTestId("visible-names")).toHaveTextContent("app.js, users, logo.png");
  });

  it("supports quoted phrases and regex in the live query", async () => {
    const user = userEvent.setup();
    renderHarness(records);

    await user.type(screen.getByLabelText("Filter"), '"user list"');
    expect(screen.getByTestId("visible-names")).toHaveTextContent("users");

    await user.clear(screen.getByLabelText("Filter"));
    await user.type(screen.getByLabelText("Filter"), "/APP\\.JS/i");
    expect(screen.getByTestId("visible-names")).toHaveTextContent("app.js");
  });

  it("accepts autocomplete into the current token and preserves surrounding tokens", async () => {
    const user = userEvent.setup();
    renderHarness(records, { query: "status-code:200 sta", invert: false, type: "all" });

    const input = screen.getByLabelText("Filter") as HTMLInputElement;
    await user.click(input);
    await user.keyboard("{Enter}");

    expect(input.value).toBe("status-code:200 status-code:");
  });
});

function FilterHarness(props: { records: NetworkRecord[]; initialFilter?: FilterState }) {
  const [filter, setFilter] = useState<FilterState>(
    props.initialFilter ?? {
      query: "",
      invert: false,
      type: "all"
    }
  );

  const parsed = useMemo(() => parseNetworkFilterQuery(filter.query), [filter.query]);
  const visible = props.records.filter((record) => matchesFilter(record, filter, parsed));

  return (
    <div>
      <NetworkFilterBar filter={filter} records={props.records} onFilterChange={setFilter} />
      <output data-testid="visible-names">
        {visible.length === 0 ? "none" : visible.map((record) => record.name).join(", ")}
      </output>
    </div>
  );
}

function renderHarness(records: NetworkRecord[], initialFilter?: FilterState) {
  return render(<FilterHarness records={records} initialFilter={initialFilter} />);
}

const records: NetworkRecord[] = [
  record("app.js", {
    type: "script",
    url: "https://cdn.example.test/assets/app.js?build=42",
    domain: "cdn.example.test",
    status: 200,
    sizeBytes: 4096,
    responseHeaders: [{ name: "content-type", value: "application/javascript" }]
  }),
  record("users", {
    type: "fetch",
    method: "POST",
    url: "https://api.example.test/v1/user%20list/results",
    domain: "api.example.test",
    status: 201,
    sizeBytes: 900,
    source: "hook",
    responseHeaders: [{ name: "content-type", value: "application/json" }]
  }),
  record("logo.png", {
    type: "image",
    url: "http://static.example.test/assets/logo.png",
    domain: "static.example.test",
    status: 304,
    sizeBytes: 1200,
    responseHeaders: [{ name: "content-type", value: "image/png" }]
  })
];

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
