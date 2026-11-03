// Adventuity Floodline: cost matrix and automatic quotation engine.
// Pure functions, no network access: used by the floodline-autoquote edge function (Deno) and tested in Node.
// All amounts are South African rand. Adventuity (Pty) Ltd is not registered for VAT, so no VAT is added.

export const SURVEY_HAVE = 'Yes, I have a survey or LiDAR';
export const SURVEY_ARRANGE = 'No, please arrange a survey';

/** The matrix the website starts with. The administrator edits it on pricing.html (stored in floodline_settings). */
export const DEFAULT_MATRIX = {
  version: 1,
  auto: {
    enabled: true,          // send quotations automatically
    delay_minutes: 10,      // after the request comes in
    max_total: 150000,      // larger quotations go to the engineer for review
    max_per_hour: 12,       // safety limit against form spam
    send_international: true,
    since: null,            // only requests received after this moment (set when automatic quotes were switched on)
  },
  services: {
    letter:    { name: 'Pre-purchase flood risk letter', base: 2500, days: 3, deposit_pct: 100, extra_rp: 500, site_visit: false, survey_needed: false, unknown_size: 'assume',
                 bands: [{ max_ha: 2, factor: 1 }, { max_ha: 10, factor: 1.2 }, { max_ha: 50, factor: 1.5 }, { max_ha: 200, factor: 2 }] },
    desktop:   { name: 'Desktop flood line study', base: 6500, days: 5, deposit_pct: 50, extra_rp: 1000, site_visit: false, survey_needed: false, unknown_size: 'assume',
                 bands: [{ max_ha: 2, factor: 1 }, { max_ha: 5, factor: 1.15 }, { max_ha: 20, factor: 1.35 }, { max_ha: 50, factor: 1.6 }, { max_ha: 100, factor: 1.9 }] },
    certified: { name: 'Flood line report for approval (certified)', base: 16500, days: 10, deposit_pct: 50, extra_rp: 1500, site_visit: true, survey_needed: true, unknown_size: 'assume',
                 bands: [{ max_ha: 2, factor: 1 }, { max_ha: 5, factor: 1.15 }, { max_ha: 20, factor: 1.35 }, { max_ha: 50, factor: 1.6 }, { max_ha: 100, factor: 1.9 }] },
    large:     { name: 'Township, mining or large-site flood line report', base: 35000, days: 15, deposit_pct: 50, extra_rp: 2500, site_visit: true, survey_needed: true, unknown_size: 'manual',
                 bands: [{ max_ha: 20, factor: 1 }, { max_ha: 50, factor: 1.3 }, { max_ha: 100, factor: 1.6 }, { max_ha: 250, factor: 2 }, { max_ha: 500, factor: 2.6 }] },
    crossing:  { name: 'Bridge or culvert hydraulic check', base: 9500, days: 5, deposit_pct: 50, extra_rp: 1000, site_visit: true, survey_needed: false, unknown_size: 'assume',
                 bands: [{ max_ha: 5, factor: 1 }, { max_ha: 20, factor: 1.15 }, { max_ha: 100, factor: 1.3 }] },
  },
  // What each answer to "What is the flood line for?" is priced as. 'building' = certified report when there is
  // (or we arrange) a survey, otherwise a desktop study. 'manual' = always quoted by the engineer.
  purposes: {
    'Property purchase or insurance': 'letter',
    'Bank, lender or investor requirement': 'letter',
    'Building plan or site development plan': 'building',
    'Environmental or water use application': 'certified',
    'Environmental or water permit': 'certified',
    'Development or subdivision approval': 'certified',
    'Township establishment (NWA s144)': 'large',
    'Mining or industrial (GN 704)': 'large',
    'Mining or industrial site': 'large',
    'Stormwater, culvert or bridge design': 'crossing',
    'Other': 'manual',
  },
  included_rps: ['1:50', '1:100'],
  catchment: { applies_to: ['desktop', 'certified', 'large', 'crossing'],
               bands: [{ max_km2: 10, factor: 1 }, { max_km2: 100, factor: 1.1 }, { max_km2: 1000, factor: 1.25 }, { max_km2: null, factor: 1.4 }] },
  urgency: { express_share: 0.6, express_pct: 30, urgent_share: 0.35, urgent_pct: 60 },
  travel: { from: 'Bloemfontein', lat: -29.1167, lon: 26.2167, free_km: 150, rate_per_km: 7.5, road_factor: 1.12, overnight_km: 450, overnight: 1800 },
  survey: { base: 6500, base_ha: 2, unknown_ha: 2, days: 7, tiers: [{ to_ha: 20, per_ha: 900 }, { to_ha: 100, per_ha: 350 }, { to_ha: null, per_ha: 150 }] },
  international: { uplift_pct: 15 },
  rounding: 50,
  valid_days: 30,
  contact: { phone: '063 497 7649' },   // printed on quotations
};

