import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  findCodeSearchMatches,
  formatCodeTextWithPrettier,
  normalizeCodeViewText,
  shouldDisableCodeFormatting,
  shouldDisableCodeHighlighting,
  tokenizeCode,
  type CodeLine,
  type CodeSearchMatch,
  type CodeToken
} from "./codeView";
import { i18n } from "./i18n";
import {
  defaultCodeSearchOptions,
  FloatingSearchBar,
  focusSearchInput,
  getSearchStatusText,
  useFloatingSearchHotkeys
} from "./searchUi";

type CodeViewProps = {
  text: string;
  mimeType?: string;
  searchable?: boolean;
};

export function CodeView({ text, mimeType, searchable = false }: CodeViewProps) {
  const normalizedText = useMemo(() => normalizeCodeViewText(text), [text]);
  const [displayText, setDisplayText] = useState(() => normalizedText);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOptions, setSearchOptions] = useState(defaultCodeSearchOptions);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const codeViewRef = useRef<HTMLDivElement>(null);
  const focusSearchInputRef = useRef(false);
  const formattingDisabled = shouldDisableCodeFormatting(normalizedText);
  const highlightingDisabled = shouldDisableCodeHighlighting(normalizedText);

  useEffect(() => {
    let cancelled = false;

    setDisplayText(normalizedText);
    void formatCodeTextWithPrettier(normalizedText, mimeType).then((formatted) => {
      if (!cancelled) {
        setDisplayText(normalizeCodeViewText(formatted));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mimeType, normalizedText]);

  useEffect(() => {
    if (searchable) {
      return;
    }

    setSearchOpen(false);
    setQuery("");
    setSearchOptions(defaultCodeSearchOptions);
    setActiveMatchIndex(0);
  }, [searchable]);

  const lines = useMemo(() => tokenizeCode(displayText, mimeType), [displayText, mimeType]);
  const lineStartOffsets = useMemo(() => buildLineStartOffsets(displayText), [displayText]);
  const searchResult = useMemo(() => {
    if (!searchable || !searchOpen || query.length === 0) {
      return { matches: [] as CodeSearchMatch[] };
    }

    return findCodeSearchMatches(displayText, query, searchOptions);
  }, [displayText, query, searchOpen, searchOptions, searchable]);
  const matches = searchResult.matches;
  const searchError = searchResult.error;
  const matchCount = matches.length;

  const goToMatch = useCallback(
    (direction: 1 | -1) => {
      if (matchCount === 0) {
        return;
      }

      setActiveMatchIndex((current) => {
        const base = current >= 0 && current < matchCount ? current : 0;
        return (base + direction + matchCount) % matchCount;
      });
    },
    [matchCount]
  );

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [query, searchOptions.matchCase, searchOptions.wholeWord, searchOptions.useRegex]);

  useEffect(() => {
    if (matchCount === 0) {
      if (activeMatchIndex !== 0) {
        setActiveMatchIndex(0);
      }
      return;
    }

    if (activeMatchIndex >= matchCount) {
      setActiveMatchIndex(matchCount - 1);
    }
  }, [activeMatchIndex, matchCount]);

  useFloatingSearchHotkeys({
    enabled: searchable,
    searchOpen,
    onOpen: () => {
      focusSearchInputRef.current = true;
      setSearchOpen(true);
    },
    onFocusInput: () => focusSearchInput(searchInputRef),
    onNavigate: goToMatch
  });

  useEffect(() => {
    if (!searchOpen || !focusSearchInputRef.current) {
      return;
    }

    focusSearchInput(searchInputRef);
    focusSearchInputRef.current = false;
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen || matchCount === 0 || !codeViewRef.current) {
      return;
    }

    const activeMatch = codeViewRef.current.querySelector(`[data-match-index="${activeMatchIndex}"]`);
    if (activeMatch instanceof HTMLElement) {
      activeMatch.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeMatchIndex, matchCount, query, searchOpen]);

  const statusText = getSearchStatusText({
    query,
    matchCount,
    activeMatchIndex,
    invalidRegex: searchError === "invalid-regex"
  });

  return (
    <div className={`code-view-shell${searchable && searchOpen ? " has-floating-search" : ""}`}>
      {searchable && searchOpen ? (
        <div className="floating-search-anchor">
          <FloatingSearchBar
            inputRef={searchInputRef}
            query={query}
            statusText={statusText}
            searchOptions={searchOptions}
            matchCount={matchCount}
            invalidRegex={searchError === "invalid-regex"}
            onQueryChange={setQuery}
            onOptionsChange={setSearchOptions}
            onNavigate={goToMatch}
            onClose={() => setSearchOpen(false)}
          />
        </div>
      ) : null}
      {highlightingDisabled ? <div className="code-view-notice">{i18n.details.largeCodeViewPlaintextFallback}</div> : null}
      {!highlightingDisabled && formattingDisabled ? <div className="code-view-notice">{i18n.details.largeCodeViewFormattingFallback}</div> : null}
      <div className="code-view-shell-body">
        <div className="code-view" ref={codeViewRef}>
          {lines.map((line, index) => (
            <div key={line.lineNumber} className="code-line">
              <span className="line-number">{line.lineNumber}</span>
              <code>
                {renderCodeLine(line, lineStartOffsets[index] ?? 0, matches, activeMatchIndex)}
              </code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function renderCodeLine(
  line: CodeLine,
  lineStart: number,
  matches: CodeSearchMatch[],
  activeMatchIndex: number
): ReactNode {
  let tokenOffset = lineStart;

  return line.tokens.map((token, tokenIndex) => {
    const node = renderToken(token, tokenOffset, tokenIndex, line.lineNumber, matches, activeMatchIndex);
    tokenOffset += token.text.length;
    return node;
  });
}

function renderToken(
  token: CodeToken,
  tokenStart: number,
  tokenIndex: number,
  lineNumber: number,
  matches: CodeSearchMatch[],
  activeMatchIndex: number
): ReactNode {
  if (token.text.length === 0 || matches.length === 0) {
    return (
      <span key={`${lineNumber}-${tokenIndex}`} className={`token-${token.kind}`}>
        {token.text}
      </span>
    );
  }

  const tokenEnd = tokenStart + token.text.length;
  const overlappingMatches = matches
    .map((match, matchIndex) => ({ ...match, matchIndex }))
    .filter((match) => match.end > tokenStart && match.start < tokenEnd);

  if (overlappingMatches.length === 0) {
    return (
      <span key={`${lineNumber}-${tokenIndex}`} className={`token-${token.kind}`}>
        {token.text}
      </span>
    );
  }

  const segments: ReactNode[] = [];
  let cursor = 0;

  overlappingMatches.forEach((match) => {
    const localStart = Math.max(0, match.start - tokenStart);
    const localEnd = Math.min(token.text.length, match.end - tokenStart);

    if (localStart > cursor) {
      segments.push(
        <span key={`${lineNumber}-${tokenIndex}-plain-${cursor}`}>{token.text.slice(cursor, localStart)}</span>
      );
    }

    if (localEnd > localStart) {
      segments.push(
        <span
          key={`${lineNumber}-${tokenIndex}-match-${match.matchIndex}-${localStart}`}
          className={`code-search-hit${match.matchIndex === activeMatchIndex ? " active" : ""}`}
          data-match-index={match.matchIndex}
        >
          {token.text.slice(localStart, localEnd)}
        </span>
      );
    }

    cursor = Math.max(cursor, localEnd);
  });

  if (cursor < token.text.length) {
    segments.push(<span key={`${lineNumber}-${tokenIndex}-plain-end`}>{token.text.slice(cursor)}</span>);
  }

  return (
    <span key={`${lineNumber}-${tokenIndex}`} className={`token-${token.kind}`}>
      {segments}
    </span>
  );
}

function buildLineStartOffsets(text: string): number[] {
  const offsets: number[] = [];
  let offset = 0;

  text.split("\n").forEach((line) => {
    offsets.push(offset);
    offset += line.length + 1;
  });

  return offsets;
}

