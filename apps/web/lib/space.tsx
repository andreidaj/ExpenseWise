"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/http";
import { resources } from "@/lib/resources";
import type { Space } from "@/lib/types";

const SPACE_KEY = "expensewise.space_id";

type SpaceValue = {
  spaces: Space[];
  current: Space | null;
  loading: boolean;
  error: string | null;
  setCurrentId: (id: string) => void;
  reload: () => Promise<void>;
};

const SpaceContext = createContext<SpaceValue | null>(null);

function pickSpace(spaces: Space[], preferred: string | null): Space | null {
  const active = spaces.filter((space) => !space.archived_at);
  return (
    active.find((space) => space.id === preferred) ||
    active.find((space) => space.kind === "personal" && space.name === "Personal") ||
    active.find((space) => space.kind === "personal") ||
    active[0] ||
    null
  );
}

export function SpaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [currentId, setCurrentIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    if (!user) {
      setSpaces([]);
      setCurrentIdState(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await resources.spaces();
      setSpaces(next);
      const stored = window.localStorage.getItem(SPACE_KEY);
      const chosen = pickSpace(next, currentId || stored);
      setCurrentIdState(chosen?.id ?? null);
      if (chosen) window.localStorage.setItem(SPACE_KEY, chosen.id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // Reîncarcă spațiile când identitatea se schimbă.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function setCurrentId(id: string) {
    setCurrentIdState(id);
    window.localStorage.setItem(SPACE_KEY, id);
  }

  const current = spaces.find((space) => space.id === currentId) ?? null;
  const value = useMemo(
    () => ({ spaces, current, loading, error, setCurrentId, reload }),
    [spaces, current, loading, error],
  );

  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>;
}

export function useSpace(): SpaceValue {
  const value = useContext(SpaceContext);
  if (!value) throw new Error("useSpace trebuie folosit în SpaceProvider.");
  return value;
}
