# ExpenseWise

Aplicație web pentru finanțele personale și de familie. Specificația completă este în [EXPENSEWISE.md](EXPENSEWISE.md). Contractul asistentului MCP este în [IMPLEMENTARE-MCP.md](IMPLEMENTARE-MCP.md).

## Pornire locală

Din rădăcina proiectului:

```powershell
docker compose up -d --build
```

Site-ul este la `http://localhost:3000`. API-ul ascultă doar pe calculator, la `http://127.0.0.1:8000`.

Pentru telefon, în aceeași rețea Wi-Fi, deschide adresa `Network` afișată de containerul web, pe portul 3000.

Variabilele sunt în `.env.example`, `apps/api/.env.example` și `apps/web/.env.example`. Nu pune secrete în git.
