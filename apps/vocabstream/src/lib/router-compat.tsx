"use client";

import {
  createContext,
  useContext,
  useEffect,
  type AnchorHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { stripBasePath, toAppPath } from "./routes";

type RouterCompatContextValue = {
  pathname: string;
  params: Record<string, string>;
};

const RouterCompatContext = createContext<RouterCompatContextValue>({
  pathname: "/",
  params: {},
});

export function RouterCompatProvider({
  children,
  pathname,
  params,
}: PropsWithChildren<RouterCompatContextValue>) {
  return (
    <RouterCompatContext.Provider value={{ pathname, params }}>
      {children}
    </RouterCompatContext.Provider>
  );
}

export function useLocation() {
  const compat = useContext(RouterCompatContext);
  const nextPathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";

  return {
    pathname: compat.pathname || stripBasePath(nextPathname || "/"),
    search: search ? `?${search}` : "",
    hash: "",
    key: "",
    state: null,
  };
}

export function useParams<T extends Record<string, string>>() {
  const compat = useContext(RouterCompatContext);
  return compat.params as T;
}

export function useNavigate() {
  const router = useRouter();

  return (target: string | number) => {
    if (typeof target === "number") {
      if (target === -1) {
        router.back();
        return;
      }

      if (typeof window !== "undefined" && Number.isInteger(target)) {
        window.history.go(target);
      }
      return;
    }

    router.push(toAppPath(target));
  };
}

type CompatLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  children: ReactNode;
};

export const Link = ({ to, children, ...props }: CompatLinkProps) => {
  const href = toAppPath(to);
  return (
    <NextLink href={href} {...props}>
      {children}
    </NextLink>
  );
};

export function Navigate({ to }: { to: string }) {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(to);
  }, [navigate, to]);

  return null;
}

export function Routes({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function Route() {
  return null;
}