const RP_ORDER = ['1:20', '1:50', '1:100', '1:200', 'RMF'];
const num = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v));
const clone = (o) => JSON.parse(JSON.stringify(o));

/** Deep-merge a stored matrix over the defaults so new settings get sensible values. */
export function withDefaults(m) {
  const out = clone(DEFAULT_MATRIX);
  if (!m || typeof m !== 'object') return out;
  for (const k of Object.keys(m)) {
    if (k === 'services' && m.services && typeof m.services === 'object') {
      for (const s of Object.keys(m.services)) out.services[s] = Object.assign({}, out.services[s] || {}, m.services[s]);
    } else if (['auto', 'catchment', 'urgency', 'travel', 'survey', 'international', 'contact'].includes(k) && m[k] && typeof m[k] === 'object') {
      out[k] = Object.assign({}, out[k], m[k]);
    } else if (k === 'purposes' && m.purposes && typeof m.purposes === 'object') {
      out.purposes = Object.assign({}, out.purposes, m.purposes);
    } else out[k] = m[k];
  }
  return out;
}

/** Check an edited matrix; returns a list of problems in plain words (empty when it is usable). */
export function validateMatrix(m) {
  const p = [];
  const pos = (v) => typeof v === 'number' && isFinite(v) && v > 0;
  if (!m || typeof m !== 'object' || !m.services) return ['The matrix is empty.'];
  for (const [key, s] of Object.entries(m.services)) {
    const n = s.name || key;
    if (!s.name || String(s.name).length > 80) p.push(`Give the service "${key}" a name of up to 80 characters.`);
    if (!pos(s.base)) p.push(`${n}: the base price must be more than R0.`);
    if (!(Number.isInteger(s.days) && s.days >= 1 && s.days <= 120)) p.push(`${n}: the turnaround must be 1 to 120 working days.`);
    if (!(s.deposit_pct >= 10 && s.deposit_pct <= 100)) p.push(`${n}: the deposit must be 10 to 100%.`);
    if (!(s.extra_rp >= 0)) p.push(`${n}: the price per extra return period cannot be negative.`);
    if (!Array.isArray(s.bands) || !s.bands.length) p.push(`${n}: add at least one site-size band.`);
    else {
      let last = 0;
      for (const b of s.bands) {
        if (!pos(b.max_ha) || b.max_ha <= last) { p.push(`${n}: site-size bands must go up in size (each "up to" larger than the one before).`); break; }
        if (!pos(b.factor) || b.factor > 20) { p.push(`${n}: each size factor must be between 0 and 20.`); break; }
        last = b.max_ha;
      }
    }
  }
  const valid = new Set([...Object.keys(m.services), 'building', 'manual']);
  for (const [purpose, svc] of Object.entries(m.purposes || {})) if (!valid.has(svc)) p.push(`"${purpose}" is set to an unknown service.`);
  if (m.purposes && Object.values(m.purposes).includes('building') && (!m.services.certified || !m.services.desktop)) p.push('Building plans need both the desktop and the certified service.');
  const a = m.auto || {};
  if (!(Number.isInteger(a.delay_minutes) && a.delay_minutes >= 1 && a.delay_minutes <= 1440)) p.push('The delay must be 1 to 1 440 minutes.');
  if (!pos(a.max_total)) p.push('The automatic limit must be more than R0.');
  if (!(Number.isInteger(a.max_per_hour) && a.max_per_hour >= 1 && a.max_per_hour <= 200)) p.push('The hourly limit must be 1 to 200 quotations.');
  const t = m.travel || {};
  if (!(t.free_km >= 0 && t.rate_per_km >= 0 && t.road_factor >= 1 && t.road_factor <= 3)) p.push('Check the travel settings (free km, rate per km, road factor 1 to 3).');
  const u = m.urgency || {};
  if (!(u.urgent_share > 0 && u.urgent_share < u.express_share && u.express_share <= 1)) p.push('Urgency: the urgent share must be smaller than the express share (both between 0 and 1).');
  if (!(u.express_pct >= 0 && u.urgent_pct >= 0)) p.push('Urgency surcharges cannot be negative.');
  const c = (m.catchment || {}).bands || [];
  if (!c.length || c.some((b, i) => !pos(b.factor) || (b.max_km2 !== null && !pos(b.max_km2)) || (b.max_km2 === null && i !== c.length - 1))) p.push('Catchment bands: each needs a factor, and only the last may be open-ended.');
  const sv = m.survey || {};
  if (!(sv.base >= 0 && sv.base_ha >= 0 && Array.isArray(sv.tiers) && sv.tiers.length)) p.push('Check the survey prices.');
  if (!(m.rounding >= 1 && m.rounding <= 1000)) p.push('Rounding must be R1 to R1 000.');
  if (!(Number.isInteger(m.valid_days) && m.valid_days >= 1 && m.valid_days <= 365)) p.push('Quotation validity must be 1 to 365 days.');
  if (!((m.international || {}).uplift_pct >= 0)) p.push('The international surcharge cannot be negative.');
  return p;
}

