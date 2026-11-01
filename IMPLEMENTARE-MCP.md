# Implementare MCP ExpenseWise

Serverul MCP ExpenseWise stă în aplicația FastAPI (`apps/api`). Nu este un proces separat. Prin el, un client MCP (Cursor, Claude, ChatGPT) lucrează în contul unui utilizator confirmat: spații, conturi, tranzacții, bugete, obiective și rapoarte, doar în limita rolului din fiecare spațiu.

Pornește doar dacă `ASSISTANT_PUBLIC_URL` este setată. Fără ea nu se adaugă nicio rută `/mcp`, `/oauth`, `/.well-known` sau `/api/asistent`.

Specificația de produs, schema și permisiunile sunt în `EXPENSEWISE.md`. Acest fișier este contractul de implementare al asistentului.

## 1. Arhitectură

| Fișier | Rol |
| --- | --- |
| `apps/api/app/mcp/__init__.py` | Citește `ASSISTANT_PUBLIC_URL`. `assistant_enabled()` este adevărat doar când valoarea, după `strip` și fără slash final, este nevidă. |
| `apps/api/app/mcp/server.py` | Rute OAuth, documente well-known, transport MCP. |
| `apps/api/app/mcp/tools.py` | `INSTRUCTIONS`, înregistrarea uneltelor, regulile de spațiu, rol și confirmare. |
| `apps/api/app/services/assistant_oauth_service.py` | Clienți, cereri, acorduri, coduri, tokenuri, hash SHA-256, revocare. |
| `apps/api/app/services/assistant_idempotency_service.py` | Cheia la `adauga_tranzactie`. |
| `apps/api/app/api/assistant.py` | Consimțământ și lista de conexiuni, pe sesiunea aplicației. |
| `apps/api/app/main.py` | Montează serverul doar când asistentul este pornit. Intră în lifespan. |
| `apps/web/next.config.ts` | Proxy local și de producție pentru `/mcp`, `/oauth`, `/.well-known`. |
| `.cursor/mcp.json` | URL-ul clientului, fără cheie. |
| `apps/api/.env.example` | `ASSISTANT_PUBLIC_URL` comentată până în etapa 4. |
| `apps/api/tests/test_asistent.py` | 401, well-known, PKCE, roluri, confirmare, idempotency. |

Pachetul Python, în `apps/api/pyproject.toml`:

```text
mcp>=1.30.0,<1.31.0
```

Transportul este Streamable HTTP. La fiecare boot, lifespan-ul pornește un `StreamableHTTPSessionManager`:

- `app` = serverul low-level `FastMCP._mcp_server`
- `json_response=True`
- `stateless=True`
- metode pe `/mcp`: `GET`, `POST`, `DELETE`

`FastMCP` se construiește cu `name="ExpenseWise"`, `instructions=INSTRUCTIONS` și `website_url` egal cu `ASSISTANT_PUBLIC_URL`. Nu primește un provider OAuth propriu și nu se apelează `FastMCP.run()`. Rutele HTTP se adaugă manual. În fața handler-ului MCP: `AuthenticationMiddleware` → `BearerAuthBackend` → `AuthContextMiddleware` → `RequireAuthMiddleware` cu `required_scopes=[]`.

SDK-ul verifică PKCE, expirarea codului și potrivirea `redirect_uri`. Aplicația păstrează clienții, codurile și tokenurile și leagă acordul de utilizator.

### Cum pornește

1. `assistant_public_url()` citește `ASSISTANT_PUBLIC_URL`.
2. Dacă lipsește, serverul rămâne neconstruit: zero rute de asistent.
3. Dacă este setată, se construiește serverul. `SECRET_KEY` rămâne cheia JWT a aplicației și nu se folosește ca token MCP.
4. Lifespan-ul pornește managerul. O cerere la `/mcp` înainte de pornire răspunde HTTP 503 cu `{"detail": "Asistentul AI nu este pornit."}`.

Issuer-ul OAuth este originea (`ASSISTANT_PUBLIC_URL`), nu `.../oauth`. Rutele de token stau sub `/oauth`. Resursa protejată este `{ASSISTANT_PUBLIC_URL}/mcp`.

Protecția DNS rebinding din SDK:

- host `localhost`, `127.0.0.1` sau `::1`: protecție pornită, origini locale permise;
- orice alt host: protecție oprită. În producție cererea trece prin Next.js, iar accesul este păzit de tokenul OAuth.

Local, Next.js ascultă pe portul `3000` și proxy-ează spre API (`http://127.0.0.1:8000`):

| Prefix | Destinație |
| --- | --- |
| `/mcp` | API |
| `/oauth` | API |
| `/.well-known` | API |

