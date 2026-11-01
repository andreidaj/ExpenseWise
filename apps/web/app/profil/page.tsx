"use client";

import { Fraunces } from "next/font/google";
import { useEffect, useState, type ReactNode } from "react";
import { Guard } from "@/components/Guard";
import { ReportViewSwitch } from "@/components/ReportViewSwitch";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { ApiError, errorMessage } from "@/lib/http";
import { clearStoredPeriod } from "@/lib/period";
import { resources } from "@/lib/resources";
import type { AssistantGrant } from "@/lib/types";

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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="ew-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Profile() {
  const { user, patchMe, logout } = useAuth();
  const [name, setName] = useState(user?.display_name || "");
  const [day, setDay] = useState(String(user?.period_start_day ?? 1));
  const [grants, setGrants] = useState<AssistantGrant[]>([]);
  const [assistantNote, setAssistantNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function loadGrants() {
    try {
      setGrants(await resources.grants());
      setAssistantNote(null);
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 404 || cause.status === 503)) {
        setAssistantNote("Asistentul nu este pornit pe acest server.");
        setGrants([]);
        return;
      }
      setAssistantNote(errorMessage(cause));
    }
  }

  useEffect(() => {
    void loadGrants();
  }, []);

  useEffect(() => {
    setDay(String(user?.period_start_day ?? 1));
  }, [user?.period_start_day]);

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setInfo(null);
    try {
      await patchMe({ display_name: name.trim() });
      setInfo("Numele a fost salvat.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  async function saveDay(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setInfo(null);
    try {
      await patchMe({ period_start_day: Number(day) });
      clearStoredPeriod();
      setInfo("Ziua de început a fost salvată.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  async function download() {
    setError(null);
    try {
      const blob = await resources.exportBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "expensewise-export.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function revoke(grant: AssistantGrant) {
    if (!window.confirm(`Deconectezi ${grant.client_name}?`)) return;
    setError(null);
    try {
      await resources.revokeGrant(grant.id);
      await loadGrants();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div className="ew-page">
      <style>{pageCss}</style>
      <header>
        <h1 className={display.className}>Profil</h1>
        <p className="ew-lede">Numele afișat, felul în care vezi sumele și asistenții care au acces la cont.</p>
        {user?.email ? <p className="ew-note">{user.email}</p> : null}
      </header>
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
      <form className="ew-panel" onSubmit={(event) => void saveName(event)}>
        <Field label="Nume">
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>
        <button className="ew-primary" type="submit" disabled={pending}>
          Salvează numele
        </button>
      </form>
      <form className="ew-panel" onSubmit={(event) => void saveDay(event)}>
        <h2 className={display.className}>Începutul lunii</h2>
        <p className="ew-note">
          Cheltuielile, veniturile și bugetele pornesc din ziua asta și țin până în ziua dinaintea următoarei. Soldul contului rămâne tot ce e în cont.
        </p>
        <Field label="Ziua">
          <select value={day} onChange={(event) => setDay(event.target.value)}>
            {Array.from({ length: 31 }, (_, index) => {
              const value = String(index + 1);
              return (
                <option key={value} value={value}>
                  {value}
                </option>
              );
            })}
          </select>
        </Field>
        <button className="ew-primary" type="submit" disabled={pending}>
          Salvează ziua
        </button>
      </form>
      <section className="ew-panel">
        <h2 className={display.className}>Afișare sume</h2>
        <p className="ew-note">Individual pe monedă, consolidat în RON, sau ambele. Se salvează în cont și rămâne așa pe panou și în rapoarte.</p>
        <ReportViewSwitch />
      </section>
      <section className="ew-panel">
        <h2 className={display.className}>Export</h2>
        <p className="ew-note">JSON cu spațiile la care ai acces.</p>
        <button className="ew-quiet" type="button" onClick={() => void download()}>
          Descarcă exportul
        </button>
      </section>
      <section className="ew-panel">
        <h2 className={display.className}>Asistenți conectați</h2>
        <p className="ew-note">Cursor, Claude sau ChatGPT, după ce apeși Permite. Deconectarea oprește accesul.</p>
        {assistantNote ? <p className="ew-note">{calm(assistantNote)}</p> : null}
        {grants.length ? (
          grants.map((grant) => (
            <article key={grant.id} className="ew-person">
              <div>
                <strong>{grant.client_name}</strong>
                <div className="ew-meta">
                  Conectat {formatDateTime(grant.created_at)}
                  {grant.last_used_at ? ` · folosit ${formatDateTime(grant.last_used_at)}` : ""}
                </div>
              </div>
              <button className="ew-danger" type="button" onClick={() => void revoke(grant)}>
                Deconectează
              </button>
            </article>
          ))
        ) : assistantNote ? null : (
          <p className="ew-note">Niciun asistent conectat.</p>
        )}
      </section>
      <button className="ew-quiet" type="button" onClick={() => void logout()}>
        Ieși din cont
      </button>
    </div>
  );
}

export default function Page() {
  return (
    <Guard>
      <Profile />
    </Guard>
  );
}

const pageCss = `
.ew-page, .ew-page * { box-sizing: border-box; }
body:has(.ew-page) { margin: 0; }
.ew-page {
  display: grid;
  gap: 22px;
  min-width: 0;
  max-width: 100%;
  color: #F8FAFC;
  color-scheme: dark;
  background: #0B0F19;
}
.ew-page header { display: grid; gap: 8px; min-width: 0; }
.ew-page h1 {
  margin: 0;
  font-size: clamp(1.7rem, 7vw, 2.15rem);
  font-weight: 500;
  letter-spacing: -0.03em;
  line-height: 1.12;
  color: #F8FAFC;
  overflow-wrap: anywhere;
}
.ew-page h2 {
  margin: 0;
  font-size: 1.28rem;
  font-weight: 500;
  letter-spacing: -0.02em;
  color: #F8FAFC;
}
.ew-lede { margin: 0; max-width: 40rem; color: #98A4BA; line-height: 1.55; overflow-wrap: anywhere; }
.ew-note, .ew-error, .ew-ok { margin: 0; line-height: 1.5; overflow-wrap: anywhere; background: none; border: 0; padding: 0; box-shadow: none; }
.ew-note { color: #98A4BA; font-size: 0.95rem; }
.ew-error { color: #FF738A; font-size: 0.92rem; }
.ew-ok { color: #9EE6C3; font-size: 0.92rem; }
.ew-panel {
  background: #192132;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 20px;
  box-shadow: none;
  padding: 20px;
  display: grid;
  gap: 14px;
  min-width: 0;
  max-width: 100%;
}
.ew-field { display: grid; gap: 6px; min-width: 0; }
.ew-field > span { font-size: 0.86rem; color: #98A4BA; }
.ew-page input:not([type="checkbox"]),
.ew-page select {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 48px;
  border: 1px solid rgba(255,255,255,0.07);
  background: #0B0F19;
  color: #F8FAFC;
  border-radius: 12px;
  padding: 10px 14px;
  box-shadow: none;
  font-family: inherit;
  font-size: 16px;
}
.ew-primary, .ew-quiet, .ew-danger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: stretch;
  width: 100%;
  min-height: 48px;
  padding: 0 16px;
  border-radius: 14px;
  box-shadow: none;
  font-family: inherit;
  font-size: 0.98rem;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
  text-decoration: none;
}
.ew-primary { border: 1px solid #9585FF; background: #9585FF; color: #F8FAFC; }
.ew-primary:hover { background: #B1A5FF; border-color: #B1A5FF; color: #F8FAFC; }
.ew-quiet { border: 1px solid rgba(255,255,255,0.07); background: transparent; color: #F8FAFC; }
.ew-quiet:hover { border-color: #B1A5FF; color: #F8FAFC; }
.ew-danger { border: 1px solid rgba(255,255,255,0.07); background: transparent; color: #FF738A; }
.ew-danger:hover { border-color: #FF738A; color: #FF738A; }
.ew-primary:disabled, .ew-quiet:disabled, .ew-danger:disabled { opacity: 0.55; cursor: not-allowed; }
.ew-person {
  display: flex;
  gap: 12px;
  align-items: stretch;
  justify-content: space-between;
  flex-wrap: wrap;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.07);
  min-width: 0;
}
.ew-person > div { min-width: 0; flex: 1 1 12rem; }
.ew-person strong { font-weight: 600; overflow-wrap: anywhere; }
.ew-meta { color: #98A4BA; font-size: 0.88rem; margin-top: 2px; overflow-wrap: anywhere; }
.ew-page .segment {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 6px;
  width: 100%;
  max-width: 100%;
  overflow: visible;
  box-sizing: border-box;
  padding: 6px;
  background: #0B0F19;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 16px;
  box-shadow: none;
}
.ew-page .segment button {
  flex: 1 1 100%;
  width: auto;
  min-width: 0;
  min-height: 44px;
  padding: 8px 14px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: #98A4BA;
  box-shadow: none;
  white-space: normal;
  text-align: center;
}
.ew-page .segment button:hover { background: rgba(255,255,255,0.04); color: #F8FAFC; }
.ew-page .segment button[aria-pressed="true"] { background: #9585FF; color: #F8FAFC; box-shadow: none; }
.ew-page .alert,
.ew-page .alert.error {
  background: transparent;
  border: 0;
  border-radius: 0;
  padding: 0;
  box-shadow: none;
  color: #FF738A;
}
.ew-page :focus-visible { outline: 2px solid #9585FF; outline-offset: 2px; }
@media (min-width: 861px) {
  .ew-primary, .ew-quiet, .ew-danger { width: auto; justify-self: start; }
  .ew-page .segment { width: fit-content; flex-wrap: nowrap; }
  .ew-page .segment button { flex: 0 1 auto; }
}
`;
