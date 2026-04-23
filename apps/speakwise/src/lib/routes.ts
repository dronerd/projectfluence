export const SPEAKWISE_BASE_PATH = "/speakwise";

export function ensureLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export function stripBasePath(pathname: string): string {
  if (!pathname.startsWith(SPEAKWISE_BASE_PATH)) {
    return pathname || "/";
  }

  const stripped = pathname.slice(SPEAKWISE_BASE_PATH.length);
  return stripped ? ensureLeadingSlash(stripped) : "/";
}

export function normalizeInternalPath(path: string): string {
  if (!path || path === "/") {
    return "/";
  }

  return ensureLeadingSlash(path);
}

export function toAppPath(path: string): string {
  if (!path) {
    return SPEAKWISE_BASE_PATH;
  }

  if (/^(https?:)?\/\//.test(path) || path.startsWith("#")) {
    return path;
  }

  if (path.startsWith(SPEAKWISE_BASE_PATH)) {
    return path;
  }

  const normalized = normalizeInternalPath(path);
  return normalized === "/" ? SPEAKWISE_BASE_PATH : `${SPEAKWISE_BASE_PATH}${normalized}`;
}