// ---------- calendar (South African working days)
function easter(y) {   // anonymous Gregorian algorithm
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, month - 1, day);
}
const holidayCache = {};
function holidays(y) {
  if (holidayCache[y]) return holidayCache[y];
  const set = new Set();
  for (const [mo, d] of [[1, 1], [3, 21], [4, 27], [5, 1], [6, 16], [8, 9], [9, 24], [12, 16], [12, 25], [12, 26]]) {
    const t = Date.UTC(y, mo - 1, d); set.add(t);
    if (new Date(t).getUTCDay() === 0) set.add(t + 864e5);   // a Sunday holiday moves to Monday
  }
  const e = easter(y); set.add(e - 2 * 864e5); set.add(e + 864e5);   // Good Friday, Family Day
  return (holidayCache[y] = set);
}
function isWorkday(t) { const d = new Date(t), w = d.getUTCDay(); return w !== 0 && w !== 6 && !holidays(d.getUTCFullYear()).has(t); }
/** Working days from the day after `fromIso` up to and including `toDate` (YYYY-MM-DD), in South African time. */
export function workingDaysBetween(fromIso, toDate) {
  const sa = new Date(new Date(fromIso).getTime() + 2 * 3600e3);            // SAST, no daylight saving
  const today = Date.UTC(sa.getUTCFullYear(), sa.getUTCMonth(), sa.getUTCDate());
  const [y, mo, d] = String(toDate).split('-').map(Number), end = Date.UTC(y, mo - 1, d);
  if (!isFinite(end)) return null;
  if (end < today) return -1;
  let n = 0; for (let t = today + 864e5; t <= end && n < 400; t += 864e5) if (isWorkday(t)) n++;
  return n;
}

