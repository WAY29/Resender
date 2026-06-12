import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, SyntheticEvent } from "react";
import type { FilterState, NetworkRecord } from "../types";
import {
  applyFilterAutocompleteSuggestion,
  getFilterAutocomplete,
  getFilterNotices,
  moveFilterAutocompleteIndex,
  parseNetworkFilterQuery,
  type FilterAutocompleteSuggestion,
  type FilterIssue,
  type FilterNotice
} from "./filters";
import { getFilterTypes, i18n } from "./i18n";

const filterTypes = getFilterTypes();

export function NetworkFilterBar(props: {
  filter: FilterState;
  records: NetworkRecord[];
  onFilterChange: (filter: FilterState) => void;
}) {
  const parsedQuery = useMemo(() => parseNetworkFilterQuery(props.filter.query), [props.filter.query]);
  const notices = useMemo(() => getFilterNotices(parsedQuery, props.records), [parsedQuery, props.records]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [autocomplete, setAutocomplete] = useState(() => getFilterAutocomplete(props.filter.query, props.filter.query.length));
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [pendingCaret, setPendingCaret] = useState<number | null>(null);
  const listboxId = useId();

  const hasSuggestions = Boolean(autocomplete?.suggestions.length);
  const isAutocompleteOpen = isFocused && hasSuggestions;
  const activeSuggestion = isAutocompleteOpen ? autocomplete?.suggestions[highlightedIndex] : undefined;
  const feedback = buildFilterFeedback(parsedQuery.issues, notices);

  useEffect(() => {
    if (!isFocused || !inputRef.current) {
      return;
    }

    const caret = inputRef.current.selectionStart ?? props.filter.query.length;
    updateAutocomplete(props.filter.query, caret);
  }, [isFocused, props.filter.query]);

  useLayoutEffect(() => {
    if (pendingCaret === null || !inputRef.current) {
      return;
    }

    inputRef.current.focus();
    inputRef.current.setSelectionRange(pendingCaret, pendingCaret);
    setPendingCaret(null);
  }, [pendingCaret, props.filter.query]);

  function updateAutocomplete(query: string, caret: number) {
    const nextAutocomplete = getFilterAutocomplete(query, caret);
    setAutocomplete(nextAutocomplete);
    setHighlightedIndex(0);
  }

  function closeAutocomplete() {
    setAutocomplete(null);
    setHighlightedIndex(0);
  }

  function handleInputChange(event: SyntheticEvent<HTMLInputElement>) {
    const nextQuery = event.currentTarget.value;
    const nextCaret = event.currentTarget.selectionStart ?? nextQuery.length;
    props.onFilterChange({ ...props.filter, query: nextQuery });
    updateAutocomplete(nextQuery, nextCaret);
  }

  function acceptSuggestion(suggestion: FilterAutocompleteSuggestion) {
    const applied = applyFilterAutocompleteSuggestion(props.filter.query, suggestion);
    props.onFilterChange({ ...props.filter, query: applied.query });
    setPendingCaret(applied.caret);
    setAutocomplete(getFilterAutocomplete(applied.query, applied.caret));
    setHighlightedIndex(0);
  }

  function syncAutocompleteFromInput() {
    if (!inputRef.current) {
      closeAutocomplete();
      return;
    }

    const caret = inputRef.current.selectionStart ?? props.filter.query.length;
    updateAutocomplete(props.filter.query, caret);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isAutocompleteOpen || !autocomplete) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) =>
        moveFilterAutocompleteIndex(current, autocomplete.suggestions.length, "next")
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) =>
        moveFilterAutocompleteIndex(current, autocomplete.suggestions.length, "previous")
      );
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      acceptSuggestion(autocomplete.suggestions[highlightedIndex]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeAutocomplete();
    }
  }

  function handleSuggestionMouseDown(event: MouseEvent<HTMLButtonElement>, suggestion: FilterAutocompleteSuggestion) {
    event.preventDefault();
    acceptSuggestion(suggestion);
  }

  return (
    <div className="toolbar-row toolbar-filters">
      <div className="filter-stack">
        <div className="filter-field-shell">
          <label className="filter-box">
            <FilterIcon />
            <input
              ref={inputRef}
              value={props.filter.query}
              aria-label={i18n.toolbar.filter}
              aria-autocomplete="list"
              aria-controls={isAutocompleteOpen ? listboxId : undefined}
              aria-expanded={isAutocompleteOpen}
              aria-activedescendant={activeSuggestion ? activeSuggestion.id : undefined}
              placeholder={i18n.toolbar.filterPlaceholder}
              onChange={handleInputChange}
              onFocus={() => {
                setIsFocused(true);
                syncAutocompleteFromInput();
              }}
              onBlur={() => {
                setIsFocused(false);
                closeAutocomplete();
              }}
              onClick={syncAutocompleteFromInput}
              onKeyUp={(event) => {
                if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                  syncAutocompleteFromInput();
                }
              }}
              onKeyDown={handleInputKeyDown}
              onSelect={syncAutocompleteFromInput}
            />
          </label>
          {isAutocompleteOpen && autocomplete ? (
            <div className="filter-autocomplete" id={listboxId} role="listbox" aria-label={i18n.toolbar.filterSuggestions}>
              {autocomplete.suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.id}
                  id={suggestion.id}
                  type="button"
                  role="option"
                  aria-selected={index === highlightedIndex}
                  className={`filter-autocomplete-option ${index === highlightedIndex ? "active" : ""}`}
                  onMouseDown={(event) => handleSuggestionMouseDown(event, suggestion)}
                >
                  <span className="filter-autocomplete-label">{suggestion.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {feedback.length > 0 ? (
          <div className="filter-feedback warning">
            {feedback.map((message, index) => (
              <span key={`${index}-${message}`}>{message}</span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="toolbar-filter-controls">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={props.filter.invert}
            onChange={(event) =>
              props.onFilterChange({ ...props.filter, invert: event.currentTarget.checked })
            }
          />
          {i18n.toolbar.invert}
        </label>
        <button type="button" className="text-button disabled" disabled>
          {i18n.toolbar.moreFilters}
        </button>
        <div className="type-chips">
          {filterTypes.map((filterType) => (
            <button
              key={filterType.id}
              type="button"
              className={props.filter.type === filterType.id ? "active" : ""}
              onClick={() => props.onFilterChange({ ...props.filter, type: filterType.id })}
            >
              {filterType.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildFilterFeedback(issues: FilterIssue[], notices: FilterNotice[]): string[] {
  return [...issues.map(getFilterIssueMessage), ...notices.map(getFilterNoticeMessage)];
}

function getFilterIssueMessage(issue: FilterIssue): string {
  switch (issue.code) {
    case "unsupported-key":
      return i18n.toolbar.filterIssueUnsupportedKey(issue.raw);
    case "invalid-regex":
      return i18n.toolbar.filterIssueInvalidRegex(issue.raw);
    case "invalid-larger-than":
      return i18n.toolbar.filterIssueInvalidLargerThan(issue.raw);
    case "invalid-status-code":
      return i18n.toolbar.filterIssueInvalidStatusCode(issue.raw);
    case "invalid-resource-type":
      return i18n.toolbar.filterIssueInvalidResourceType(issue.raw);
    case "invalid-property-value":
      return i18n.toolbar.filterIssueInvalidPropertyValue(issue.raw);
  }
}

function getFilterNoticeMessage(notice: FilterNotice): string {
  switch (notice.code) {
    case "approximate-larger-than":
      return i18n.toolbar.filterNoticeApproximateLargerThan;
  }
}

function FilterIcon() {
  return (
    <svg className="filter-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 5H16L11.2 10.55V15.2L8.8 16.4V10.55L4 5Z" />
    </svg>
  );
}
