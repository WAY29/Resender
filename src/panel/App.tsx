import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FocusEvent } from "react";
import type {
  BodyCapture,
  FilterState,
  HeaderPair,
  NetworkRecord,
  ResendDraft
} from "../types";
import {
  configureCaptureHook,
  drainCaptureHook,
  hasChromeDevTools,
  installCaptureHook,
  openSourceLocation,
  resendFromPage
} from "./chromeApi";
import { matchesFilter } from "./filters";
import { formatBytes, formatDuration } from "./format";
import {
  applyHarResponseBody,
  findMergeTarget,
  linkRedirectRecords,
  mergeRecords,
  normaliseHarEntry,
  normaliseHookRecord,
  normaliseResendResult
} from "./records";
import {
  findHeader,
  isContentTypeHeader,
  isProtectedRequestHeader,
  removeHeaderAt,
  splitEditableHeaders
} from "./headers";
import { formatCodeTextWithPrettier, tokenizeCode, warmPrettierForMimeType } from "./codeView";
import { getNetworkIconData, NetworkIcon } from "./networkIcons";
import {
  ensureContentTypeHeader,
  removeAutoAddedEmptyContentType,
  syncAutoAddedContentTypeIndex
} from "./methodTransitions";
import {
  normaliseUrlQueryEncoding,
  parseQueryParams,
  replaceUrlQuery
} from "./queryParams";
import { nextSortState, sortRecords, type SortColumn, type SortState } from "./requestSort";
import { getFilterTypes, getRequestColumns, i18n, translateReason } from "./i18n";
import { parseImportedRecords } from "./importExport";
import "./styles.css";

const defaultFilter: FilterState = {
  query: "",
  invert: false,
  type: "all"
};

type DetailTab = "headers" | "payload" | "response";

const filterTypes = getFilterTypes();
const requestColumns = getRequestColumns();
const commonContentTypeValues = [
  "application/json",
  "application/x-www-form-urlencoded",
  "text/plain",
  "multipart/form-data"
] as const;

const defaultColumnWidths = requestColumns.reduce<Record<SortColumn, number>>((widths, column) => {
  widths[column.id] = column.defaultWidth;
  return widths;
}, {} as Record<SortColumn, number>);

