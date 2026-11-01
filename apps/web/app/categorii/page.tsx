"use client";

import { useEffect, useState } from "react";
import { Guard } from "@/components/Guard";
import { SpaceBody } from "@/components/SpaceBody";
import { Alert, Field, PageHeader } from "@/components/ui";
import { errorMessage } from "@/lib/http";
import { canManage } from "@/lib/permissions";
import { resources } from "@/lib/resources";
import type { Category, Space } from "@/lib/types";

const NEW_GROUP = "__nou__";
const EXPENSE_ORDER = ["Acasă", "Zi de zi", "Personal", "Altele"];
const INCOME_ORDER = ["Intrări", "Altele"];

function groupCategories(items: Category[], order: string[]) {
  const map = new Map<string, Category[]>();
  for (const item of items) {
    const title = item.group_name || "Altele";
    const rows = map.get(title) ?? [];
    rows.push(item);
    map.set(title, rows);
  }
  const titles = [
    ...order.filter((title) => map.has(title)),
    ...[...map.keys()].filter((title) => !order.includes(title)).sort((left, right) => left.localeCompare(right, "ro")),
  ];
  return titles.map((title) => ({
    title,
    rows: (map.get(title) ?? []).sort((left, right) => left.name.localeCompare(right.name, "ro")),
  }));
}

const screenCss = `
.ew-screen{width:100%;max-width:100%;min-width:0;overflow-x:hidden;display:grid;gap:16px;background:transparent;color:#F8FAFC}
.ew-screen h1,.ew-screen h2{font-family:inherit;color:#F8FAFC}
.ew-screen h1{font-size:1.7rem;line-height:1.15;overflow-wrap:anywhere}
.ew-screen h2{font-size:1.05rem;line-height:1.3;overflow-wrap:anywhere}
.ew-screen .muted,.ew-screen .page-lede,.ew-screen .field span{color:#98A4BA}
.ew-screen a{color:#9585FF}
.ew-screen .page-head{display:flex;flex-direction:column;align-items:stretch;gap:12px;width:100%;max-width:100%}
.ew-screen .page-head>.stack,.ew-screen .page-lede{min-width:0;width:100%;max-width:100%}
.ew-screen .page-action{width:100%}
.ew-screen .page-action>.btn,.ew-screen .page-action>a{width:100%;min-height:44px}
@media (min-width:840px){
  .ew-screen .page-head{flex-direction:row;flex-wrap:wrap;align-items:flex-end;justify-content:space-between}
  .ew-screen .page-head>.stack{width:auto;flex:1 1 16rem}
  .ew-screen .page-action{width:auto;flex:0 0 auto}
  .ew-screen .page-action>.btn,.ew-screen .page-action>a{width:auto}
}
.ew-screen .card,.ew-screen .ew-row,.ew-screen .ew-empty{
  background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:20px;box-shadow:none;color:#F8FAFC;max-width:100%;min-width:0
}
.ew-screen .card{padding:16px;overflow:hidden}
.ew-screen .btn{min-height:44px;font-family:inherit}
.ew-screen .btn.primary,.ew-screen .btn.primary:hover{background:#9585FF;border-color:#9585FF;color:#0B0F19}
.ew-screen .btn.danger,.ew-screen .btn.danger:hover{background:transparent;color:#FF738A;border-color:rgba(255,115,138,0.45)}
.ew-screen .btn.ghost,.ew-screen .btn.ghost:hover{background:transparent;color:#F8FAFC;border-color:rgba(255,255,255,0.07)}
.ew-screen input,.ew-screen select{width:100%;max-width:100%;min-width:0;background:rgba(11,15,25,0.72);color:#F8FAFC;border:1px solid rgba(255,255,255,0.07);border-radius:14px;font-family:inherit}
.ew-screen input:focus,.ew-screen select:focus{border-color:#9585FF;outline-color:#9585FF}
.ew-screen .alert{background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:16px;color:#F8FAFC;overflow-wrap:anywhere}
.ew-screen .alert.error{color:#FF738A;border-color:rgba(255,115,138,0.4)}
.ew-screen .badge{background:rgba(149,133,255,0.18);color:#F8FAFC}
.ew-cols{display:grid;gap:18px;grid-template-columns:minmax(0,1fr);min-width:0;max-width:100%;overflow-x:hidden}
@media (min-width:840px){.ew-cols{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.ew-section{display:grid;gap:8px;min-width:0;max-width:100%;overflow-x:hidden}
.ew-section h2{margin:0}
.ew-fields{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;width:100%;min-width:0}
.ew-end{display:flex;flex-wrap:wrap;gap:10px;width:100%}
.ew-end .btn{flex:1 1 100%;min-height:44px}
@media (min-width:840px){.ew-end{justify-content:flex-end}.ew-end .btn{flex:0 1 auto}}
.ew-group{background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:16px;overflow:hidden;min-width:0;max-width:100%}
.ew-group-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 8px 0 12px}
.ew-group-head h3{margin:0;padding:0;color:#98A4BA;font-size:.75rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
.ew-group-head .btn{min-height:28px;padding:0 8px;font-size:.78rem}
.ew-list{list-style:none;margin:0;padding:0;width:100%;max-width:100%;min-width:0}
.ew-line{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-height:40px;padding:4px 10px 4px 12px;border-top:1px solid rgba(255,255,255,0.06);min-width:0}
.ew-group .ew-list .ew-line:first-child{border-top:0}
.ew-name{flex:1 1 auto;min-width:0;color:#F8FAFC;overflow-wrap:anywhere;line-height:1.3}
.ew-actions{display:flex;flex:0 0 auto;gap:6px;margin-left:auto}
.ew-actions .btn{flex:0 0 auto;min-height:32px;padding:0 10px;font-size:.82rem}
.ew-line input,.ew-line select{width:auto;flex:1 1 8rem;min-width:0;min-height:36px}
.ew-screen .ew-empty{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:4px 0;background:transparent;border:0;border-radius:0;box-shadow:none}
.ew-empty p{color:#98A4BA;margin:0}
`;

