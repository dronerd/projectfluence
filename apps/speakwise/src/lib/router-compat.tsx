"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toAppPath } from "./routes";

export function useNavigate() {
  const router = useRouter();

  return (target: string | number) => {
    if (typeof target === "number") {
      if (target === -1) {
        router.back();
      }
      return;
    }

    router.push(toAppPath(target));
  };
}

export function Navigate({ to }: { to: string }) {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(to);
  }, [navigate, to]);

  return null;
}