export function App() {
  const [records, setRecords] = useState<NetworkRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [filter, setFilter] = useState<FilterState>(defaultFilter);
  const [captureEnabled, setCaptureEnabled] = useState(true);
  const [preserveLog, setPreserveLog] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bodyLimitMb, setBodyLimitMb] = useState(2);
  const [focusResponseAfterResend, setFocusResponseAfterResend] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string>();
  const [listWidthPercent, setListWidthPercent] = useState(58);
  const [sortState, setSortState] = useState<SortState>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("headers");
  const [columnWidths, setColumnWidths] = useState<Record<SortColumn, number>>(defaultColumnWidths);
  const harSequence = useRef(0);
  const workbenchRef = useRef<HTMLElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const captureEnabledRef = useRef(captureEnabled);

  const bodyLimitBytes = Math.max(1, bodyLimitMb) * 1024 * 1024;
  const selectedRecord = records.find((record) => record.id === selectedId);

  const filteredRecords = useMemo(
    () => sortRecords(records.filter((record) => matchesFilter(record, filter)), sortState),
    [records, filter, sortState]
  );

  const requestGridTemplate = useMemo(
    () => `34px ${requestColumns.map((column) => `${columnWidths[column.id]}px`).join(" ")}`,
    [columnWidths]
  );

  useEffect(() => {
    captureEnabledRef.current = captureEnabled;
  }, [captureEnabled]);

  useEffect(() => {
    if (!hasChromeDevTools()) {
      setStatusMessage(i18n.status.openInDevTools);
      return;
    }

    chrome.devtools.network.getHAR((harLog) => {
      if (!captureEnabledRef.current) {
        return;
      }

      const initialRecords = harLog.entries.map((entry) => {
        harSequence.current += 1;
        const id = `har:initial:${harSequence.current}`;
        const record = normaliseHarEntry(entry, id);
        captureHarContent(entry, record);
        return record;
      });
      setRecords((current) => upsertMany(current, initialRecords));
    });

    const requestFinished = (entry: chrome.devtools.network.Request) => {
      if (!captureEnabledRef.current) {
        return;
      }

      harSequence.current += 1;
      const id = `har:live:${harSequence.current}`;
      const record = normaliseHarEntry(entry, id);
      setRecords((current) => upsertMany(current, [record]));
      captureHarContent(entry, record);
    };

    chrome.devtools.network.onRequestFinished.addListener(requestFinished);

    return () => {
      chrome.devtools.network.onRequestFinished.removeListener(requestFinished);
    };
  }, []);

  function captureHarContent(entry: chrome.devtools.network.HAREntry, record: NetworkRecord) {
    if (!hasGetContent(entry)) {
      return;
    }

    entry.getContent((content, encoding) => {
      setRecords((current) => {
        const index = findHarContentTargetIndex(current, record);
        if (index === -1) {
          return current;
        }

        const next = [...current];
        if (!captureEnabledRef.current && !next[index].resent) {
          return current;
        }
        next[index] = applyHarResponseBody(next[index], content, encoding);
        return linkRedirectRecords(next);
      });
    });
  }

  useEffect(() => {
    let cancelled = false;

    installCaptureHook(bodyLimitBytes, captureEnabled)
      .then(() => {
        return;
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setCaptureEnabled(false);
          setStatusMessage(i18n.status.captureInjectionFailed(error.message));
        }
      });

    const poll = window.setInterval(() => {
      if (!captureEnabledRef.current) {
        return;
      }

      drainCaptureHook()
        .then((hookRecords) => {
          if (hookRecords.length === 0) return;
          const normalised = hookRecords.map((record) => normaliseHookRecord(record, record.frameId));
          setRecords((current) => upsertMany(current, normalised));
        })
        .catch((error: Error) => {
          setStatusMessage(i18n.status.capturePollingFailed(error.message));
        });
    }, 500);

    const reinject = window.setInterval(() => {
      installCaptureHook(bodyLimitBytes, captureEnabledRef.current).catch(() => {
        // New frames may be inaccessible. Polling errors are surfaced separately.
      });
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearInterval(reinject);
    };
  }, [bodyLimitBytes, captureEnabled]);

  useEffect(() => {
    configureCaptureHook({ bodyLimitBytes, captureEnabled }).catch((error: Error) => {
      setStatusMessage(i18n.status.updateLimitFailed(error.message));
    });
  }, [bodyLimitBytes, captureEnabled]);

  function clearRecords() {
    setRecords([]);
    setSelectedId(undefined);
  }

  function selectRecord(id: string) {
    if (selectedId === id) {
      setSelectedId(undefined);
      return;
    }

    if (!selectedId) {
      setDetailTab("headers");
    }
    setSelectedId(id);
  }

  function exportEnhancedHar() {
    const payload = {
      tool: "Resender",
      version: "0.2.2",
      exportedAt: new Date().toISOString(),
      bodyLimitBytes,
      records
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `resender-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function importEnhancedHar(file: File | undefined) {
    if (!file) {
      return;
    }

    try {
      const importedRecords = parseImportedRecords(await file.text());
      setRecords((current) => upsertMany(current, importedRecords));
      setStatusMessage(undefined);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <main className="app-shell">
      <Toolbar
        captureEnabled={captureEnabled}
        filter={filter}
        preserveLog={preserveLog}
        settingsOpen={settingsOpen}
        bodyLimitMb={bodyLimitMb}
        focusResponseAfterResend={focusResponseAfterResend}
        onCaptureToggle={() => setCaptureEnabled((enabled) => !enabled)}
        onClear={clearRecords}
        onImport={() => importInputRef.current?.click()}
        onExport={exportEnhancedHar}
        onFilterChange={setFilter}
        onPreserveLogChange={setPreserveLog}
        onSettingsOpenChange={setSettingsOpen}
        onBodyLimitMbChange={setBodyLimitMb}
        onFocusResponseAfterResendChange={setFocusResponseAfterResend}
      />
      <input
        ref={importInputRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          void importEnhancedHar(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />

      {statusMessage ? (
        <div className="status-bar">
          <span>{statusMessage}</span>
          <button type="button" onClick={() => setStatusMessage(undefined)}>
            {i18n.toolbar.dismiss}
          </button>
        </div>
      ) : null}

      <section className="workbench" ref={workbenchRef}>
        <RequestTable
          records={filteredRecords}
          selectedId={selectedId}
          onSelect={selectRecord}
          onSortChange={(column) => setSortState((current) => nextSortState(current, column))}
          onColumnResize={(column, width) =>
            setColumnWidths((current) => ({ ...current, [column]: width }))
          }
          listWidthPercent={listWidthPercent}
          gridTemplate={requestGridTemplate}
          columnWidths={columnWidths}
          sortState={sortState}
          isDetailsOpen={Boolean(selectedRecord)}
        />
        {selectedRecord ? (
          <>
            <button
              type="button"
              className="splitter"
              aria-label={i18n.table.resizeListDetails}
              onPointerDown={(event) => {
                const bounds = workbenchRef.current?.getBoundingClientRect();
                if (!bounds) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                const resize = (moveEvent: PointerEvent) => {
                  const next = ((moveEvent.clientX - bounds.left) / bounds.width) * 100;
                  setListWidthPercent(Math.min(78, Math.max(28, next)));
                };
                const stop = () => {
                  window.removeEventListener("pointermove", resize);
                  window.removeEventListener("pointerup", stop);
                };
                window.addEventListener("pointermove", resize);
                window.addEventListener("pointerup", stop);
              }}
            />
            <RequestDetails
              record={selectedRecord}
              bodyLimitBytes={bodyLimitBytes}
              activeTab={detailTab}
              onClose={() => setSelectedId(undefined)}
              onActiveTabChange={setDetailTab}
              onResendRecord={(record) => {
                setRecords((current) => upsertMany(current, [record]));
                setSelectedId(record.id);
                if (focusResponseAfterResend) {
                  setDetailTab("response");
                }
              }}
              onStatus={setStatusMessage}
            />
          </>
        ) : null}
      </section>
    </main>
  );
}

function Toolbar(props: {
  captureEnabled: boolean;
  filter: FilterState;
  preserveLog: boolean;
  settingsOpen: boolean;
  bodyLimitMb: number;
  focusResponseAfterResend: boolean;
  onCaptureToggle: () => void;
  onClear: () => void;
  onImport: () => void;
  onExport: () => void;
  onFilterChange: (filter: FilterState) => void;
  onPreserveLogChange: (preserve: boolean) => void;
  onSettingsOpenChange: (open: boolean) => void;
  onBodyLimitMbChange: (limit: number) => void;
  onFocusResponseAfterResendChange: (focus: boolean) => void;
}) {
  return (
    <header className="toolbar">
      <div className="toolbar-row toolbar-primary">
        <button
          type="button"
          className={`icon-button record-button ${props.captureEnabled ? "is-recording" : ""}`}
          title={props.captureEnabled ? i18n.toolbar.stopCapture : i18n.toolbar.startCapture}
          onClick={props.onCaptureToggle}
        >
          <RecordCaptureIcon recording={props.captureEnabled} />
        </button>
        <button type="button" className="icon-button clear-button" title={i18n.toolbar.clear} onClick={props.onClear}>
          <ClearIcon />
        </button>
        <div className="toolbar-divider" />
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={props.preserveLog}
            onChange={(event) => props.onPreserveLogChange(event.currentTarget.checked)}
          />
          {i18n.toolbar.preserveLog}
        </label>
        <button type="button" className="icon-button transfer-button" title={i18n.toolbar.import} onClick={props.onImport}>
          <ImportIcon />
        </button>
        <button type="button" className="icon-button transfer-button" title={i18n.toolbar.export} onClick={props.onExport}>
          <ExportIcon />
        </button>
        <button
          type="button"
          className="icon-button settings-button"
          title={i18n.toolbar.settings}
          onClick={() => props.onSettingsOpenChange(!props.settingsOpen)}
        >
          <GearIcon />
        </button>
        {props.settingsOpen ? (
          <div className="settings-popover">
            <label>
              {i18n.toolbar.bodyLimit}
              <span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={props.bodyLimitMb}
                  onChange={(event) => props.onBodyLimitMbChange(Number(event.currentTarget.value))}
                />
                MB
              </span>
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={props.focusResponseAfterResend}
                onChange={(event) => props.onFocusResponseAfterResendChange(event.currentTarget.checked)}
              />
              {i18n.toolbar.focusResponseAfterResend}
            </label>
          </div>
        ) : null}
      </div>

      <div className="toolbar-row toolbar-filters">
        <label className="filter-box">
          <FilterIcon />
          <input
            value={props.filter.query}
            aria-label={i18n.toolbar.filter}
            placeholder={i18n.toolbar.filterPlaceholder}
            onChange={(event) =>
              props.onFilterChange({ ...props.filter, query: event.currentTarget.value })
            }
          />
        </label>
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
    </header>
  );
}

function RequestTable(props: {
  records: NetworkRecord[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onSortChange: (column: SortColumn) => void;
  onColumnResize: (column: SortColumn, width: number) => void;
  listWidthPercent: number;
  gridTemplate: string;
  columnWidths: Record<SortColumn, number>;
  sortState: SortState;
  isDetailsOpen: boolean;
}) {
  const requestListStyle = {
    width: props.isDetailsOpen ? `${props.listWidthPercent}%` : "100%",
    "--request-columns": props.gridTemplate
  } as CSSProperties;

  return (
    <section className="request-list" style={requestListStyle}>
      <div className="request-header request-row">
        <span className="request-type-spacer" aria-hidden="true" />
        {requestColumns.map((column) => (
          <div
            key={column.id}
            className={`request-header-cell ${props.sortState?.column === column.id ? "active" : ""}`}
          >
            <button
              type="button"
              className="sort-header"
              onClick={() => props.onSortChange(column.id)}
              aria-label={i18n.table.sortColumn(
                column.label,
                props.sortState?.column === column.id ? props.sortState.direction : "none"
              )}
            >
              <span>{column.label}</span>
              {props.sortState?.column === column.id ? (
                <SortIcon direction={props.sortState.direction} />
              ) : null}
            </button>
            <span
              className="column-resizer"
              role="separator"
              aria-label={i18n.table.resizeColumn(column.label)}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const startX = event.clientX;
                const startWidth = props.columnWidths[column.id];
                const resize = (moveEvent: PointerEvent) => {
                  const nextWidth = Math.max(column.minWidth, Math.round(startWidth + moveEvent.clientX - startX));
                  props.onColumnResize(column.id, nextWidth);
                };
                const stop = () => {
                  window.removeEventListener("pointermove", resize);
                  window.removeEventListener("pointerup", stop);
                };
                window.addEventListener("pointermove", resize);
                window.addEventListener("pointerup", stop);
              }}
            />
          </div>
        ))}
      </div>
      <div className="request-body">
        {props.records.length === 0 ? (
          <div className="empty-state">{i18n.table.noRequests}</div>
        ) : (
          props.records.map((record) => (
            <button
              key={record.id}
              type="button"
              className={`request-row request-item ${props.selectedId === record.id ? "selected" : ""}`}
              onClick={() => props.onSelect(record.id)}
            >
              <RequestTypeIcon record={record} />
              <span className="name-cell" title={record.url}>
                {record.resent ? <ResenderIcon title={i18n.table.resentRequest} /> : null}
                {record.name}
              </span>
              <span>{record.method}</span>
              <span title={record.domain}>{record.domain}</span>
              <span className={`status-cell ${statusClassName(record.status)}`}>
                <span>{record.status ?? "-"}</span>
                {record.redirectSourceId ? (
                  <RedirectJumpButton
                    direction="source"
                    onClick={() => props.onSelect(record.redirectSourceId!)}
                  />
                ) : null}
                {record.redirectTargetId ? (
                  <RedirectJumpButton
                    direction="target"
                    onClick={() => props.onSelect(record.redirectTargetId!)}
                  />
                ) : null}
              </span>
              <span>{record.type}</span>
              <span className="initiator-cell" title={record.initiator}>
                <InitiatorCell record={record} />
              </span>
              <span>{record.sizeText}</span>
              <span>{formatDuration(record.timeMs)}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function RedirectJumpButton(props: { direction: "source" | "target"; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`redirect-jump ${props.direction}`}
      title={props.direction === "target" ? i18n.table.jumpToRedirectedRequest : i18n.table.jumpToRedirectSource}
      onClick={(event) => {
        event.stopPropagation();
        props.onClick();
      }}
    >
      {props.direction === "target" ? "->" : "<-"}
    </button>
  );
}

function InitiatorCell({ record }: { record: NetworkRecord }) {
  if (!record.initiator) {
    return "-";
  }

  if (!record.initiatorLocation) {
    return record.initiator;
  }

  return (
    <button
      type="button"
      className="initiator-link"
      title={`${record.initiatorLocation.url}:${(record.initiatorLocation.lineNumber ?? 0) + 1}`}
      onClick={(event) => {
        event.stopPropagation();
        if (!openSourceLocation(record.initiatorLocation!)) {
          window.open(record.initiatorLocation!.url, "_blank", "noopener,noreferrer");
        }
      }}
    >
      {record.initiator}
    </button>
  );
}

function RequestTypeIcon({ record }: { record: NetworkRecord }) {
  const icon = getNetworkIconData(record);
  return (
    <span
      className="request-type-icon"
      title={icon.label}
      aria-label={icon.label}
      style={{ color: `var(${icon.colorVar})` }}
    >
      <NetworkIcon iconName={icon.iconName} />
    </span>
  );
}

function SortIcon({ direction }: { direction: "asc" | "desc" }) {
  return (
    <svg className={`sort-icon ${direction}`} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 3 10 8H2L6 3Z" fill="currentColor" />
    </svg>
  );
}

function RequestDetails(props: {
  record: NetworkRecord;
  bodyLimitBytes: number;
  activeTab: DetailTab;
  onClose: () => void;
  onActiveTabChange: (tab: DetailTab) => void;
  onResendRecord: (record: NetworkRecord) => void;
  onStatus: (message?: string) => void;
}) {
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");
  const [requestHeaders, setRequestHeaders] = useState<HeaderPair[]>([]);
  const [body, setBody] = useState("");
  const [credentials, setCredentials] = useState<RequestCredentials>("same-origin");
  const [sending, setSending] = useState(false);
  const [pendingMethod, setPendingMethod] = useState<string>();
  const [autoAddedContentTypeIndex, setAutoAddedContentTypeIndex] = useState<number>();
  const [focusHeaderIndex, setFocusHeaderIndex] = useState<number>();
  const [focusHeaderValue, setFocusHeaderValue] = useState(false);

  useEffect(() => {
    setMethod(props.record.method);
    setUrl(props.record.url);
    setRequestHeaders(props.record.requestHeaders);
    setBody(props.record.requestBody.text ?? "");
    setCredentials(props.record.credentials ?? "same-origin");
    setPendingMethod(undefined);
    setAutoAddedContentTypeIndex(undefined);
    setFocusHeaderIndex(undefined);
    setFocusHeaderValue(false);
  }, [props.record]);

  const disabledReason = translateReason(props.record.unsupportedReason);
  const queryParams = useMemo(() => parseQueryParams(url), [url]);
  const requestBodyMimeType = findHeader(requestHeaders, "content-type") ?? props.record.requestBody.mimeType;

  function beginHeaderValueFocus(index: number) {
    setFocusHeaderIndex(index);
    setFocusHeaderValue(true);
  }

  function handleRequestHeadersChange(nextHeaders: HeaderPair[]) {
    setAutoAddedContentTypeIndex((currentIndex) =>
      syncAutoAddedContentTypeIndex(requestHeaders, nextHeaders, currentIndex)
    );
    setRequestHeaders(nextHeaders);
  }

  function commitMethodChange(nextMethodRaw: string) {
    const nextMethod = nextMethodRaw.toUpperCase();
    const currentMethod = method.toUpperCase();

    if (currentMethod === nextMethod) {
      return;
    }

    if (currentMethod === "POST" && nextMethod === "GET") {
      if (body.length > 0) {
        setPendingMethod(nextMethod);
        return;
      }

      setMethod(nextMethod);
      const nextHeaders = removeAutoAddedEmptyContentType(requestHeaders, autoAddedContentTypeIndex);
      setRequestHeaders(nextHeaders);
      setAutoAddedContentTypeIndex(undefined);
      return;
    }

    if (currentMethod === "GET" && nextMethod === "POST") {
      setMethod(nextMethod);
      const { headers, addedIndex } = ensureContentTypeHeader(requestHeaders);
      setRequestHeaders(headers);
      if (addedIndex !== undefined) {
        setAutoAddedContentTypeIndex(addedIndex);
        beginHeaderValueFocus(addedIndex);
      } else {
        setAutoAddedContentTypeIndex(undefined);
      }
      return;
    }

    setMethod(nextMethod);
  }

  function confirmSwitchToGet() {
    if (!pendingMethod) {
      return;
    }

    setMethod(pendingMethod);
    setBody("");
    setRequestHeaders(removeAutoAddedEmptyContentType(requestHeaders, autoAddedContentTypeIndex));
    setAutoAddedContentTypeIndex(undefined);
    setPendingMethod(undefined);
  }

  function cancelPendingMethodChange() {
    setPendingMethod(undefined);
  }

  async function send() {
    if (disabledReason) {
      return;
    }

    const requestUrl = normaliseUrlQueryEncoding(url);
    if (requestUrl !== url) {
      setUrl(requestUrl);
    }

    const { editable } = splitEditableHeaders(requestHeaders);
    const draft: ResendDraft = {
      method,
      url: requestUrl,
      headers: editable,
      body,
      credentials,
      bodyLimitBytes: props.bodyLimitBytes,
      resendId: `${Date.now()}:${Math.random().toString(16).slice(2)}`
    };

    setSending(true);
    try {
      const result = await resendFromPage(draft, props.record.frameId);
      props.onResendRecord(normaliseResendResult(result, draft, props.record.id));
      props.onStatus(undefined);
    } catch (error) {
      props.onStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <aside className="details-panel">
      <div className="details-head">
        <button type="button" className="icon-button close-details-button" title={i18n.details.closeDetails} onClick={props.onClose}>
          <CloseIcon />
        </button>
        <div className="details-tabs">
          {[
            ["headers", i18n.details.headers],
            ["payload", i18n.details.payload],
            ["response", i18n.details.response]
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={props.activeTab === id ? "active" : ""}
              onClick={() => props.onActiveTabChange(id as DetailTab)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="primary-action detail-send"
          disabled={sending || Boolean(disabledReason)}
          title={disabledReason ?? i18n.details.sendEditedRequest}
          onClick={send}
        >
          {sending ? i18n.details.sending : i18n.details.send}
        </button>
      </div>
      <div className="details-content">
        {disabledReason ? <div className="warning detail-warning">{disabledReason}</div> : null}
        {props.activeTab === "headers" ? (
          <HeadersView
            record={props.record}
            method={method}
            pendingMethod={pendingMethod}
            url={url}
            credentials={credentials}
            requestHeaders={requestHeaders}
            focusHeaderIndex={focusHeaderIndex}
            focusHeaderValue={focusHeaderValue}
            onMethodChange={commitMethodChange}
            onUrlChange={setUrl}
            onCredentialsChange={setCredentials}
            onRequestHeadersChange={handleRequestHeadersChange}
            onClearHeaderFocus={() => {
              setFocusHeaderIndex(undefined);
              setFocusHeaderValue(false);
            }}
            onConfirmMethodChange={confirmSwitchToGet}
            onCancelMethodChange={cancelPendingMethodChange}
          />
        ) : null}
        {props.activeTab === "payload" ? (
          <PayloadEditor
            bodyCapture={props.record.requestBody}
            mimeType={requestBodyMimeType}
            queryParams={queryParams}
            body={body}
            onQueryParamsChange={(nextQueryParams) => setUrl(replaceUrlQuery(url, nextQueryParams))}
            onBodyChange={setBody}
          />
        ) : null}
        {props.activeTab === "response" ? <BodyView title={i18n.details.response} body={props.record.responseBody} /> : null}
      </div>
    </aside>
  );
}

function HeadersView(props: {
  record: NetworkRecord;
  method: string;
  pendingMethod?: string;
  url: string;
  credentials: RequestCredentials;
  requestHeaders: HeaderPair[];
  focusHeaderIndex?: number;
  focusHeaderValue: boolean;
  onMethodChange: (method: string) => void;
  onUrlChange: (url: string) => void;
  onCredentialsChange: (credentials: RequestCredentials) => void;
  onRequestHeadersChange: (headers: HeaderPair[]) => void;
  onClearHeaderFocus: () => void;
  onConfirmMethodChange: () => void;
  onCancelMethodChange: () => void;
}) {
  return (
    <div className="headers-view">
      <DetailSection title={i18n.details.general}>
        <div className="edit-grid">
          <label>
            {i18n.details.requestUrl}
            <input value={props.url} onChange={(event) => props.onUrlChange(event.currentTarget.value)} />
          </label>
          <label className="method-field">
            {i18n.details.requestMethod}
            <select
              value={props.method}
              onChange={(event) => props.onMethodChange(event.currentTarget.value)}
            >
              {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            {i18n.details.credentials}
            <select
              value={props.credentials}
              onChange={(event) =>
                props.onCredentialsChange(event.currentTarget.value as RequestCredentials)
              }
            >
              <option value="same-origin">same-origin</option>
              <option value="include">include</option>
              <option value="omit">omit</option>
            </select>
          </label>
        </div>
        {props.pendingMethod === "GET" ? (
          <InlineConfirmBar
            message={i18n.details.switchToGetClearsBody}
            confirmLabel={i18n.details.convert}
            cancelLabel={i18n.details.cancel}
            onConfirm={props.onConfirmMethodChange}
            onCancel={props.onCancelMethodChange}
          />
        ) : null}
        <KeyValue name={i18n.details.statusCode} value={`${props.record.status ?? "-"} ${props.record.statusText ?? ""}`} />
        <KeyValue name={i18n.details.resourceType} value={i18n.resourceTypes[props.record.type]} />
        <KeyValue name={i18n.details.frame} value={props.record.frameUrl ?? "-"} />
      </DetailSection>
      <DetailSection title={i18n.details.requestHeaders}>
        <EditableHeaderList
          headers={props.requestHeaders}
          onChange={props.onRequestHeadersChange}
          focusIndex={props.focusHeaderIndex}
          focusValue={props.focusHeaderValue}
          onClearFocus={props.onClearHeaderFocus}
        />
      </DetailSection>
      <DetailSection title={i18n.details.responseHeaders}>
        <HeaderList headers={props.record.responseHeaders} />
      </DetailSection>
    </div>
  );
}

function PayloadEditor(props: {
  bodyCapture: BodyCapture;
  mimeType?: string;
  queryParams: HeaderPair[];
  body: string;
  onQueryParamsChange: (queryParams: HeaderPair[]) => void;
  onBodyChange: (body: string) => void;
}) {
  const [formatting, setFormatting] = useState(false);
  const unavailable =
    props.bodyCapture.kind !== "text" &&
    props.bodyCapture.kind !== "json" &&
    props.bodyCapture.kind !== "form" &&
    props.bodyCapture.kind !== "empty";

  async function formatBody() {
    setFormatting(true);
    try {
      props.onBodyChange(await formatCodeTextWithPrettier(props.body, props.mimeType));
    } finally {
      setFormatting(false);
    }
  }

  useEffect(() => {
    void warmPrettierForMimeType(props.mimeType, props.body);
  }, [props.body, props.mimeType]);

  return (
    <div className="payload-editor">
      <DetailSection title={i18n.details.getQuery}>
        <EditableQueryParamList
          params={props.queryParams}
          onChange={props.onQueryParamsChange}
        />
      </DetailSection>
      <section className="detail-section">
        <div className="section-title-row">
          <h3>{i18n.details.requestBody}</h3>
          <button
            type="button"
            className="text-button section-action"
            disabled={formatting}
            onClick={() => {
              void formatBody();
            }}
          >
            {formatting ? i18n.details.formatting : i18n.details.format}
          </button>
        </div>
        {unavailable ? (
          <div className="body-unavailable">
            <strong>{props.bodyCapture.kind}</strong>
            <span>{translateReason(props.bodyCapture.reason) ?? i18n.details.originalPayloadUnavailable}</span>
            {props.bodyCapture.sizeBytes !== undefined ? <span>{i18n.details.size}: {formatBytes(props.bodyCapture.sizeBytes)}</span> : null}
          </div>
        ) : null}
        <EditableCodeEditor
          value={props.body}
          placeholder={i18n.details.editRequestBody}
          mimeType={props.mimeType}
          onChange={props.onBodyChange}
        />
      </section>
    </div>
  );
}

function BodyView({ title, body }: { title: string; body: BodyCapture }) {
  useEffect(() => {
    if (body.kind === "text" || body.kind === "json" || body.kind === "form") {
      void warmPrettierForMimeType(body.mimeType, body.text);
    }
  }, [body]);

  return (
    <div className="body-view">
      <h3>{title}</h3>
      {body.kind === "text" || body.kind === "json" || body.kind === "form" ? (
        <CodeView text={body.text ?? ""} mimeType={body.mimeType} />
      ) : body.kind === "empty" ? (
        <p className="muted">{i18n.details.noBody}</p>
      ) : (
        <div className="body-unavailable">
          <strong>{body.kind}</strong>
          <span>{translateReason(body.reason) ?? i18n.details.bodyUnavailable}</span>
          {body.sizeBytes !== undefined ? <span>{i18n.details.size}: {formatBytes(body.sizeBytes)}</span> : null}
        </div>
      )}
    </div>
  );
}

function CodeView({ text, mimeType }: { text: string; mimeType?: string }) {
  const [displayText, setDisplayText] = useState(() => text);

  useEffect(() => {
    let cancelled = false;

    setDisplayText(text);
    void formatCodeTextWithPrettier(text, mimeType).then((formatted) => {
      if (!cancelled) {
        setDisplayText(formatted);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mimeType, text]);

  const lines = tokenizeCode(displayText, mimeType);

  return (
    <div className="code-view">
      {lines.map((line) => (
        <div key={line.lineNumber} className="code-line">
          <span className="line-number">{line.lineNumber}</span>
          <code>
            {line.tokens.map((token, index) => (
              <span key={`${line.lineNumber}-${index}`} className={`token-${token.kind}`}>
                {token.text}
              </span>
            ))}
          </code>
        </div>
      ))}
    </div>
  );
}

function EditableCodeEditor(props: {
  value: string;
  placeholder: string;
  mimeType?: string;
  onChange: (value: string) => void;
}) {
  const highlightRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void warmPrettierForMimeType(props.mimeType, props.value);
  }, [props.mimeType, props.value]);

  const lines = tokenizeCode(props.value, props.mimeType);

  return (
    <div className="editable-code-editor">
      <div className="code-view code-editor-highlight" ref={highlightRef} aria-hidden="true">
        {lines.map((line) => (
          <div key={line.lineNumber} className="code-line">
            <span className="line-number">{line.lineNumber}</span>
            <code>
              {line.tokens.map((token, index) => (
                <span key={`${line.lineNumber}-${index}`} className={`token-${token.kind}`}>
                  {token.text}
                </span>
              ))}
            </code>
          </div>
        ))}
      </div>
      <textarea
        className="code-editor-input"
        spellCheck={false}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        onScroll={(event) => {
          if (!highlightRef.current) return;
          highlightRef.current.scrollTop = event.currentTarget.scrollTop;
          highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
        }}
      />
    </div>
  );
}

function EditableQueryParamList(props: {
  params: HeaderPair[];
  onChange: (params: HeaderPair[]) => void;
}) {
  return (
    <EditablePairList
      pairs={props.params}
      onChange={props.onChange}
      addLabel={i18n.details.addQueryParam}
      defaultName="param"
      editLabel={i18n.details.editQueryParam}
      removeLabel={i18n.details.removeQueryParam}
    />
  );
}

function EditableHeaderList(props: {
  headers: HeaderPair[];
  onChange: (headers: HeaderPair[]) => void;
  focusIndex?: number;
  focusValue: boolean;
  onClearFocus: () => void;
}) {
  return (
    <EditablePairList
      pairs={props.headers}
      onChange={props.onChange}
      addLabel={i18n.details.addHeader}
      defaultName="x-header"
      editLabel={i18n.details.editHeader}
      removeLabel={i18n.details.removeHeader}
      isReadonly={(header) => isProtectedRequestHeader(header.name)}
      readonlyLabel={i18n.details.readonly}
      focusIndex={props.focusIndex}
      focusValue={props.focusValue}
      onClearFocus={props.onClearFocus}
    />
  );
}

function EditablePairList(props: {
  pairs: HeaderPair[];
  onChange: (pairs: HeaderPair[]) => void;
  addLabel: string;
  defaultName: string;
  editLabel: (name: string) => string;
  removeLabel: (name: string) => string;
  isReadonly?: (pair: HeaderPair) => boolean;
  readonlyLabel?: string;
  focusIndex?: number;
  focusValue?: boolean;
  onClearFocus?: () => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number>();
  const [draftName, setDraftName] = useState("");
  const [draftValue, setDraftValue] = useState("");

  useEffect(() => {
    if (props.focusIndex === undefined) {
      return;
    }

    const pair = props.pairs[props.focusIndex];
    if (!pair) {
      props.onClearFocus?.();
      return;
    }

    setEditingIndex(props.focusIndex);
    setDraftName(pair.name);
    setDraftValue(pair.value);
  }, [props.focusIndex, props.onClearFocus, props.pairs]);

  function beginEdit(index: number, pair: HeaderPair) {
    setEditingIndex(index);
    setDraftName(pair.name);
    setDraftValue(pair.value);
  }

  function commitEdit() {
    if (editingIndex === undefined || draftName.trim().length === 0) {
      setEditingIndex(undefined);
      return;
    }

    props.onChange(
      props.pairs.map((pair, index) =>
        index === editingIndex
          ? { name: draftName.trim(), value: draftValue }
          : pair
      )
    );
    setEditingIndex(undefined);
  }

  return (
    <div className="header-list editable-header-list">
      {props.pairs.map((pair, index) => (
        <EditablePairRow
          key={`${pair.name}-${index}`}
          pair={pair}
          index={index}
          editingIndex={editingIndex}
          draftName={draftName}
          draftValue={draftValue}
          onBeginEdit={beginEdit}
          onCommitEdit={commitEdit}
          onDraftNameChange={setDraftName}
          onDraftValueChange={setDraftValue}
          onCancelEdit={() => setEditingIndex(undefined)}
          onRemove={(removeIndex) => props.onChange(removeHeaderAt(props.pairs, removeIndex))}
          isReadonly={props.isReadonly}
          readonlyLabel={props.readonlyLabel}
          editLabel={props.editLabel}
          removeLabel={props.removeLabel}
          autoFocusName={props.focusIndex === index && !props.focusValue}
          autoFocusValue={props.focusIndex === index && Boolean(props.focusValue)}
          onAutoFocusHandled={props.onClearFocus}
        />
      ))}
      <button
        type="button"
        className="add-header-button"
        onClick={() => {
          const nextPair = { name: props.defaultName, value: "" };
          props.onChange([...props.pairs, nextPair]);
          setEditingIndex(props.pairs.length);
          setDraftName(nextPair.name);
          setDraftValue(nextPair.value);
        }}
      >
        {props.addLabel}
      </button>
    </div>
  );
}

function EditablePairRow(props: {
  pair: HeaderPair;
  index: number;
  editingIndex?: number;
  draftName: string;
  draftValue: string;
  onBeginEdit: (index: number, pair: HeaderPair) => void;
  onCommitEdit: () => void;
  onDraftNameChange: (value: string) => void;
  onDraftValueChange: (value: string) => void;
  onCancelEdit: () => void;
  onRemove: (index: number) => void;
  isReadonly?: (pair: HeaderPair) => boolean;
  readonlyLabel?: string;
  editLabel: (name: string) => string;
  removeLabel: (name: string) => string;
  autoFocusName?: boolean;
  autoFocusValue?: boolean;
  onAutoFocusHandled?: () => void;
}) {
  const isReadonly = props.isReadonly?.(props.pair) ?? false;
  const isEditing = props.editingIndex === props.index;

  function handleRowBlur(event: FocusEvent<HTMLDivElement>) {
    if (!isEditing || isReadonly) {
      return;
    }

    const nextFocused = event.relatedTarget;
    if (nextFocused instanceof Node && event.currentTarget.contains(nextFocused)) {
      return;
    }

    props.onCommitEdit();
  }

  useEffect(() => {
    if (isEditing && (props.autoFocusName || props.autoFocusValue)) {
      props.onAutoFocusHandled?.();
    }
  }, [isEditing, props.autoFocusName, props.autoFocusValue, props.onAutoFocusHandled]);

  return (
    <div
      className={`key-value header-row ${isReadonly ? "is-protected" : ""}`}
      onBlur={handleRowBlur}
      onDoubleClick={() => {
        if (!isReadonly) props.onBeginEdit(props.index, props.pair);
      }}
    >
      {isEditing && !isReadonly ? (
        <>
          <input
            className="header-name-input"
            autoFocus={props.autoFocusName}
            value={props.draftName}
            onChange={(event) => props.onDraftNameChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") props.onCommitEdit();
              if (event.key === "Escape") props.onCancelEdit();
            }}
          />
          <span className="header-value-edit">
            <HeaderValueEditor
              name={props.draftName}
              value={props.draftValue}
              autoFocus={props.autoFocusValue || (!props.autoFocusName && !props.autoFocusValue)}
              onChange={props.onDraftValueChange}
              onKeyDown={(event) => {
                if (event.key === "Enter") props.onCommitEdit();
                if (event.key === "Escape") props.onCancelEdit();
              }}
            />
            <button type="button" className="header-row-button" onMouseDown={(event) => event.preventDefault()} onClick={props.onCommitEdit}>
              {i18n.details.save}
            </button>
          </span>
        </>
      ) : (
        <>
          <span>
            {props.pair.name}
            {isReadonly && props.readonlyLabel ? <em className="readonly-pill">{props.readonlyLabel}</em> : null}
          </span>
          <strong className="header-value" title={props.pair.value}>
            <span className="header-value-text">{props.pair.value}</span>
            {!isReadonly ? (
              <span className="header-actions">
                <button type="button" className="header-row-icon" onClick={() => props.onBeginEdit(props.index, props.pair)} aria-label={props.editLabel(props.pair.name)}>
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="header-row-icon"
                  onClick={() => props.onRemove(props.index)}
                  aria-label={props.removeLabel(props.pair.name)}
                >
                  <RemoveIcon />
                </button>
              </span>
            ) : null}
          </strong>
        </>
      )}
    </div>
  );
}

function HeaderValueEditor(props: {
  name: string;
  value: string;
  autoFocus: boolean;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => void;
}) {
  if (isContentTypeHeader(props.name)) {
    return (
      <ContentTypeValueEditor
        value={props.value}
        autoFocus={props.autoFocus}
        onChange={props.onChange}
        onKeyDown={props.onKeyDown}
      />
    );
  }

  return (
    <input
      autoFocus={props.autoFocus}
      value={props.value}
      onChange={(event) => props.onChange(event.currentTarget.value)}
      onKeyDown={props.onKeyDown}
    />
  );
}

function ContentTypeValueEditor(props: {
  value: string;
  autoFocus: boolean;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const presetValue = commonContentTypeValues.includes(props.value as (typeof commonContentTypeValues)[number])
    ? props.value
    : undefined;

  return (
    <span className="content-type-editor">
      <input
        autoFocus={props.autoFocus}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        onBlur={() => setMenuOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setMenuOpen(true);
            return;
          }

          props.onKeyDown(event);
        }}
      />
      <button
        type="button"
        className="content-type-trigger"
        aria-label={i18n.details.commonHeaderValues}
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        title={presetValue ?? i18n.details.customHeaderValue}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setMenuOpen((current) => !current)}
      >
        <ChevronDownIcon />
      </button>
      {menuOpen ? (
        <span className="content-type-menu" role="listbox" aria-label={i18n.details.commonHeaderValues}>
          {commonContentTypeValues.map((value) => (
            <button
              key={value}
              type="button"
              role="option"
              aria-selected={presetValue === value}
              className={presetValue === value ? "is-selected" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                props.onChange(value);
                setMenuOpen(false);
              }}
            >
              {value}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}

function InlineConfirmBar(props: {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="inline-confirm-bar warning">
      <span>{props.message}</span>
      <span className="inline-confirm-actions">
        <button type="button" className="header-row-button" onClick={props.onCancel}>
          {props.cancelLabel}
        </button>
        <button type="button" className="primary-action inline-confirm-button" onClick={props.onConfirm}>
          {props.confirmLabel}
        </button>
      </span>
    </div>
  );
}

function DetailSection(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="detail-section">
      <h3>{props.title}</h3>
      {props.children}
    </section>
  );
}

function KeyValue({ name, value }: { name: string; value: string }) {
  return (
    <div className="key-value">
      <span>{name}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function HeaderList({ headers }: { headers: HeaderPair[] }) {
  if (headers.length === 0) {
    return <p className="muted">{i18n.details.noHeadersCaptured}</p>;
  }

  return (
    <div className="header-list">
      {headers.map((header, index) => (
        <div key={`${header.name}-${index}`} className="key-value">
          <span>{header.name}</span>
          <strong>{header.value}</strong>
        </div>
      ))}
    </div>
  );
}

function RecordCaptureIcon({ recording }: { recording: boolean }) {
  return (
    <svg className="record-capture-icon" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="6.25" />
      {recording ? <rect x="7.2" y="7.2" width="5.6" height="5.6" rx="0.8" /> : <circle className="record-dot" cx="10" cy="10" r="2.8" />}
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg className="clear-icon" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="6.2" />
      <path d="M5.4 14.6 14.6 5.4" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg className="transfer-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 3.5V13" />
      <path d="M6.5 6.9 10 3.5 13.5 6.9" />
      <path d="M5 14.5V16.5H15V14.5" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg className="transfer-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 3.5V13" />
      <path d="M6.5 9.6 10 13 13.5 9.6" />
      <path d="M5 14.5V16.5H15V14.5" />
    </svg>
  );
}

function ResenderIcon({ title }: { title?: string }) {
  return (
    <span className="resender-mark" role="img" aria-label={title} title={title} />
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 18.5 8.3 18l9.4-9.4-2.8-2.8-9.4 9.4L5 18.5Z" />
      <path d="m13.8 6.9 2.8 2.8" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 12h12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 7 10 10" />
      <path d="m17 7-10 10" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.5 4 6 7.5 9.5 4" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg className="gear-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M8.9 17L8.55 14.8C8.25 14.7 7.96 14.58 7.68 14.43C7.4 14.28 7.14 14.12 6.9 13.93L4.85 14.85L3.75 12.95L5.55 11.62C5.52 11.45 5.5 11.28 5.49 11.11C5.47 10.94 5.46 10.77 5.46 10.6C5.46 10.43 5.47 10.26 5.49 10.09C5.5 9.92 5.52 9.75 5.55 9.58L3.75 8.25L4.85 6.35L6.9 7.27C7.14 7.08 7.4 6.92 7.68 6.77C7.96 6.62 8.25 6.5 8.55 6.4L8.9 4.2H11.1L11.45 6.4C11.75 6.5 12.04 6.62 12.32 6.77C12.6 6.92 12.86 7.08 13.1 7.27L15.15 6.35L16.25 8.25L14.45 9.58C14.48 9.75 14.5 9.92 14.51 10.09C14.53 10.26 14.54 10.43 14.54 10.6C14.54 10.77 14.53 10.94 14.51 11.11C14.5 11.28 14.48 11.45 14.45 11.62L16.25 12.95L15.15 14.85L13.1 13.93C12.86 14.12 12.6 14.28 12.32 14.43C12.04 14.58 11.75 14.7 11.45 14.8L11.1 17H8.9ZM10 12.85C10.62 12.85 11.15 12.63 11.59 12.19C12.03 11.75 12.25 11.22 12.25 10.6C12.25 9.98 12.03 9.45 11.59 9.01C11.15 8.57 10.62 8.35 10 8.35C9.38 8.35 8.85 8.57 8.41 9.01C7.97 9.45 7.75 9.98 7.75 10.6C7.75 11.22 7.97 11.75 8.41 12.19C8.85 12.63 9.38 12.85 10 12.85Z"
        fill="currentColor"
      />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg className="filter-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 5H16L11.2 10.55V15.2L8.8 16.4V10.55L4 5Z" />
    </svg>
  );
}

function upsertMany(current: NetworkRecord[], incomingRecords: NetworkRecord[]): NetworkRecord[] {
  let next = [...current];

  for (const incoming of incomingRecords) {
    const directIndex = next.findIndex((record) => record.id === incoming.id);
    if (directIndex !== -1) {
      next[directIndex] = mergeRecords(next[directIndex], incoming);
      continue;
    }

    const mergeTarget = findMergeTarget(next, incoming);
    if (mergeTarget) {
      next = next.map((record) =>
        record.id === mergeTarget.id ? mergeRecords(record, incoming) : record
      );
      continue;
    }

    next.push(incoming);
  }

  return linkRedirectRecords(next);
}

function hasGetContent(entry: chrome.devtools.network.HAREntry): entry is chrome.devtools.network.Request {
  return typeof (entry as Partial<chrome.devtools.network.Request>).getContent === "function";
}

function findHarContentTargetIndex(records: NetworkRecord[], source: NetworkRecord): number {
  const directIndex = records.findIndex((record) => record.id === source.id);
  if (directIndex !== -1) {
    return directIndex;
  }

  return records.findIndex((record) => {
    const closeInTime = Math.abs(record.startedAt - source.startedAt) < 3000;
    return record.method === source.method && record.url === source.url && closeInTime;
  });
}

function statusClassName(status?: number): string {
  if (status === undefined) return "";
  if (status >= 200 && status < 300) return "status-ok";
  if (status >= 400) return "status-error";
  if (status >= 300) return "status-redirect";
  return "";
}
