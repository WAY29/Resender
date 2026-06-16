import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { findCodeSearchMatches, normalizeCodeViewText, type CodeSearchMatch } from "./codeView";
import {
  defaultCodeSearchOptions,
  FloatingSearchBar,
  focusSearchInput,
  getSearchStatusText,
  useFloatingSearchHotkeys
} from "./searchUi";
import {
  describeJsonValue,
  getJsonChildren,
  isJsonComposite,
  type JsonValue
} from "./preview";

type JsonPreviewSearchViewProps = {
  value: JsonValue;
  syncState: { expanded: boolean; version: number };
};

type SearchTextPart = {
  text: string;
  matchIndex?: number;
};

type SearchTextDescriptor = {
  value: string;
  parts: SearchTextPart[];
};

export function JsonPreviewSearchView({ value, syncState }: JsonPreviewSearchViewProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOptions, setSearchOptions] = useState(defaultCodeSearchOptions);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const focusSearchInputRef = useRef(false);

  const searchResult = useMemo(() => {
    if (!searchOpen || query.length === 0) {
      return { matches: [] as CodeSearchMatch[] };
    }

    return findCodeSearchMatches(buildJsonSearchText(value), query, searchOptions);
  }, [query, searchOpen, searchOptions, value]);
  const matches = searchResult.matches;
  const matchCount = matches.length;
  const searchError = searchResult.error;

  const searchContext = useMemo(
    () => createJsonSearchContext(value, searchOpen ? matches : [], activeMatchIndex),
    [activeMatchIndex, matches, searchOpen, value]
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
    enabled: true,
    searchOpen,
    onOpen: () => {
      focusSearchInputRef.current = true;
      setSearchOpen(true);
    },
    onFocusInput: () => focusSearchInput(searchInputRef),
    onNavigate: (direction) => {
      if (matchCount === 0) {
        return;
      }

      setActiveMatchIndex((current) => {
        const base = current >= 0 && current < matchCount ? current : 0;
        return (base + direction + matchCount) % matchCount;
      });
    }
  });

  useEffect(() => {
    if (!searchOpen || !focusSearchInputRef.current) {
      return;
    }

    focusSearchInput(searchInputRef);
    focusSearchInputRef.current = false;
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen || matchCount === 0 || !treeRef.current) {
      return;
    }

    const activeMatch = treeRef.current.querySelector(`[data-match-index="${activeMatchIndex}"]`);
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
    <div className={`preview-search-shell${searchOpen ? " has-search-dock" : ""}`}>
      <div className="json-tree" role="tree" ref={treeRef}>
        <JsonPreviewSearchNode
          nodeKey={Array.isArray(value) ? "[]" : "{}"}
          value={value}
          depth={0}
          defaultExpanded
          syncState={syncState}
          path="$"
          searchContext={searchContext}
        />
      </div>
      {searchOpen ? (
        <div className="search-dock">
          <FloatingSearchBar
            inputRef={searchInputRef}
            query={query}
            statusText={statusText}
            searchOptions={searchOptions}
            matchCount={matchCount}
            invalidRegex={searchError === "invalid-regex"}
            onQueryChange={setQuery}
            onOptionsChange={setSearchOptions}
            onNavigate={(direction) => {
              if (matchCount === 0) {
                return;
              }

              setActiveMatchIndex((current) => {
                const base = current >= 0 && current < matchCount ? current : 0;
                return (base + direction + matchCount) % matchCount;
              });
            }}
            onClose={() => setSearchOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

function JsonPreviewSearchNode(props: {
  nodeKey: string;
  value: JsonValue;
  depth: number;
  defaultExpanded?: boolean;
  syncState: { expanded: boolean; version: number };
  path: string;
  searchContext: JsonSearchContext;
}) {
  const composite = isJsonComposite(props.value);
  const [expanded, setExpanded] = useState(() => props.defaultExpanded ?? props.depth < 1);

  useEffect(() => {
    if (!composite) {
      return;
    }

    setExpanded(props.syncState.expanded);
  }, [composite, props.syncState]);

  useEffect(() => {
    if (!composite || !props.searchContext.activeMatchPath) {
      return;
    }

    if (props.searchContext.activeMatchPath.startsWith(`${props.path}.`)) {
      setExpanded(true);
    }
  }, [composite, props.path, props.searchContext.activeMatchPath]);

  const keyText = props.depth === 0 ? props.nodeKey : props.nodeKey;
  const summaryText = composite ? describeJsonValue(props.value) : undefined;
  const valueText = composite ? undefined : describeJsonValue(props.value);

  const keyDescriptor = props.searchContext.descriptors.get(`${props.path}:key`) ?? { value: keyText, parts: [{ text: keyText }] };
  const summaryDescriptor = summaryText
    ? props.searchContext.descriptors.get(`${props.path}:summary`) ?? { value: summaryText, parts: [{ text: summaryText }] }
    : undefined;
  const valueDescriptor = valueText
    ? props.searchContext.descriptors.get(`${props.path}:value`) ?? { value: valueText, parts: [{ text: valueText }] }
    : undefined;

  if (!composite) {
    return (
      <div className="json-node json-leaf" style={{ "--json-depth": props.depth } as CSSProperties}>
        <span className="json-key">{renderSearchParts(keyDescriptor, props.searchContext.activeMatchIndex)}</span>
        <span className="json-separator">:</span>
        <span className={`json-value json-value-${typeof props.value === "string" ? "string" : props.value === null ? "null" : typeof props.value}`}>
          {valueDescriptor ? renderSearchParts(valueDescriptor, props.searchContext.activeMatchIndex) : null}
        </span>
      </div>
    );
  }

  const children = getJsonChildren(props.value);

  return (
    <div className="json-node-group" style={{ "--json-depth": props.depth } as CSSProperties}>
      <button
        type="button"
        className="json-node json-node-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className={`json-chevron ${expanded ? "is-expanded" : ""}`} aria-hidden="true">
          <ChevronDownIcon />
        </span>
        <span className="json-key">{renderSearchParts(keyDescriptor, props.searchContext.activeMatchIndex)}</span>
        <span className="json-separator">:</span>
        <span className="json-summary">
          {summaryDescriptor ? renderSearchParts(summaryDescriptor, props.searchContext.activeMatchIndex) : null}
        </span>
      </button>
      {expanded ? (
        <div className="json-children" role="group">
          {children.map((child) => (
            <JsonPreviewSearchNode
              key={child.key}
              nodeKey={child.key}
              value={child.value}
              depth={props.depth + 1}
              syncState={props.syncState}
              path={`${props.path}.${child.key}`}
              searchContext={props.searchContext}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type JsonSearchContext = {
  descriptors: Map<string, SearchTextDescriptor>;
  activeMatchIndex: number;
  matchedPaths: Set<string>;
  activeMatchPath?: string;
};

function createJsonSearchContext(
  value: JsonValue,
  matches: CodeSearchMatch[],
  activeMatchIndex: number
): JsonSearchContext {
  const descriptors = new Map<string, SearchTextDescriptor>();
  const matchedPaths = new Set<string>();
  const activeMatchPathRef: { value?: string } = {};
  const offsets = { value: 0 };
  collectJsonSearchDescriptors(value, "$", matches, descriptors, matchedPaths, activeMatchPathRef, offsets, activeMatchIndex, true);
  return { descriptors, activeMatchIndex, matchedPaths, activeMatchPath: activeMatchPathRef.value };
}

function collectJsonSearchDescriptors(
  value: JsonValue,
  path: string,
  matches: CodeSearchMatch[],
  descriptors: Map<string, SearchTextDescriptor>,
  matchedPaths: Set<string>,
  activeMatchPathRef: { value?: string },
  offsets: { value: number },
  activeMatchIndex: number,
  isRoot = false
) {
  const nodeKey = isRoot ? (Array.isArray(value) ? "[]" : "{}") : path.slice(path.lastIndexOf(".") + 1);
  const keyDescriptor = buildSearchTextDescriptor(nodeKey, matches, offsets.value);
  descriptors.set(`${path}:key`, keyDescriptor);
  markJsonMatchPath(path, keyDescriptor, matchedPaths, activeMatchPathRef, activeMatchIndex);
  offsets.value += nodeKey.length + 1;

  if (isJsonComposite(value)) {
    const summary = describeJsonValue(value);
    const summaryDescriptor = buildSearchTextDescriptor(summary, matches, offsets.value);
    descriptors.set(`${path}:summary`, summaryDescriptor);
    markJsonMatchPath(path, summaryDescriptor, matchedPaths, activeMatchPathRef, activeMatchIndex);
    offsets.value += summary.length + 1;

    getJsonChildren(value).forEach((child) => {
      collectJsonSearchDescriptors(child.value, `${path}.${child.key}`, matches, descriptors, matchedPaths, activeMatchPathRef, offsets, activeMatchIndex);
    });
    return;
  }

  const display = describeJsonValue(value);
  const valueDescriptor = buildSearchTextDescriptor(display, matches, offsets.value);
  descriptors.set(`${path}:value`, valueDescriptor);
  markJsonMatchPath(path, valueDescriptor, matchedPaths, activeMatchPathRef, activeMatchIndex);
  offsets.value += display.length + 1;
}

function markJsonMatchPath(
  path: string,
  descriptor: SearchTextDescriptor,
  matchedPaths: Set<string>,
  activeMatchPathRef: { value?: string },
  activeMatchIndex: number
) {
  const descriptorMatchIndexes = descriptor.parts
    .map((part) => part.matchIndex)
    .filter((matchIndex): matchIndex is number => matchIndex !== undefined);

  if (descriptorMatchIndexes.length === 0) {
    return;
  }

  matchedPaths.add(path);
  if (descriptorMatchIndexes.includes(activeMatchIndex)) {
    activeMatchPathRef.value = path;
  }
}

function buildJsonSearchText(value: JsonValue): string {
  const chunks: string[] = [];
  appendJsonSearchText(value, chunks, true);
  return normalizeCodeViewText(chunks.join("\n"));
}

function appendJsonSearchText(value: JsonValue, chunks: string[], isRoot = false, nodeKey?: string) {
  const currentKey = isRoot ? (Array.isArray(value) ? "[]" : "{}") : nodeKey ?? "";
  chunks.push(currentKey);

  if (isJsonComposite(value)) {
    chunks.push(describeJsonValue(value));
    getJsonChildren(value).forEach((child) => appendJsonSearchText(child.value, chunks, false, child.key));
    return;
  }

  chunks.push(describeJsonValue(value));
}

function buildSearchTextDescriptor(text: string, matches: CodeSearchMatch[], textStart: number): SearchTextDescriptor {
  if (text.length === 0 || matches.length === 0) {
    return { value: text, parts: [{ text }] };
  }

  const textEnd = textStart + text.length;
  const overlappingMatches = matches
    .map((match, matchIndex) => ({ ...match, matchIndex }))
    .filter((match) => match.end > textStart && match.start < textEnd);

  if (overlappingMatches.length === 0) {
    return { value: text, parts: [{ text }] };
  }

  const parts: SearchTextPart[] = [];
  let cursor = 0;

  overlappingMatches.forEach((match) => {
    const localStart = Math.max(0, match.start - textStart);
    const localEnd = Math.min(text.length, match.end - textStart);

    if (localStart > cursor) {
      parts.push({ text: text.slice(cursor, localStart) });
    }

    if (localEnd > localStart) {
      parts.push({ text: text.slice(localStart, localEnd), matchIndex: match.matchIndex });
    }

    cursor = Math.max(cursor, localEnd);
  });

  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor) });
  }

  return { value: text, parts };
}

function renderSearchParts(descriptor: SearchTextDescriptor, activeMatchIndex: number): ReactNode {
  return descriptor.parts.map((part, index) => {
    if (part.matchIndex === undefined) {
      return <span key={`${descriptor.value}-${index}`}>{part.text}</span>;
    }

    return (
      <span
        key={`${descriptor.value}-${index}`}
        className={`code-search-hit${part.matchIndex === activeMatchIndex ? " active" : ""}`}
        data-match-index={part.matchIndex}
      >
        {part.text}
      </span>
    );
  });
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3.5 6 4.5 4 4.5-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}
