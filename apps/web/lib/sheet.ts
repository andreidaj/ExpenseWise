export type SheetTable = {
  headers: string[];
  rows: Record<string, string>[];
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
  return matrixToTable(matrix);
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
  const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheet = book.Sheets[book.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(sheet, {
    header: 1,
    raw: false,
    dateNF: "dd.mm.yyyy",
    defval: "",
  });
  return matrixToTable(matrix);
}
