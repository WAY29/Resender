import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { FilterState, NetworkRecord } from "../types";
import { openSourceLocation } from "./chromeApi";
import { formatDuration } from "./format";
import { getRequestColumns, i18n } from "./i18n";
import { isWindowsPlatform } from "./platform";
import { getNetworkIconData, NetworkIcon } from "./networkIcons";
import { getPreviewImageSrc, getPreviewModel } from "./preview";
import type { SortColumn, SortState } from "./requestSort";
import { buildDomainFilter, buildHideFromListFilter, buildMethodFilter } from "./requestContextMenu";
import {
  buildRequestCopyText,
  buildRequestListCopyText,
  getRequestCopySupport,
  type RequestCopyFormat
} from "./requestCopy";

const requestColumns = getRequestColumns();

type MenuGroup = "open" | "copy" | "filter" | null;

type ContextMenuState = {
  x: number;
  y: number;
  record: NetworkRecord;
  submenu: MenuGroup;
};

export function RequestTable(props: {
  records: NetworkRecord[];
  selectedId?: string;
  filter: FilterState;
  onSelect: (id: string) => void;
  onSortChange: (column: SortColumn) => void;
  onColumnResize: (column: SortColumn, width: number) => void;
  onFilterTokenAppend: (token: string) => void;
  onStatus: (message?: string) => void;
  onCopyText?: (text: string) => Promise<void>;
  listWidthPercent: number;
  gridTemplate: string;
  columnWidths: Record<SortColumn, number>;
  sortState: SortState;
  isDetailsOpen: boolean;
}) {
  const isWindows = isWindowsPlatform();
  const requestListStyle = {
    width: props.isDetailsOpen ? `${props.listWidthPercent}%` : "100%",
    "--request-columns": props.gridTemplate
  } as CSSProperties;
  const containerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    if (!menu) {
      return;
    }

    function closeOnClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenu(null);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenu(null);
      }
    }

    window.addEventListener("click", closeOnClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", closeOnClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menu]);

  const menuStyle = useMemo(() => {
    if (!menu || !containerRef.current) {
      return undefined;
    }

    const bounds = containerRef.current.getBoundingClientRect();
    return {
      left: Math.max(8, menu.x - bounds.left),
      top: Math.max(8, menu.y - bounds.top)
    } as CSSProperties;
  }, [menu]);

  async function writeText(text: string) {
    const copy = props.onCopyText ?? ((value: string) => navigator.clipboard.writeText(value));
    await copy(text);
  }

  async function copyRecord(record: NetworkRecord, format: RequestCopyFormat) {
    try {
      await writeText(buildRequestCopyText(record, format));
      props.onStatus(undefined);
    } catch (error) {
      props.onStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setMenu(null);
    }
  }

  async function copyListed(format: RequestCopyFormat) {
    try {
      await writeText(buildRequestListCopyText(props.records, format));
      props.onStatus(undefined);
    } catch (error) {
      props.onStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setMenu(null);
    }
  }

  function openInSources(record: NetworkRecord) {
    const location = record.initiatorLocation ?? { url: record.url };
    if (!openSourceLocation(location)) {
      props.onStatus(i18n.contextMenu.openInSourcesFailed);
      return;
    }
    setMenu(null);
  }

  function openInNewTab(record: NetworkRecord) {
    window.open(record.url, "_blank", "noopener,noreferrer");
    setMenu(null);
  }

  function appendFilter(token: string) {
    props.onFilterTokenAppend(token);
    setMenu(null);
  }

  return (
    <section className="request-list" style={requestListStyle} ref={containerRef}>
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
              onContextMenu={(event) => {
                event.preventDefault();
                props.onSelect(record.id);
                setMenu({ x: event.clientX, y: event.clientY, record, submenu: null });
              }}
            >
              <RequestTypeIcon record={record} />
              <span className="name-cell" title={record.url}>
                {record.resent ? <span className="resender-mark" role="img" aria-label={i18n.table.resentRequest} title={i18n.table.resentRequest} /> : null}
                {record.name}
              </span>
              <span>{record.method}</span>
              <span title={record.domain}>{record.domain}</span>
              <span className={`status-cell ${statusClassName(record.status)}`}>
                <span>{record.status ?? "-"}</span>
                {record.redirectSourceId ? (
                  <RedirectJumpButton direction="source" onClick={() => props.onSelect(record.redirectSourceId!)} />
                ) : null}
                {record.redirectTargetId ? (
                  <RedirectJumpButton direction="target" onClick={() => props.onSelect(record.redirectTargetId!)} />
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
      {menu ? (
        <div ref={menuRef} className="request-context-menu" style={menuStyle} role="menu">
          <ContextMenuButton label={i18n.contextMenu.openInSources} onClick={() => openInSources(menu.record)} />
          <ContextMenuButton label={i18n.contextMenu.openInNewTab} onClick={() => openInNewTab(menu.record)} />
          <MenuDivider />
          <MenuItem
            label={i18n.contextMenu.copy}
            submenu={menu.submenu === "copy"}
            onHover={() => setMenu((current) => (current ? { ...current, submenu: "copy" } : current))}
          >
            <SubmenuButton label={i18n.contextMenu.copyUrl} onClick={() => copyRecord(menu.record, "url")} />
            <CopyFormatButton record={menu.record} format="curl-bash" label={i18n.contextMenu.copyAsCurlBash} onCopy={copyRecord} onStatus={props.onStatus} />
            {isWindows ? <CopyFormatButton record={menu.record} format="curl-cmd" label={i18n.contextMenu.copyAsCurlCmd} onCopy={copyRecord} onStatus={props.onStatus} /> : null}
            {isWindows ? <CopyFormatButton record={menu.record} format="powershell" label={i18n.contextMenu.copyAsPowerShell} onCopy={copyRecord} onStatus={props.onStatus} /> : null}
            <CopyFormatButton record={menu.record} format="fetch" label={i18n.contextMenu.copyAsFetch} onCopy={copyRecord} onStatus={props.onStatus} />
            <CopyFormatButton record={menu.record} format="fetch-node" label={i18n.contextMenu.copyAsFetchNode} onCopy={copyRecord} onStatus={props.onStatus} />
            <MenuDivider />
            <SubmenuButton label={i18n.contextMenu.copyAllListedUrls} onClick={() => void copyListed("url")} />
            <SubmenuButton label={i18n.contextMenu.copyAllListedAsCurlBash} onClick={() => void copyListed("curl-bash")} />
            {isWindows ? <SubmenuButton label={i18n.contextMenu.copyAllListedAsCurlCmd} onClick={() => void copyListed("curl-cmd")} /> : null}
            {isWindows ? <SubmenuButton label={i18n.contextMenu.copyAllListedAsPowerShell} onClick={() => void copyListed("powershell")} /> : null}
            <SubmenuButton label={i18n.contextMenu.copyAllListedAsFetch} onClick={() => void copyListed("fetch")} />
            <SubmenuButton label={i18n.contextMenu.copyAllListedAsFetchNode} onClick={() => void copyListed("fetch-node")} />
          </MenuItem>
          <MenuDivider />
          <MenuItem
            label={i18n.contextMenu.filter}
            submenu={menu.submenu === "filter"}
            onHover={() => setMenu((current) => (current ? { ...current, submenu: "filter" } : current))}
          >
            <SubmenuButton label={i18n.contextMenu.filterByDomain} onClick={() => appendFilter(buildDomainFilter(menu.record))} />
            <SubmenuButton label={i18n.contextMenu.filterByMethod} onClick={() => appendFilter(buildMethodFilter(menu.record))} />
            <SubmenuButton label={i18n.contextMenu.hideFromList} onClick={() => appendFilter(buildHideFromListFilter(menu.record))} />
          </MenuItem>
        </div>
      ) : null}
    </section>
  );
}

function CopyFormatButton(props: {
  record: NetworkRecord;
  format: Exclude<RequestCopyFormat, "url">;
  label: string;
  onCopy: (record: NetworkRecord, format: RequestCopyFormat) => Promise<void>;
  onStatus: (message?: string) => void;
}) {
  const support = getRequestCopySupport(props.record, props.format);
  const disabled = !support.supported;

  return (
    <SubmenuButton
      label={props.label}
      disabled={disabled}
      title={disabled ? support.reason : undefined}
      onClick={() => {
        if (!support.supported) {
          props.onStatus(support.reason);
          return;
        }
        void props.onCopy(props.record, props.format);
      }}
    />
  );
}

function MenuItem(props: {
  label: string;
  submenu: boolean;
  onHover: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="request-context-menu-item with-submenu" onMouseEnter={props.onHover}>
      <span>{props.label}</span>
      <span className="submenu-arrow">›</span>
      {props.submenu ? <div className="request-context-submenu">{props.children}</div> : null}
    </div>
  );
}

function ContextMenuButton(props: { label: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" className="request-context-submenu-item top-level" onClick={props.onClick}>
      {props.label}
    </button>
  );
}

function MenuDivider() {
  return <div className="request-context-divider" aria-hidden="true" />;
}

function SubmenuButton(props: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="request-context-submenu-item"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
    >
      {props.label}
    </button>
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
  const thumbnailSrc = icon.iconName === "file-image" ? getPreviewImageSrc(getPreviewModel(record.responseBody)) : undefined;

  return (
    <span
      className="request-type-icon"
      title={icon.label}
      aria-label={icon.label}
      style={thumbnailSrc ? undefined : { color: `var(${icon.colorVar})` }}
    >
      {thumbnailSrc ? <img className="request-type-thumbnail" src={thumbnailSrc} alt="" /> : <NetworkIcon iconName={icon.iconName} />}
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

function statusClassName(status?: number): string {
  if (status === undefined) return "";
  if (status >= 200 && status < 300) return "status-ok";
  if (status >= 400) return "status-error";
  if (status >= 300) return "status-redirect";
  return "";
}
