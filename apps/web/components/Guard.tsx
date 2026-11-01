"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Shell } from "@/components/Shell";
import { useAuth } from "@/lib/auth";

export function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/autentificare?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, pathname, router, user]);

  if (loading || !user) {
    return (
      <div className="center-fallback" role="status">
        <p className="brand">ExpenseWise</p>
        <p className="muted">Se încarcă…</p>
      </div>
    );
  }
  return <Shell>{children}</Shell>;
}
