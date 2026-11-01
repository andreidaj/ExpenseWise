"use client";

import type { ReactNode } from "react";
import { Alert } from "@/components/ui";
import { useSpace } from "@/lib/space";
import type { Space } from "@/lib/types";

export function SpaceBody({ children }: { children: (space: Space) => ReactNode }) {
  const { current, loading, error } = useSpace();
  if (loading && !current) return <p className="muted empty" role="status">Se încarcă spațiul…</p>;
  if (!current) {
    return <Alert kind={error ? "error" : "info"}>{error || "Nu există încă un spațiu."}</Alert>;
  }
  return <>{children(current)}</>;
}
