export type SheetTable = {
  headers: string[];
  rows: Record<string, string>[];
  bank?: "ing" | "revolut" | "raiffeisen";
};

function detectDelimiter(sample: string): string {
  const line = sample.split(/\r?\n/, 1)[0] ?? "";
  let best = ",";
  let score = -1;
  for (const delimiter of [",", ";", "\t"]) {
    const count = line.split(delimiter).length;
    if (count > score) {
      best = delimiter;
      score = count;
    }
  }
  return best;
}

export function parseCsv(text: string): SheetTable {
  const source = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(source);
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.trim());
      cell = "";
      if (row.some(Boolean)) matrix.push(row);
      row = [];
    } else if (char !== "\r") cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) matrix.push(row);
  return tableFromMatrix(matrix);
}

function matrixToTable(matrix: Array<Array<string | number | boolean | Date | null | undefined>>): SheetTable {
  const headerRow = (matrix[0] ?? []).map((cell, index) => {
    const text = cell === null || cell === undefined ? "" : String(cell).trim();
    return text || `Coloana ${index + 1}`;
  });
  const headers = headerRow.filter((header, index) => header || index === 0);
  const rows = matrix.slice(1).map((line) => {
    const record: Record<string, string> = {};
    headerRow.forEach((header, index) => {
      const value = line[index];
      record[header] = value === null || value === undefined ? "" : String(value).trim();
    });
    return record;
  });
  return { headers: headerRow, rows: rows.filter((record) => Object.values(record).some(Boolean)) };
}

export async function readSpreadsheet(file: File): Promise<SheetTable> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCsv(await file.text());
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: true,
    codepage: 1250,
  } as XLSX.ParsingOptions);
  const sheet = book.Sheets[book.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(sheet, {
    header: 1,
    raw: false,
    dateNF: "dd.mm.yyyy",
    defval: "",
  });
  return tableFromMatrix(matrix);
}

function tableFromMatrix(matrix: Array<Array<string | number | boolean | Date | null | undefined>>): SheetTable {
  const text = matrix.map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell).trim())));
  const bank = recognizeBank(text);
  if (bank) return bank;
  return matrixToTable(matrix);
}

const MONTHS: Record<string, number> = {
  ianuarie: 1,
  februarie: 2,
  martie: 3,
  aprilie: 4,
  mai: 5,
  iunie: 6,
  iulie: 7,
  august: 8,
  septembrie: 9,
  octombrie: 10,
  noiembrie: 11,
  decembrie: 12,
};

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ș/g, "s")
    .replace(/ț/g, "t")
    .replace(/\s+/g, " ")
    .trim();
}

function cellAt(row: string[], index: number | null): string {
  if (index === null || index < 0 || index >= row.length) return "";
  return row[index].trim();
}

function findColumn(header: string[], name: string): number | null {
  const target = fold(name);
  const index = header.findIndex((cell) => fold(cell) === target);
  return index >= 0 ? index : null;
}

function signedAmount(value: string): number | null {
  let text = value.trim().replace(/\s/g, "");
  if (!text) return null;
  const negative = text.startsWith("-") || (text.startsWith("(") && text.endsWith(")"));
  text = text.replace(/[()]/g, "");
  if (text.startsWith("+") || text.startsWith("-")) text = text.slice(1);
  if (text.includes(",") && text.includes(".")) {
    text = text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (text.includes(",")) text = text.replace(",", ".");
  const amount = Number(text);
  if (!Number.isFinite(amount)) return null;
  return negative ? -amount : amount;
}

function positiveAmount(value: string): string {
  const amount = signedAmount(value);
  if (amount === null || amount === 0) return "";
  return Math.abs(amount).toFixed(2);
}

function isoDate(value: string): string {
  const text = fold(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const numeric = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(text);
  if (numeric) return safeDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  const words = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})/.exec(text);
  if (words && MONTHS[words[2]]) return safeDate(Number(words[3]), MONTHS[words[2]], Number(words[1]));
  return "";
}

