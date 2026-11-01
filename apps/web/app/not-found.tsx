import Link from "next/link";
import { Fraunces } from "next/font/google";

const display = Fraunces({
  subsets: ["latin", "latin-ext"],
  weight: "500",
  display: "swap",
});

export default function NotFound() {
  return (
    <main className="ew-sheet">
      <style>{sheetCss}</style>
      <article className="ew-sheet-col">
        <h1 className={display.className}>Pagina nu există</h1>
        <p className="ew-lede">Adresa nu duce nicăieri în ExpenseWise.</p>
        <Link className="ew-primary" href="/">
          Înapoi la ExpenseWise
        </Link>
      </article>
    </main>
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
.ew-lede { margin: 0; color: #98A4BA; line-height: 1.55; overflow-wrap: anywhere; }
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
.ew-primary:hover { background: #B1A5FF; border-color: #B1A5FF; color: #F8FAFC; text-decoration: none; }
.ew-sheet :focus-visible { outline: 2px solid #9585FF; outline-offset: 2px; }
`;
