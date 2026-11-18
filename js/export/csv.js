// Eksport CSV: jeden wiersz na dzień; czytania dnia w jednej komórce rozdzielone wybranym znakiem.
import {isoDate} from '../dom.js';

/**
 * @param {{date: Date, texts: string[]|null}[]} rows
 * @param {{sep: string, withDate: boolean}} opt
 */
export function toCsv(rows, opt){
  const esc = s => /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  const lines = rows.map(r => {
    const cell = r.texts ? r.texts.filter(Boolean).join(opt.sep) : '';
    return opt.withDate ? `${isoDate(r.date)},${esc(cell)}` : esc(cell);
  });
  return lines.join('\r\n') + '\r\n';
}

export function download(name, text, type = 'text/csv;charset=utf-8', bom = true){
  const blob = new Blob([(bom ? '\ufeff' : '') + text], {type});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
