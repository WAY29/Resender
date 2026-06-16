import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeView } from "./codeViewer";
import { JsonPreviewSearchView } from "./previewSearch";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn()
  });
});

describe("Preview search", () => {
  it("enables floating search in text preview", async () => {
    const user = userEvent.setup();
    const { container } = render(<CodeView text="OK value OK" searchable />);

    await user.keyboard("{Control>}f{/Control}");
    const input = screen.getByRole("searchbox", { name: "Search response body" });
    await user.type(input, "OK");

    await waitFor(() => {
      expect(screen.getByText("1 of 2")).toBeInTheDocument();
    });

    expect(container.querySelector(".search-dock")).toBeInTheDocument();
  });

  it("searches JSON keys and values in preview tree", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <JsonPreviewSearchView
        value={{ status: "OK", nested: { statusText: "Still OK" } }}
        syncState={{ expanded: true, version: 0 }}
      />
    );

    await user.keyboard("{Control>}f{/Control}");
    const input = screen.getByRole("searchbox", { name: "Search response body" });
    await user.type(input, "OK");

    await waitFor(() => {
      expect(screen.getByText("1 of 2")).toBeInTheDocument();
    });

    expect(document.querySelectorAll(".code-search-hit")).toHaveLength(2);
    expect(container.querySelector(".search-dock")).toBeInTheDocument();
  });

  it("auto-expands collapsed JSON branches to reveal active matches", async () => {
    const user = userEvent.setup();
    render(
      <JsonPreviewSearchView
        value={{ root: { nested: { target: "OK" } } }}
        syncState={{ expanded: false, version: 1 }}
      />
    );

    await user.keyboard("{Control>}f{/Control}");
    const input = screen.getByRole("searchbox", { name: "Search response body" });
    await user.type(input, "OK");

    await waitFor(() => {
      expect(screen.getByText("1 of 1")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/target/i)).toBeInTheDocument();
    });
  });

  it("supports regex literals in JSON preview search", async () => {
    const user = userEvent.setup();
    render(
      <JsonPreviewSearchView
        value={{ status: "OK", result: "OK" }}
        syncState={{ expanded: true, version: 0 }}
      />
    );

    await user.keyboard("{Control>}f{/Control}");
    await user.click(screen.getByRole("button", { name: "Use regular expression" }));
    const input = screen.getByRole("searchbox", { name: "Search response body" });
    await user.type(input, "/OK/");

    await waitFor(() => {
      expect(screen.getByText("1 of 2")).toBeInTheDocument();
    });
  });
});
