"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftRight,
  ChartColumn,
  ChartPie,
  CircleUser,
  FileUp,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Receipt,
  Repeat,
  Tags,
  Target,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/components/Providers";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useSpace } from "@/lib/space";

type Icon = typeof LayoutDashboard;

const ITEMS: { href: string; label: string; icon: Icon }[] = [
  { href: "/panou", label: "Panou", icon: LayoutDashboard },
  { href: "/tranzactii", label: "Tranzacții", icon: ArrowLeftRight },
  { href: "/conturi", label: "Conturi", icon: Wallet },
  { href: "/categorii", label: "Categorii", icon: Tags },
  { href: "/bugete", label: "Bugete", icon: ChartPie },
  { href: "/obiective", label: "Obiective", icon: Target },
  { href: "/recurente", label: "Recurențe", icon: Repeat },
  { href: "/rapoarte", label: "Rapoarte", icon: ChartColumn },
  { href: "/import", label: "Extras din bancă", icon: FileUp },
  { href: "/bon", label: "Bon", icon: Receipt },
  { href: "/spatii", label: "Spații", icon: Layers },
  { href: "/profil", label: "Profil", icon: CircleUser },
];

const MORE = ITEMS.filter((item) => !["/panou", "/tranzactii", "/conturi"].includes(item.href));

function isCurrent(pathname: string, href: string) {
  return pathname === href || (href !== "/panou" && pathname.startsWith(`${href}/`));
}

function Mark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#0B0F19" />
      <rect x="1" y="1" width="30" height="30" rx="8" stroke="#9585FF" strokeOpacity="0.55" />
      <path d="M9 21.5V16.5" stroke="#FF738A" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16 21.5V11.5" stroke="#9585FF" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M23 21.5V8.5" stroke="#4EE0B5" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function SpaceSelect() {
  const { spaces, current, setCurrentId } = useSpace();
  return (
    <label className="switcher">
      <span>Spațiu</span>
      <select aria-label="Spațiu curent" value={current?.id ?? ""} onChange={(event) => setCurrentId(event.target.value)}>
        {spaces
          .filter((space) => !space.archived_at)
          .map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
      </select>
    </label>
  );
}

function LogoutButton() {
  const { logout } = useAuth();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void logout().finally(() => setPending(false));
      }}
    >
      <LogOut aria-hidden="true" />
      Ieși din cont
    </Button>
  );
}

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: (typeof ITEMS)[number];
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="nav-link"
      aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
      onClick={onNavigate}
    >
      <Icon aria-hidden="true" strokeWidth={1.75} />
      <span>{item.label}</span>
    </Link>
  );
}

function dockCurrent(pathname: string, href: string) {
  if (href === "/tranzactii") {
    return pathname === "/tranzactii" || (pathname.startsWith("/tranzactii/") && pathname !== "/tranzactii/nou");
  }
  return isCurrent(pathname, href);
}

function DockLink({ item, pathname, onNavigate }: { item: (typeof ITEMS)[number]; pathname: string; onNavigate: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="dock-item"
      aria-current={dockCurrent(pathname, item.href) ? "page" : undefined}
      onClick={onNavigate}
    >
      <Icon aria-hidden="true" strokeWidth={1.75} />
      <span className="dock-label">{item.label}</span>
    </Link>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduce = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panou = ITEMS[0];
  const tranzactii = ITEMS[1];
  const conturi = ITEMS[2];

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onResize() {
      if (window.innerWidth > 860) setOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        menuRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function closeMenu() {
    setOpen(false);
    menuRef.current?.focus();
  }

  return (
    <div className="app">
      <aside className="side">
        <div className="side-head">
          <Link href="/panou" className="brand">
            <Mark />
            ExpenseWise
          </Link>
        </div>
        <nav aria-label="Secțiuni">
          {ITEMS.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
        <div className="side-foot">
          <SpaceSelect />
          <LogoutButton />
        </div>
      </aside>
      <div className="frame">
        <a className="skip" href="#continut">
          Sari la conținut
        </a>
        <main id="continut" className="content" inert={open ? true : undefined}>
          {children}
        </main>
        <AnimatePresence>
        {open ? (
          <motion.div
            id="meniu-extins"
            className="menu-sheet"
            role="region"
            aria-label="Meniu"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
          >
            <div className="menu-sticky">
              <div className="menu-heading">
                <p id="meniu-titlu" className="menu-title">
                  Meniu
                </p>
                <Button ref={closeRef} variant="ghost" size="sm" onClick={closeMenu}>
                  Închide
                </Button>
              </div>
              <SpaceSelect />
              <LogoutButton />
            </div>
            <nav className="menu-links" aria-label="Restul secțiunilor">
              {MORE.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} onNavigate={() => setOpen(false)} />
              ))}
            </nav>
          </motion.div>
        ) : null}
        </AnimatePresence>
        <nav className="dock" aria-label="Navigare principală">
        <DockLink item={panou} pathname={pathname} onNavigate={() => setOpen(false)} />
        <DockLink item={tranzactii} pathname={pathname} onNavigate={() => setOpen(false)} />
        <Link
          href="/tranzactii/nou"
          className="dock-add"
          aria-label="Tranzacție nouă"
          aria-current={pathname === "/tranzactii/nou" ? "page" : undefined}
          onClick={() => setOpen(false)}
        >
          <Plus aria-hidden="true" strokeWidth={2.25} />
        </Link>
        <DockLink item={conturi} pathname={pathname} onNavigate={() => setOpen(false)} />
        <button
          ref={menuRef}
          className="dock-item"
          type="button"
          aria-expanded={open}
          aria-controls="meniu-extins"
          aria-label={open ? "Închide meniul" : "Deschide meniul"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" strokeWidth={1.75} /> : <Menu aria-hidden="true" strokeWidth={1.75} />}
          <span className="dock-label">Meniu</span>
        </button>
        </nav>
      </div>
    </div>
  );
}
