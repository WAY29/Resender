import type { NetworkRecord, ResourceType } from "../types";
import { findHeader } from "./headers";
import { i18n } from "./i18n";

export type NetworkIconName =
  | "file-document"
  | "file-fetch-xhr"
  | "file-font"
  | "file-generic"
  | "file-image"
  | "file-json"
  | "file-manifest"
  | "file-media"
  | "file-script"
  | "file-stylesheet"
  | "file-wasm"
  | "file-websocket";

export type NetworkIconData = {
  iconName: NetworkIconName;
  label: string;
  colorVar: string;
};

type SvgIconData = {
  paths: string[];
};

const svgIcons: Record<NetworkIconName, SvgIconData> = {
  "file-document": {
    paths: [
      "M6 7.5H14V6H6V7.5ZM6 14H12V12.5H6V14ZM6 10.75H14V9.25H6V10.75ZM4.5 17C4.08333 17 3.72933 16.854 3.438 16.562C3.146 16.2707 3 15.9167 3 15.5V4.5C3 4.08333 3.146 3.72933 3.438 3.438C3.72933 3.146 4.08333 3 4.5 3H15.5C15.9167 3 16.2707 3.146 16.562 3.438C16.854 3.72933 17 4.08333 17 4.5V15.5C17 15.9167 16.854 16.2707 16.562 16.562C16.2707 16.854 15.9167 17 15.5 17H4.5ZM4.5 15.5H15.5V4.5H4.5V15.5Z"
    ]
  },
  "file-fetch-xhr": {
    paths: [
      "M4.5 17C4.0875 17 3.73437 16.8531 3.44062 16.5594C3.14687 16.2656 3 15.9125 3 15.5V4.5C3 4.0875 3.14687 3.73438 3.44062 3.44063C3.73437 3.14688 4.0875 3 4.5 3H13L17 7V15.5C17 15.9125 16.8531 16.2656 16.5594 16.5594C16.2656 16.8531 15.9125 17 15.5 17H4.5ZM4.5 15.5H15.5V8H12V4.5H4.5V15.5Z"
    ]
  },
  "file-font": {
    paths: [
      "M4.5 17C4.08333 17 3.72933 16.854 3.438 16.562C3.146 16.2707 3 15.9167 3 15.5V4.5C3 4.08333 3.146 3.72933 3.438 3.438C3.72933 3.146 4.08333 3 4.5 3H15.5C15.9167 3 16.2707 3.146 16.562 3.438C16.854 3.72933 17 4.08333 17 4.5V15.5C17 15.9167 16.854 16.2707 16.562 16.562C16.2707 16.854 15.9167 17 15.5 17H4.5ZM4.5 15.5H15.5V4.5H4.5V15.5Z",
      "M13 6H7V7.5H9.25V14H10.75V7.5H13V6Z"
    ]
  },
  "file-generic": {
    paths: [
      "M4.5 17C4.08333 17 3.72933 16.854 3.438 16.562C3.146 16.2707 3 15.9167 3 15.5V4.5C3 4.08333 3.146 3.72933 3.438 3.438C3.72933 3.146 4.08333 3 4.5 3H15.5C15.9167 3 16.2707 3.146 16.562 3.438C16.854 3.72933 17 4.08333 17 4.5V15.5C17 15.9167 16.854 16.2707 16.562 16.562C16.2707 16.854 15.9167 17 15.5 17H4.5ZM4.5 15.5H15.5V4.5H4.5V15.5Z"
    ]
  },
  "file-image": {
    paths: [
      "M4.5 17C4.08333 17 3.72933 16.8507 3.438 16.552C3.146 16.2533 3 15.9027 3 15.5V4.5C3 4.09733 3.146 3.74667 3.438 3.448C3.72933 3.14933 4.08333 3 4.5 3H15.5C15.9167 3 16.2707 3.14933 16.562 3.448C16.854 3.74667 17 4.09733 17 4.5V15.5C17 15.9027 16.854 16.2533 16.562 16.552C16.2707 16.8507 15.9167 17 15.5 17H4.5ZM4.5 15.5H15.5V4.5H4.5V15.5ZM5.5 14H14.5L11.5 10L9.25 13L7.75 11L5.5 14Z"
    ]
  },
  "file-json": {
    paths: [
      "M12 16V14.5H13.75C13.9625 14.5 14.1406 14.4281 14.2844 14.2844C14.4281 14.1406 14.5 13.9625 14.5 13.75V12.25C14.5 11.6806 14.691 11.191 15.0729 10.7813C15.4549 10.3715 15.9306 10.1319 16.5 10.0625V9.97917C15.9306 9.86806 15.4549 9.61111 15.0729 9.20833C14.691 8.80556 14.5 8.31944 14.5 7.75V6.25C14.5 6.0375 14.4281 5.85937 14.2844 5.71562C14.1406 5.57187 13.9625 5.5 13.75 5.5H12V4H13.75C14.375 4 14.9063 4.21875 15.3438 4.65625C15.7813 5.09375 16 5.625 16 6.25V7.75C16 7.9625 16.0719 8.14063 16.2156 8.28438C16.3594 8.42813 16.5375 8.5 16.75 8.5H18V11.5H16.75C16.5375 11.5 16.3594 11.5719 16.2156 11.7156C16.0719 11.8594 16 12.0375 16 12.25V13.75C16 14.375 15.7813 14.9063 15.3438 15.3438C14.9063 15.7813 14.375 16 13.75 16H12ZM6.25 16C5.625 16 5.09375 15.7813 4.65625 15.3438C4.21875 14.9063 4 14.375 4 13.75V12.25C4 12.0375 3.92812 11.8594 3.78437 11.7156C3.64062 11.5719 3.4625 11.5 3.25 11.5H2V8.5H3.25C3.4625 8.5 3.64062 8.42813 3.78437 8.28438C3.92812 8.14063 4 7.9625 4 7.75V6.25C4 5.625 4.21875 5.09375 4.65625 4.65625C5.09375 4.21875 5.625 4 6.25 4H8V5.5H6.25C6.0375 5.5 5.85938 5.57187 5.71563 5.71562C5.57188 5.85937 5.5 6.0375 5.5 6.25V7.75C5.5 8.33333 5.30903 8.82986 4.92708 9.23958C4.54514 9.64931 4.06944 9.88889 3.5 9.95833V10.0448C4.06944 10.0983 4.54514 10.3333 4.92708 10.75C5.30903 11.1667 5.5 11.6667 5.5 12.25V13.75C5.5 13.9625 5.57188 14.1406 5.71563 14.2844C5.85938 14.4281 6.0375 14.5 6.25 14.5H8V16H6.25Z",
      "M9.19336 10.3495H11.1445V11.9374L9.99609 14.1816H8.73633L9.19336 11.9374V10.3495ZM9.19336 6.27142H11.1445V8.4101H9.19336V6.27142Z"
    ]
  },
  "file-manifest": {
    paths: [
      "M6.7456 7.5C6.95687 7.5 7.13542 7.42855 7.28125 7.28565C7.42708 7.14273 7.5 6.96565 7.5 6.7544C7.5 6.54313 7.42855 6.36458 7.28565 6.21875C7.14273 6.07292 6.96565 6 6.7544 6C6.54313 6 6.36458 6.07145 6.21875 6.21435C6.07292 6.35727 6 6.53435 6 6.7456C6 6.95687 6.07145 7.13542 6.21435 7.28125C6.35727 7.42708 6.53435 7.5 6.7456 7.5ZM6.7456 10.75C6.95687 10.75 7.13542 10.6785 7.28125 10.5356C7.42708 10.3927 7.5 10.2156 7.5 10.0044C7.5 9.79313 7.42855 9.61458 7.28565 9.46875C7.14273 9.32292 6.96565 9.25 6.7544 9.25C6.54313 9.25 6.36458 9.32145 6.21875 9.46435C6.07292 9.60727 6 9.78435 6 9.9956C6 10.2069 6.07145 10.3854 6.21435 10.5313C6.35727 10.6771 6.53435 10.75 6.7456 10.75ZM6.7456 14C6.95687 14 7.13542 13.9285 7.28125 13.7856C7.42708 13.6427 7.5 13.4656 7.5 13.2544C7.5 13.0431 7.42855 12.8646 7.28565 12.7188C7.14273 12.5729 6.96565 12.5 6.7544 12.5C6.54313 12.5 6.36458 12.5715 6.21875 12.7144C6.07292 12.8573 6 13.0344 6 13.2456C6 13.4569 6.07145 13.6354 6.21435 13.7813C6.35727 13.9271 6.53435 14 6.7456 14ZM4.5 17C4.0875 17 3.73437 16.8531 3.44062 16.5594C3.14687 16.2656 3 15.9125 3 15.5V4.5C3 4.0875 3.14687 3.73438 3.44062 3.44063C3.73437 3.14688 4.0875 3 4.5 3H13L17 7V15.5C17 15.9125 16.8531 16.2656 16.5594 16.5594C16.2656 16.8531 15.9125 17 15.5 17H4.5ZM4.5 15.5H15.5V8H12V4.5H4.5V15.5Z"
    ]
  },
  "file-media": {
    paths: [
      "M8 13.5L13.5 10L8 6.5V13.5ZM4.5 17C4.08333 17 3.72933 16.854 3.438 16.562C3.146 16.2707 3 15.9167 3 15.5V4.5C3 4.08333 3.146 3.72933 3.438 3.438C3.72933 3.146 4.08333 3 4.5 3H15.5C15.9167 3 16.2707 3.146 16.562 3.438C16.854 3.72933 17 4.08333 17 4.5V15.5C17 15.9167 16.854 16.2707 16.562 16.562C16.2707 16.854 15.9167 17 15.5 17H4.5ZM4.5 15.5H15.5V4.5H4.5V15.5Z"
    ]
  },
  "file-script": {
    paths: [
      "M8 12.5L9.062 11.438L7.625 10L9.062 8.562L8 7.5L5.5 10L8 12.5ZM12 12.5L14.5 10L12 7.5L10.938 8.562L12.375 10L10.938 11.438L12 12.5ZM4.5 17C4.08333 17 3.72933 16.854 3.438 16.562C3.146 16.2707 3 15.9167 3 15.5V4.5C3 4.08333 3.146 3.72933 3.438 3.438C3.72933 3.146 4.08333 3 4.5 3H15.5C15.9167 3 16.2707 3.146 16.562 3.438C16.854 3.72933 17 4.08333 17 4.5V15.5C17 15.9167 16.854 16.2707 16.562 16.562C16.2707 16.854 15.9167 17 15.5 17H4.5ZM4.5 15.5H15.5V4.5H4.5V15.5Z"
    ]
  },
  "file-stylesheet": {
    paths: [
      "M4.5 17C4.08333 17 3.72933 16.854 3.438 16.562C3.146 16.2707 3 15.9167 3 15.5V4.5C3 4.08333 3.146 3.72933 3.438 3.438C3.72933 3.146 4.08333 3 4.5 3H15.5C15.9167 3 16.2707 3.146 16.562 3.438C16.854 3.72933 17 4.08333 17 4.5V15.5C17 15.9167 16.854 16.2707 16.562 16.562C16.2707 16.854 15.9167 17 15.5 17H4.5ZM4.5 15.5H15.5V4.5H4.5V15.5Z",
      "M7.59765 13.8623C7.25261 13.8623 6.92873 13.7838 6.626 13.6267C6.32327 13.4696 6.06854 13.257 5.86182 12.9889C6.09944 12.9734 6.30249 12.8853 6.47096 12.7246C6.63943 12.5635 6.72366 12.3641 6.72366 12.1265C6.72366 11.7586 6.8502 11.4502 7.10327 11.2012C7.35634 10.9521 7.6668 10.8276 8.03464 10.8276C8.39475 10.8276 8.69932 10.9542 8.94835 11.2072C9.19738 11.46 9.32189 11.7664 9.32189 12.1265C9.32189 12.6094 9.15526 13.0196 8.822 13.3569C8.48837 13.6938 8.08025 13.8623 7.59765 13.8623ZM10.3101 11.1383L9.13815 9.96579L12.8046 6.29881C12.912 6.1914 13.0424 6.1377 13.1958 6.1377C13.3488 6.1377 13.479 6.1914 13.5864 6.29881L13.9771 6.68945C14.0845 6.79686 14.1382 6.92524 14.1382 7.07458C14.1382 7.22392 14.0845 7.3523 13.9771 7.45971L10.3101 11.1383Z"
    ]
  },
  "file-wasm": {
    paths: [
      "M13.1632 4.5C12.6015 5.68247 11.3962 6.5 10 6.5C8.6038 6.5 7.39855 5.68247 6.83682 4.5L4.5 4.5L4.5 15.5H15.5V4.5H13.1632ZM12 3C12 4.10457 11.1046 5 10 5C8.89543 5 8 4.10457 8 3H4.5C3.67157 3 3 3.67157 3 4.5V15.5C3 16.3284 3.67157 17 4.5 17H15.5C16.3284 17 17 16.3284 17 15.5V4.5C17 3.67157 16.3284 3 15.5 3H12Z",
      "M10 13.5L10 10H9.00003V13L8.38675 13V11H7.6055V13H7L7 10H5.99999L5.99999 13.5C5.99999 13.6417 6.04791 13.7604 6.14375 13.8562C6.23958 13.9521 6.35833 14 6.5 14L9.50003 14C9.6417 14 9.76045 13.9521 9.85628 13.8562C9.95212 13.7604 10 13.6417 10 13.5Z",
      "M12 13V14H11V10.75C11 10.3358 11.3358 10 11.75 10H13.25C13.6642 10 14 10.3358 14 10.75V14H13V13H12ZM12 12V11H13V12H12Z"
    ]
  },
  "file-websocket": {
    paths: [
      "M7 16L4 13L7 10L8.0625 11.0625L6.875 12.25H10V13.75H6.875L8.0625 14.9375L7 16ZM12.2544 13.75C12.0431 13.75 11.8646 13.6785 11.7188 13.5356C11.5729 13.3927 11.5 13.2156 11.5 13.0044C11.5 12.7931 11.5715 12.6146 11.7144 12.4688C11.8573 12.3229 12.0344 12.25 12.2456 12.25C12.4569 12.25 12.6354 12.3215 12.7813 12.4644C12.9271 12.6073 13 12.7844 13 12.9956C13 13.2069 12.9285 13.3854 12.7856 13.5313C12.6427 13.6771 12.4656 13.75 12.2544 13.75ZM15.2544 13.75C15.0431 13.75 14.8646 13.6785 14.7188 13.5356C14.5729 13.3927 14.5 13.2156 14.5 13.0044C14.5 12.7931 14.5715 12.6146 14.7144 12.4688C14.8573 12.3229 15.0344 12.25 15.2456 12.25C15.4569 12.25 15.6354 12.3215 15.7813 12.4644C15.9271 12.6073 16 12.7844 16 12.9956C16 13.2069 15.9285 13.3854 15.7856 13.5313C15.6427 13.6771 15.4656 13.75 15.2544 13.75ZM14 10L12.9375 8.9375L14.125 7.75H11V6.25H14.125L12.9375 5.0625L14 4L17 7L14 10ZM5.7544 7.75C5.54313 7.75 5.36458 7.67855 5.21875 7.53565C5.07292 7.39273 5 7.21565 5 7.0044C5 6.79313 5.07145 6.61458 5.21435 6.46875C5.35727 6.32292 5.53435 6.25 5.7456 6.25C5.95687 6.25 6.13542 6.32145 6.28125 6.46435C6.42708 6.60727 6.5 6.78435 6.5 6.9956C6.5 7.20687 6.42855 7.38542 6.28565 7.53125C6.14273 7.67708 5.96565 7.75 5.7544 7.75ZM8.7544 7.75C8.54313 7.75 8.36458 7.67855 8.21875 7.53565C8.07292 7.39273 8 7.21565 8 7.0044C8 6.79313 8.07145 6.61458 8.21435 6.46875C8.35727 6.32292 8.53435 6.25 8.7456 6.25C8.95687 6.25 9.13542 6.32145 9.28125 6.46435C9.42708 6.60727 9.5 6.78435 9.5 6.9956C9.5 7.20687 9.42855 7.38542 9.28565 7.53125C9.14273 7.67708 8.96565 7.75 8.7544 7.75Z"
    ]
  }
};

