"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Guard } from "@/components/Guard";
import { SpaceBody } from "@/components/SpaceBody";
import { TransactionForm } from "@/components/TransactionForm";
import { Alert, PageHeader } from "@/components/ui";
import { errorMessage } from "@/lib/http";
import { canManage, canWriteTransactions } from "@/lib/permissions";
import { resources } from "@/lib/resources";
import type { Account, Category, Goal, Space } from "@/lib/types";

const screenCss = `
.ew-screen{width:100%;max-width:100%;min-width:0;overflow-x:hidden;display:grid;gap:16px;background:transparent;color:#F8FAFC}
.ew-screen h1,.ew-screen h2{font-family:inherit;color:#F8FAFC}
.ew-screen h1{font-size:1.7rem;line-height:1.15;overflow-wrap:anywhere}
.ew-screen .muted,.ew-screen .page-lede{color:#98A4BA;max-width:100%}
.ew-screen a{color:#9585FF}
.ew-screen .page-head{display:flex;flex-direction:column;align-items:stretch;gap:12px;width:100%;max-width:100%}
.ew-screen .page-head>.stack{min-width:0;width:100%}
.ew-screen .page-action{width:100%}
.ew-screen .page-action>.btn,.ew-screen .page-action>a{width:100%;min-height:44px}
@media (min-width:840px){
  .ew-screen .page-head{flex-direction:row;flex-wrap:wrap;align-items:flex-end;justify-content:space-between}
  .ew-screen .page-head>.stack{width:auto;flex:1 1 16rem}
  .ew-screen .page-action{width:auto;flex:0 0 auto}
  .ew-screen .page-action>.btn,.ew-screen .page-action>a{width:auto}
}
.ew-screen .alert{background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:16px;color:#F8FAFC;overflow-wrap:anywhere}
.ew-screen .alert.error{color:#FF738A;border-color:rgba(255,115,138,0.4)}
.ew-screen .btn.primary,.ew-screen .btn.primary:hover{background:#9585FF;border-color:#9585FF;color:#0B0F19;min-height:44px}
.ew-empty{display:grid;gap:10px;justify-items:start;padding:16px;background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:20px;max-width:100%}
.ew-empty p{color:#F8FAFC}
`;

function NewTransaction({ space }: { space: Space }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    setReady(false);
    setError(null);
    Promise.all([resources.accounts(space.id), resources.categories(space.id), resources.goals(space.id).catch(() => [])])
      .then(([nextAccounts, nextCategories, nextGoals]) => {
        if (!alive) return;
        setAccounts(nextAccounts);
        setCategories(nextCategories);
        setGoals(nextGoals);
      })
      .catch((cause) => {
        if (alive) setError(errorMessage(cause));
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [space.id]);

  if (!canWriteTransactions(space.role)) {
    return (
      <div className="ew-screen">
        <style>{screenCss}</style>
        <PageHeader title="Tranzacție nouă" lede="Venit, cheltuială sau transfer între conturile acestui spațiu." />
        <Alert>Rolul tău poate vedea tranzacțiile, nu le poate adăuga.</Alert>
      </div>
    );
  }

  const needsAccount = ready && !error && accounts.length === 0;
  const accountHref = canManage(space.role) ? "/conturi#cont-nou" : "/conturi";
  const accountLabel = canManage(space.role) ? "Cont nou" : "Conturi";

  return (
    <div className="ew-screen">
      <style>{screenCss}</style>
      <PageHeader
        title="Tranzacție nouă"
        lede="Venit, cheltuială sau transfer între conturile acestui spațiu."
        action={
          needsAccount ? (
            <Link className="btn primary" href={accountHref}>
              {accountLabel}
            </Link>
          ) : null
        }
      />
      {error ? <Alert>{error}</Alert> : null}
      {!ready ? <p className="muted">Se încarcă conturile…</p> : null}
      {needsAccount ? (
        <div className="ew-empty">
          <p>Încă nu există un cont pentru tranzacție.</p>
          <Link href={accountHref}>{accountLabel}</Link>
        </div>
      ) : null}
      {accounts.length ? (
        <TransactionForm
          spaceId={space.id}
          baseCurrency={space.base_currency}
          accounts={accounts}
          categories={categories}
          goals={goals}
        />
      ) : null}
    </div>
  );
}

export default function Page() {
  return (
    <Guard>
      <SpaceBody>{(space) => <NewTransaction space={space} />}</SpaceBody>
    </Guard>
  );
}
