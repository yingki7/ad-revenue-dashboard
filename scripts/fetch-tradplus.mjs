import fs from 'node:fs';

const token = process.env.TRADPLUS_API_TOKEN;
if (!token) throw new Error('TRADPLUS_API_TOKEN is not configured.');

const formatDate = date => date.toISOString().slice(0, 10);
const nowChina = new Date(Date.now() + 8 * 60 * 60 * 1000);
// TradPlus completes UTC+8 report data at about 21:00 Beijing time.
const completedDayOffset = nowChina.getUTCHours() >= 21 ? 1 : 2;
const end = new Date(Date.UTC(
  nowChina.getUTCFullYear(),
  nowChina.getUTCMonth(),
  nowChina.getUTCDate() - completedDayOffset,
));
const start = new Date(end); start.setUTCDate(end.getUTCDate() - 59);
const limit = 1000;
let offset = 0, items = [];

while (true) {
  const response = await fetch('https://openapi.tradplusad.com/v4/allreport', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate: formatDate(start), endDate: formatDate(end), timezone: 'UTC+8', currency: 'USD',
      groupBy: ['date', 'appId'], metric: ['revenue', 'dau', 'impressionApi'], start: offset, limit
    })
  });
  if (!response.ok) throw new Error(`TradPlus API request failed: HTTP ${response.status} ${await response.text()}`);
  const payload = await response.json();
  if (payload.code && Number(payload.code) !== 200) {
    throw new Error(`TradPlus API error ${payload.code}: ${payload.message ?? 'Unknown error'}`);
  }
  const page = Array.isArray(payload.items) ? payload.items : [];
  items.push(...page);
  if (page.length < limit) break;
  offset += page.length;
}
if (!items.length) throw new Error('TradPlus API returned no report rows.');

const number = value => {
  const parsed = Number(String(value ?? 0).replace(/[$,￥%\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const daily = new Map();
for (const row of items) {
  const date = String(row.date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
  const value = daily.get(date) ?? { revenue: 0, dau: 0, impressions: 0 };
  value.revenue += number(row.revenue ?? row.Revenue);
  value.dau += number(row.dau);
  value.impressions += number(row.impressionApi);
  daily.set(date, value);
}
const timeline = Array.from({ length: 60 }, (_, i) => {
  const date = new Date(start); date.setUTCDate(start.getUTCDate() + i); return formatDate(date);
});
const rows = timeline.map(date => ({ date, ...(daily.get(date) ?? { revenue: 0, dau: 0, impressions: 0 }) }));
const latest = rows.at(-1);
const output = {
  updated_at: new Date().toISOString(), source_file: 'TradPlus API v4/allreport',
  current_dates: timeline.slice(30), previous_dates: timeline.slice(0, 30),
  current: rows.slice(30).map(row => row.revenue), previous: rows.slice(0, 30).map(row => row.revenue),
  latest: {
    date: latest.date, revenue: latest.revenue, dau: latest.dau,
    arpdau: latest.dau ? latest.revenue / latest.dau : 0,
    ecpm: latest.impressions ? latest.revenue * 1000 / latest.impressions : 0
  }
};
fs.writeFileSync('data.json', JSON.stringify(output, null, 2) + '\n');
console.log(`Fetched ${items.length} TradPlus rows through ${latest.date}; revenue ${latest.revenue}.`);
