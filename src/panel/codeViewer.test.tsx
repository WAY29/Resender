import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "./i18n";
import { CodeView } from "./codeViewer";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn()
  });
});

describe("CodeView search", () => {
  it("registers keyboard shortcuts in capture phase", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<CodeView text="token" searchable />);

    expect(addEventListener).toHaveBeenCalledWith("keydown", expect.any(Function), { capture: true });

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function), { capture: true });
  });

  it("opens search with Ctrl+F and finds matches", async () => {
    const user = userEvent.setup();
    render(<CodeView text={'{"tokens": 1, "nested": { "tokens": 2 }}'} mimeType="application/json" searchable />);

    await user.keyboard("{Control>}f{/Control}");

    const input = screen.getByRole("searchbox", { name: "Search response body" });
    expect(input).toHaveFocus();

    await user.type(input, "tokens");

    await waitFor(() => {
      expect(screen.getByText("1 of 2")).toBeInTheDocument();
    });

    expect(document.querySelectorAll(".code-search-hit")).toHaveLength(2);
    expect(document.querySelectorAll(".code-search-hit.active")).toHaveLength(1);
  });

  it("navigates matches with Enter and previous button", async () => {
    const user = userEvent.setup();
    render(<CodeView text="token token token" searchable />);

    await user.keyboard("{Control>}f{/Control}");
    const input = screen.getByRole("searchbox", { name: "Search response body" });
    await user.type(input, "token");

    await waitFor(() => {
      expect(screen.getByText("1 of 3")).toBeInTheDocument();
    });

    await user.keyboard("{Enter}");
    expect(screen.getByText("2 of 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous match" }));
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  it("supports regex toggling and invalid regex feedback", async () => {
    const user = userEvent.setup();
    render(<CodeView text="/tokens/ /values/" searchable />);

    await user.keyboard("{Control>}f{/Control}");
    const input = screen.getByRole("searchbox", { name: i18n.details.search });
    await user.click(screen.getByRole("button", { name: i18n.details.useRegex }));
    await user.type(input, "(");

    await waitFor(() => {
      expect(screen.getByText(i18n.details.invalidRegex)).toBeInTheDocument();
    });

    await user.clear(input);
    await user.paste("\\/[a-z]+\\/");

    await waitFor(() => {
      expect(screen.getByText(i18n.details.searchMatchCount(1, 2))).toBeInTheDocument();
    });
  });

  it("accepts slash-delimited regex literals like /OK/", async () => {
    const user = userEvent.setup();
    render(<CodeView text="status=OK\nresult=OK" searchable />);

    await user.keyboard("{Control>}f{/Control}");
    const input = screen.getByRole("searchbox", { name: i18n.details.search });
    await user.click(screen.getByRole("button", { name: i18n.details.useRegex }));
    await user.type(input, "/OK/");

    await waitFor(() => {
      expect(screen.getByText(i18n.details.searchMatchCount(1, 2))).toBeInTheDocument();
    });
  });

  it("closes search on Escape and removes highlights", async () => {
    const user = userEvent.setup();
    render(<CodeView text="token token" searchable />);

    await user.keyboard("{Control>}f{/Control}");
    const input = screen.getByRole("searchbox", { name: "Search response body" });
    await user.type(input, "token");

    await waitFor(() => {
      expect(document.querySelectorAll(".code-search-hit")).toHaveLength(2);
    });

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".code-search-hit")).toHaveLength(0);
  });
});
