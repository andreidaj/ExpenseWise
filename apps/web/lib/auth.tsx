"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearMailHint, clearTokens, getAccess, getRefresh, readDelivery, readTokens, saveMailHint, saveTokens } from "@/lib/http";
import { normalizeUser } from "@/lib/normalize";
import { resources } from "@/lib/resources";
import type { ReportView, User } from "@/lib/types";

type RegisterResult = {
  user: User;
};

type AuthValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: { email: string; password: string; display_name: string }) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  patchMe: (body: {
    display_name?: string;
    report_view?: ReportView;
    base_currency?: string;
    period_start_day?: number;
  }) => Promise<User>;
};

const AuthContext = createContext<AuthValue | null>(null);

async function establishSession(payload: unknown, email: string, password: string): Promise<void> {
  const tokens = readTokens(payload);
  if (tokens) {
    saveTokens(tokens);
    return;
  }
  const logged = await api("/api/auth/login", {
    method: "POST",
    json: { email, password },
    auth: false,
    skipRefresh: true,
  });
  const nextTokens = readTokens(logged);
  if (!nextTokens) throw new Error("Contul a fost creat, dar nu am primit sesiunea.");
  saveTokens(nextTokens);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!getAccess() && !getRefresh()) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const me = await resources.me();
        if (!cancelled) setUser(me);
      } catch {
        clearTokens();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void boot();
    function onUnauthorized() {
      setUser(null);
      router.replace("/autentificare");
    }
    window.addEventListener("expensewise-unauthorized", onUnauthorized);
    return () => {
      cancelled = true;
      window.removeEventListener("expensewise-unauthorized", onUnauthorized);
    };
  }, [router]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      async login(email, password) {
        const payload = await api("/api/auth/login", {
          method: "POST",
          json: { email, password },
          auth: false,
          skipRefresh: true,
        });
        const tokens = readTokens(payload);
        if (!tokens) throw new Error("Autentificarea nu a întors un token.");
        saveTokens(tokens);
        const me = normalizeUser(payload).email ? normalizeUser(payload) : await resources.me();
        const resolved = me.email ? me : await resources.me();
        setUser(resolved);
        return resolved;
      },
      async register(input) {
        const payload = await api("/api/auth/register", {
          method: "POST",
          json: input,
          auth: false,
          skipRefresh: true,
        });
        await establishSession(payload, input.email, input.password);
        const delivery = readDelivery(payload);
        saveMailHint({ email: input.email, ...delivery });
        const me = await resources.me();
        setUser(me);
        return { user: me };
      },
      async logout() {
        const refresh = getRefresh();
        try {
          if (refresh) {
            await api("/api/auth/logout", {
              method: "POST",
              json: { refresh_token: refresh },
              skipRefresh: true,
            });
          }
        } catch {
          // Ieșirea locală rămâne chiar dacă serverul nu răspunde.
        }
        clearTokens();
        clearMailHint();
        setUser(null);
        router.replace("/");
      },
      async refreshUser() {
        if (!getAccess() && !getRefresh()) {
          setUser(null);
          return null;
        }
        const me = await resources.me();
        setUser(me);
        return me;
      },
      async patchMe(body) {
        const me = await resources.patchMe(body);
        setUser(me);
        return me;
      },
    }),
    [loading, router, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth trebuie folosit în AuthProvider.");
  return value;
}