export function getNetworkIconData(record: NetworkRecord): NetworkIconData {
  const type = inferIconResourceType(record);
  if (type !== "manifest" && simplifyContentType(getRecordMimeType(record)) === "application/json") {
    return { iconName: "file-json", label: i18n.resourceTypes[type], colorVar: "--icon-file-script" };
  }

  return iconDataForResourceType(type);
}

export function NetworkIcon({ iconName }: { iconName: NetworkIconName }) {
  const icon = svgIcons[iconName];
  return (
    <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
      {icon.paths.map((path, index) => (
        <path key={`${iconName}-${index}`} d={path} fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
      ))}
    </svg>
  );
}

function iconDataForResourceType(resourceType: ResourceType): NetworkIconData {
  if (resourceType === "document") {
    return { iconName: "file-document", label: i18n.resourceTypes.document, colorVar: "--icon-file-document" };
  }
  if (resourceType === "image") {
    return { iconName: "file-image", label: i18n.resourceTypes.image, colorVar: "--icon-file-image" };
  }
  if (resourceType === "font") {
    return { iconName: "file-font", label: i18n.resourceTypes.font, colorVar: "--icon-file-font" };
  }
  if (resourceType === "script") {
    return { iconName: "file-script", label: i18n.resourceTypes.script, colorVar: "--icon-file-script" };
  }
  if (resourceType === "css") {
    return { iconName: "file-stylesheet", label: i18n.resourceTypes.css, colorVar: "--icon-file-styles" };
  }
  if (resourceType === "manifest") {
    return { iconName: "file-manifest", label: i18n.resourceTypes.manifest, colorVar: "--icon-file-default" };
  }
  if (resourceType === "wasm") {
    return { iconName: "file-wasm", label: i18n.resourceTypes.wasm, colorVar: "--icon-file-default" };
  }
  if (resourceType === "websocket") {
    return { iconName: "file-websocket", label: i18n.resourceTypes.websocket, colorVar: "--icon-file-default" };
  }
  if (resourceType === "media") {
    return { iconName: "file-media", label: i18n.resourceTypes.media, colorVar: "--icon-file-media" };
  }
  if (resourceType === "fetch" || resourceType === "xhr") {
    return { iconName: "file-fetch-xhr", label: i18n.resourceTypes[resourceType], colorVar: "--icon-file-default" };
  }
  return { iconName: "file-generic", label: i18n.resourceTypes.other, colorVar: "--icon-file-default" };
}

