"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Guard } from "@/components/Guard";
import { Alert, Field, PageHeader } from "@/components/ui";
import { asList, asRecord, formatDisplayDate } from "@/lib/format";
import { ApiError, api, errorMessage, readDelivery } from "@/lib/http";
import { canInvite, canManage, isOwner } from "@/lib/permissions";
import { normalizeMember, normalizeSpace } from "@/lib/normalize";
import { resources } from "@/lib/resources";
import { useSpace } from "@/lib/space";
import { ROLE_LABEL, SPACE_KIND_LABEL, type Member, type Role, type Space } from "@/lib/types";

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
.ew-screen .card,.ew-screen .ew-row,.ew-screen .ew-empty,.ew-screen .ew-block{
  background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:20px;box-shadow:none;color:#F8FAFC;max-width:100%;min-width:0
}
.ew-screen .card,.ew-screen .ew-block{padding:16px;overflow:hidden}
.ew-screen .btn{min-height:44px;font-family:inherit}
.ew-screen .btn.primary,.ew-screen .btn.primary:hover{background:#9585FF;border-color:#9585FF;color:#0B0F19}
.ew-screen .btn.danger,.ew-screen .btn.danger:hover{background:transparent;color:#FF738A;border-color:rgba(255,115,138,0.45)}
.ew-screen .btn.ghost,.ew-screen .btn.ghost:hover{background:transparent;color:#F8FAFC;border-color:rgba(255,255,255,0.07)}
.ew-screen input,.ew-screen select{width:100%;max-width:100%;min-width:0;background:rgba(11,15,25,0.72);color:#F8FAFC;border:1px solid rgba(255,255,255,0.07);border-radius:14px;font-family:inherit}
.ew-screen input:focus,.ew-screen select:focus{border-color:#9585FF;outline-color:#9585FF}
.ew-screen .alert{background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:16px;color:#F8FAFC;overflow-wrap:anywhere}
.ew-screen .alert.error{color:#FF738A;border-color:rgba(255,115,138,0.4)}
.ew-screen .alert.ok{color:#4EE0B5;border-color:rgba(78,224,181,0.4)}
.ew-screen .alert.info{color:#98A4BA}
.ew-screen .badge{background:rgba(149,133,255,0.18);color:#F8FAFC}
.ew-fields{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;width:100%;min-width:0}
.ew-end{display:flex;flex-wrap:wrap;gap:10px;width:100%}
.ew-end .btn{flex:1 1 100%;min-height:44px}
.ew-section{display:grid;gap:10px;min-width:0;max-width:100%;overflow-x:hidden}
.ew-list{list-style:none;margin:0;padding:0;display:grid;gap:10px;width:100%;max-width:100%;min-width:0;overflow-x:hidden}
.ew-row{display:grid;gap:6px;padding:14px 16px;overflow:hidden}
.ew-name{color:#F8FAFC;overflow-wrap:anywhere;line-height:1.35}
.ew-meta{color:#98A4BA;font-size:.85rem;overflow-wrap:anywhere}
.ew-actions{display:flex;flex-wrap:wrap;gap:8px;max-width:100%}
.ew-actions select{flex:1 1 100%;width:100%;min-width:0}
.ew-actions .btn{flex:1 1 8rem;min-height:44px}
.ew-empty{display:grid;gap:10px;justify-items:start;padding:16px}
.ew-empty p{color:#F8FAFC}
.ew-break,.ew-break a{overflow-wrap:anywhere;word-break:break-all}
.ew-screen .card.ew-form{margin-bottom:96px}
`;

function SpaceDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { reload, setCurrentId } = useSpace();
  const [space, setSpace] = useState<Space | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersNote, setMembersNote] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "owner">>("viewer");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [logHint, setLogHint] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [membersReady, setMembersReady] = useState(false);

  async function load() {
    setError(null);
    setMembersReady(false);
    try {
      const raw = await api(`/api/spaces/${id}`);
      const next = normalizeSpace(raw);
      if (!next) throw new Error("Spațiul nu a putut fi citit.");
      setSpace(next);
      setName(next.name);
      const embedded = asList(asRecord(raw).members).map(normalizeMember).filter((item): item is Member => Boolean(item));
      if (embedded.length) {
        setMembers(embedded);
        setMembersNote(null);
        setMembersReady(true);
        return;
      }
      try {
        setMembers(await resources.members(id));
        setMembersNote(null);
        setMembersReady(true);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 404) {
          setMembersNote("Lista de membri nu a fost întoarsă de server.");
        } else setMembersNote(errorMessage(cause));
        setMembersReady(true);
      }
    } catch (cause) {
      setError(errorMessage(cause));
      setMembersReady(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    if (!space) return;
    setPending(true);
    setError(null);
    try {
      await resources.patchSpace(space.id, { name: name.trim() });
      await reload();
      await load();
      setInfo("Numele a fost salvat.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    if (!space) return;
    setPending(true);
    setError(null);
    setInfo(null);
    setLogHint(false);
    setDevLink(null);
    try {
      const payload = await resources.invite(space.id, { email: email.trim(), role });
      const delivery = readDelivery(payload);
      const record = asRecord(payload);
      const token = delivery.verificationToken || (typeof record.token === "string" ? record.token : null);
      const url =
        delivery.verificationUrl ||
        (typeof record.invite_url === "string" ? record.invite_url : null) ||
        (token ? `/invitatie?token=${encodeURIComponent(token)}` : null);
      setDevLink(url);
      setLogHint(delivery.emailSent === false);
      setInfo("Invitația a fost creată.");
      setEmail("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  async function changeRole(member: Member, nextRole: string) {
    setError(null);
    try {
      await resources.patchMember(id, member.user_id, nextRole);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function remove(member: Member) {
    if (!window.confirm(`Scoți pe ${member.display_name || member.email} din spațiu?`)) return;
    setError(null);
    try {
      await resources.removeMember(id, member.user_id);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function removeSpace() {
    if (!space) return;
    if (!window.confirm(`Ștergi spațiul „${space.name}” și toate datele lui?`)) return;
    setPending(true);
    try {
      await resources.deleteSpace(space.id);
      await reload();
      router.push("/spatii");
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }

  if (error && !space) {
    return (
      <div className="ew-screen">
        <style>{screenCss}</style>
        <Alert>{error}</Alert>
      </div>
    );
  }
  if (!space) {
    return (
      <div className="ew-screen">
        <style>{screenCss}</style>
        <p className="muted">Se încarcă spațiul…</p>
      </div>
    );
  }

  return (
    <div className="ew-screen">
      <style>{screenCss}</style>
      <PageHeader
        title={space.name}
        lede={`${SPACE_KIND_LABEL[space.kind]} · ${ROLE_LABEL[space.role]} · ${space.base_currency}`}
        action={
          <button
            className="btn primary"
            type="button"
            onClick={() => {
              setCurrentId(space.id);
              router.push("/panou");
            }}
          >
            Folosește spațiul
          </button>
        }
      />
      {space.kind === "project" && (space.starts_on || space.ends_on) ? (
        <p className="muted">
          {space.starts_on ? `Început ${formatDisplayDate(space.starts_on)}` : ""}
          {space.ends_on ? ` · Sfârșit ${formatDisplayDate(space.ends_on)}` : ""}
        </p>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}
      {info ? <Alert kind="ok">{info}</Alert> : null}
      {canManage(space.role) ? (
        <form className="card stack" onSubmit={(event) => void saveName(event)}>
          <Field label="Nume">
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <div className="ew-end">
            <button className="btn ghost" type="submit" disabled={pending}>
              Salvează numele
            </button>
          </div>
        </form>
      ) : null}
      <section className="ew-section">
        <h2>Membri</h2>
        {membersNote ? <p className="muted">{membersNote}</p> : null}
        {membersReady && members.length ? (
          <ul className="ew-list">
            {members.map((member) => (
              <li key={member.user_id} className="ew-row">
                <div className="ew-name">{member.display_name || member.email}</div>
                <div className="ew-meta">{member.email}</div>
                {member.role === "owner" || !canManage(space.role) ? (
                  <div>
                    <span className="badge">{ROLE_LABEL[member.role]}</span>
                  </div>
                ) : (
                  <div className="ew-actions">
                    <select value={member.role} onChange={(event) => void changeRole(member, event.target.value)} aria-label="Rol">
                      <option value="viewer">Vizualizare</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Administrator</option>
                    </select>
                    <button className="btn danger" type="button" onClick={() => void remove(member)}>
                      Scoate
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        {membersReady && !members.length && !membersNote ? (
          <div className="ew-empty">
            <p>Încă nu sunt membri de arătat.</p>
          </div>
        ) : null}
      </section>
      {space.kind === "personal" ? (
        <p className="muted">Spațiul personal rămâne doar al tău. Nu are invitații.</p>
      ) : canInvite(space.role, space.kind) ? (
        <form className="card stack ew-form" onSubmit={(event) => void invite(event)}>
          <h2>Invită</h2>
          {logHint ? <Alert kind="info">Emailul nu a fost trimis. Linkul de invitație este în logul serverului API.</Alert> : null}
          {devLink ? (
            <p className="ew-break">
              Link primit de la server: <a href={devLink}>{devLink}</a>
            </p>
          ) : null}
          <div className="ew-fields">
            <Field label="Email">
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </Field>
            <Field label="Rol">
              <select value={role} onChange={(event) => setRole(event.target.value as Exclude<Role, "owner">)}>
                <option value="viewer">Vizualizare</option>
                <option value="editor">Editor</option>
                <option value="admin">Administrator</option>
              </select>
            </Field>
          </div>
          <div className="ew-end">
            <button className="btn primary" type="submit" disabled={pending}>
              Trimite invitația
            </button>
          </div>
        </form>
      ) : null}
      {isOwner(space.role) ? (
        <section className="ew-block">
          <h2>Șterge spațiul</h2>
          <p className="muted">Se șterg membrii, conturile, tranzacțiile, bugetele și obiectivele.</p>
          <div className="ew-end">
            <button className="btn danger" type="button" disabled={pending} onClick={() => void removeSpace()}>
              Șterge spațiul
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function Page() {
  return (
    <Guard>
      <SpaceDetail />
    </Guard>
  );
}