// ---------- geography
// Coarse outline of South Africa (lon, lat), good enough to tell South African sites from foreign ones.
// The coast is pushed a little out to sea so coastal sites never count as foreign; Lesotho and Eswatini fall inside.
const SA = [[16.45, -28.63], [17.4, -28.75], [18.2, -28.9], [19.0, -28.95], [20.0, -28.4], [20.0, -24.75], [20.6, -26.9], [21.7, -26.85], [22.6, -26.0], [23.5, -25.6], [24.6, -25.8], [25.5, -25.7], [26.8, -24.7], [27.0, -23.6], [28.2, -22.6], [29.4, -22.2], [31.3, -22.4], [32.05, -24.4], [32.1, -25.95], [32.15, -26.5], [32.95, -26.86], [32.7, -28.6], [31.35, -30.0], [30.3, -31.45], [28.3, -32.95], [25.8, -34.25], [22.1, -34.45], [20.0, -35.0], [18.3, -34.6], [17.7, -33.0], [17.0, -31.0], [16.3, -28.75]];
export function inSouthAfrica(lat, lon) {
  let inside = false;
  for (let i = 0, j = SA.length - 1; i < SA.length; j = i++) {
    const [xi, yi] = SA[i], [xj, yj] = SA[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function km(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// ---------- formatting
export function rand(v) {
  const s = Math.abs(v).toFixed(2), [i, d] = s.split('.');
  return (v < 0 ? '-' : '') + 'R ' + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '.' + d;
}
const fmtNum = (v) => String(Math.round(v * 100) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
function roundUp(v, step) { return Math.ceil(v / step - 1e-9) * step; }

/**
 * Price one quote request.
 * req: { purpose, survey, size_ha, return_periods[], deadline 'YYYY-MM-DD', lat, lon, page, screening{catchment_km2} }
 * now: ISO time the quotation is made.
 * Returns { mode: 'auto'|'manual', reasons[], service, lines[], optional[], total, deposit_pct, deposit, balance,
 *           turnaround_days, valid_days, valid_until, assumptions[], exclusions[], international, summary }
 */
export function priceRequest(reqIn, matrixIn, now = new Date().toISOString()) {
  const m = withDefaults(matrixIn), req = reqIn || {};
  const reasons = [], assumptions = [], exclusions = [], lines = [], optional = [];
  const step = m.rounding || 50;
  const purpose = String(req.purpose || '').trim();
  const size = num(req.size_ha);
  const lat = num(req.lat), lon = num(req.lon);
  const hasXY = lat !== null && lon !== null;
  const page = String(req.page || '');
  const international = hasXY ? !inSouthAfrica(lat, lon) : /adventuity\.com/i.test(page);
  const surveyAns = String(req.survey || '');
  const survey = surveyAns === SURVEY_HAVE ? 'have' : surveyAns === SURVEY_ARRANGE ? 'arrange' : 'unsure';

  // 1. which service
  let key = m.purposes[purpose];
  if (!key) { reasons.push(purpose ? `Purpose "${purpose}" is not in the matrix.` : 'No purpose was chosen.'); key = 'manual'; }
  if (key === 'building') key = survey === 'unsure' ? 'desktop' : 'certified';
  if (key === 'manual') {
    if (!reasons.length) reasons.push(`Requests for "${purpose}" are always quoted by the engineer.`);
    return { mode: 'manual', reasons, service: null, lines, optional, total: 0, deposit: 0, assumptions, exclusions, international };
  }
  const s = m.services[key];
  if (!s) return { mode: 'manual', reasons: [`The service "${key}" is missing from the matrix.`], service: null, lines, optional, total: 0, deposit: 0, assumptions, exclusions, international };

  // 2. site size
  let sizeFactor = 1, sizeNote = '';
  if (size === null || size <= 0) {
    if (s.unknown_size === 'manual') reasons.push(`No site size was given, and ${s.name.toLowerCase()} prices depend on it.`);
    else assumptions.push(`Priced for a site of up to ${fmtNum(s.bands[0].max_ha)} ha. If your site is larger, we will confirm the price before any work starts.`);
  } else {
    const band = s.bands.find((b) => size <= b.max_ha);
    if (!band) reasons.push(`The site (${fmtNum(size)} ha) is larger than the ${fmtNum(s.bands[s.bands.length - 1].max_ha)} ha limit for automatic ${s.name.toLowerCase()} quotations.`);
    else { sizeFactor = band.factor; sizeNote = `site ${fmtNum(size)} ha`; }
  }

  // 3. catchment (from the free flood check, when the client ran it)
  let catchFactor = 1, catchNote = '';
  const ckm = num(req.screening && req.screening.catchment_km2);
  if (ckm !== null && ckm > 0 && (m.catchment.applies_to || []).includes(key)) {
    const b = m.catchment.bands.find((x) => x.max_km2 === null || ckm <= x.max_km2);
    if (b) { catchFactor = b.factor; if (b.factor !== 1) catchNote = `catchment about ${fmtNum(Math.round(ckm * 10) / 10)} km²`; }
  }

  const fee = roundUp(s.base * sizeFactor * catchFactor, step);
  lines.push({ label: s.name, amount: fee, note: [sizeNote, catchNote].filter(Boolean).join(', ') });

  // 4. return periods beyond 1:50 and 1:100
  const rps = Array.isArray(req.return_periods) ? [...new Set(req.return_periods.map(String))] : [];
  const extra = RP_ORDER.filter((r) => rps.includes(r) && !(m.included_rps || []).includes(r));
  let rpAmt = 0;
  if (extra.length && s.extra_rp > 0) { rpAmt = extra.length * s.extra_rp; lines.push({ label: `Additional return period${extra.length > 1 ? 's' : ''} ${extra.length > 1 ? extra.slice(0, -1).join(', ') + ' and ' + extra[extra.length - 1] : extra[0]}`, amount: rpAmt, note: '' }); }

  const engineering = fee + rpAmt;

  // 5. international work
  if (international) {
    const up = roundUp(engineering * (m.international.uplift_pct || 0) / 100, step);
    if (up > 0) lines.push({ label: `International project coordination (${m.international.uplift_pct}%)`, amount: up, note: '' });
    exclusions.push('Sign-off by an engineer registered in your country, where your authority requires it.');
    if (!m.auto.send_international) reasons.push('Automatic quotations for sites outside South Africa are switched off.');
  }

  // 6. survey
  let surveyDays = 0;
  const surveyPrice = (ha) => {
    const sv = m.survey; let amt = sv.base, from = sv.base_ha;
    for (const t of sv.tiers) { const to = t.to_ha === null ? Infinity : t.to_ha; if (ha > from) amt += (Math.min(ha, to) - from) * t.per_ha; from = to; if (ha <= to) break; }
    return roundUp(amt, step);
  };
  if (s.survey_needed) {
    const ha = size && size > 0 ? size : m.survey.unknown_ha;
    if (international) exclusions.push('The topographical survey, by a land surveyor in your country.');
    else if (survey === 'have') assumptions.push('Uses your topographical survey or LiDAR (CAD or point cloud, contours at 1 m or closer).');
    else if (survey === 'arrange') {
      lines.push({ label: 'Topographical survey by a registered land surveyor (provisional sum)', amount: surveyPrice(ha), note: size ? '' : `assumes ${fmtNum(ha)} ha` });
      surveyDays = m.survey.days || 0;
      assumptions.push('The survey is a provisional sum: it is charged at the land surveyor\'s final price.');
    } else {
      optional.push({ label: 'Topographical survey by a registered land surveyor (provisional sum), if you do not have one', amount: surveyPrice(ha) });
      exclusions.push('The topographical survey, unless you add the optional survey below.');
    }
  } else if (key === 'desktop') {
    assumptions.push(`Uses the best available public terrain data. A desktop study is for planning and due diligence; where your authority needs a certified flood line on survey, the ${m.services.certified ? m.services.certified.name.toLowerCase() + ' starts at ' + rand(m.services.certified.base) : 'certified report applies'}.`);
  }

  // 7. site inspection travel
  if (s.site_visit && !international) {
    const t = m.travel;
    if (hasXY) {
      const oneWay = km(t.lat, t.lon, lat, lon) * (t.road_factor || 1);
      const beyond = Math.max(0, oneWay - (t.free_km || 0));
      if (beyond > 0 && t.rate_per_km > 0) lines.push({ label: 'Site inspection travel', amount: roundUp(beyond * 2 * t.rate_per_km, step), note: `about ${Math.round(oneWay)} km each way from ${t.from}; ${Math.round(beyond * 2)} km beyond the ${t.free_km} km included, at ${rand(t.rate_per_km)}/km` });
      if (t.overnight > 0 && oneWay > t.overnight_km) lines.push({ label: 'Overnight accommodation for the site inspection', amount: roundUp(t.overnight, step), note: '' });
    } else assumptions.push(`Includes one site inspection within ${t.free_km} km of ${t.from}; further travel is charged at ${rand(t.rate_per_km)} per km.`);
  }

  // 8. urgency
  let days = s.days + surveyDays;
  if (req.deadline && /^\d{4}-\d{2}-\d{2}$/.test(String(req.deadline))) {
    const avail = workingDaysBetween(now, req.deadline);
    const u = m.urgency;
    if (avail === null) { /* unreadable date: ignore */ }
    else if (avail < 0) assumptions.push(`The date you need it by (${req.deadline}) has passed; we have priced the standard turnaround.`);
    else if (avail < days) {
      const share = avail / days;
      const base = engineering;
      if (share >= u.express_share) { lines.push({ label: `Express turnaround: ${avail} working days instead of ${days} (+${u.express_pct}%)`, amount: roundUp(base * u.express_pct / 100, step), note: '' }); days = avail; }
      else if (share >= u.urgent_share) { lines.push({ label: `Urgent turnaround: ${avail} working days instead of ${days} (+${u.urgent_pct}%)`, amount: roundUp(base * u.urgent_pct / 100, step), note: '' }); days = avail; }
      else reasons.push(`Needed by ${req.deadline}: ${avail} working day${avail === 1 ? '' : 's'} for work that normally takes ${days}.`);
    }
  }

  const total = lines.reduce((a, l) => a + l.amount, 0);
  if (total > m.auto.max_total) reasons.push(`The total (${rand(total)}) is above the ${rand(m.auto.max_total)} limit for automatic quotations.`);
  const depositPct = s.deposit_pct;
  const deposit = Math.min(total, roundUp(total * depositPct / 100, 10));
  exclusions.push('Municipal, DWS or other authority fees.', 'Rework after a change to the site layout or development plan.');
  const validUntil = new Date(new Date(now).getTime() + m.valid_days * 864e5).toISOString().slice(0, 10);
  const startsWhen = s.survey_needed && !international ? (survey === 'have' ? 'after we receive your survey and the deposit' : survey === 'arrange' ? 'after the deposit, including the survey' : 'after we receive the survey and the deposit') : 'after we receive the deposit';
  return {
    mode: reasons.length ? 'manual' : 'auto', reasons,
    service: { key, name: s.name }, lines, optional, total, deposit_pct: depositPct, deposit, balance: total - deposit,
    turnaround_days: days, turnaround: `${days} working days ${startsWhen}`, valid_days: m.valid_days, valid_until: validUntil,
    assumptions, exclusions, international,
    summary: `${s.name}${sizeNote ? ' (' + sizeNote + ')' : ''}: ${rand(total)}`,
  };
}

/** Plain-text quotation for the client's e-mail. */
export function quoteText(q, ctx) {
  const L = [];
  const first = String(ctx.name || '').trim().split(/\s+/)[0] || 'there';
  L.push(`Hi ${first},`, '', `Thank you for your flood line request (reference ${ctx.ref}). Here is your quotation from Adventuity (Pty) Ltd.`, '');
  for (const l of q.lines) L.push(`- ${l.label}${l.note ? ' (' + l.note + ')' : ''}: ${rand(l.amount)}`);
  L.push(`TOTAL: ${rand(q.total)} (no VAT: Adventuity is not registered for VAT)`, '');
  if (q.optional && q.optional.length) { for (const o of q.optional) L.push(`Optional - ${o.label}: ${rand(o.amount)}`); L.push(''); }
  L.push(`Turnaround: ${q.turnaround}.`);
  L.push(q.deposit_pct >= 100 ? `Payment: ${rand(q.deposit)} in full to start.` : `To start: a ${q.deposit_pct}% deposit of ${rand(q.deposit)}; the balance of ${rand(q.balance)} is due when the final report is delivered.`, '');
  L.push(`See the full quotation and pay ${q.deposit_pct >= 100 ? '' : 'the deposit '}online here:`, ctx.link, '');
  if (ctx.bank) L.push(`Or pay by EFT: ${ctx.bank}. Reference: ${ctx.invoice}.`, '');
  if (q.assumptions.length) { L.push('Based on the details you gave us:'); for (const a of q.assumptions) L.push(`- ${a}`); L.push(''); }
  if (q.exclusions.length) { L.push('Not included:'); for (const e of q.exclusions) L.push(`- ${e}`); L.push(''); }
  L.push(`This quotation is valid until ${q.valid_until}. It is based on the details you supplied; if the site or the scope turns out to be materially different, we will confirm a revised price before any work starts.`, '');
  L.push(`Questions? Reply to this e-mail${ctx.phone ? ' or call or WhatsApp ' + ctx.phone : ''}.`, '', 'Adventuity (Pty) Ltd', 'Transforming ideas into reality.');
  return L.join('\n');
}
