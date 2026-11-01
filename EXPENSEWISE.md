# ExpenseWise 1.0 — Specificație, bază de date și plan

Versiunea 1.0 · 20 octombrie 2026

Acest fișier este sursa de adevăr pentru ExpenseWise. Descrie produsul, regulile financiare, găzduirea, schema PostgreSQL și asistentul MCP. Contractul HTTP al asistentului, uneltele și testele sunt în `IMPLEMENTARE-MCP.md`.

Aplicația se construiește de la zero. Nu există date de producție de protejat.

## 1. Produsul

ExpenseWise este o aplicație web gratuită pentru finanțele personale și de familie, în ecosistemul Visaj Technologies.

Funcționează în browser, pe desktop și pe telefon. Contul este personal. ChatGPT, Cursor sau Claude se pot conecta opțional prin MCP. În backend nu există API OpenAI, Gemini sau alt serviciu AI cu plată.

| Modul | Ce face |
| --- | --- |
| Utilizatori | Înregistrare liberă, confirmare email, autentificare, resetare parolă |
| Spații financiare | Personale, familiale și de proiect; oricâte |
| Membri | Proprietarul invită și stabilește permisiunea |
| Conturi | Numerar, bancă, card, economii |
| Venituri și cheltuieli | Manual, apoi import și OCR |
| Categorii | Listă predefinită, apoi editabilă în spațiu |
| Transferuri | Între conturile aceluiași spațiu, fără a fi venit sau cheltuială |
| Recurențe | Săptămânal, lunar, anual; generate când aplicația este deschisă |
| Bugete | Lunare, pe categorie sau pe tot spațiul |
| Obiective | Mașină, vacanță, locuință sau orice sumă țintă |
| Valute | RON implicit; suma originală se păstrează |
| Rapoarte | Pe spațiu, consolidate, filtre, grafice |
| MCP | Aceleași reguli ca în interfață, în limita permisiunii |

## 2. Decizii închise

Acestea nu se redeschid la implementare.

| Subiect | Decizie |
| --- | --- |
| Frontend | Next.js |
| Backend | FastAPI, un singur proces |
| Bază | PostgreSQL 16 |
| Grafice | Recharts |
| OCR | PaddleOCR, doar local în etapa 3, profil Docker separat |
| Bani în cod | `numeric`, niciodată `float` |
| Autentificare aplicație | Email și parolă. Access JWT scurt. Refresh token opac, doar hash în bază |
| Email | Resend, pentru confirmarea adresei și pentru resetarea parolei |
| Cont neconfirmat | Poate intra în ecranul de confirmare. Spațiile se deschid după confirmare |
| MCP | În același proces FastAPI. Pornește doar cu `ASSISTANT_PUBLIC_URL` |
| Legătura cu chat-ul | OAuth 2.1 + PKCE. Fără API key în `mcp.json` |
| Scope MCP | `expensewise` |
| Joburi | La cerere, când utilizatorul deschide aplicația sau apelează API-ul. Fără cron permanent |
| Bonuri | Imaginea nu se păstrează. După confirmare rămâne tranzacția |
| Curs | Frankfurter implicit. Curs manual permis. Pe tranzacție se salvează cursul, data și sursa |
| Afișare | Separat, consolidat în RON, sau ambele |
| Local | Docker: Postgres + API. Next.js cu `npm run dev`. OCR cu profilul `ocr` |
| Producție 1.0 | Railway: site, API, PostgreSQL. Trei servicii |
| Vercel | Mai târziu, doar pentru Next.js. API-ul și baza rămân |
| Domeniu | Cumpărat de noi. Se leagă de Railway când există. Până atunci, domeniul Railway |
| Fus orar | `Europe/Bucharest` pentru „azi” și pentru recurențe |

Costul licențelor pentru Next.js, FastAPI, PostgreSQL, PaddleOCR, Recharts și serverul MCP propriu este zero. Găzduirea are plafoane. Railway Free, după trial, dă 1 USD credit pe lună, 0,5 GB RAM și 0,5 GB disc per serviciu, un proiect, trei servicii, un volum. Când creditul se termină, serviciile se opresc până luna următoare. Trei servicii mici pentru uz personal încap. PaddleOCR cere peste 1 GB RAM și rămâne pe calculator. Vercel Hobby, când va fi folosit, este pentru uz personal necomercial.

## 3. Reguli financiare

### Monede

RON este moneda implicită a spațiului și a rapoartelor. O tranzacție în altă monedă își păstrează suma și codul monedei. Conversia în RON folosește cursul salvat pe rând:

- `frankfurter` — cursul BCE din ziua tranzacției, luat când se salvează;
- `manual` — cursul introdus de utilizator.

Dacă Frankfurter nu răspunde și nu există curs manual, tranzacția se salvează în moneda ei și nu intră în totalul consolidat. Raportul o arată la „fără curs”. Pe ecran se vede cursul folosit.

Afișarea, salvată pe utilizator: `separate`, `consolidated` sau `both`.

### Transferuri și solduri

Un transfer între două conturi din același spațiu are `kind = transfer`. Nu intră în venituri, cheltuieli, bugete sau rapoarte de categorii.

