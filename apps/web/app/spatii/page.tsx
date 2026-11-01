"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Guard } from "@/components/Guard";
import { Alert, PageHeader } from "@/components/ui";
import { canInvite } from "@/lib/permissions";
import { useSpace } from "@/lib/space";
import { ROLE_LABEL, SPACE_KIND_LABEL } from "@/lib/types";

const screenCss = `
.ew-screen{width:100%;max-width:100%;min-width:0;overflow-x:hidden;display:grid;gap:16px;background:transparent;color:#F8FAFC}
.ew-screen h1{font-family:inherit;color:#F8FAFC;font-size:1.7rem;line-height:1.15;overflow-wrap:anywhere}
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
.ew-screen .ew-row,.ew-screen .ew-empty{
  background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:20px;box-shadow:none;color:#F8FAFC;max-width:100%;min-width:0
}
.ew-screen .btn{min-height:44px;font-family:inherit}
.ew-screen .btn.primary,.ew-screen .btn.primary:hover{background:#9585FF;border-color:#9585FF;color:#0B0F19}
.ew-screen .btn.ghost,.ew-screen .btn.ghost:hover{background:transparent;color:#F8FAFC;border-color:rgba(255,255,255,0.07)}
.ew-screen .alert{background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:16px;color:#F8FAFC;overflow-wrap:anywhere}
.ew-screen .alert.error{color:#FF738A;border-color:rgba(255,115,138,0.4)}
.ew-screen .badge{background:rgba(149,133,255,0.18);color:#F8FAFC}
.ew-list{list-style:none;margin:0;padding:0;display:grid;gap:10px;width:100%;max-width:100%;min-width:0;overflow-x:hidden}
.ew-row{display:grid;gap:8px;padding:14px 16px;overflow:hidden}
.ew-name{color:#F8FAFC;overflow-wrap:anywhere;line-height:1.35}
.ew-meta{color:#98A4BA;font-size:.85rem;overflow-wrap:anywhere}
.ew-actions{display:flex;flex-wrap:wrap;gap:8px;max-width:100%}
.ew-actions .btn,.ew-actions a.btn{flex:1 1 7.5rem;min-height:44px;text-align:center}
.ew-empty{display:grid;gap:10px;justify-items:start;padding:16px}
.ew-empty p{color:#F8FAFC}
`;

function SpacesScreen() {
  const { spaces, current, setCurrentId, loading, error } = useSpace();
  const router = useRouter();

  return (
    <div className="ew-screen">
      <style>{screenCss}</style>
      <PageHeader
        title="Spații"
        lede="Personal este creat la cont. Poți adăuga familie sau proiect."
        action={
          <Link className="btn primary" href="/spatii/nou">
            Spațiu nou
          </Link>
        }
      />
      {error ? <Alert>{error}</Alert> : null}
      {loading && !spaces.length ? <p className="muted">Se încarcă spațiile…</p> : null}
      {spaces.length ? (
        <ul className="ew-list">
          {spaces.map((space) => (
            <li key={space.id} className="ew-row">
              <div className="ew-name">
                {space.name} {current?.id === space.id ? <span className="badge">Activ</span> : null}
              </div>
              <div className="ew-meta">
                {SPACE_KIND_LABEL[space.kind]} · {ROLE_LABEL[space.role]} · {space.base_currency}
              </div>
              <div className="ew-actions">
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => {
                    setCurrentId(space.id);
                    router.push("/panou");
                  }}
                >
                  Folosește
                </button>
                <Link className="btn ghost" href={`/spatii/${space.id}`}>
                  Detalii
                </Link>
                {canInvite(space.role, space.kind) ? (
                  <Link className="btn ghost" href={`/spatii/${space.id}`}>
                    Invită
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {!loading && !spaces.length ? (
        <div className="ew-empty">
          <p>Încă nu există spații.</p>
          <Link href="/spatii/nou">Spațiu nou</Link>
        </div>
      ) : null}
    </div>
  );
}

export default function Page() {
  return (
    <Guard>
      <SpacesScreen />
    </Guard>
  );
}
