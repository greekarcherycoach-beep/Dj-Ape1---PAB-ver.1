// Broadcast Scheduler: server-side time (IANA tz), recurring shows, overlap check, manual override.
'use strict';
const fs = require('fs');
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function nowIn(tz, d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
  return { day: WD[p.weekday], date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute };
}
const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
function spans(show) { // [{day,from,to}] in minutes; overnight shows are split across midnight
  const a = toMin(show.start); let b = toMin(show.end); const out = [];
  if (b <= a) b += 1440;
  const days = show.days && show.days.length ? show.days : null;
  for (const d of days || [null]) {
    out.push({ day: d, date: show.date || null, from: a, to: Math.min(b, 1440) });
    if (b > 1440) out.push({ day: d === null ? null : (d + 1) % 7, date: null, from: 0, to: b - 1440, carry: true, srcDate: show.date });
  }
  return out;
}
function create({ file, tz, log, onChange }) {
  let shows = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  let override = null, paused = false, current = null;
  const save = () => fs.writeFileSync(file, JSON.stringify(shows, null, 1));
  const matches = (s, n) => s.enabled !== false && spans(s).some(sp => n.min >= sp.from && n.min < sp.to &&
    (sp.date ? (sp.carry ? false : sp.date === n.date) : (sp.day === null ? true : sp.day === n.day)));
  function overlaps(a, b) {
    return spans(a).some(x => spans(b).some(y => x.from < y.to && y.from < x.to &&
      ((x.day !== null && y.day !== null && x.day === y.day) || (x.date && x.date === y.date))));
  }
  function add(show) {
    if (!/^\d\d:\d\d$/.test(show.start || '') || !/^\d\d:\d\d$/.test(show.end || '') || !show.name) return { error: 'invalid show' };
    show.id = show.id || Math.random().toString(36).slice(2, 10);
    const clash = shows.find(s => s.id !== show.id && s.enabled !== false && overlaps(s, show));
    if (clash) return { error: `overlaps with "${clash.name}"`, status: 409 };
    shows = shows.filter(s => s.id !== show.id); shows.push(show); save(); return { show };
  }
  const remove = id => { shows = shows.filter(s => s.id !== id); save(); };
  function resolve() {
    if (override && Date.now() < override.until) return override.show;
    override = null; if (paused) return null;
    const n = nowIn(tz); return shows.find(s => matches(s, n)) || null;
  }
  function tick() {
    const s = resolve(), id = s ? s.id : null;
    if (id !== (current && current.id)) { current = s; log('SHOW_CHANGED', s ? s.name : '(none)'); onChange(s); }
  }
  function next() {
    const n = nowIn(tz); let best = null;
    for (let off = 0; off < 7 * 1440; off++) { // minute scan over a week is cheap and DST-agnostic
      const t = new Date(Date.now() + off * 60000), nn = nowIn(tz, t);
      const s = shows.find(x => matches(x, nn)); if (s && (!current || s.id !== current.id)) { best = { show: s, inMinutes: off }; break; }
    }
    return best;
  }
  return { add, remove, list: () => shows, tick, current: () => current, next,
    setOverride: (show, minutes) => { override = { show: { ...show, id: 'override', name: show.name || 'Έκτακτη εκπομπή' }, until: Date.now() + minutes * 60000 }; tick(); },
    clearOverride: () => { override = null; tick(); }, setPaused: v => { paused = v; tick(); }, now: () => nowIn(tz) };
}
module.exports = { create, nowIn };
