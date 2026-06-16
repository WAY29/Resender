import { useEffect } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import type { CodeSearchOptions } from "./codeView";
import { i18n } from "./i18n";

export const defaultCodeSearchOptions: CodeSearchOptions = {
  matchCase: false,
  wholeWord: false,
  useRegex: false
};

export function useFloatingSearchHotkeys(props: {
  enabled: boolean;
  searchOpen: boolean;
  onOpen: () => void;
  onFocusInput: () => void;
  onNavigate: (direction: 1 | -1) => void;
}) {
  useEffect(() => {
    if (!props.enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      const command = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (command && !event.altKey && key === "f") {
        stopSearchShortcutEvent(event);
        if (props.searchOpen) {
          props.onFocusInput();
        } else {
          props.onOpen();
        }
        return;
      }

      if (!props.searchOpen) {
        return;
      }

      if (command && !event.altKey && key === "g") {
        stopSearchShortcutEvent(event);
        props.onNavigate(event.shiftKey ? -1 : 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [props]);
}

export function focusSearchInput(inputRef: RefObject<HTMLInputElement | null>) {
  inputRef.current?.focus();
  inputRef.current?.select();
}

export function handleSearchInputKeyDown(
  event: ReactKeyboardEvent<HTMLInputElement>,
  actions: { goToMatch: (direction: 1 | -1) => void; onClose: () => void }
) {
  if (event.key === "Enter") {
    event.preventDefault();
    actions.goToMatch(event.shiftKey ? -1 : 1);
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    actions.onClose();
  }
}

export function getSearchStatusText(props: {
  query: string;
  matchCount: number;
  activeMatchIndex: number;
  invalidRegex: boolean;
}): string {
  if (props.query.length === 0) {
    return "";
  }

  if (props.invalidRegex) {
    return i18n.details.invalidRegex;
  }

  if (props.matchCount === 0) {
    return i18n.details.noMatches;
  }

  return i18n.details.searchMatchCount(props.activeMatchIndex + 1, props.matchCount);
}

export function FloatingSearchBar(props: {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  statusText: string;
  searchOptions: CodeSearchOptions;
  matchCount: number;
  invalidRegex: boolean;
  onQueryChange: (query: string) => void;
  onOptionsChange: (updater: (current: CodeSearchOptions) => CodeSearchOptions) => void;
  onNavigate: (direction: 1 | -1) => void;
  onClose: () => void;
}) {
  return (
    <div className="code-search-bar" role="search">
      <span className="code-search-icon" aria-hidden="true">
        <SearchIcon />
      </span>
      <input
        ref={props.inputRef}
        type="search"
        className={`code-search-input${props.invalidRegex ? " is-invalid" : ""}`}
        aria-label={i18n.details.search}
        placeholder={i18n.details.search}
        value={props.query}
        onChange={(event) => props.onQueryChange(event.currentTarget.value)}
        onKeyDown={(event) => handleSearchInputKeyDown(event, { goToMatch: props.onNavigate, onClose: props.onClose })}
      />
      <button
        type="button"
        className={`text-button code-search-toggle code-search-toggle-case${props.searchOptions.matchCase ? " active" : ""}`}
        aria-label={i18n.details.matchCase}
        title={i18n.details.matchCase}
        onClick={() => props.onOptionsChange((current) => ({ ...current, matchCase: !current.matchCase }))}
      >
        Aa
      </button>
      <button
        type="button"
        className={`text-button code-search-toggle code-search-toggle-word${props.searchOptions.wholeWord ? " active" : ""}`}
        aria-label={i18n.details.matchWholeWord}
        title={i18n.details.matchWholeWord}
        onClick={() => props.onOptionsChange((current) => ({ ...current, wholeWord: !current.wholeWord }))}
      >
        ab
      </button>
      <button
        type="button"
        className={`text-button code-search-toggle code-search-toggle-regex${props.searchOptions.useRegex ? " active" : ""}`}
        aria-label={i18n.details.useRegex}
        title={i18n.details.useRegex}
        onClick={() => props.onOptionsChange((current) => ({ ...current, useRegex: !current.useRegex }))}
      >
        (.*)
      </button>
      <button
        type="button"
        className="icon-button code-search-nav code-search-nav-previous"
        aria-label={i18n.details.previousMatch}
        title={i18n.details.previousMatch}
        disabled={props.matchCount === 0}
        onClick={() => props.onNavigate(-1)}
      >
        <ChevronUpIcon />
      </button>
      <button
        type="button"
        className="icon-button code-search-nav code-search-nav-next"
        aria-label={i18n.details.nextMatch}
        title={i18n.details.nextMatch}
        disabled={props.matchCount === 0}
        onClick={() => props.onNavigate(1)}
      >
        <ChevronDownIcon />
      </button>
      <span className={`code-search-status${props.invalidRegex ? " is-error" : ""}`}>{props.statusText}</span>
      <button
        type="button"
        className="icon-button code-search-close"
        aria-label={i18n.details.closeSearch}
        title={i18n.details.closeSearch}
        onClick={props.onClose}
      >
        <CloseSmallIcon />
      </button>
    </div>
  );
}

function stopSearchShortcutEvent(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  const nativeEvent = event as KeyboardEvent & { stopImmediatePropagation?: () => void };
  nativeEvent.stopImmediatePropagation?.();
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="m12.5 12.5 4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3.5 10 4.5-4 4.5 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3.5 6 4.5 4 4.5-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

function CloseSmallIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 4 12 12M12 4 4 12" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}
