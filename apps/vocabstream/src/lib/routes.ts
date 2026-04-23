export const VOCABSTREAM_BASE_PATH = "/vocabstream";

export type RouteMatch = {
  pathname: string;
  params: Record<string, string>;
};

export function stripBasePath(pathname: string): string {
  if (!pathname.startsWith(VOCABSTREAM_BASE_PATH)) {
    return pathname || "/";
  }

  const stripped = pathname.slice(VOCABSTREAM_BASE_PATH.length);
  return stripped ? ensureLeadingSlash(stripped) : "/";
}

export function ensureLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export function normalizeInternalPath(path: string): string {
  if (!path || path === "/" || path === "/landing_page") {
    return "/learn";
  }

  return ensureLeadingSlash(path);
}

export function toAppPath(path: string): string {
  if (!path) {
    return VOCABSTREAM_BASE_PATH;
  }

  if (/^(https?:)?\/\//.test(path) || path.startsWith("#")) {
    return path;
  }

  if (path.startsWith(VOCABSTREAM_BASE_PATH)) {
    return path;
  }

  const normalized = normalizeInternalPath(path);
  return normalized === "/" ? VOCABSTREAM_BASE_PATH : `${VOCABSTREAM_BASE_PATH}${normalized}`;
}

export function matchPath(pattern: string, pathname: string): RouteMatch | null {
  const normalizedPattern = pattern === "/" ? [] : pattern.split("/").filter(Boolean);
  const normalizedPath = pathname === "/" ? [] : pathname.split("/").filter(Boolean);

  if (normalizedPattern.length !== normalizedPath.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const patternSegment = normalizedPattern[index];
    const pathSegment = normalizedPath[index];

    if (patternSegment.startsWith(":")) {
      params[patternSegment.slice(1)] = decodeURIComponent(pathSegment);
      continue;
    }

    if (patternSegment !== pathSegment) {
      return null;
    }
  }

  return {
    pathname,
    params,
  };
}
