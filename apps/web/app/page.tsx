"use client";

import Link from "next/link";
import { Fraunces } from "next/font/google";
import { useAuth } from "@/lib/auth";

const display = Fraunces({
  subsets: ["latin", "latin-ext"],
  weight: "500",
  display: "swap",
});

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
.ew-copy { margin: 0; color: #98A4BA; line-height: 1.5; overflow-wrap: anywhere; }
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
.ew-primary:hover { background: #B1A5FF; border-color: #B1A5FF; color: #F8FAFC; text-decoration: none; }
.ew-quiet { border: 1px solid rgba(255,255,255,0.07); background: transparent; color: #F8FAFC; }
.ew-quiet:hover { border-color: #B1A5FF; color: #F8FAFC; text-decoration: none; }
.ew-auth :focus-visible { outline: 2px solid #9585FF; outline-offset: 2px; }
`;

export default function HomePage() {
  const { user, loading } = useAuth();
  const nextHref = user ? "/panou" : "/inregistrare";
  const nextLabel = user ? "Deschide panoul" : "Creează cont";

  return (
    <main className="ew-auth">
      <style>{authCss}</style>
      <div className="ew-auth-col">
        <header>
          <p className={`${display.className} ew-brand`}>ExpenseWise</p>
          <p className="ew-tagline">Finanțele tale, liniștite.</p>
        </header>
        <section className="ew-card">
          <h1 className={display.className}>Finanțele casei, într-un singur loc.</h1>
          <p className="ew-copy">
            {user
              ? "Conturile și spațiile tale sunt aici."
              : "Spații personale, de familie și de proiect. Conturi în moneda lor, cu totalul adus în lei."}
          </p>
          <Link className="ew-primary" href={loading ? "/inregistrare" : nextHref}>
            {loading ? "Creează cont" : nextLabel}
          </Link>
          {!user ? (
            <Link className="ew-quiet" href="/autentificare">
              Intră în cont
            </Link>
          ) : null}
        </section>
      </div>
    </main>
  );
}
