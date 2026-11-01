"use client";

import Link from "next/link";
import { Fraunces } from "next/font/google";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/http";

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

export default function RegisterPage() {
  const { register, user } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Parola are minim 8 caractere.");
      return;
    }
    if (password !== confirm) {
      setError("Parolele nu coincid.");
      return;
    }
    setPending(true);
    try {
      await register({
        display_name: displayName.trim(),
        email: email.trim(),
        password,
      });
      router.replace("/panou");
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }

  return (
    <Frame>
      <form className="ew-card" onSubmit={(event) => void submit(event)}>
        <h1 className={display.className}>Creează cont</h1>
        <p className="ew-copy">Înregistrarea este deschisă. Nu ai nevoie de invitație.</p>
        {user ? <p className="ew-note">Ești deja autentificat.</p> : null}
        {error ? (
          <p className="ew-error" role="alert">
            {calm(error)}
          </p>
        ) : null}
        <Field label="Nume">
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" required />
        </Field>
        <Field label="Email">
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
        </Field>
        <Field label="Parolă">
          <PasswordInput value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
        </Field>
        <Field label="Confirmă parola">
          <PasswordInput value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" minLength={8} required />
        </Field>
        <button className="ew-primary" type="submit" disabled={pending}>
          {pending ? "Se creează…" : "Creează contul"}
        </button>
        <p className="ew-links">
          Ai deja cont? <Link href="/autentificare">Intră în cont</Link>
        </p>
      </form>
    </Frame>
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
.ew-copy, .ew-links, .ew-note, .ew-error { margin: 0; line-height: 1.5; overflow-wrap: anywhere; background: none; border: 0; padding: 0; }
.ew-copy { color: #98A4BA; }
.ew-links { text-align: center; color: #98A4BA; font-size: 0.95rem; }
.ew-links a { color: #B1A5FF; }
.ew-links a:hover { color: #9585FF; }
.ew-note { color: #98A4BA; font-size: 0.92rem; }
.ew-error { color: #FF738A; font-size: 0.92rem; }
.ew-field { display: grid; gap: 6px; min-width: 0; }
.ew-field > span { font-size: 0.86rem; color: #98A4BA; }
.ew-auth input, .ew-auth select {
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
.ew-auth input:-webkit-autofill {
  -webkit-text-fill-color: #F8FAFC;
  caret-color: #F8FAFC;
  box-shadow: 0 0 0 1000px #0B0F19 inset;
}
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
  text-decoration: none;
}
.ew-primary:hover { background: #B1A5FF; border-color: #B1A5FF; color: #F8FAFC; }
.ew-primary:disabled { opacity: 0.55; cursor: not-allowed; }
.ew-auth :focus-visible { outline: 2px solid #9585FF; outline-offset: 2px; }
`;
