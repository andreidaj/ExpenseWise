"use client";

import Link from "next/link";
import { Fraunces } from "next/font/google";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { api, clearMailHint, errorMessage, loadMailHint, readDelivery, readTokens, saveMailHint, saveTokens } from "@/lib/http";

const display = Fraunces({
  subsets: ["latin", "latin-ext"],
  weight: "500",
  display: "swap",
});

const jobs = new Map<string, Promise<unknown>>();

function verifyOnce(token: string): Promise<unknown> {
  const existing = jobs.get(token);
  if (existing) return existing;
  const job = api("/api/auth/verify-email", {
    method: "POST",
    json: { token },
    auth: false,
    skipRefresh: true,
  });
  jobs.set(token, job);
  return job;
}

function calm(message: string): string {
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message)) {
    return "Nu am putut vorbi cu serverul. Verifică legătura și încearcă din nou.";
  }
  return message;
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="ew-auth">
      <style>{authCss}</style>
      <div className="ew-auth-col">
        <header>
          <Link href="/" className={`${display.className} ew-brand`}>
            ExpenseWise
          </Link>
          <p className="ew-tagline">Finanțele tale, liniștite.</p>
        </header>
        {children}
      </div>
    </main>
  );
}

function ConfirmScreen() {
  const params = useSearchParams();
  const token = params.get("token");
  const router = useRouter();
  const { user, loading, logout, refreshUser } = useAuth();
  const [hint, setHint] = useState(loadMailHint());
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(Boolean(token));

  useEffect(() => {
    if (loading || token || !user) return;
    router.replace("/panou");
  }, [loading, router, token, user]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setChecking(true);
    verifyOnce(token)
      .then(async (payload) => {
        const tokens = readTokens(payload);
        if (tokens) saveTokens(tokens);
        clearMailHint();
        const me = await refreshUser();
        if (!alive) return;
        if (me?.email_verified_at) router.replace("/panou");
        else router.replace("/autentificare?confirmat=1");
      })
      .catch((cause) => {
        if (!alive) return;
        setError(errorMessage(cause));
        setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, [refreshUser, router, token]);

  async function resend() {
    setPending(true);
    setError(null);
    setInfo(null);
    try {
      const payload = await api("/api/auth/resend-verification", { method: "POST", json: {} });
      const delivery = readDelivery(payload);
      const next = { email: user?.email || hint?.email || "", ...delivery };
      saveMailHint(next);
      setHint(next);
      setInfo("Am cerut din nou mesajul de confirmare.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  const email = user?.email || hint?.email;
  const devLink = hint?.verificationUrl || (hint?.verificationToken ? `/confirma-email?token=${encodeURIComponent(hint.verificationToken)}` : null);

  return (
    <Frame>
      <section className="ew-card">
        <h1 className={display.className}>Verifică emailul</h1>
        {checking ? <p className="ew-copy">Se confirmă adresa…</p> : null}
        {error ? (
          <p className="ew-error" role="alert">
            {calm(error)}
          </p>
        ) : null}
        {info ? (
          <p className="ew-ok" role="status">
            {info}
          </p>
        ) : null}
        {!checking ? (
          <>
            <p className="ew-copy">
              {email ? `Ți-am pregătit confirmarea pentru ${email}.` : "Deschide linkul din mesaj ca să intri în spațiul Personal."}
            </p>
            {hint?.emailSent === true ? null : hint?.emailSent === false ? (
              <p className="ew-note">Emailul nu a fost trimis. Linkul de confirmare este în logul serverului API.</p>
            ) : (
              <p className="ew-note">Dacă nu primești mesajul, serverul nu are Resend și linkul este în logul API.</p>
            )}
            {devLink ? (
              <p className="ew-note">
                Link primit de la server, doar pentru development:{" "}
                <a className="ew-break" href={devLink}>
                  {devLink}
                </a>
              </p>
            ) : null}
            {user ? (
              <div className="ew-stack">
                <button className="ew-primary" type="button" disabled={pending || loading} onClick={() => void resend()}>
                  {pending ? "Se trimite…" : "Trimite din nou"}
                </button>
                <button className="ew-quiet" type="button" onClick={() => void logout()}>
                  Ieși din cont
                </button>
              </div>
            ) : (
              <p className="ew-links">
                <Link href="/autentificare?next=/confirma-email">Intră în cont</Link> ca să retrimiți mesajul.
              </p>
            )}
          </>
        ) : null}
      </section>
    </Frame>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense
      fallback={
        <Frame>
          <section className="ew-card">
            <p className="ew-note">Se încarcă…</p>
          </section>
        </Frame>
      }
    >
      <ConfirmScreen />
    </Suspense>
  );
}

const authCss = `
.ew-auth, .ew-auth * { box-sizing: border-box; }
body:has(.ew-auth) { margin: 0; background: #0B0F19; }
.ew-auth {
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
.ew-auth-col {
  width: min(420px, calc(100% - 32px));
  margin-inline: auto;
  display: grid;
  gap: 22px;
  min-width: 0;
}
.ew-auth header { display: grid; gap: 8px; justify-items: center; min-width: 0; }
.ew-brand {
  margin: 0;
  font-size: 2rem;
  font-weight: 500;
  letter-spacing: -0.03em;
  line-height: 1.05;
  color: #F8FAFC;
  text-decoration: none;
  text-align: center;
}
.ew-tagline { margin: 0; text-align: center; font-size: 0.98rem; line-height: 1.4; color: #98A4BA; }
.ew-card {
  width: 100%;
  min-width: 0;
  background: #192132;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 20px;
  box-shadow: none;
  padding: 24px 20px 20px;
  display: grid;
  gap: 14px;
}
.ew-card h1 {
  margin: 0;
  font-size: clamp(1.45rem, 6vw, 1.65rem);
  font-weight: 500;
  letter-spacing: -0.03em;
  line-height: 1.15;
  color: #F8FAFC;
  overflow-wrap: anywhere;
}
.ew-copy, .ew-links, .ew-note, .ew-error, .ew-ok { margin: 0; line-height: 1.5; overflow-wrap: anywhere; background: none; border: 0; padding: 0; }
.ew-copy { color: #98A4BA; }
.ew-links { text-align: center; color: #98A4BA; font-size: 0.95rem; }
.ew-links a, .ew-note a, .ew-break { color: #B1A5FF; }
.ew-links a:hover, .ew-note a:hover { color: #9585FF; }
.ew-break { overflow-wrap: anywhere; }
.ew-note { color: #98A4BA; font-size: 0.92rem; }
.ew-error { color: #FF738A; font-size: 0.92rem; }
.ew-ok { color: #9EE6C3; font-size: 0.92rem; }
.ew-stack { display: grid; gap: 10px; }
.ew-primary, .ew-quiet {
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
  text-decoration: none;
}
.ew-primary { border: 1px solid #9585FF; background: #9585FF; color: #F8FAFC; }
.ew-primary:hover { background: #B1A5FF; border-color: #B1A5FF; color: #F8FAFC; }
.ew-quiet { border: 1px solid rgba(255,255,255,0.07); background: transparent; color: #F8FAFC; }
.ew-quiet:hover { border-color: #B1A5FF; color: #F8FAFC; }
.ew-primary:disabled, .ew-quiet:disabled { opacity: 0.55; cursor: not-allowed; }
.ew-auth :focus-visible { outline: 2px solid #9585FF; outline-offset: 2px; }
`;
