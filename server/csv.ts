/**
 * Escapes one CSV cell. Values that a spreadsheet would treat as a formula
 * (leading = + - @ tab or carriage return) are prefixed with an apostrophe so
 * they are shown as text instead of being executed (CSV/formula injection).
 */
export function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const BOM = String.fromCharCode(0xfeff);

export function toCsv(header: string[], rows: (string | number)[][]): string {
  // BOM so Excel opens UTF-8 (accented names) correctly; CRLF per RFC 4180.
  return BOM + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
