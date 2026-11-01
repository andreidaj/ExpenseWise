"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/http";
import { useAuth } from "@/lib/auth";
import { REPORT_VIEW_LABEL, type ReportView } from "@/lib/types";

const OPTIONS: ReportView[] = ["separate", "consolidated", "both"];

export function ReportViewSwitch() {
  const { user, patchMe } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function choose(view: ReportView) {
    if (!user || user.report_view === view) return;
    setError(null);
    setPending(true);
    try {
      await patchMe({ report_view: view });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack tight view-switch">
      <div className="segment" role="group" aria-label="Afișare sume">
        {OPTIONS.map((view) => (
          <button
            key={view}
            type="button"
            aria-pressed={user?.report_view === view}
            disabled={pending}
            onClick={() => void choose(view)}
          >
            {REPORT_VIEW_LABEL[view]}
          </button>
        ))}
      </div>
      {error ? <p className="alert error">{error}</p> : null}
    </div>
  );
}
