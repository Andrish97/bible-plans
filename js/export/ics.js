// Eksport do kalendarza (iCalendar, RFC 5545): jedno wydarzenie całodniowe na każdy dzień z czytaniem.
import {pad2} from '../dom.js';

const ymd = d => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
const esc = s => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Zawijanie linii do 75 bajtów UTF-8 (kontynuacja zaczyna się od spacji). */
function fold(line){
  const enc = new TextEncoder();
  if(enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '', len = 0;
  for(const ch of line){
    const n = enc.encode(ch).length;
    if(len + n > (out.length ? 74 : 75)){ out.push(cur); cur = ''; len = 0; }
    cur += ch; len += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/**
 * @param {{date: Date, texts: string[]|null}[]} rows
 * @param {{title: string, parts: string[], reminder: string}} opt  reminder: '' albo 'HH:MM' (w dniu czytania)
 */
export function toIcs(rows, opt){
  const now = new Date();
  const stamp = `${ymd(now)}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;
  const salt = Math.random().toString(36).slice(2, 8);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//bible-plans//Plan czytania Biblii//PL', 'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH', `X-WR-CALNAME:${esc(opt.title)}`];
  let n = 0;
  for(const r of rows){
    if(!r.texts) continue;
    n++;
    const texts = r.texts.filter(Boolean);
    const end = new Date(r.date.getFullYear(), r.date.getMonth(), r.date.getDate() + 1);
    const desc = opt.parts.length > 1 ? r.texts.map((t, i) => t ? `${opt.parts[i]}: ${t}` : '').filter(Boolean).join('\n') : texts.join('\n');
    lines.push('BEGIN:VEVENT',
      `UID:${ymd(r.date)}-${n}-${salt}@bible-plans`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(r.date)}`,
      `DTEND;VALUE=DATE:${ymd(end)}`,
      `SUMMARY:${esc('📖 ' + texts.join(' · '))}`,
      `DESCRIPTION:${esc(`${opt.title} – dzień ${n}\n${desc}`)}`,
      'TRANSP:TRANSPARENT');
    if(opt.reminder){
      const [h, m] = opt.reminder.split(':').map(Number);
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc('Czytanie: ' + texts.join(' · '))}`,
        `TRIGGER;RELATED=START:PT${h}H${m ? m + 'M' : ''}`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