Soldul unui cont la o dată este:

- soldul inițial;
- plus veniturile din acel cont până la dată;
- minus cheltuielile din acel cont până la dată;
- minus transferurile care pleacă din cont;
- plus transferurile care intră în cont.

Rândurile cu `deleted_at` nu intră. Nu se ține un sold separat care să poată deriva de la tranzacții.

Transfer în aceeași monedă: aceeași sumă iese dintr-un cont și intră în celălalt. Transfer între monede: `amount` iese din contul sursă, `counter_amount` intră în contul destinație. Ambele sunt obligatorii.

### Recurențe

O regulă este săptămânală, lunară sau anuală. La prima cerere a zilei pentru acel spațiu, API-ul generează tranzacțiile scadente, până la ziua curentă din București. Unicitatea `(recurring_rule_id, occurred_on)` oprește dublura. Regula poate fi oprită sau modificată. Oprirea nu șterge tranzacțiile deja create. Generarea nu sare peste zilele în care nimeni nu a deschis aplicația: la următoarea deschidere se creează toate scadențele lipsă.

### Spații și rapoarte

Datele unui spațiu se văd doar de către membri. Raportul consolidat adună numai spațiile în care utilizatorul are cel puțin vizualizare. Un spațiu `personal` nu apare altcuiva. Un spațiu `family` sau `project` se împarte prin invitație.

Un proiect este un spațiu cu `kind = project`, cu început și sfârșit opționale. Poate avea tranzacții în mai multe monede și pe mai multe luni.

### Bugete și obiective

Bugetul este lunar, pe o categorie sau pe tot spațiul, într-o monedă. Consumul este suma cheltuielilor din luna respectivă, convertite în moneda bugetului cu cursul de pe tranzacție. Ecranul arată consumat, rămas și cât la sută.

Obiectivul are sumă țintă, monedă și dată opțională. Progresul este suma tranzacțiilor legate de el prin `goal_id`, convertite în moneda obiectivului. Un cont de economii poate fi indicat ca destinație, dar progresul vine din tranzacțiile legate, nu din tot soldul contului.

## 4. Permisiuni

Proprietarul este `spaces.owner_id` și are și rând în `space_members` cu rolul `owner`.

| Acțiune | viewer | editor | admin | owner |
| --- | --- | --- | --- | --- |
| Vedere spațiu, tranzacții, solduri, rapoarte, bugete, obiective | da | da | da | da |
| Adaugă tranzacție, recurență, legare de obiectiv | nu | da | da | da |
| Modifică o tranzacție existentă | nu | da | da | da |
| Șterge tranzacție, cont, categorie, buget, obiectiv | nu | nu | da | da |
| Conturi, categorii, bugete, obiective, recurențe: creare și modificare | nu | nu | da | da |
| Invită, schimbă rol, scoate membru | nu | nu | da | da |
| Șterge spațiul, schimbă proprietarul | nu | nu | nu | da |

Adminul nu poate coborî sau scoate proprietarul. Invitația poate fi `viewer`, `editor` sau `admin`.

La fiecare apel MCP, rolul se citește din bază. Un rol schimbat în aplicație se aplică la următoarea unealtă, fără reconectare.

## 5. Introducerea tranzacțiilor

### Manual

Sumă, monedă, dată, categorie, cont, descriere. La transfer: cont sursă, cont destinație, sumele. Categoria lipsește la transfer.

### Import CSV și Excel

Etapa 3. Utilizatorul asociază coloanele, vede previzualizarea, vede rândurile care par duplicate și confirmă. Până la confirmare, rândurile stau în `import_rows`, nu în `transactions`. Amprenta de duplicat este SHA-256 peste data, suma, moneda, descrierea normalizată și contul. Aceeași amprentă în spațiu se marchează duplicat și nu se importă a doua oară decât dacă utilizatorul o bifează.

### PaddleOCR

Etapa 3, doar în Docker cu profilul `ocr`. Utilizatorul încarcă poza. Serviciul întoarce comerciantul, data, liniile și totalul într-un `receipt_draft`. Utilizatorul corectează și salvează. Se creează tranzacția cu `origin = ocr`. Draftul se șterge. Fișierul nu se scrie în bază și nu se urcă pe Railway.

### ChatGPT prin MCP

Etapa 4. Comenzi pentru înregistrare, solduri și rapoarte, în limita rolului. Ștergerea și modificarea cer `confirmat: true` în argumentele uneltei, după ce utilizatorul a spus explicit în conversație.

## 6. Arhitectură

```text
Browser
  → Next.js (Railway, serviciul web)
       /api către FastAPI este apelat din browser cu Bearer
       /mcp  /oauth  /.well-known  sunt proxiate către FastAPI
  → FastAPI (Railway, serviciul api)
       reguli, auth, Resend, MCP
  → PostgreSQL (Railway, volum)
```

Trei servicii, un volum. MCP nu este al patrulea serviciu.

Local:

```text
expensewise/
  docker-compose.yml          # db + api; ocr doar cu --profile ocr
  apps/web                    # Next.js, npm run dev
  apps/api                    # FastAPI
  services/ocr                # PaddleOCR
  EXPENSEWISE.md
  IMPLEMENTARE-MCP.md         # contractul asistentului ExpenseWise
```

`docker compose up` pornește Postgres și API. `docker compose --profile ocr up` adaugă PaddleOCR. Next.js rămâne în afara Compose, ca reload-ul să fie rapid.

Next.js, în `next.config`, trimite mai departe aceste prefixe către API, cu antetul `Host` al originii publice:

- `/mcp`
- `/oauth`
- `/.well-known`

Așa `ASSISTANT_PUBLIC_URL` este originea site-ului, nu portul API-ului. Clientul MCP vorbește cu Next.js, iar Next.js trimite aceste căi la FastAPI.

| Mediu | Origine publică | API intern |
| --- | --- | --- |
| Local | `http://localhost:3000` | `http://127.0.0.1:8000` |
| Railway, înainte de domeniu | domeniul generat al serviciului web | URL-ul privat Railway al API-ului |
| Cu domeniu | `https://domeniul-tau.ro` | neschimbat |

Când apare domeniul, în Railway pe serviciul web se adaugă Custom Domain. DNS primește CNAME și TXT, ambele. HTTPS îl emite Railway. Subdomeniul `api` nu este obligatoriu, pentru că browserul și chat-ul vorbesc cu originea site-ului. API-ul poate rămâne fără domeniu public.

Vercel, mai târziu, înlocuiește doar serviciul web. Proxy-ul pentru `/mcp`, `/oauth` și `/.well-known` se mută în configurația Vercel. `ASSISTANT_PUBLIC_URL` devine domeniul de pe Vercel.

### Variabile

API:

| Variabilă | Rol |
| --- | --- |
| `DATABASE_URL` | Postgres |
| `SECRET_KEY` | JWT-ul de access al aplicației |
| `JWT_ALGORITHM` | `HS256` |
| `ACCESS_TOKEN_TTL_MINUTES` | 15 |
| `REFRESH_TOKEN_TTL_DAYS` | 30 |
| `APP_PUBLIC_URL` | Originea site-ului, folosită în linkurile din email |
| `ASSISTANT_PUBLIC_URL` | Goală în etapa 1–3. În etapa 4, aceeași origine ca site-ul. Goală = zero rute MCP |
| `RESEND_API_KEY` | Goală local: linkul se scrie în log, nu se trimite |
| `EMAIL_FROM` | `ExpenseWise <noreply@domeniu>` după verificarea domeniului la Resend |
| `FRANKFURTER_URL` | `https://api.frankfurter.app` |
| `OCR_URL` | Goală în afara profilului `ocr` |

Web:

| Variabilă | Rol |
| --- | --- |
| `API_INTERNAL_URL` | Unde proxy-ul trimite `/mcp`, `/oauth`, `/.well-known` |
| `NEXT_PUBLIC_API_URL` | Unde browserul trimite apelurile aplicației |

Secretele stau în `.env` local și în Variables pe Railway. Nu intră în git. `.env.example` are doar numele, fără valori.

## 7. Autentificare și Resend

Parola se salvează cu hash (Argon2id). În bază nu există parola și nu există tokenul în clar.

### Confirmare email

Până la cheia Resend, contul se deschide fără confirmare.

1. Înregistrarea creează utilizatorul cu `email_verified_at` gol și un rând în `email_tokens` cu `purpose = verify_email`, valabil 24 de ore, o singură folosire.
2. Linkul este `{APP_PUBLIC_URL}/confirma-email?token=...`.
3. Deschiderea linkului setează `email_verified_at` și `used_at`.
4. Până atunci, singurele rute deschise sunt retrimiterea și ieșirea din cont.
5. Retrimiterea invalidează tokenul anterior.

### Resetare parolă

1. `POST /api/auth/forgot-password` răspunde mereu la fel dacă formatul emailului este valid: mesajul a fost trimis. Nu spune dacă adresa există.
2. Dacă adresa există și este confirmată, se creează token `reset_password`, valabil o oră.
3. Linkul este `{APP_PUBLIC_URL}/resetare-parola?token=...`.
4. Parola nouă setează `used_at`, schimbă hash-ul și revocă toate refresh-urile aplicației și toate acordurile MCP ale utilizatorului.

### Limite și Resend

Același tip de email către aceeași adresă pleacă de cel mult trei ori pe oră. Peste limită, răspunsul rămâne neutru și nu se mai cheamă Resend.

Resend, pe domeniul neverificat, livrează doar către adresa contului Resend. În Docker, cu `RESEND_API_KEY` goală, linkul se scrie în logul API. După ce domeniul există, în DNS se pun înregistrările SPF și DKIM de la Resend, iar `EMAIL_FROM` folosește acel domeniu.

## 8. Schema PostgreSQL

Extensii: `pgcrypto`, `citext`. Cheile sunt `uuid`, implicite `gen_random_uuid()`. Timpul este `timestamptz`. Sumele sunt `numeric(19, 4)`. Cursul este `numeric(19, 8)`. Codul monedei este `char(3)`.