De aceea local `ASSISTANT_PUBLIC_URL=http://localhost:3000`. Clientul MCP vorbește cu Next.js, iar Next.js trimite mai departe la FastAPI. În `.env.example` linia rămâne comentată până în etapa 4.

Pe Railway, originea este domeniul serviciului web. După cumpărarea domeniului, aceeași variabilă devine `https://domeniul-tau.ro`. API-ul nu are nevoie de domeniu propriu.

## 2. Configurare client

Configurația nu conține API key, header sau secret. Clientul descoperă OAuth din well-known și face PKCE.

Local:

```json
{
  "mcpServers": {
    "expensewise": { "url": "http://localhost:3000/mcp" }
  }
}
```

Producție, același obiect, cu originea din `ASSISTANT_PUBLIC_URL`. URL-ul trebuie să fie exact resursa anunțată de server.

Documente well-known (GET și OPTIONS, `Cache-Control: no-store`). `{origin}` este `ASSISTANT_PUBLIC_URL` fără slash final.

| Document | Căi |
| --- | --- |
| Authorization server (`issuer` = `{origin}`) | `/.well-known/oauth-authorization-server`, `/.well-known/oauth-authorization-server/oauth`, `/oauth/.well-known/oauth-authorization-server` |
| Protected resource (`resource` = `{origin}/mcp`) | `/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-protected-resource` |

`issuer` și `authorization_servers` se publică fără slash final.

## 3. Autentificare OAuth 2.1 + PKCE

Un singur scope: `expensewise`. Înregistrarea dinamică îl are ca `valid_scopes` și `default_scopes`.

Resource indicator: `{origin}/mcp`. La `/oauth/authorize`, o resursă diferită este respinsă. La încărcarea access token-ului, lipsa resursei este acceptată. O resursă care nu este `{origin}/mcp` face tokenul invalid.

Grant types: `authorization_code`, `refresh_token`. Response type: `code`. Code challenge: doar `S256`.

`token_endpoint_auth_methods_supported` și `revocation_endpoint_auth_methods_supported`: `none`, `client_secret_post`, `client_secret_basic`. Cursor folosește `none`. Metadatele se construiesc explicit, ca să anunțe `none`.

| Constantă | Valoare |
| --- | --- |
| Access token | 1 oră (`expires_in` = 3600) |
| Refresh token | 30 zile |
| Cod de autorizare | 10 minute |
| Cerere de consimțământ | 15 minute |
| Scriere `last_used_at` | cel mult o dată pe minut |

Tokenurile sunt opace. Access: `secrets.token_urlsafe(32)`. Refresh: `secrets.token_urlsafe(48)`. Codul și id-ul cererii: `token_urlsafe(32)`. În bază, pentru cod și pentru token, se păstrează doar `hashlib.sha256(valoare.encode("utf-8")).hexdigest()`. Răspunsul de token are `token_type` `Bearer`.

Pașii:

