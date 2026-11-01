"use client";

import { Fraunces } from "next/font/google";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { asRecord, asString } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { resources } from "@/lib/resources";
import { useSpace } from "@/lib/space";

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

function InviteScreen() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const router = useRouter();
  const { user, loading } = useAuth();
  const { reload, setCurrentId } = useSpace();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (loading || user) return;
    const next = token ? `/invitatie?token=${encodeURIComponent(token)}` : "/invitatie";
    router.replace(`/autentificare?next=${encodeURIComponent(next)}`);
  }, [loading, router, token, user]);

  async function accept() {
    setPending(true);
    setError(null);
    try {
      const payload = await resources.acceptInvite(token);
      const record = asRecord(payload);
      const spaceId = asString(record.space_id) || asString(asRecord(record.space).id);
      await reload();
      if (spaceId) setCurrentId(spaceId);
      router.replace("/panou");
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }

  return (
    <Sheet>
      <h1 className={display.className}>Invitație</h1>
      <p className="ew-lede">Accepți să intri în spațiul la care ai fost invitat, cu rolul ales de proprietar.</p>
      {!token ? (
        <p className="ew-error" role="alert">
          Linkul de invitație nu conține tokenul.
        </p>
      ) : null}
      {error ? (
        <p className="ew-error" role="alert">
          {calm(error)}
        </p>
      ) : null}
      {user && token ? (
        <button className="ew-primary" type="button" disabled={pending} onClick={() => void accept()}>
          {pending ? "Se acceptă…" : "Acceptă invitația"}
        </button>
      ) : (
        <p className="ew-note">Se verifică sesiunea…</p>
      )}
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
      <InviteScreen />
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
.ew-lede, .ew-note, .ew-error { margin: 0; line-height: 1.55; overflow-wrap: anywhere; background: none; border: 0; padding: 0; }
.ew-lede { color: #98A4BA; }
.ew-note { color: #98A4BA; font-size: 0.95rem; }
.ew-error { color: #FF738A; font-size: 0.92rem; }
.ew-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 48px;
  padding: 0 18px;
  border-radius: 14px;
  border: 1px solid #9585FF;
  background: #9585FF;
  color: #F8FAFC;
  box-shadow: none;
  font-family: inherit;
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
}
.ew-primary:hover { background: #B1A5FF; border-color: #B1A5FF; color: #F8FAFC; }
.ew-primary:disabled { opacity: 0.55; cursor: not-allowed; }
.ew-sheet :focus-visible { outline: 2px solid #9585FF; outline-offset: 2px; }
`;
