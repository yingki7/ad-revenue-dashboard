import fs from 'node:fs';
import path from 'node:path';

const candidates = ['upload/report.csv', 'upload/report.json'];
const source = candidates.find(fs.existsSync);
if (!source) {
  console.log('No upload/report.csv or upload/report.json; keeping existing data.json.');
  process.exit(0);
}

const aliases = {
  date: ['date', '日期', 'day', 'statdate', 'reportdate'],
  revenue: ['revenue', '收入', '收益', '预估收入', 'estimatedrevenue', 'revenueapi'],
  dau: ['dau', '日活', '日活跃用户'],
  ecpm: ['ecpm', 'ecpmapi']
};
const clean = value => String(value ?? '').trim().toLowerCase().replace(/[\s_\-()（）]/g, '');
const number = value => {
  const parsed = Number(String(value ?? '').replace(/[$,￥%\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const pick = (row, names) => {
  const wanted = names.map(clean);
  const key = Object.keys(row).find(k => wanted.includes(clean(k)));
  return key === undefined ? undefined : row[key];
};
function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"' && quoted && next === '"') { field += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { row.push(field); field = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift()?.map(v => v.trim()) ?? [];
  return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])));
}

const raw = fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '');
let rows;
if (path.extname(source) === '.json') {
  const parsed = JSON.parse(raw);
  rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : [];
} else rows = parseCsv(raw);
if (!rows.length) throw new Error(`${source} does not contain any data rows.`);

const daily = new Map();
for (const row of rows) {
  const rawDate = pick(row, aliases.date);
  const revenue = pick(row, aliases.revenue);
  if (rawDate == null || revenue == null) continue;
  const match = String(rawDate).match(/\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/);
  if (!match) continue;
  const date = match[0].replaceAll('/', '-').split('-').map((v, i) => i ? v.padStart(2, '0') : v).join('-');
  const previous = daily.get(date) ?? { revenue: 0, dau: 0, ecpmWeighted: 0, impressions: 0 };
  const rev = number(revenue), dau = number(pick(row, aliases.dau)), ecpm = number(pick(row, aliases.ecpm));
  previous.revenue += rev;
  previous.dau += dau;
  if (ecpm) { previous.ecpmWeighted += ecpm * Math.max(rev, 1); previous.impressions += Math.max(rev, 1); }
  daily.set(date, previous);
}
const dates = [...daily.keys()].sort();
if (dates.length < 2) throw new Error('At least two valid dates are required. Expected date and revenue columns.');
const end = new Date(`${dates.at(-1)}T00:00:00Z`);
const timeline = Array.from({ length: 60 }, (_, i) => {
  const d = new Date(end); d.setUTCDate(end.getUTCDate() - 59 + i);
  return d.toISOString().slice(0, 10);
});
const values = timeline.map(date => daily.get(date)?.revenue ?? 0);
const latest = daily.get(timeline.at(-1)) ?? { revenue: 0, dau: 0, ecpmWeighted: 0, impressions: 0 };
const output = {
  updated_at: new Date().toISOString(),
  source_file: source,
  current_dates: timeline.slice(30), previous_dates: timeline.slice(0, 30),
  current: values.slice(30), previous: values.slice(0, 30),
  latest: {
    date: timeline.at(-1), revenue: latest.revenue, dau: latest.dau,
    arpdau: latest.dau ? latest.revenue / latest.dau : 0,
    ecpm: latest.impressions ? latest.ecpmWeighted / latest.impressions : 0
  }
};
fs.writeFileSync('data.json', JSON.stringify(output, null, 2) + '\n');
console.log(`Converted ${rows.length} rows from ${source}; latest date ${output.latest.date}.`);