function Categories({ space }: { space: Space }) {
  const manage = canManage(space.role);
  const [rows, setRows] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [lockedGroup, setLockedGroup] = useState<string | null>(null);
  const [groupChoice, setGroupChoice] = useState(EXPENSE_ORDER[0]);
  const [newGroup, setNewGroup] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftGroup, setDraftGroup] = useState("");
  const [editPending, setEditPending] = useState(false);

  function groupsFor(value: "income" | "expense") {
    const order = value === "expense" ? EXPENSE_ORDER : INCOME_ORDER;
    const names = [...new Set(rows.filter((item) => item.kind === value).map((item) => item.group_name || "Altele"))];
    return [
      ...order.filter((title) => names.includes(title)),
      ...names.filter((title) => !order.includes(title)).sort((left, right) => left.localeCompare(right, "ro")),
    ];
  }

  function closeForm() {
    setOpen(false);
    setLockedGroup(null);
  }

  function openFor(value: "income" | "expense") {
    const names = groupsFor(value);
    setKind(value);
    setLockedGroup(null);
    setGroupChoice(names[0] ?? NEW_GROUP);
    setNewGroup("");
    setName("");
    setOpen(true);
  }

  function openFresh() {
    const names = groupsFor("expense");
    setKind("expense");
    setLockedGroup(null);
    setGroupChoice(names[0] ?? NEW_GROUP);
    setNewGroup("");
    setName("");
    setOpen(true);
  }

  function openIn(value: "income" | "expense", group: string) {
    setKind(value);
    setLockedGroup(group);
    setGroupChoice(group);
    setNewGroup("");
    setName("");
    setOpen(true);
  }

  async function load() {
    setRows(await resources.categories(space.id));
  }

  useEffect(() => {
    let alive = true;
    setReady(false);
    void load()
      .catch((cause) => {
        if (alive) setError(errorMessage(cause));
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space.id]);

  useEffect(() => {
    if (!open) return;
    document.getElementById("categorie-noua")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const group = (lockedGroup ?? (groupChoice === NEW_GROUP ? newGroup : groupChoice)).trim();
    if (!group) {
      setError("Alege un grup sau scrie numele unuia nou.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await resources.createCategory(space.id, { name: name.trim(), kind, group_name: group });
      setName("");
      setNewGroup("");
      closeForm();
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  function beginEdit(category: Category) {
    setEditingId(category.id);
    setDraft(category.name);
    setDraftGroup(category.group_name || "Altele");
    setError(null);
  }

  async function saveEdit(category: Category) {
    const next = draft.trim();
    const group = draftGroup.trim();
    if (!next) {
      setError("Numele categoriei nu poate fi gol.");
      return;
    }
    if (!group) {
      setError("Grupul nu poate fi gol.");
      return;
    }
    if (next === category.name && group === category.group_name) {
      setEditingId(null);
      return;
    }
    setEditPending(true);
    setError(null);
    try {
      await resources.patchCategory(space.id, category.id, { name: next, group_name: group });
      setEditingId(null);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setEditPending(false);
    }
  }

  async function remove(category: Category) {
    if (!window.confirm(`Ștergi categoria ${category.name}?`)) return;
    setError(null);
    try {
      await resources.deleteCategory(space.id, category.id);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  function column(title: string, value: "income" | "expense") {
    const items = rows.filter((category) => category.kind === value);
    const groups = groupCategories(items, value === "expense" ? EXPENSE_ORDER : INCOME_ORDER);
    const editGroups = groupsFor(value);
    return (
      <section className="ew-section">
        <h2>{title}</h2>
        {groups.length ? (
          groups.map((group) => (
            <div key={group.title} className="ew-group">
              <div className="ew-group-head">
                <h3>{group.title}</h3>
                {manage ? (
                  <button className="btn ghost" type="button" onClick={() => openIn(value, group.title)}>
                    Adaugă
                  </button>
                ) : null}
              </div>
              <ul className="ew-list">
                {group.rows.map((category) =>
                  editingId === category.id ? (
                    <li key={category.id} className="ew-line">
                      <input
                        aria-label={`Nume pentru ${category.name}`}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        required
                      />
                      <select aria-label="Grup" value={draftGroup} onChange={(event) => setDraftGroup(event.target.value)}>
                        {[...new Set([draftGroup, ...editGroups])].filter(Boolean).map((title) => (
                          <option key={title} value={title}>
                            {title}
                          </option>
                        ))}
                      </select>
                      <div className="ew-actions">
                        <button className="btn ghost" type="button" onClick={() => setEditingId(null)} disabled={editPending}>
                          Renunță
                        </button>
                        <button className="btn primary" type="button" onClick={() => void saveEdit(category)} disabled={editPending}>
                          {editPending ? "…" : "Salvează"}
                        </button>
                      </div>
                    </li>
                  ) : (
                    <li key={category.id} className="ew-line">
                      <div className="ew-name">
                        {category.name}
                        {category.archived_at ? <span className="badge"> Arhivată</span> : null}
                      </div>
                      {manage && !category.archived_at ? (
                        <div className="ew-actions">
                          <button className="btn ghost" type="button" onClick={() => beginEdit(category)}>
                            Modifică
                          </button>
                          <button className="btn danger" type="button" onClick={() => void remove(category)}>
                            Șterge
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))
        ) : (
          <div className="ew-empty">
            <p>Nicio categorie.</p>
            {manage ? (
              <button className="btn ghost" type="button" onClick={() => openFor(value)}>
                Adaugă
              </button>
            ) : null}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="ew-screen">
      <style>{screenCss}</style>
      <PageHeader
        title="Categorii"
        lede="Adaugi într-un grup existent sau pornești un grup nou."
        action={
          manage ? (
            <button className="btn primary" type="button" aria-expanded={open} onClick={() => (open ? closeForm() : openFresh())}>
              {open ? "Închide" : "Categorie nouă"}
            </button>
          ) : null
        }
      />
      {error ? <Alert>{error}</Alert> : null}
      {!ready ? <p className="muted">Se încarcă categoriile…</p> : (
        <div className="ew-cols">
          {column("Cheltuieli", "expense")}
          {column("Venituri", "income")}
        </div>
      )}
      {manage && open ? (
        <form id="categorie-noua" className="card stack" style={{ scrollMarginTop: 84 }} onSubmit={(event) => void submit(event)}>
          <h2>{lockedGroup ? `Categorie în ${lockedGroup}` : "Categorie nouă"}</h2>
          <div className="ew-fields">
            <Field label="Nume">
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </Field>
            {lockedGroup ? (
              <p className="muted">{kind === "expense" ? "Cheltuială" : "Venit"} · {lockedGroup}</p>
            ) : (
              <>
                <Field label="Tip">
                  <select
                    value={kind}
                    onChange={(event) => {
                      const next = event.target.value as "expense" | "income";
                      const names = groupsFor(next);
                      setKind(next);
                      setGroupChoice(groupChoice === NEW_GROUP || names.includes(groupChoice) ? groupChoice : (names[0] ?? NEW_GROUP));
                    }}
                  >
                    <option value="expense">Cheltuială</option>
                    <option value="income">Venit</option>
                  </select>
                </Field>
                <Field label="Grup">
                  <select value={groupChoice} onChange={(event) => setGroupChoice(event.target.value)}>
                    {groupsFor(kind).map((title) => (
                      <option key={title} value={title}>
                        {title}
                      </option>
                    ))}
                    <option value={NEW_GROUP}>Grup nou</option>
                  </select>
                </Field>
                {groupChoice === NEW_GROUP ? (
                  <Field label="Numele grupului">
                    <input value={newGroup} onChange={(event) => setNewGroup(event.target.value)} required />
                  </Field>
                ) : null}
              </>
            )}
          </div>
          <div className="ew-end">
            <button className="btn ghost" type="button" onClick={closeForm}>
              Anulează
            </button>
            <button className="btn primary" type="submit" disabled={pending}>
              {pending ? "Se salvează…" : "Adaugă"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export default function Page() {
  return (
    <Guard>
      <SpaceBody>{(space) => <Categories space={space} />}</SpaceBody>
    </Guard>
  );
}