Ștergerea unui spațiu, făcută de proprietar, șterge în cascadă membrii, invitațiile, conturile, categoriile, tranzacțiile, recurențele, bugetele, obiectivele și importurile acelui spațiu. Ștergerea unui utilizator este refuzată cât timp deține spații. Întâi exportă și șterge spațiile, sau predă proprietatea.

### Etapa 1 — fundația

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email               citext NOT NULL UNIQUE,
    password_hash       text NOT NULL,
    display_name        text NOT NULL,
    email_verified_at   timestamptz,
    report_view         text NOT NULL DEFAULT 'both'
                        CHECK (report_view IN ('separate', 'consolidated', 'both')),
    base_currency       char(3) NOT NULL DEFAULT 'RON',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_tokens (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose         text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
    token_hash      text NOT NULL UNIQUE,
    expires_at      timestamptz NOT NULL,
    used_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_email_tokens_user ON email_tokens (user_id, purpose, created_at);

CREATE TABLE refresh_tokens (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash      text NOT NULL UNIQUE,
    expires_at      timestamptz NOT NULL,
    revoked_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE spaces (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        uuid NOT NULL REFERENCES users (id),
    name            text NOT NULL,
    kind            text NOT NULL CHECK (kind IN ('personal', 'family', 'project')),
    base_currency   char(3) NOT NULL DEFAULT 'RON',
    starts_on       date,
    ends_on         date,
    created_at      timestamptz NOT NULL DEFAULT now(),
    archived_at     timestamptz
);

CREATE TABLE space_members (
    space_id        uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role            text NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (space_id, user_id)
);

CREATE TABLE space_invitations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
    email           citext NOT NULL,
    role            text NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
    token_hash      text NOT NULL UNIQUE,
    invited_by      uuid NOT NULL REFERENCES users (id),
    expires_at      timestamptz NOT NULL,
    accepted_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id                uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
    name                    text NOT NULL,
    kind                    text NOT NULL CHECK (kind IN ('cash', 'bank', 'card', 'savings')),
    currency                char(3) NOT NULL,
    opening_balance         numeric(19, 4) NOT NULL DEFAULT 0,
    opening_balance_date    date NOT NULL,
    archived_at             timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_accounts_space ON accounts (space_id);

CREATE TABLE categories (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
    name            text NOT NULL,
    kind            text NOT NULL CHECK (kind IN ('income', 'expense')),
    archived_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (space_id, kind, name)
);

CREATE TABLE transactions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id            uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
    account_id          uuid NOT NULL REFERENCES accounts (id),
    counter_account_id  uuid REFERENCES accounts (id),
    category_id         uuid REFERENCES categories (id),
    goal_id             uuid,
    recurring_rule_id   uuid,
    kind                text NOT NULL CHECK (kind IN ('income', 'expense', 'transfer')),
    amount              numeric(19, 4) NOT NULL CHECK (amount > 0),
    currency            char(3) NOT NULL,
    counter_amount      numeric(19, 4),
    counter_currency    char(3),
    fx_rate             numeric(19, 8),
    fx_rate_date        date,
    fx_source           text CHECK (fx_source IN ('frankfurter', 'manual')),
    occurred_on         date NOT NULL,
    description         text NOT NULL DEFAULT '',
    origin              text NOT NULL DEFAULT 'app'
                        CHECK (origin IN ('app', 'asistent', 'import', 'ocr')),
    import_fingerprint  text,
    created_by          uuid NOT NULL REFERENCES users (id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz,
    CHECK (
        (kind = 'transfer' AND counter_account_id IS NOT NULL AND category_id IS NULL)
        OR
        (kind IN ('income', 'expense') AND counter_account_id IS NULL AND category_id IS NOT NULL)
    ),
    CHECK (account_id <> counter_account_id)
);
CREATE INDEX ix_tx_space_date ON transactions (space_id, occurred_on);
CREATE INDEX ix_tx_account_date ON transactions (account_id, occurred_on);
CREATE UNIQUE INDEX ux_tx_import_fp
    ON transactions (space_id, import_fingerprint)
    WHERE import_fingerprint IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE audit_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid REFERENCES users (id),
    space_id        uuid REFERENCES spaces (id) ON DELETE SET NULL,
    action          text NOT NULL,
    entity_type     text,
    entity_id       uuid,
    detail          jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_space ON audit_log (space_id, created_at);
```

`goal_id` și `recurring_rule_id` rămân fără foreign key până la tabelele din etapa 2. Migrarea etapei 2 le adaugă.

La crearea spațiului se inserează proprietarul în `space_members` și categoriile de pornire.

Venituri: Salariu, Freelance, Cadouri, Altele.

Cheltuieli: Mâncare, Transport, Locuință, Utilități, Sănătate, Educație, Divertisment, Cumpărături, Abonamente, Altele.

Constrângeri aplicate în serviciu, nu doar în SQL:

- contul, contul pereche, categoria și obiectivul aparțin aceluiași `space_id`;
- moneda tranzacției este moneda contului;
- la transfer în aceeași monedă, `counter_amount` este egal cu `amount`;
- la transfer între monede, `counter_amount` și `counter_currency` sunt completate, iar `counter_currency` este moneda contului destinație;
- categoria are același `kind` ca tranzacția;
- `fx_rate` este obligatoriu când `currency` diferă de moneda de bază a spațiului și utilizatorul a dat un curs sau Frankfurter a răspuns.

### Etapa 2 — bani, bugete, obiective, cursuri

```sql
CREATE TABLE recurring_rules (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id            uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
    account_id          uuid NOT NULL REFERENCES accounts (id),
    category_id         uuid NOT NULL REFERENCES categories (id),
    kind                text NOT NULL CHECK (kind IN ('income', 'expense')),
    amount              numeric(19, 4) NOT NULL CHECK (amount > 0),
    currency            char(3) NOT NULL,
    description         text NOT NULL DEFAULT '',
    frequency           text NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
    next_run_on         date NOT NULL,
    ends_on             date,
    paused_at           timestamptz,
    created_by          uuid NOT NULL REFERENCES users (id),
    created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transactions
    ADD CONSTRAINT fk_tx_recurring
    FOREIGN KEY (recurring_rule_id) REFERENCES recurring_rules (id);
CREATE UNIQUE INDEX ux_tx_recurring_day
    ON transactions (recurring_rule_id, occurred_on)
    WHERE recurring_rule_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE budgets (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
    category_id     uuid REFERENCES categories (id),
    year            smallint NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    month           smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
    limit_amount    numeric(19, 4) NOT NULL CHECK (limit_amount >= 0),
    currency        char(3) NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_budgets_period
    ON budgets (space_id, COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid), year, month);

CREATE TABLE goals (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
    name            text NOT NULL,
    target_amount   numeric(19, 4) NOT NULL CHECK (target_amount > 0),
    currency        char(3) NOT NULL,
    target_date     date,
    account_id      uuid REFERENCES accounts (id),
    archived_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transactions
    ADD CONSTRAINT fk_tx_goal
    FOREIGN KEY (goal_id) REFERENCES goals (id);

CREATE TABLE exchange_rates (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency   char(3) NOT NULL,
    quote_currency  char(3) NOT NULL,
    rate_date       date NOT NULL,
    rate            numeric(19, 8) NOT NULL CHECK (rate > 0),
    source          text NOT NULL CHECK (source IN ('frankfurter', 'manual')),
    created_by      uuid REFERENCES users (id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (base_currency, quote_currency, rate_date, source)
);
```

Cursul manual este global pe dată, nu pe spațiu. Cine îl introduce rămâne în `created_by`. Tranzacția își copiază cursul în coloanele proprii și nu depinde mai târziu de acest tabel.

### Etapa 3 — import și OCR

```sql
CREATE TABLE import_batches (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
    filename        text NOT NULL,
    status          text NOT NULL CHECK (status IN ('preview', 'confirmed', 'discarded')),
    created_by      uuid NOT NULL REFERENCES users (id),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE import_rows (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id            uuid NOT NULL REFERENCES import_batches (id) ON DELETE CASCADE,
    row_number          integer NOT NULL,
    raw                 jsonb NOT NULL,
    mapped              jsonb,
    duplicate_of        uuid REFERENCES transactions (id),
    status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'imported', 'skipped')),
    UNIQUE (batch_id, row_number)
);

CREATE TABLE receipt_drafts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
    created_by      uuid NOT NULL REFERENCES users (id),
    merchant        text,
    occurred_on     date,
    total_amount    numeric(19, 4),
    currency        char(3),
    lines           jsonb NOT NULL DEFAULT '[]',
    status          text NOT NULL DEFAULT 'pending_review'
                    CHECK (status IN ('pending_review', 'saved', 'discarded')),
    created_at      timestamptz NOT NULL DEFAULT now()
);
```

`receipt_drafts` nu are coloană de fișier.

### Etapa 4 — tabelele MCP

Acordul îl identifică pe utilizator. Spațiile și rolul se citesc la fiecare apel din `space_members`.

```sql
CREATE TABLE assistant_oauth_clients (
    client_id       text PRIMARY KEY,
    client_info     text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assistant_auth_requests (
    id              text PRIMARY KEY,
    client_id       text NOT NULL REFERENCES assistant_oauth_clients (client_id),
    params          text NOT NULL,
    expires_at      timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assistant_grants (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    client_id       text NOT NULL REFERENCES assistant_oauth_clients (client_id),
    client_name     text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_used_at    timestamptz,
    revoked_at      timestamptz
);
CREATE INDEX ix_assistant_grants_user ON assistant_grants (user_id, revoked_at);

CREATE TABLE assistant_auth_codes (
    code_hash           text PRIMARY KEY,
    grant_id            uuid NOT NULL REFERENCES assistant_grants (id) ON DELETE CASCADE,
    client_id           text NOT NULL,
    code_challenge      text NOT NULL,
    redirect_uri        text NOT NULL,
    redirect_uri_provided_explicitly boolean NOT NULL DEFAULT true,
    resource            text,
    scopes              text NOT NULL DEFAULT '',
    expires_at          timestamptz NOT NULL,
    used_at             timestamptz
);

CREATE TABLE assistant_tokens (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash      text NOT NULL UNIQUE,
    kind            text NOT NULL CHECK (kind IN ('access', 'refresh')),
    grant_id        uuid NOT NULL REFERENCES assistant_grants (id) ON DELETE CASCADE,
    client_id       text NOT NULL,
    scopes          text NOT NULL DEFAULT '',
    resource        text,
    expires_at      timestamptz NOT NULL,
    revoked_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_assistant_tokens_grant ON assistant_tokens (grant_id);

CREATE TABLE assistant_idempotency (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    grant_id        uuid NOT NULL REFERENCES assistant_grants (id) ON DELETE CASCADE,
    fingerprint     text NOT NULL,
    status          text NOT NULL CHECK (status IN ('in_progress', 'complete', 'abandoned')),
    transaction_id  uuid REFERENCES transactions (id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (grant_id, fingerprint)
);
```

În `assistant_oauth_clients.client_info` și `assistant_auth_requests.params` stă JSON-ul, ca text. Codurile și tokenurile se caută după SHA-256. `id`-ul cererii de autorizare este secretul din URL-ul paginii de consimțământ și are viață de 15 minute; după răspuns, rândul se șterge.

Ștergerea utilizatorului șterge acordurile, deci și codurile și tokenurile. Resetarea parolei revocă acordurile (`revoked_at`) fără să șteargă istoricul.

## 9. API-ul aplicației

Prefix `/api`. Browserul trimite `Authorization: Bearer` cu access token-ul. Refresh-ul stă într-un cookie `HttpOnly` pe originea site-ului dacă site-ul și API-ul sunt proxiate împreună; altfel refresh-ul este tot Bearer, salvat de client. Pentru 1.0, ambele tokenuri sunt Bearer, ținute de Next.js pe originea site-ului, ca să nu depindem de cookie între domenii.

Rutele de mai jos cer email confirmat, cu excepția celor de cont.

| Metodă și cale | Rol minim | Efect |
| --- | --- | --- |
| POST `/api/auth/register` | public | Creează contul și trimite confirmarea |
| POST `/api/auth/verify-email` | public | Confirmă tokenul |
| POST `/api/auth/resend-verification` | autentificat | Retrimite, în limita de 3 pe oră |
| POST `/api/auth/login` | public | Access + refresh, doar după confirmare refuză spațiile |
| POST `/api/auth/refresh` | refresh | Access nou, refresh rotit |
| POST `/api/auth/logout` | refresh | Revocă refresh-ul curent |
| POST `/api/auth/forgot-password` | public | Răspuns neutru |
| POST `/api/auth/reset-password` | public | Parolă nouă, revocă sesiunile și acordurile MCP |
| GET `/api/me` | autentificat | Profil și `email_verified_at` |
| PATCH `/api/me` | confirmat | Nume, `report_view`, `base_currency` |
| GET `/api/export` | confirmat | JSON cu spațiile la care are acces |
| CRUD `/api/spaces` | owner la ștergere; confirmat la creare | Spațiu nou: membru owner + categorii |
| POST `/api/spaces/{id}/invitations` | admin | Email cu link |
| POST `/api/invitations/accept` | confirmat | Devine membru |
| PATCH `/api/spaces/{id}/members/{user_id}` | admin | Schimbă rolul |
| DELETE `/api/spaces/{id}/members/{user_id}` | admin | Scoate membrul |
| CRUD `/api/spaces/{id}/accounts` | admin la scriere, viewer la citire | |
| CRUD `/api/spaces/{id}/categories` | admin la scriere, viewer la citire | |
| CRUD `/api/spaces/{id}/transactions` | editor la creare și modificare, admin la ștergere | Ștergerea pune `deleted_at` |
| GET `/api/spaces/{id}/balances` | viewer | Sold pe cont |
| CRUD `/api/spaces/{id}/recurring-rules` | admin; editor poate crea | |
| CRUD `/api/spaces/{id}/budgets` | admin la scriere, viewer la citire | Include consumat și rămas |
| CRUD `/api/spaces/{id}/goals` | admin la scriere, viewer la citire | Include progresul |
| GET `/api/reports` | viewer | `space_id` repetabil, `from`, `to`, `currency` |
| POST `/api/spaces/{id}/imports` | editor | Previzualizare |
| POST `/api/spaces/{id}/imports/{batch_id}/confirm` | editor | Scrie tranzacțiile bifate |
| POST `/api/spaces/{id}/receipts` | editor | Trimite la OCR, întoarce draft |
| POST `/api/spaces/{id}/receipts/{draft_id}/save` | editor | Tranzacție, apoi șterge draftul |

`GET /api/reports` fără `space_id` înseamnă toate spațiile vizibile. `currency=RON` înseamnă consolidat. Fără `currency`, totaluri separate pe monedă.

Jurnalul `audit_log` primește: înregistrare, confirmare, resetare parolă, login, creare spațiu, invitație, schimbare rol, scoatere membru, ștergere tranzacție, confirmare import, acord MCP, revocare MCP.

## 10. Planul MCP

Etapa 4. Până atunci `ASSISTANT_PUBLIC_URL` rămâne goală și rutele de mai jos nu există.

### Contractul HTTP

Detaliile de rute, PKCE, well-known și unelte sunt în `IMPLEMENTARE-MCP.md`. Pe scurt:

- Pachetul `mcp>=1.30.0,<1.31.0`.
- Gate-ul `ASSISTANT_PUBLIC_URL`. După `strip`, fără slash final. Gol: serverul nu se montează.
- `FastMCP` cu `name="ExpenseWise"`, `instructions` și `website_url` egale cu originea. Fără `FastMCP.run()`.
- Transport Streamable HTTP pe `/mcp` (`GET`, `POST`, `DELETE`), `json_response=True`, `stateless=True`, pornit în lifespan. Înainte de pornire: HTTP 503, `{"detail": "Asistentul AI nu este pornit."}`.
- Autentificarea în fața handler-ului: Bearer. `required_scopes` rămâne lista goală. Token invalid: HTTP 401 și `WWW-Authenticate` cu `resource_metadata` către `/.well-known/oauth-protected-resource/mcp`.
- PKCE doar S256. Grant types: `authorization_code`, `refresh_token`. La token, metodele anunțate includ `none`.
- În bază, doar SHA-256 pentru coduri și tokenuri.
- Refresh-ul se rotește. Codul și refresh-ul vechi, folosite a doua oară, dau 400 și nu emit tokenuri.
- Issuer-ul este originea, nu `.../oauth`. Resursa este `{origin}/mcp`. Scope-ul este `expensewise`.
- TTL: access 1 oră, refresh 30 zile, cod 10 minute, cerere de autorizare 15 minute. `last_used_at` se scrie cel mult o dată pe minut.
- Uneltele întorc `dict`. Eroarea de regulă este HTTP 200 cu `result.isError = true`.
- Clientul, în `.cursor/mcp.json`, are doar URL-ul:

```json
{ "mcpServers": { "expensewise": { "url": "http://localhost:3000/mcp" } } }
```

În producție, același obiect cu `https://domeniul-tau.ro/mcp` sau cu domeniul Railway al site-ului.

Protecția DNS rebinding din SDK rămâne pornită pe localhost și oprită pe orice alt host, pentru că în producție cererea trece prin proxy-ul Next.js.

### Consimțământ

Pagina de consimțământ este ruta Next.js `/autorizare-asistent`. API-ul de consimțământ stă pe sesiunea aplicației, nu pe tokenul MCP:

| Metodă și cale | Efect |
| --- | --- |
| GET `/api/asistent/autorizare/{request_id}` | Numele aplicației și emailul. 410 dacă cererea a expirat |
| POST `/api/asistent/autorizare/{request_id}` | Corp `{"allow": true\|false}`. Întoarce `redirect_url` |
| GET `/api/asistent/conexiuni` | Acordurile active |
| DELETE `/api/asistent/conexiuni/{grant_id}` | Pune `revoked_at` pe acord și pe tokenuri. 204 sau 404 |

„Permite” dă asistentului exact drepturile pe care utilizatorul le are în spații. „Refuză” întoarce `access_denied`.

În Profil, ecranul „Asistenți conectați” listează acordurile și are Deconectează.

### Pașii de conectare

1. Clientul citește well-known și face `POST /oauth/register`. Înregistrarea nu dă acces la date.
2. `GET` sau `POST /oauth/authorize` salvează cererea 15 minute și răspunde 302 către `{origin}/autorizare-asistent?request={request_id}`.
3. Dacă utilizatorul nu e logat, pagina îl duce la login și înapoi.
4. Permite creează `assistant_grants` și un cod de 10 minute. Refuză șterge cererea.
5. `POST /oauth/token` schimbă codul, cu `code_verifier`, în access și refresh.
6. Apelurile `POST /mcp` trimit `Authorization: Bearer` și `Accept: application/json, text/event-stream`.

### Unelte

Fiecare unealtă deschide o sesiune SQLAlchemy și cheamă aceleași servicii ca rutele `/api`. Nu face HTTP către propriul API.

Argumentul `spatiu` este numele sau id-ul. Rezolvarea, doar în spațiile utilizatorului:

- gol și un singur spațiu: se folosește acela;
- gol și mai multe: `ToolError` cu lista, iar modelul întreabă;
- id sau nume unic: se folosește;
- mai multe potriviri: lista, fără să aleagă singur.

Aceeași regulă pentru cont și categorie când numele nu este unic.

| Unealtă | Cine | Efect |
| --- | --- | --- |
| `spatii_disponibile` | orice acord | Spațiile, rolul în fiecare, moneda de bază |
| `conturi` | viewer | Conturile și soldul |
| `categorii` | viewer | Categoriile spațiului |
| `cauta_tranzactii` | viewer | Filtre: spațiu, cont, categorie, de la, până la, text, monedă. `limita` 1–100, implicit 20, plus `total` |
| `detalii_tranzactie` | viewer | Un rând, dacă spațiul îi este vizibil |
| `bugete` | viewer | Limita, consumat, rămas, pe luna cerută sau luna curentă |
| `obiective` | viewer | Ținta și progresul |
| `raport_perioada` | viewer | Totaluri pe categorie și pe monedă. Include spațiile trimise sau toate cele vizibile |
| `compara_perioade` | viewer | Două intervale, aceleași totaluri |
| `adauga_tranzactie` | editor | Creează. `origin = asistent`. Idempotency dacă `permite_duplicat` este false |
| `modifica_tranzactie` | editor | Cere `confirmat: true`. Fără el, refuză și nu scrie |
| `sterge_tranzactie` | admin | Cere `confirmat: true`. Pune `deleted_at` |
| `seteaza_buget` | admin | Creează sau înlocuiește bugetul lunii |
| `adauga_categorie` | admin | În spațiul indicat |

Nu există unelte pentru invitații, roluri, ștergerea spațiului, parola, import sau OCR. Acelea rămân în aplicație.

`adauga_tranzactie` cere sumă pozitivă, dată, cont și, la venit sau cheltuială, categorie. Transferul cere contul destinație. Seria de dubluri: cheia este `asistent:{grant_id}:{amprenta}` în `assistant_idempotency`. Amprenta este SHA-256 peste JSON canonic (`sort_keys`, fără spații) al argumentelor fără `permite_duplicat`. Aceeași cheie întoarce tranzacția deja creată. O cheie `in_progress` mai veche de 5 minute poate fi reluată.

`INSTRUCTIONS` îi spune modelului: să întrebe spațiul când sunt mai multe, să nu inventeze categorii, să nu șteragă și să nu modifice fără o cerere explicită a utilizatorului, să treacă atunci `confirmat: true`, și să prezinte cursul folosit când moneda nu este RON. Textul este instrucțiune către model. Serverul aplică rolul, sumele, spațiul și `confirmat` indiferent de text.

Scrierile sensibile din ChatGPT depind de planul contului OpenAI: acțiunile de modificare sunt în beta pe Business, Enterprise și Edu. Serverul este același pentru Cursor și pentru ChatGPT.

### Verificare

Testele MCP pornesc pe o bază al cărei nume se termină în `_test`. Acoperă:

- fără `ASSISTANT_PUBLIC_URL`, `/mcp` nu există;
- 401 și well-known;
- PKCE, cod de unică folosință, refresh rotit, revocare;
- un spațiu față de mai multe;
- viewer care nu poate adăuga;
- editor care adaugă și nu poate șterge;
- ștergere fără `confirmat` refuzată, cu `confirmat` marcată ștearsă;
- a doua cerere identică nu creează a doua tranzacție;
- un spațiu al altui cont nu se rezolvă.

## 11. Ordinea de lucru

### Etapa 1 — Fundația

Docker Compose cu Postgres și FastAPI. Next.js pe portul 3000. Tabelele din etapa 1. Înregistrare, Resend sau log, login, spații, invitații, conturi, categorii, tranzacții manuale, solduri. Fără MCP.

Gata când: un utilizator confirmat creează un spațiu personal, un cont cash în RON, o cheltuială, și vede soldul corect. Un al doilea utilizator nu vede spațiul. După invitație ca viewer, îl vede și nu poate scrie.

### Etapa 2 — Gestionarea banilor

Tabelele din etapa 2. Recurențe generate la citirea spațiului. Bugete cu consumat și rămas. Obiective. Frankfurter și curs manual. Rapoarte separat și consolidat. Export JSON.

Gata când: o chirie lunară oprită două săptămâni apare o singură dată la deschidere. Un transfer nu crește cheltuielile. Un buget în RON include o cheltuială în EUR cu cursul salvat pe ea.

### Etapa 3 — Import și OCR

Tabelele din etapa 3. CSV și Excel cu previzualizare și duplicate. PaddleOCR în profilul `ocr`, pe o poză de bon, cu confirmare. API-ul pornește și fără `OCR_URL`.

Gata când: același fișier importat de două ori nu dublează rândurile. Salvarea bonului lasă o tranzacție și zero fișiere în bază.

### Etapa 4 — MCP și lansare

Tabelele din etapa 4. Proxy în Next.js. `ASSISTANT_PUBLIC_URL`. Pagina de consimțământ. Uneltele. Testele din secțiunea 10. Apoi Railway: trei servicii, variabile, login pe domeniul generat. Domeniul propriu când este cumpărat. Verificarea pe telefon a ecranelor din etapa 1 și 2.

Gata când: Cursor se conectează cu URL-ul, utilizatorul apasă Permite, întreabă soldul și adaugă o cheltuială care se vede în aplicație. Deconectarea din Profil face următorul apel 401. Ștergerea `ASSISTANT_PUBLIC_URL` și repornirea scot asistentul, iar aplicația și datele rămân.

## 12. În afara versiunii 1.0

- Vercel pentru Next.js.
- PaddleOCR pe server.
- Cron care stă pornit.
- Păstrarea pozelor de bon.
- API-uri AI plătite în backend.
- Abonamente și plată.
- A doua copie a serverului.