1. `POST /oauth/register`, JSON, de exemplu `redirect_uris`, `client_name`, `token_endpoint_auth_method: "none"`, `grant_types: ["authorization_code", "refresh_token"]`, `response_types: ["code"]`. Răspuns 201, cu `client_id`. Înregistrarea nu dă niciun drept pe date.
2. `GET` sau `POST /oauth/authorize` cu `response_type=code`, `client_id`, `redirect_uri`, `code_challenge`, `code_challenge_method=S256`, `state`, `scope=expensewise`, `resource={origin}/mcp`. Serverul salvează cererea 15 minute și răspunde 302 către `{origin}/autorizare-asistent?request={request_id}`. Pagina este rută Next.js, nu endpoint FastAPI.
3. Utilizatorul este autentificat în aplicație, cu emailul confirmat. `GET /api/asistent/autorizare/{request_id}` întoarce numele aplicației și emailul. Cerere expirată sau necunoscută: HTTP 410.
4. `POST /api/asistent/autorizare/{request_id}` cu corpul `{"allow": true}` sau `{"allow": false}`.
5. `allow: false` șterge cererea și întoarce `redirect_url` cu `error=access_denied` și `state`.
6. `allow: true` creează acordul pe utilizatorul logat. Se emite codul (10 minute, o singură folosință) și se șterge cererea. `redirect_url` conține `code` și `state`.
7. `POST /oauth/token`, corp `application/x-www-form-urlencoded`: `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `code_verifier`. Cod folosit a doua oară: HTTP 400, `error=invalid_grant`. Nu se emit tokenuri.
8. Access token-ul poartă `grant_id`. Subiectul este id-ul utilizatorului. La fiecare apel MCP valid, `last_used_at` se actualizează cel mult o dată pe minut.
9. `POST /oauth/token` cu `grant_type=refresh_token` rotește refresh-ul: rândul vechi primește `revoked_at`, se emit access și refresh noi. Reutilizarea refresh-ului vechi dă 400.
10. `POST /oauth/revoke` revocă tokenul trimis. `DELETE /api/asistent/conexiuni/{grant_id}` pune `revoked_at` pe acord și pe tokenurile lui. Următorul apel MCP primește 401. `GET /api/asistent/conexiuni` listează acordurile active.

`/mcp` fără token, sau cu Bearer necunoscut, expirat, revocat ori emis pentru altă resursă: HTTP 401.

```text
WWW-Authenticate: Bearer error="invalid_token", error_description="Authentication required", resource_metadata="{origin}/.well-known/oauth-protected-resource/mcp"
```

Corpul este `{"error":"invalid_token","error_description":"Authentication required"}`. Un access token valid pentru această resursă este suficient.

Resetarea parolei din aplicație revocă toate acordurile utilizatorului. Ștergerea utilizatorului șterge acordurile, codurile și tokenurile.

Emailul neconfirmat nu poate apăsa Permite. Pagina îl trimite la confirmare.

## 4. Spații și permisiuni

Lanțul este: access token → `grant_id` → acord → `user_id` → rândurile din `space_members`.

Acordul nu copiază rolurile. La fiecare unealtă, rolul se citește din bază. O schimbare făcută în aplicație se aplică la următorul apel, fără reconectare.

Un acord cu `revoked_at` setat nu mai încarcă coduri, refresh-uri sau access token-uri.

Rolurile sunt cele din `EXPENSEWISE.md`: `viewer`, `editor`, `admin`, `owner`. Proprietarul are drepturile de `admin` plus operațiile care rămân doar în aplicație.

| Unealtă | Rol minim |
| --- | --- |
| `spatii_disponibile`, `conturi`, `categorii`, `cauta_tranzactii`, `detalii_tranzactie`, `bugete`, `obiective`, `raport_perioada`, `compara_perioade` | viewer |
| `adauga_tranzactie`, `modifica_tranzactie` | editor |
| `sterge_tranzactie`, `seteaza_buget`, `adauga_categorie` | admin |

Parametrul `spatiu` (nume sau id) există pe uneltele care lucrează pe un spațiu. Rezolvarea, doar în spațiile utilizatorului:

- gol și un singur spațiu: se folosește acela;
- gol și mai multe: `ToolError`, cu lista, care cere să fie întrebat utilizatorul;
- id exact: spațiul, dacă este membru;
- nume exact, fără diferență de majuscule, apoi nume parțial dacă rezultatul este unic;
- mai multe potriviri: lista, fără alegere automată.

Un spațiu din alt cont nu se rezolvă. Tranzacția se încarcă doar dacă `space_id` este printre spațiile vizibile.

Aceeași regulă de potrivire se aplică la `cont` și la `categorie`.

## 5. Protocolul apelului

```http
POST /mcp
Authorization: Bearer <access_token>
Accept: application/json, text/event-stream
Content-Type: application/json
```

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "spatii_disponibile", "arguments": {} }
}
```

Cu `json_response=True`, răspunsul de succes este HTTP 200 și un corp JSON-RPC.

- succes: `result.isError` este `false`; payload-ul este JSON în `result.content[0].text`;
- regulă de business încălcată: tot HTTP 200, `result.isError` = `true`, mesajul în `result.content[0].text`.

Uneltele sunt annotate `-> dict`. Nu se înregistrează resources sau prompts.

Paginarea nu folosește `offset`. `cauta_tranzactii` primește `limita` (1–100, implicit 20) și întoarce `total` plus pagina. Dacă `total` este mai mare, clientul reapelează cu `limita` mai mare sau cu `cautare`.

## 6. Unelte

Toate cheamă serviciile folosite de rutele `/api`. Niciuna nu face HTTP către propriul API. Tranzacțiile create de asistent au `origin = asistent`.

Sumele sunt pozitive. Moneda lipsă înseamnă moneda contului. Data lipsă înseamnă ziua curentă din `Europe/Bucharest`. Transferul nu are categorie. Venitul și cheltuiala au categorie de același fel. Contul, contul pereche, categoria și obiectivul trebuie să fie în spațiul rezolvat.

Cursul urmează regula din specificație: RON nu are curs; altă monedă ia Frankfurter sau `curs` trimis de utilizator, cu `sursa_curs = manual`. Fără curs, tranzacția se salvează și nu intră în totalul consolidat.