function inferIconResourceType(record: NetworkRecord): ResourceType {
  const typeFromMime = resourceTypeFromMimeType(getRecordMimeType(record));

  if (typeFromMime && typeFromMime !== record.type) {
    if (record.type === "fetch") {
      return typeFromMime;
    }
    if (typeFromMime === "image") {
      return typeFromMime;
    }
    if (record.type === "other" && typeFromMime === "script") {
      return typeFromMime;
    }
  }

  return record.type;
}

function getRecordMimeType(record: NetworkRecord): string {
  return (
    record.responseBody.mimeType ??
    findHeader(record.responseHeaders, "content-type") ??
    record.requestBody.mimeType ??
    findHeader(record.requestHeaders, "content-type") ??
    ""
  );
}

function simplifyContentType(mimeType: string): string {
  return mimeType.split(";")[0].trim().toLowerCase();
}

function resourceTypeFromMimeType(mimeType: string): ResourceType | undefined {
  const simplified = simplifyContentType(mimeType);
  if (!simplified) return undefined;
  if (simplified === "text/html") return "document";
  if (simplified === "text/css") return "css";
  if (simplified.startsWith("image/")) return "image";
  if (simplified.startsWith("font/")) return "font";
  if (simplified.startsWith("audio/") || simplified.startsWith("video/")) return "media";
  if (simplified === "application/wasm") return "wasm";
  if (simplified.includes("javascript") || simplified.endsWith("ecmascript")) return "script";
  return undefined;
}
