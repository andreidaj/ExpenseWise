"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Guard } from "@/components/Guard";
import { SpaceBody } from "@/components/SpaceBody";
import { TransactionForm } from "@/components/TransactionForm";
import { Alert, PageHeader } from "@/components/ui";
import { errorMessage } from "@/lib/http";
import { canDelete, canWriteTransactions } from "@/lib/permissions";
import { resources } from "@/lib/resources";
import type { Account, Category, Goal, Space, Transaction } from "@/lib/types";

const screenCss = `
.ew-screen{width:100%;max-width:100%;min-width:0;overflow-x:hidden;display:grid;gap:16px;background:transparent;color:#F8FAFC}
.ew-screen h1{font-family:inherit;color:#F8FAFC;font-size:1.7rem;line-height:1.15;overflow-wrap:anywhere}
.ew-screen .muted{color:#98A4BA}
.ew-screen .page-head{display:flex;flex-direction:column;align-items:stretch;gap:12px;width:100%;max-width:100%}
.ew-screen .alert{background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:16px;color:#F8FAFC;overflow-wrap:anywhere}
.ew-screen .alert.error{color:#FF738A;border-color:rgba(255,115,138,0.4)}
`;

function EditTransaction({ space }: { space: Space }) {
  const params = useParams<{ id: string }>();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      resources.transaction(space.id, params.id),
      resources.accounts(space.id),
      resources.categories(space.id),
      resources.goals(space.id).catch(() => []),
    ])
      .then(([nextTransaction, nextAccounts, nextCategories, nextGoals]) => {
        setTransaction(nextTransaction);
        setAccounts(nextAccounts);
        setCategories(nextCategories);
        setGoals(nextGoals);
      })
      .catch((cause) => setError(errorMessage(cause)));
  }, [params.id, space.id]);

  return (
    <div className="ew-screen">
      <style>{screenCss}</style>
      <PageHeader title={canWriteTransactions(space.role) ? "Modifică tranzacția" : "Tranzacție"} />
      {error ? <Alert>{error}</Alert> : null}
      {!transaction && !error ? <p className="muted">Se încarcă tranzacția…</p> : null}
      {transaction && (transaction.kind === "debt" || transaction.kind === "repayment") ? (
        <p className="muted">
          Mișcarea asta ține de o datorie. O vezi și o închizi în <Link href="/datorii">Datorii</Link>.
        </p>
      ) : null}
      {transaction && transaction.kind !== "debt" && transaction.kind !== "repayment" ? (
        <TransactionForm
          spaceId={space.id}
          baseCurrency={space.base_currency}
          accounts={accounts}
          categories={categories}
          goals={goals}
          initial={transaction}
          readOnly={!canWriteTransactions(space.role)}
          canDelete={canDelete(space.role)}
        />
      ) : null}
    </div>
  );
}

export default function Page() {
  return (
    <Guard>
      <SpaceBody>{(space) => <EditTransaction space={space} />}</SpaceBody>
    </Guard>
  );
}