| Unealtă | Input | Efect |
| --- | --- | --- |
| `spatii_disponibile` | fără argumente | Spațiile membrului, rolul, tipul, moneda de bază. Nu modifică nimic. |
| `conturi` | `spatiu` opțional | Nume, tip, monedă, sold. |
| `categorii` | `spatiu` opțional; `fel` opțional (`income` sau `expense`) | Categoriile active. |
| `cauta_tranzactii` | `spatiu` opțional; `cont`, `categorie`, `de_la`, `pana_la`, `cautare`, `moneda` opționale; `limita` 1–100, implicit 20 | Pagina și `total`. Fără rândurile șterse. |
| `detalii_tranzactie` | `tranzactie_id` | Rândul, contul, categoria, cursul, obiectivul. |
| `bugete` | `spatiu` opțional; `an` și `luna` opționale (implicit luna curentă) | Limită, consumat, rămas, monedă. |
| `obiective` | `spatiu` opțional | Țintă, progres, monedă, dată. |
| `raport_perioada` | `de_la`, `pana_la`; `spatiu` opțional; `moneda` opțională | Totaluri pe categorie și pe monedă. Fără `spatiu`: toate spațiile vizibile. `moneda=RON`: consolidat. |
| `compara_perioade` | `de_la_a`, `pana_la_a`, `de_la_b`, `pana_la_b`; `spatiu` opțional | Aceleași totaluri pe cele două intervale. |
| `adauga_tranzactie` | `fel` (`income`, `expense`, `transfer`); `suma`; `cont`; `spatiu` opțional; `categorie` la venit și cheltuială; `cont_destinatie` la transfer; `suma_destinatie` când monedele diferă; `moneda` opțională; `data` opțională; `descriere` opțională; `obiectiv` opțional; `curs` opțional; `permite_duplicat` implicit false | Creează tranzacția. |
| `modifica_tranzactie` | `tranzactie_id`; câmpurile de schimbat; `confirmat` | Scrie doar dacă `confirmat` este `true`. |
| `sterge_tranzactie` | `tranzactie_id`; `confirmat` | Doar cu `confirmat: true`. Pune `deleted_at`. |
| `seteaza_buget` | `spatiu` opțional; `limita`; `an`; `luna`; `moneda` opțională; `categorie` opțională | Creează sau înlocuiește bugetul acelei luni. Fără categorie: buget pe tot spațiul. |
| `adauga_categorie` | `nume`; `fel`; `spatiu` opțional | Categorie nouă în spațiu. |

Annotations: citirile au `readOnlyHint=true`. `modifica_tranzactie` și `sterge_tranzactie` au `destructiveHint=true`. `adauga_tranzactie` are `idempotentHint=false` când `permite_duplicat` poate crea un rând nou; apelul repetat cu aceeași amprentă rămâne totuși o singură tranzacție cât timp `permite_duplicat` este false.

Nu există unelte pentru invitații, schimbare de rol, ștergerea spațiului, parolă, import CSV, Excel sau OCR.

### Reguli aplicate în server

**Confirmare.** `modifica_tranzactie` și `sterge_tranzactie` fără `confirmat: true` răspund cu `ToolError` și nu scriu. `INSTRUCTIONS` îi cere modelului să pună `confirmat` doar după o cerere explicită de modificare sau ștergere.

**Idempotency.** Doar `adauga_tranzactie`, și doar când `permite_duplicat` este `false`. Cheia este `asistent:{grant_id}:{amprenta}` în `assistant_idempotency`. Amprenta este SHA-256 peste JSON canonic (`sort_keys`, fără spații) al argumentelor, fără `permite_duplicat`. Aceeași cheie întoarce tranzacția deja creată. O cheie `in_progress` mai veche de 5 minute poate fi reluată. La succes: `complete`. La eșec: `abandoned`. `permite_duplicat=true` sare peste cheie.

**Transfer.** Nu intră în venituri, cheltuieli, bugete sau raportul pe categorii. Soldul scade în contul sursă și crește în contul destinație, cu regula de sume din `EXPENSEWISE.md`.

**Rapoarte.** Includ numai spațiile în care utilizatorul are cel puțin `viewer`. Ștergerile (`deleted_at`) lipsesc.

Textul `INSTRUCTIONS`, copiat în cod:

```text
Ești asistentul ExpenseWise. Lucrezi doar în spațiile utilizatorului autentificat.
Dacă sunt mai multe spații și nu este clar despre care este vorba, cheamă spatii_disponibile și întreabă.
Nu inventa categorii: folosește categorii. Nu alege singur când există mai multe potriviri.
Pentru o cheltuială sau un venit nou, cheamă adauga_tranzactie.
Nu chema modifica_tranzactie sau sterge_tranzactie decât dacă utilizatorul a cerut explicit modificarea sau ștergerea. Atunci trimite confirmat=true.
La sume în altă monedă decât RON, arată cursul și sursa lui.
Invitațiile, rolurile, importul și bonurile se fac în aplicație, nu aici.
```

Serverul aplică rolul, spațiul, sumele și `confirmat` chiar dacă modelul sare peste text.

## 7. Endpoint-uri HTTP

Toate apar doar când `ASSISTANT_PUBLIC_URL` este setat.

| Metodă | Cale | Auth | Rol |
| --- | --- | --- | --- |
| GET, POST, DELETE | `/mcp` | Bearer OAuth | Transport MCP. 401 fără token valid. 503 dacă managerul nu a pornit. |
| GET, POST | `/oauth/authorize` | clientul OAuth | Începe PKCE. 302 către `{origin}/autorizare-asistent?request=`. |
| POST, OPTIONS | `/oauth/token` | client OAuth (`none` sau secret) | Schimbă codul sau refresh-ul. |
| POST, OPTIONS | `/oauth/register` | public | Înregistrare dinamică. 201. |
| POST, OPTIONS | `/oauth/revoke` | client OAuth | Revocă tokenul trimis. |
| GET, OPTIONS | `/.well-known/oauth-authorization-server` | public | Metadate authorization server. |
| GET, OPTIONS | `/.well-known/oauth-authorization-server/oauth` | public | Același document. |
| GET, OPTIONS | `/oauth/.well-known/oauth-authorization-server` | public | Același document. |
| GET, OPTIONS | `/.well-known/oauth-protected-resource/mcp` | public | Metadate resursă. |
| GET, OPTIONS | `/.well-known/oauth-protected-resource` | public | Același document de resursă. |
| GET | `/api/asistent/autorizare/{request_id}` | sesiune aplicație, email confirmat | Detalii consimțământ. 410 dacă cererea a expirat. |
| POST | `/api/asistent/autorizare/{request_id}` | sesiune aplicație, email confirmat | Corp `{"allow": true\|false}`. Întoarce `redirect_url`. |
| GET | `/api/asistent/conexiuni` | sesiune aplicație | Acorduri active. |
| DELETE | `/api/asistent/conexiuni/{grant_id}` | sesiune aplicație | Revocă acordul. 204 sau 404. |

`/autorizare-asistent` este pagină Next.js. Nu este rută FastAPI. În Profil, „Asistenți conectați” folosește lista și ștergerea de mai sus.

## 8. Tabele

DDL-ul este în `EXPENSEWISE.md`, etapa 4: `assistant_oauth_clients`, `assistant_auth_requests`, `assistant_grants`, `assistant_auth_codes`, `assistant_tokens`, `assistant_idempotency`.

`client_info` și `params` sunt JSON păstrat ca text. Codurile și tokenurile se caută după SHA-256. Id-ul cererii de autorizare este secretul din URL și trăiește 15 minute. După Permite sau Refuză, rândul se șterge.

## 9. Verificare

Testele din `apps/api/tests/test_asistent.py` pornesc pe o bază al cărei nume se termină în `_test`.

1. Fără `ASSISTANT_PUBLIC_URL`, `/mcp` răspunde 404.
2. Well-known anunță `resource` = `{origin}/mcp` și `issuer` fără slash final.
3. `/mcp` fără token răspunde 401 cu `WWW-Authenticate`.
4. PKCE S256, cod de unică folosință, refresh rotit, revocare din `/api/asistent/conexiuni`.
5. Un spațiu este folosit direct. Mai multe spații, fără `spatiu`, întorc lista și nu scriu.
6. Viewer nu poate chema `adauga_tranzactie`. Editor nu poate chema `sterge_tranzactie`.
7. `sterge_tranzactie` fără `confirmat` nu pune `deleted_at`. Cu `confirmat: true`, o pune.
8. A doua `adauga_tranzactie` cu aceleași argumente întoarce aceeași tranzacție.
9. Un spațiu al altui utilizator nu apare în `spatii_disponibile` și nu poate fi deschis prin id.

În Cursor, după Permite: o întrebare de sold și o cheltuială mică. Cheltuiala se vede în aplicație cu `origin = asistent`. Deconectarea din Profil face următorul apel 401.

Dacă asistentul trebuie oprit, se șterge `ASSISTANT_PUBLIC_URL` și se repornește API-ul. Rutele dispar. Tranzacțiile și conturile rămân.