function safeDate(year: number, month: number, day: number): string {
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function statementRow(when: string, amount: string, currency: string, description: string, kind: string): Record<string, string> {
  return { Data: when, Suma: amount, Moneda: currency || "RON", Descriere: description.replace(/\s+/g, " ").trim(), Tip: kind };
}

function recognizeBank(matrix: string[][]): SheetTable | null {
  const revolut = revolutTable(matrix);
  if (revolut) return revolut;
  const raiffeisen = raiffeisenTable(matrix);
  if (raiffeisen) return raiffeisen;
  return ingTable(matrix);
}

const BALANCE = ["soldul zilei", "sold initial", "sold final", "sold disponibil", "rulaj debitor", "rulaj creditor"];
const BOOKED = ["data inregistrarii", "data inregistrare"];
const TRADED = ["data tranzactiei", "data tranzactie"];
const DETAILS = ["descrierea tranzactiei", "descriere tranzactie", "descrierea", "detalii", "descriere"];

function findAny(header: string[], names: string[]): number | null {
  for (const name of names) {
    const found = findColumn(header, name);
    if (found !== null) return found;
  }
  return null;
}

function raiffeisenTable(matrix: string[][]): SheetTable | null {
  const headerAt = matrix.findIndex((row) => raiffeisenHeader(row));
  if (headerAt < 0) return null;
  const header = matrix[headerAt];
  const booked = findAny(header, BOOKED);
  const traded = findAny(header, TRADED);
  const detailCol = findAny(header, DETAILS);
  const debitCol = findColumn(header, "suma debit");
  const creditCol = findColumn(header, "suma credit");
  const amountCol = debitCol === null && creditCol === null ? findColumn(header, "suma") : null;
  const currency = statementCurrency(matrix);
  const rows: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;
  for (const row of matrix.slice(headerAt + 1)) {
    if (!row.some((item) => item.trim()) || isBalance(row)) continue;
    const when = isoDate(cellAt(row, booked)) || isoDate(cellAt(row, traded));
    const detail = cellAt(row, detailCol);
    let amount = "";
    let kind = "";
    if (amountCol === null) {
      const debit = positiveAmount(cellAt(row, debitCol));
      const credit = positiveAmount(cellAt(row, creditCol));
      amount = debit || credit;
      kind = debit ? "expense" : "income";
    } else {
      const signed = signedAmount(cellAt(row, amountCol));
      if (signed !== null && signed !== 0) {
        amount = Math.abs(signed).toFixed(2);
        kind = signed < 0 ? "expense" : "income";
      }
    }
    if (when && amount) {
      current = statementRow(when, amount, currency, detail || "Raiffeisen", kind);
      rows.push(current);
      continue;
    }
    if (current && detail && !when) current.Descriere = `${current.Descriere} · ${detail}`.replace(/\s+/g, " ").trim();
  }
  return { headers: ["Data", "Suma", "Moneda", "Descriere", "Tip"], rows, bank: "raiffeisen" };
}

function raiffeisenHeader(row: string[]): boolean {
  const booked = findAny(row, BOOKED) !== null || findAny(row, TRADED) !== null;
  const split = findColumn(row, "suma debit") !== null || findColumn(row, "suma credit") !== null;
  const single = findAny(row, DETAILS) !== null && findColumn(row, "suma") !== null;
  return booked && (split || single);
}

function isBalance(row: string[]): boolean {
  const folded = fold(row.join(" "));
  return BALANCE.some((phrase) => folded.includes(phrase));
}

function statementCurrency(matrix: string[][]): string {
  for (const row of matrix) {
    for (const cell of row) {
      const match = /\bvaluta\b\s*[:\-]?\s*([a-z]+)/.exec(fold(cell));
      if (!match) continue;
      const word = match[1];
      if (word === "lei" || word === "ron") return "RON";
      if (word === "euro") return "EUR";
      if (word.length === 3) return word.toUpperCase();
    }
  }
  return "RON";
}

function revolutTable(matrix: string[][]): SheetTable | null {
  const headerAt = matrix.findIndex((row) => {
    const cells = new Set(row.map(fold));
    return cells.has("amount") && cells.has("description") && (cells.has("started date") || cells.has("completed date"));
  });
  if (headerAt < 0) return null;
  const header = matrix[headerAt];
  const started = findColumn(header, "started date");
  const completed = findColumn(header, "completed date");
  const amountCol = findColumn(header, "amount");
  const feeCol = findColumn(header, "fee");
  const currencyCol = findColumn(header, "currency");
  const descriptionCol = findColumn(header, "description");
  const stateCol = findColumn(header, "state");
  const typeCol = findColumn(header, "type");
  const skip = new Set(["failed", "reverted", "reversed", "cancelled", "canceled"]);
  const rows: Record<string, string>[] = [];
  for (const row of matrix.slice(headerAt + 1)) {
    if (!row.some((item) => item.trim())) continue;
    if (skip.has(fold(cellAt(row, stateCol)))) continue;
    const when = isoDate(cellAt(row, completed)) || isoDate(cellAt(row, started));
    const signed = signedAmount(cellAt(row, amountCol));
    const fee = signedAmount(cellAt(row, feeCol)) ?? 0;
    if (!when || signed === null) continue;
    const description = cellAt(row, descriptionCol) || cellAt(row, typeCol) || "Revolut";
    const currency = (cellAt(row, currencyCol) || "RON").toUpperCase();
    if (signed < 0) rows.push(statementRow(when, (Math.abs(signed) + (fee > 0 ? fee : 0)).toFixed(2), currency, description, "expense"));
    else if (signed > 0) {
      rows.push(statementRow(when, signed.toFixed(2), currency, description, "income"));
      if (fee > 0) rows.push(statementRow(when, fee.toFixed(2), currency, `Comision · ${description}`, "expense"));
    } else if (fee > 0) rows.push(statementRow(when, fee.toFixed(2), currency, `Comision · ${description}`, "expense"));
  }
  return { headers: ["Data", "Suma", "Moneda", "Descriere", "Tip"], rows, bank: "revolut" };
}

const DETAIL_LABELS = ["tranzactie la", "ordonator", "beneficiar", "detalii", "terminal"];

function ingTable(matrix: string[][]): SheetTable | null {
  if (!matrix.some((row) => ingHeader(row))) return null;
  let columns: { data: number; detalii: number; debit: number; credit: number } | null = null;
  let current: { date: string; amount: string; kind: string; title: string; merchant: string; extras: string[] } | null = null;
  const rows: Record<string, string>[] = [];
  const finish = () => {
    if (!current) return;
    const merchant = current.merchant.trim();
    const title = current.title.trim();
    const head = merchant ? (title && !fold(merchant).includes(fold(title)) ? `${title} · ${merchant}` : merchant) : title || "ING";
    const description = [head, ...current.extras.map((item) => item.trim()).filter(Boolean)].join(" · ");
    rows.push(statementRow(current.date, current.amount, "RON", description, current.kind));
    current = null;
  };
  for (const row of matrix) {
    if (ingHeader(row)) {
      finish();
      columns = {
        data: findColumn(row, "data") ?? 0,
        detalii: findColumn(row, "detalii tranzactie") ?? 3,
        debit: findColumn(row, "debit") ?? 0,
        credit: findColumn(row, "credit") ?? 0,
      };
      continue;
    }
    if (!columns) continue;
    const when = isoDate(cellAt(row, columns.data));
    const debit = positiveAmount(cellAt(row, columns.debit));
    const credit = positiveAmount(cellAt(row, columns.credit));
    const detail = cellAt(row, columns.detalii);
    if (when && (debit || credit)) {
      finish();
      current = { date: when, amount: debit || credit, kind: debit ? "expense" : "income", title: detail, merchant: "", extras: [] };
      continue;
    }
    if (!current || !detail) continue;
    const folded = fold(detail);
    const label = DETAIL_LABELS.find((item) => folded.startsWith(item));
    const rest = detail.includes(":") ? detail.split(":").slice(1).join(":").trim() : "";
    if (label === "tranzactie la") current.merchant = rest;
    else if (label && rest) current.extras.push(rest);
  }
  finish();
  return { headers: ["Data", "Suma", "Moneda", "Descriere", "Tip"], rows, bank: "ing" };
}

function ingHeader(row: string[]): boolean {
  const cells = new Set(row.map(fold));
  return cells.has("data") && cells.has("debit") && cells.has("credit");
}
