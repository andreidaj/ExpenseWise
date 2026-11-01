"use client";

import { Fraunces } from "next/font/google";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { asRecord, asString } from "@/lib/format";
import { ApiError, errorMessage } from "@/lib/http";
import { normalizeConsent } from "@/lib/normalize";
import { resources } from "@/lib/resources";

const display = Fraunces({
  subsets: ["latin", "latin-ext"],
  weight: "500",
  display: "swap",
});

function calm(message: string): string {
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message)) {
    return "Nu am putut vorbi cu serverul. Verifică legătura și încearcă din nou.";
  }
  return message;
}

function Sheet({ children }: { children: ReactNode }) {
  return (
    <main className="ew-sheet">
      <style>{sheetCss}</style>
      <article className="ew-sheet-col">{children}</article>
    </main>
  );
}

function ConsentScreen() {
  const params = useSearchParams();
  const request = params.get("request") || "";
  const router = useRouter();
  const { user, loading } = useAuth();
  const [clientName, setClientName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!request) return;
    if (!user) {
      router.replace(`/autentificare?next=${encodeURIComponent(`/autorizare-asistent?request=${request}`)}`);
      return;
    }
    let alive = true;
    resources
      .consent(request)
      .then((payload) => {
        if (!alive) return;
        const consent = normalizeConsent(payload);
        setClientName(consent.clientName);
        setEmail(consent.email || user.email);
        setReady(true);
      })
      .catch((cause) => {
        if (!alive) return;
        if (cause instanceof ApiError && cause.status === 410) {
          setExpired(true);
          setError(errorMessage(cause));
          return;
        }
        setError(errorMessage(cause));
      });
    return () => {
      alive = false;
    };
  }, [loading, request, router, user]);

  async function decide(allow: boolean) {
    setPending(true);
    setError(null);
    try {
      const payload = await resources.decideConsent(request, allow);
      const record = asRecord(payload);
      const redirectUrl = asString(record.redirect_url) || asString(record.redirectUrl);
      if (redirectUrl) {
        window.location.href = redirectUrl;
        return;
      }
      setError(allow ? "Accesul a fost permis, dar serverul nu a întors adresa de întoarcere." : "Accesul a fost refuzat.");
      setPending(false);
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }

  return (
    <Sheet>
      <h1 className={display.className}>Autorizare asistent</h1>
      <p className="ew-lede">
        Confirmi accesul unui asistent la cont. Permite îi lasă drepturile tale din spații, iar Refuză întoarce acces refuzat.
      </p>
      {!request ? (
        <p className="ew-error" role="alert">
          Lipsește cererea de autorizare.
        </p>
      ) : null}
      {expired ? (
        <p className="ew-error" role="alert">
          Cererea a expirat. Începe conectarea din nou din aplicația asistentului.
        </p>
      ) : null}
      {error && !expired ? (
        <p className="ew-error" role="alert">
          {calm(error)}
        </p>
      ) : null}
      {ready && !expired ? (
        <>
          <p className="ew-copy">
            <strong>{clientName}</strong> cere acces la contul {email || "tău"}.
          </p>
          <div className="ew-actions">
            <button className="ew-primary" type="button" disabled={pending} onClick={() => void decide(true)}>
              Permite
            </button>
            <button className="ew-danger" type="button" disabled={pending} onClick={() => void decide(false)}>
              Refuză
            </button>
          </div>
        </>
      ) : request && !error && !expired ? (
        <p className="ew-note">Se încarcă cererea…</p>
      ) : null}
    </Sheet>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <Sheet>
          <p className="ew-note">Se încarcă…</p>
        </Sheet>
      }
    >
      <ConsentScreen />
    </Suspense>
  );
}

const sheetCss = `
.ew-sheet, .ew-sheet * { box-sizing: border-box; }
body:has(.ew-sheet) { margin: 0; background: #0B0F19; }
.ew-sheet {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: safe center;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  padding: max(72px, calc(env(safe-area-inset-top, 0px) + 56px)) 0 max(32px, calc(env(safe-area-inset-bottom, 0px) + 24px));
  background: #0B0F19;
  color: #F8FAFC;
  color-scheme: dark;
}
.ew-sheet-col {
  width: min(420px, calc(100% - 32px));
  margin-inline: auto;
  display: grid;
  gap: 14px;
  align-content: center;
  min-width: 0;
  background: #192132;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 20px;
  padding: 24px 20px;
}
.ew-sheet h1 {
  margin: 0;
  font-size: clamp(1.7rem, 7vw, 2.2rem);
  font-weight: 500;
  letter-spacing: -0.03em;
  line-height: 1.12;
  color: #F8FAFC;
  overflow-wrap: anywhere;
}
.ew-lede, .ew-copy, .ew-note, .ew-error { margin: 0; line-height: 1.55; overflow-wrap: anywhere; background: none; border: 0; padding: 0; }
.ew-lede, .ew-copy { color: #98A4BA; }
.ew-note { color: #98A4BA; font-size: 0.95rem; }
.ew-error { color: #FF738A; font-size: 0.92rem; }
.ew-copy strong { color: #F8FAFC; font-weight: 600; }
.ew-actions { display: grid; grid-template-columns: 1fr; gap: 10px; }
.ew-primary, .ew-danger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 48px;
  padding: 0 18px;
  border-radius: 14px;
  box-shadow: none;
  font-family: inherit;
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
}
.ew-primary { border: 1px solid #9585FF; background: #9585FF; color: #F8FAFC; }
.ew-primary:hover { background: #B1A5FF; border-color: #B1A5FF; color: #F8FAFC; }
.ew-danger { border: 1px solid rgba(255,255,255,0.07); background: transparent; color: #FF738A; }
.ew-danger:hover { border-color: #FF738A; color: #FF738A; }
.ew-primary:disabled, .ew-danger:disabled { opacity: 0.55; cursor: not-allowed; }
.ew-sheet :focus-visible { outline: 2px solid #9585FF; outline-offset: 2px; }
`;
