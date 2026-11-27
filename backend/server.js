// One State, Many Worlds - Express + MongoDB (Mongoose) backend
const express = require('express'), mongoose = require('mongoose'), bcrypt = require('bcryptjs'),
  jwt = require('jsonwebtoken'), cors = require('cors');
const { Schema, model } = mongoose;
const SECRET = process.env.JWT_SECRET || 'change-this-secret', RATE = 8; // INR per km (SRS 3.2.6)
const TIERS = { low: 1500, high: 3000 };                                 // SRS 3.2.3

const User = model('User', new Schema({ name: String, email: { type: String, unique: true }, hash: String,
  role: { type: String, default: 'traveller' }, favorites: [Schema.Types.ObjectId] }, { timestamps: true }));
const Region = model('Region', new Schema({ name: String, description: String, hub: { name: String, lat: Number, lon: Number } }));
const Destination = model('Destination', new Schema({ region: { type: Schema.Types.ObjectId, ref: 'Region' }, name: String,
  category: [String], description: String, lat: Number, lon: Number, recDays: Number, activities: [String], image: String, bestTime: String,
  travel: { howToReach: String, hub: String, hours: Number },
  cost: { transport: Number, stay: Number, food: Number, activity: Number, updated: { type: Date, default: Date.now } } }));
Destination.schema.index({ region: 1, name: 1 }, { unique: true });
const Review = model('Review', new Schema({ destination: { type: Schema.Types.ObjectId, ref: 'Destination' }, rating: Number, text: String, user: Schema.Types.ObjectId, userName: String }, { timestamps: true }));
const Itinerary = model('Itinerary', new Schema({ user: { type: Schema.Types.ObjectId, ref: 'User' }, title: String, result: Schema.Types.Mixed }, { timestamps: true }));

const Stay = model('Stay', new Schema({ destination: Schema.Types.ObjectId, name: String, kind: String, price: Number, minPrice: Number, maxPrice: Number, owner: Schema.Types.ObjectId, rooms: Number, baseRating: Number, baseCount: Number, image: String, ratings: [{ user: Schema.Types.ObjectId, value: Number }] }));
const Coupon = model('Coupon', new Schema({ code: { type: String, unique: true }, percent: Number, maxDiscount: Number, validTill: Date, uses: { type: Number, default: 0 } }, { timestamps: true }));
const Audit = model('Audit', new Schema({ who: String, action: String, detail: String }, { timestamps: true }));
const Category = model('Category', new Schema({ name: String }));
const Meta = model('Meta', new Schema({ key: { type: String, unique: true } }));   // one-time seed markers
const Photo = model('Photo', new Schema({ destination: Schema.Types.ObjectId, url: String, caption: String }));
const Booking = model('Booking', new Schema({ ref: String, user: Schema.Types.ObjectId, userName: String, userEmail: String, itinerary: Schema.Types.ObjectId, stay: Schema.Types.ObjectId, stayName: String,
  owner: Schema.Types.ObjectId, destination: Schema.Types.ObjectId, place: String, checkIn: Date, nights: Number, guests: Number, amount: Number, status: { type: String, default: 'CONFIRMED' } }, { timestamps: true }));
const Notification = model('Notification', new Schema({ owner: Schema.Types.ObjectId, text: String, booking: Schema.Types.ObjectId, read: { type: Boolean, default: false } }, { timestamps: true }));
const log = (who, action, detail = '') => Audit.create({ who, action, detail }).catch(() => {});
const rate = s => { const n = s.ratings.length, t = s.baseCount + n, sum = s.ratings.reduce((a, r) => a + r.value, 0); return { avg: t ? Math.round((s.baseRating * s.baseCount + sum) / t * 10) / 10 : null, count: t }; };
const stayOut = s => ({ id: s._id, destination: s.destination, name: s.name, kind: s.kind, type: s.kind, price: s.price, minPrice: s.minPrice ?? s.price, maxPrice: s.maxPrice ?? s.price, image: s.image, ...rate(s) });
// ---------- helpers ----------
const hav = (a, b) => { const r = x => x * Math.PI / 180, dp = r(b.lat - a.lat), dl = r(b.lon - a.lon);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dl / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(h)); };
const hasCost = d => d.cost?.transport != null;
const daily = d => hasCost(d) ? d.cost.stay + d.cost.food + d.cost.activity : 0;
const tier = d => !hasCost(d) ? 'N/A' : daily(d) < TIERS.low ? 'LOW' : daily(d) <= TIERS.high ? 'MEDIUM' : 'HIGH';
const pwErrors = p => [[p.length >= 8, '8+ characters'], [/[A-Z]/.test(p), 'an uppercase letter'], [/[a-z]/.test(p), 'a lowercase letter'],
  [/\d/.test(p), 'a digit'], [/[^A-Za-z0-9]/.test(p), 'a special character'], [!/\s/.test(p), 'no spaces']].filter(x => !x[0]).map(x => x[1]);
const fail = (status, msg) => Object.assign(new Error(msg), { status });
const wrap = f => (q, s, n) => f(q, s).catch(n);
const auth = (role) => (req, res, next) => { try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', '') || String(req.query.token || ''), SECRET);
  if (role && req.user.role !== role) throw 0; next(); } catch { next(fail(401, 'Authentication required.')); } };
const pub = d => ({ ...d.toObject(), id: d._id, tier: tier(d), dailyCost: daily(d) });

function plan(region, dests, days, budget, must) {
  if (!dests.length) throw fail(400, 'No destinations available for this region.');
  const hub = region.hub;
  let pool = [...dests];
  let anchor = must ? dests.find(d => String(d._id) === String(must)) : null;
  if (must && !anchor) throw fail(404, 'The requested record was not found.');

  if (anchor) {
    pool.sort((a, b) => hav(anchor, a) - hav(anchor, b));
  } else {
    pool.sort((a, b) => hav(hub, a) - hav(hub, b));
  }

  const maxStops = Math.min(pool.length, Math.max(1, Math.min(days, Math.ceil(days / 1.5))));
  const minStops = Math.min(pool.length, Math.max(1, Math.floor(days / 3.5)));

  function orderCircuit(stops) {
    const ordered = [];
    let remaining = [...stops], cur = hub;
    while (remaining.length) {
      remaining.sort((a, b) => hav(cur, a) - hav(cur, b));
      const next = remaining.shift();
      ordered.push(next);
      cur = next;
    }
    return ordered;
  }

  function allocateDays(orderedStops, totalDays) {
    const n = orderedStops.length;
    if (n === 1) return [totalDays];
    let alloc = orderedStops.map(s => Math.max(1, s.recDays || 1));
    let sum = alloc.reduce((a, b) => a + b, 0);

    while (sum > totalDays) {
      let maxIdx = 0;
      for (let i = 1; i < n; i++) if (alloc[i] > alloc[maxIdx]) maxIdx = i;
      if (alloc[maxIdx] <= 1) break;
      alloc[maxIdx]--;
      sum--;
    }

    while (sum < totalDays) {
      let minRatioIdx = 0, minRatio = Infinity;
      for (let i = 0; i < n; i++) {
        const ratio = alloc[i] / (orderedStops[i].recDays || 1);
        if (ratio < minRatio) { minRatio = ratio; minRatioIdx = i; }
      }
      alloc[minRatioIdx]++;
      sum++;
    }
    return alloc;
  }

  function getCombinations(arr, size) {
    if (size === 0) return [[]];
    if (arr.length === 0) return [];
    const head = arr[0], tail = arr.slice(1);
    return [...getCombinations(tail, size - 1).map(c => [head, ...c]), ...getCombinations(tail, size)];
  }

  const stopChoices = [];
  const startCandidates = anchor ? [anchor] : pool.slice(0, Math.min(5, pool.length));

  for (const start of startCandidates) {
    for (let k = minStops; k <= maxStops; k++) {
      if (k === 1) {
        stopChoices.push([start]);
      } else {
        const neighbors = pool
          .filter(d => String(d._id) !== String(start._id))
          .sort((a, b) => hav(start, a) - hav(start, b))
          .slice(0, Math.min(6, pool.length - 1));
        const combos = getCombinations(neighbors, k - 1);
        for (const c of combos) stopChoices.push([start, ...c]);
      }
    }
  }

  const seenCombos = new Set(), validCombos = [];
  for (const choice of stopChoices) {
    const key = choice.map(s => String(s._id)).sort().join(',');
    if (!seenCombos.has(key)) { seenCombos.add(key); validCombos.push(choice); }
  }

  const evaluated = [];
  for (const stops of validCombos) {
    const ordered = orderCircuit(stops);
    const dayAlloc = allocateDays(ordered, days);
    if (dayAlloc.reduce((a, b) => a + b, 0) !== days) continue;

    const legs = ordered.slice(1).map((s, i) => Math.round(hav(ordered[i], s)));
    const maxLeg = legs.length ? Math.max(...legs) : 0;
    if (maxLeg > 380 && validCombos.length > 5) continue;

    const transport = ordered[0].cost.transport + legs.reduce((a, l) => a + l * RATE, 0) + ordered[ordered.length - 1].cost.transport;
    let stay = 0, food = 0, activity = 0;
    ordered.forEach((s, i) => {
      stay += dayAlloc[i] * s.cost.stay;
      food += dayAlloc[i] * s.cost.food;
      activity += dayAlloc[i] * s.cost.activity;
    });

    const totalCost = transport + stay + food + activity;
    evaluated.push({
      ordered, dayAlloc, legs, maxLeg,
      costs: { transport, stay, food, activity, total: totalCost },
      totalCost, key: ordered.map(s => String(s._id)).sort().join(',')
    });
  }

  if (!evaluated.length) throw fail(400, 'Could not formulate a valid itinerary for the requested parameters.');

  const feasible = evaluated.filter(e => e.totalCost <= budget);
  const sorter = (a, b) => {
    const varA = a.ordered.reduce((acc, s, idx) => acc + Math.abs(a.dayAlloc[idx] - s.recDays), 0);
    const varB = b.ordered.reduce((acc, s, idx) => acc + Math.abs(b.dayAlloc[idx] - s.recDays), 0);
    return (varA - varB) || (a.maxLeg - b.maxLeg) || (a.totalCost - b.totalCost);
  };
  const best = (feasible.length ? feasible.sort(sorter) : evaluated.sort((a, b) => a.totalCost - b.totalCost))[0];

  const days_plan = [];
  let dayNum = 1;

  best.ordered.forEach((s, sIdx) => {
    const allocatedDays = best.dayAlloc[sIdx];
    const isFirstStop = (sIdx === 0);

    for (let d = 0; d < allocatedDays; d++) {
      const isFirstDayAtStop = (d === 0);
      const isFinalDayOfTrip = (dayNum === days);

      let tr = 0;
      let travelTime = 'Local exploration & sightseeing';

      if (isFirstDayAtStop) {
        if (isFirstStop) {
          tr = s.cost.transport;
          travelTime = `≈${s.travel?.hours || Math.max(1, Math.round(hav(hub, s) / 60))}h transfer from ${hub.name}`;
        } else {
          tr = best.legs[sIdx - 1] * RATE;
          const legKm = best.legs[sIdx - 1];
          travelTime = `≈${Math.max(1, Math.round(legKm / 50))}h drive from ${best.ordered[sIdx - 1].name} (${legKm} km straight-line)`;
        }
      }

      if (isFinalDayOfTrip) {
        tr += best.ordered[best.ordered.length - 1].cost.transport;
        const returnHours = s.travel?.hours || Math.max(1, Math.round(hav(hub, s) / 60));
        travelTime = isFirstDayAtStop
          ? `${travelTime} + ${returnHours}h return to ${hub.name}`
          : `${returnHours}h return journey to ${hub.name}`;
      }

      const acts = s.activities?.length ? s.activities : ['Sightseeing', 'Cultural exploration'];
      const act1 = acts[d % acts.length];
      const act2 = acts[(d + 1) % acts.length];

      const scheduleMorning = isFirstDayAtStop
        ? (isFirstStop ? `Travel from ${hub.name} and check in` : `Travel from ${best.ordered[sIdx - 1].name} and check in`)
        : `${act1}`;
      const scheduleAfternoon = `${act2}, lunch locally`;
      const scheduleEvening = isFinalDayOfTrip
        ? `Check out and return to ${hub.name}`
        : `Free evening, dinner locally`;

      const dailyTotal = tr + s.cost.stay + s.cost.food + s.cost.activity;

      days_plan.push({
        day: dayNum++,
        place: s.name,
        activities: [act1, act2],
        schedule: { morning: scheduleMorning, afternoon: scheduleAfternoon, evening: scheduleEvening },
        travelTime,
        transport: tr,
        stay: s.cost.stay,
        food: s.cost.food,
        activity: s.cost.activity,
        dailyTotal
      });
    }
  });

  const t = best.costs;
  return {
    stops: best.ordered.map(s => ({ id: s._id, name: s.name, lat: s.lat, lon: s.lon, bestTime: s.bestTime })),
    hub,
    days,
    budget,
    costs: t,
    days_plan,
    daysUsed: days,
    unusedDays: 0,
    remaining: budget - t.total,
    shortfall: Math.max(0, t.total - budget),
    status: t.total < budget ? 'WITHIN' : t.total === budget ? 'EXACT' : 'EXCEEDS',
    calculation: [
      `Transport = ${best.ordered[0].cost.transport} (${hub.name} to ${best.ordered[0].name})` +
        best.legs.map((l, i) => ` + ${l} km x ₹${RATE} (${best.ordered[i].name} to ${best.ordered[i+1].name})`).join('') +
        ` + ${best.ordered.at(-1).cost.transport} (return to ${hub.name}) = ₹${t.transport.toLocaleString('en-IN')}`,
      `Stay = ₹${t.stay.toLocaleString('en-IN')}, Food = ₹${t.food.toLocaleString('en-IN')}, Activities = ₹${t.activity.toLocaleString('en-IN')}`,
      `Total = ₹${t.total.toLocaleString('en-IN')}`
    ]
  };
}

// ---------- app ----------
const app = express(); app.use(cors()); app.use(express.json({ limit: '100kb' }));
const hits = {};   // simple rate limit: 300 requests / minute / IP
app.use('/api', (req, res, next) => { const k = req.ip, t = Date.now(); hits[k] = (hits[k] || []).filter(x => t - x < 60000);
  if (hits[k].push(t) > 300) return next(fail(429, 'Too many requests. Please slow down.')); next(); });

app.post('/api/auth/register', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 60), email = String(req.body.email || '').trim().toLowerCase(), pw = String(req.body.password || '');
  if (!name) throw fail(400, 'Name is required.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) throw fail(400, 'Enter a valid email address.');
  const e = pwErrors(pw); if (e.length) throw fail(400, 'Password needs: ' + e.join(', ') + '.');
  if (await User.exists({ email })) throw fail(409, 'An account with this email already exists.');
  await User.create({ name, email, role: req.body.role === 'owner' ? 'owner' : 'traveller', hash: await bcrypt.hash(pw, 10) });   // cost 10: fast enough for a free server
  console.log(`NEW USER REGISTERED: ${name} <${email}> at ${new Date().toLocaleString()}`); log(email, 'REGISTER', name);
  res.status(201).json({ message: 'Account created. Please log in.' }); }));

const fails = {};  // login lockout: 5 failures -> 15 minutes (SRS 3.2.9.3)
const doLogin = adminOnly => wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase(), f = fails[email] || { n: 0, until: 0 };
  if (f.until > Date.now()) throw fail(429, 'Too many attempts. Try again in 15 minutes.');
  const u = await User.findOne({ email });
  if (!u || !(await bcrypt.compare(String(req.body.password || ''), u.hash))) {
    f.n++; if (f.n >= 5) { f.until = Date.now() + 15 * 60000; f.n = 0; } fails[email] = f; throw fail(401, 'Invalid email or password.'); }
  delete fails[email]; if (adminOnly && u.role !== 'admin') throw fail(401, 'Invalid email or password.'); log(email, 'LOGIN');
  try { if (bcrypt.getRounds(u.hash) > 10) { u.hash = await bcrypt.hash(String(req.body.password || ''), 10); await u.save(); } } catch {}   // one-time: make older slow hashes fast
  res.json({ token: jwt.sign({ id: u._id, role: u.role, name: u.name }, SECRET, { expiresIn: '60m' }), name: u.name, role: u.role }); });
app.post('/api/auth/login', doLogin(false)); app.post('/api/admin/login', doLogin(true));

app.use('/api', auth());   // everything below requires login

const ext = async url => { try { const r = await fetch(url, { headers: { 'User-Agent': 'OneStateManyWorlds/1.0 (student project)' }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw 0; return await r.json(); } catch { throw fail(502, 'Places service is unavailable. Try again shortly.'); } };
app.get('/api/places/search', wrap(async (req, res) => {          // any place in Karnataka (OpenStreetMap Nominatim)
  const q = String(req.query.q || '').trim().slice(0, 100); if (q.length < 2) return res.json([]);
  const la0 = +req.query.lat || 15, lo0 = +req.query.lon || 76;
  const j = await ext(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=15&countrycodes=in&viewbox=${lo0 - 3.6},${la0 + 4},${lo0 + 3.6},${la0 - 4}&q=${encodeURIComponent(q)}`);
  const OK = new Set(['tourism', 'natural', 'historic', 'waterway', 'place', 'boundary', 'leisure']);   // keep tourist-relevant results, drop roads/shops/buildings
  let rows = j.filter(p => OK.has(p.category) || p.type === 'place_of_worship'); if (!rows.length) rows = j.slice(0, 5);
  const label = p => ({ administrative: 'Region', attraction: 'Attraction', place_of_worship: 'Temple / worship', waterfall: 'Waterfall', viewpoint: 'Viewpoint', peak: 'Peak', beach: 'Beach' }[p.type] || String(p.type || 'place').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()));
  const seen = new Set(), out = [];
  for (const p of rows.sort((x, y) => (y.importance || 0) - (x.importance || 0))) { const a = p.address || {}, name = p.name || p.display_name.split(',')[0], k = name + (+p.lat).toFixed(1) + (+p.lon).toFixed(1);
    if (seen.has(k)) continue; seen.add(k);
    out.push({ name, lat: +p.lat, lon: +p.lon, type: label(p), address: [a.village || a.town || a.city || a.suburb, a.county || a.state_district, a.state].filter(Boolean).join(', ') || p.display_name }); }
  res.json(out.slice(0, 8)); }));
const overpass = async ql => {   // ask both public Overpass servers at once, use the first answer
  try { return await Promise.any(['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'].map(async u => {
    const r = await fetch(u + '?data=' + encodeURIComponent(ql), { headers: { 'User-Agent': 'OneStateManyWorlds/1.0 (student project)' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('bad status'); return r.json(); })); }
  catch { throw fail(502, 'Places service is busy. Please tap Retry in a moment.'); } };
app.get('/api/places/nearby', wrap(async (req, res) => {   // OpenStreetMap Overpass + curated destinations
  const lat = +req.query.lat, lon = +req.query.lon, kind = String(req.query.kind || 'attractions'); if (!isFinite(lat) || !isFinite(lon)) throw fail(400, 'Invalid coordinates.');
  const FILT = { attractions: ['[tourism~"attraction|viewpoint|museum|zoo|theme_park"]', '[natural~"waterfall|peak"]', '[historic~"monument|castle|fort|temple|ruins|archaeological_site|memorial"]'], food: ['[amenity~"restaurant|cafe"]'],
    stay: ['[tourism~"hotel|guest_house|resort|hostel|camp_site"]'], essentials: ['[amenity~"hospital|fuel|atm|pharmacy"]'] }[kind];
  if (!FILT) throw fail(400, 'Unknown kind.');
  if (kind === 'stay' && process.env.GOOGLE_PLACES_KEY) { try {   // live ratings when a Google Places key is configured
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', { method: 'POST', signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.GOOGLE_PLACES_KEY, 'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.location' },
      body: JSON.stringify({ textQuery: 'hotels and resorts', locationBias: { circle: { center: { latitude: lat, longitude: lon }, radius: 30000 } }, maxResultCount: 15 }) });
    const j = await r.json();
    if (r.ok && j.places?.length) return res.json(j.places.map(p => ({ name: p.displayName?.text, lat: p.location.latitude, lon: p.location.longitude, type: 'hotel', rating: p.rating, reviews: p.userRatingCount, price: p.priceLevel,
      distanceKm: Math.round(hav({ lat, lon }, { lat: p.location.latitude, lon: p.location.longitude })) })).sort((a, b) => (b.rating || 0) - (a.rating || 0))); } catch {} }
  const seen = new Set(), out = [], add = (n, la, lo, type, extra = {}) => { if (!n || la == null || seen.has(n)) return; seen.add(n);
    out.push({ name: n, lat: la, lon: lo, type, distanceKm: Math.round(hav({ lat, lon }, { lat: la, lon: lo })), ...extra }); };
  let err = null;
  for (const R of [25000, 60000]) {   // widen the search if the first radius finds too little
    let j; try { j = await overpass(`[out:json][timeout:12];(${FILT.map(f => `nwr(around:${R},${lat},${lon})${f}[name];`).join('')});out center 40;`); } catch (e) { err = e; break; }
    for (const e of j.elements || []) add(e.tags?.name, e.lat ?? e.center?.lat, e.lon ?? e.center?.lon, e.tags.tourism || e.tags.natural || e.tags.historic || e.tags.amenity, { stars: e.tags.stars });
    if (out.length >= 3) break; }
  if (kind === 'attractions') for (const d of await Destination.find()) { const km = hav({ lat, lon }, d); if (km > 0.5 && km <= 150) add(d.name, d.lat, d.lon, 'curated', { id: d._id }); }
  if (!out.length && err) throw err;   // curated places are still shown if the map server is down
  res.json(out.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 10)); }));
const IMG_ALIAS = { Mullayanagiri: ['Mullayyanagiri'], Melkote: ['Melukote'], Mysuru: ['Mysore'], Alleppey: ['Alappuzha'], Coorg: ['Kodagu'], Thekkady: ['Periyar'], Marari: ['Mararikulam'], Wayanad: ['Wayanad'], 'Fort Kochi': ['Fort Kochi', 'Fort Cochin'] };
async function wikiImage(name, hint = '') {   // free Wikipedia/Wikimedia thumbnail; only accepts a page whose title matches the place (never a generic state/region page)
  const keys = [name, ...(IMG_ALIAS[name] || [])].map(s => s.toLowerCase());
  for (const q of [`${name} ${hint}`.trim(), `${name} India`, name]) { try {
    const j = await ext(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=5&prop=pageimages&piprop=thumbnail&pithumbsize=700&format=json`);
    const pg = Object.values(j.query?.pages || {}).sort((x, y) => x.index - y.index).find(x => x.thumbnail?.source && keys.some(k => String(x.title).toLowerCase().includes(k)));
    if (pg) return pg.thumbnail.source; } catch {} }
  return null; }
app.get('/api/image', wrap(async (req, res) => res.json({ url: await wikiImage(String(req.query.name || '').slice(0, 80), String(req.query.hint || '').slice(0, 40)) })));
app.get('/api/weather', wrap(async (req, res) => { const lat = +req.query.lat, lon = +req.query.lon; if (!isFinite(lat) || !isFinite(lon)) throw fail(400, 'Invalid coordinates.');
  const j = await ext(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3&timezone=auto`);
  res.json({ now: Math.round(j.current?.temperature_2m), daily: j.daily.time.map((t, i) => ({ date: t, max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], rain: j.daily.precipitation_probability_max[i] })) }); }));
const btCache = {};
app.get('/api/besttime', wrap(async (req, res) => {   // best months, estimated from last year's real weather
  const lat = +req.query.lat, lon = +req.query.lon; if (!isFinite(lat) || !isFinite(lon)) throw fail(400, 'Invalid coordinates.');
  const key = lat.toFixed(1) + ',' + lon.toFixed(1); if (btCache[key]) return res.json(btCache[key]);
  const y = new Date().getFullYear() - 1;
  const j = await ext(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${y}-01-01&end_date=${y}-12-31&daily=temperature_2m_mean,precipitation_sum&timezone=auto`);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], m = M.map(() => ({ t: 0, n: 0, wet: 0 }));
  j.daily.time.forEach((d, i) => { const k = +d.slice(5, 7) - 1, p = j.daily.precipitation_sum[i], t = j.daily.temperature_2m_mean[i]; if (t == null) return; m[k].t += t; m[k].n++; if (p > 2.5) m[k].wet++; });
  const good = m.map(x => x.n > 0 && x.wet / x.n <= 0.25 && x.t / x.n >= 14 && x.t / x.n <= 30);
  let best = { s: -1, len: 0 }; for (let s = 0; s < 12; s++) { let len = 0; while (len < 12 && good[(s + len) % 12]) len++; if (len > best.len) best = { s, len }; }
  let range; if (best.len) range = best.len === 12 ? 'All year' : `${M[best.s]}–${M[(best.s + best.len - 1) % 12]}`;
  else range = m.map((x, i) => [i, x.n ? x.wet / x.n : 1]).sort((a, b) => a[1] - b[1]).slice(0, 3).map(a => a[0]).sort((a, b) => a - b).map(i => M[i]).join(', ');
  const out = { range, source: "estimated from last year's weather" }; btCache[key] = out; res.json(out); }));
app.get('/api/favorites', wrap(async (req, res) => res.json((await User.findById(req.user.id)).favorites.map(String))));
app.post('/api/favorites/:id', wrap(async (req, res) => { const u = await User.findById(req.user.id), id = req.params.id, has = u.favorites.map(String).includes(id);
  u.favorites = has ? u.favorites.filter(f => String(f) !== id) : [...u.favorites, id]; await u.save(); res.json(u.favorites.map(String)); }));
app.get('/api/coupons', wrap(async (q, res) => res.json(await Coupon.find({ validTill: { $gt: new Date() } }).select('code percent maxDiscount validTill'))));
app.get('/api/stays/top', wrap(async (req, res) => {   // best-rated resorts and stays
  const ds = await Destination.find(req.query.region ? { region: req.query.region } : {}).select('name image'), by = Object.fromEntries(ds.map(d => [String(d._id), d]));
  const rows = (await Stay.find({ destination: { $in: ds.map(d => d._id) } })).map(s => ({ ...stayOut(s), place: by[String(s.destination)]?.name, placeId: s.destination, image: by[String(s.destination)]?.image }));
  res.json(rows.sort(req.query.sort === 'price' ? (a, b) => a.price - b.price : (a, b) => b.avg - a.avg || b.count - a.count).slice(0, 6)); }));
app.post('/api/stays/:id/rate', wrap(async (req, res) => { const v = +req.body.value; if (!Number.isInteger(v) || v < 1 || v > 5) throw fail(400, 'Rating must be 1 to 5.');
  const s = await Stay.findById(req.params.id).catch(() => null); if (!s) throw fail(404, 'Stay not found.');
  s.ratings = s.ratings.filter(r => String(r.user) !== req.user.id).concat({ user: req.user.id, value: v }); await s.save(); res.json(stayOut(s)); }));
app.get('/api/regions', wrap(async (q, s) => s.json(await Region.find())));
const allCats = async () => [...new Set([...(await Destination.distinct('category')), ...(await Category.find()).map(c => c.name)])]
  .filter(c => typeof c === 'string' && c.trim().length > 0 && !/^[0-9a-fA-F]{24}$/.test(c))
  .sort();
app.get('/api/categories', wrap(async (q, s) => s.json(await allCats())));
const listDest = wrap(async (req, res) => {
  const { q = '', category = '', tier: t = '' } = req.query, region = req.query.region || req.query.regionId || '';
  if (q.length > 100) throw fail(400, 'Keyword must be 100 characters or fewer.');
  if (t && !['LOW', 'MEDIUM', 'HIGH'].includes(t)) throw fail(400, 'Budget tier must be LOW, MEDIUM or HIGH.');
  const kw = q.toLowerCase().trim();
  let rows = (await Destination.find().sort('name')).map(pub);
  rows = rows.filter(d => (!kw || [d.name, d.description, ...d.category, ...d.activities].some(x => x.toLowerCase().includes(kw)))
    && (!category || d.category.some(c => c.toLowerCase() === category.toLowerCase())) && (!t || d.tier === t) && (!region || String(d.region) === region));
  const ids = rows.map(d => d._id), st = await Review.aggregate([{ $match: { destination: { $in: ids } } }, { $group: { _id: '$destination', avg: { $avg: '$rating' }, n: { $sum: 1 } } }]);
  rows.forEach(d => { const s = st.find(x => String(x._id) === String(d._id)); d.avgRating = s ? Math.round(s.avg * 10) / 10 : null; d.reviewCount = s ? s.n : 0; });
  if (rows.some(d => !d.image)) backfillImages();
  res.json(rows); });
app.get('/api/destinations/search', listDest); app.get('/api/destinations', listDest);

app.get('/api/destination/:id', wrap(async (req, res) => {
  const d = await Destination.findById(req.params.id).catch(() => null); if (!d) throw fail(404, 'Destination not found.');
  const near = (await Destination.find({ _id: { $ne: d._id }, region: d.region })).map(o => ({ ...pub(o), distanceKm: Math.round(hav(d, o)) }))
    .sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 5);
  const stays = (await Stay.find({ destination: d._id })).map(stayOut).sort((a, b) => b.avg - a.avg);
  res.json({ ...pub(d), nearby: near, stays }); }));

app.get('/api/destination/:id/reviews', wrap(async (req, res) => {
  const r = await Review.find({ destination: req.params.id }).sort('-createdAt'), n = r.length;
  res.json({ count: n, average: n ? Math.round(r.reduce((a, x) => a + x.rating, 0) / n * 10) / 10 : null, reviews: r }); }));
app.post('/api/reviews', wrap(async (req, res) => {
  const { destinationId, rating, text = '' } = req.body, clean = String(text).replace(/<[^>]*>/g, '');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw fail(400, 'Rating must be 1 to 5.');
  if (clean.length > 500) throw fail(400, 'Review must be 500 characters or fewer.');
  if (!(await Destination.exists({ _id: destinationId }).catch(() => null))) throw fail(404, 'Destination not found.');
  if (await Review.countDocuments({ user: req.user.id, createdAt: { $gt: new Date(Date.now() - 864e5) } }) >= 3) throw fail(429, 'You can post at most 3 reviews per 24 hours.');
  const me = await User.findById(req.user.id);
  res.status(201).json(await Review.create({ destination: destinationId, rating, text: clean, user: req.user.id, userName: me?.name || 'Traveller' })); }));
app.delete('/api/review/:id', auth('admin'), wrap(async (req, res) => { await Review.findByIdAndDelete(req.params.id); res.json({ message: 'Review deleted.' }); }));

app.post('/api/itinerary/generate', wrap(async (req, res) => {
  const days = +req.body.days, budget = +req.body.budget;
  if (!Number.isInteger(days) || days < 1 || days > 15) throw fail(400, 'Days must be a whole number from 1 to 15.');
  if (!Number.isInteger(budget) || budget < 1 || budget > 1e6) throw fail(400, 'Budget must be a whole number from 1 to 1,000,000 INR.');
  const region = req.body.regionId ? await Region.findById(req.body.regionId).catch(() => null) : await Region.findOne();
  if (!region) throw fail(404, 'Region not found.');
  const dests = (await Destination.find({ region: region._id }).sort('_id')).filter(d => hasCost(d) && d.recDays && (String(d._id) === String(req.body.destinationId) || ![].concat(req.body.exclude || []).map(String).includes(String(d._id))));
  let must = req.body.destinationId; const p = req.body.place;
  if (p) { const lat = +p.lat, lon = +p.lon, nm = String(p.name || '').trim().slice(0, 80);
    if (!nm || !isFinite(lat) || !isFinite(lon)) throw fail(400, 'Invalid place.');
    dests.push({ _id: 'ext', name: nm, lat, lon, recDays: 2, activities: ['Sightseeing', 'Local food'],        // estimated costs (no live pricing)
      cost: { transport: Math.round(hav(region.hub, { lat, lon }) * 5), stay: 1000, food: 400, activity: 300 } }); must = 'ext'; }
  const anchor = must ? dests.find(d => String(d._id) === String(must)) : null; if (must && !anchor) throw fail(404, 'The requested record was not found.');
  const pool = anchor ? dests.filter(d => d === anchor || hav(anchor, d) <= 200) : dests;   // anchored plans only add places within 200 km of the chosen place
  const result = plan(region, pool, days, budget, must);
  if (result.status === 'EXCEEDS') {   // real alternatives: shorter plans from the same planner that fit the budget
    result.minBudget = result.costs.total; result.alternatives = [];
    for (let d = days - 1; d >= 1 && result.alternatives.length < 2; d--) {
      try { const a = plan(region, pool, d, budget, must); if (a.costs.total <= budget) result.alternatives.push({ days: d, total: a.costs.total, stops: a.stops.map(s => s.name) }); } catch {} }
  }
  const tr = Math.round(+req.body.travellers || 1); if (tr < 1 || tr > 20) throw fail(400, 'Travellers must be 1 to 20.'); result.travellers = tr;
  const code = String(req.body.coupon || '').trim().toUpperCase(); result.payable = result.costs.total;
  if (code) { const c = await Coupon.findOne({ code, validTill: { $gt: new Date() } }); if (!c) throw fail(400, 'Invalid or expired coupon code.');
    const off = Math.min(Math.round(result.costs.total * c.percent / 100), c.maxDiscount), pay = result.costs.total - off;
    Object.assign(result, { coupon: { code, percent: c.percent, discount: off }, payable: pay, remaining: budget - pay, shortfall: Math.max(0, pay - budget), status: pay < budget ? 'WITHIN' : pay === budget ? 'EXACT' : 'EXCEEDS' });
    c.uses++; await c.save(); log(req.user.name, 'COUPON_USED', code); }
  const it = await Itinerary.create({ user: req.user.id, title: result.stops.map(s => s.name).join(' + '), result });
  res.json({ ...result, itineraryId: it._id }); }));
app.get('/api/itineraries', wrap(async (req, res) => res.json(await Itinerary.find({ user: req.user.id }).sort('-createdAt').select('title createdAt result.days result.budget'))));
app.get('/api/itinerary/:id', wrap(async (req, res) => {
  const it = await Itinerary.findOne({ _id: req.params.id, user: req.user.id }).catch(() => null); if (!it) throw fail(404, 'Itinerary not found.'); res.json(it.result); }));

const num = (v, lo, hi, nm) => { const n = Number(v); if (v === '' || v == null || !isFinite(n) || n < lo || n > hi) throw fail(400, `${nm} must be a number from ${lo} to ${hi}.`); return n; };
const list = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
const baseBody = b => { const name = String(b.name || '').trim().slice(0, 100); if (!name) throw fail(400, 'Name is required (1-100 characters).');
  const category = list(b.category).slice(0, 5); if (!category.length) throw fail(400, 'At least one category is required.');
  const description = String(b.description || '').trim().slice(0, 2000); if (!description) throw fail(400, 'Description is required.');
  return { name, category, description, lat: num(b.lat, -90, 90, 'Latitude'), lon: num(b.lon, -180, 180, 'Longitude'), recDays: Math.round(num(b.recDays, 1, 15, 'Recommended days')),
    activities: list(b.activities).slice(0, 10), ...(b.image ? { image: String(b.image).slice(0, 500) } : {}), ...(b.bestTime ? { bestTime: String(b.bestTime).slice(0, 60) } : {}) }; };
const travelBody = b => { const howToReach = String(b.howToReach || '').trim().slice(0, 200); if (!howToReach) throw fail(400, 'How to reach is required.');
  return { howToReach, hub: String(b.hub || '').trim().slice(0, 60), hours: num(b.hours, 0.1, 48, 'Travel time (hours)') }; };
const costBody = b => ({ transport: num(b.transport, 0, 1e5, 'Transport'), stay: num(b.stay, 0, 1e5, 'Stay'), food: num(b.food, 0, 1e5, 'Food'), activity: num(b.activity, 0, 1e5, 'Activity'), updated: new Date() });
const dup = e => { if (e.code === 11000) throw fail(409, 'A record with the same name or destination already exists.'); throw e; };
const findD = async id => { const d = await Destination.findById(id).catch(() => null); if (!d) throw fail(404, 'The requested record was not found.'); return d; };
const NA = { message: 'Information not available.' }, STAYS = ['HOSTEL', 'HOMESTAY', 'LODGE', 'HOTEL', 'RESORT', 'CAMPING'];
// ---- read endpoints ----
app.get('/api/destination/:id/categories', wrap(async (req, res) => res.json((await findD(req.params.id)).category)));
app.get('/api/destination/:id/travelinfo', wrap(async (req, res) => { const t = (await findD(req.params.id)).travel; res.json(t?.howToReach ? { howToReach: t.howToReach, hub: t.hub, hours: t.hours } : NA); }));
app.get('/api/destination/:id/costs', wrap(async (req, res) => { const d = await findD(req.params.id), c = d.cost;
  res.json(hasCost(d) ? { costId: d._id, transport: c.transport, stay: c.stay, food: c.food, activity: c.activity, updated: c.updated } : NA); }));
app.get('/api/destination/:id/stays', wrap(async (req, res) => res.json((await Stay.find({ destination: (await findD(req.params.id))._id })).map(stayOut).sort((a, b) => b.avg - a.avg))));
app.get('/api/destination/:id/photos', wrap(async (req, res) => { const d = await findD(req.params.id);
  res.json([...(d.image ? [{ url: d.image, caption: d.name }] : []), ...(await Photo.find({ destination: d._id })).map(p => ({ id: p._id, url: p.url, caption: p.caption }))]); }));
app.get('/api/destination/:id/location', wrap(async (req, res) => { const d = await findD(req.params.id); res.json({ latitude: d.lat, longitude: d.lon }); }));
app.get('/api/destinations/map', wrap(async (req, res) => { const r = req.query.region || req.query.regionId;
  res.json((await Destination.find(r ? { region: r } : {}).sort('name')).map(d => ({ id: d._id, name: d.name, latitude: d.lat, longitude: d.lon }))); }));
app.get('/api/region/:id', wrap(async (req, res) => { const r = await Region.findById(req.params.id).catch(() => null); if (!r) throw fail(404, 'The requested record was not found.');
  res.json({ id: r._id, name: r.name, description: r.description, hub: r.hub, destinations: (await Destination.find({ region: r._id }).sort('name')).map(d => ({ id: d._id, name: d.name })) }); }));
// ---- administrator endpoints ----
app.post('/api/destinations', auth('admin'), wrap(async (req, res) => { const region = await Region.findById(req.body.regionId).catch(() => null); if (!region) throw fail(400, 'Select a valid region.');
  const d = await Destination.create({ ...baseBody(req.body), region: region._id }).catch(dup); log(req.user.name, 'ADD_DESTINATION', d.name); res.status(201).json({ destinationId: d._id, status: 'CREATED' }); }));
app.put('/api/destination/:id', auth('admin'), wrap(async (req, res) => { await findD(req.params.id);
  const d = await Destination.findByIdAndUpdate(req.params.id, { ...baseBody(req.body), ...(req.body.howToReach ? { travel: travelBody(req.body) } : {}) }, { new: true }).catch(dup);
  log(req.user.name, 'UPDATE_DESTINATION', d.name); res.json(pub(d)); }));
app.delete('/api/destination/:id', auth('admin'), wrap(async (req, res) => { const d = await findD(req.params.id);
  await Promise.all([Review.deleteMany({ destination: d._id }), Stay.deleteMany({ destination: d._id }), Photo.deleteMany({ destination: d._id }), d.deleteOne()]);
  log(req.user.name, 'DELETE_DESTINATION', d.name); res.json({ status: 'DELETED' }); }));
app.post('/api/categories', auth('admin'), wrap(async (req, res) => { const name = String(req.body.name || '').trim().slice(0, 60); if (!name) throw fail(400, 'Category name is required.');
  if ((await allCats()).some(c => c.toLowerCase() === name.toLowerCase())) throw fail(409, 'A record with the same name or destination already exists.');
  const c = await Category.create({ name }); log(req.user.name, 'ADD_CATEGORY', name); res.status(201).json({ categoryId: c._id }); }));
app.post('/api/travel-info', auth('admin'), wrap(async (req, res) => { const d = await findD(req.body.destinationId);
  if (d.travel?.howToReach) throw fail(409, 'A record with the same name or destination already exists.'); d.travel = travelBody(req.body); await d.save(); res.status(201).json({ travelInfoId: d._id }); }));
app.post('/api/costs', auth('admin'), wrap(async (req, res) => { const d = await findD(req.body.destinationId);
  if (hasCost(d)) throw fail(409, 'A record with the same name or destination already exists.'); d.cost = costBody(req.body); await d.save(); res.status(201).json({ costId: d._id }); }));
app.put('/api/cost/:id', auth('admin'), wrap(async (req, res) => { const d = await findD(req.params.id); d.cost = costBody(req.body); await d.save();
  log(req.user.name, 'UPDATE_COST', d.name); res.json({ costId: d._id, ...costBody(req.body) }); }));
app.post('/api/stays', auth('admin'), wrap(async (req, res) => { const d = await findD(req.body.destinationId), kind = String(req.body.type || '').toUpperCase();
  if (!STAYS.includes(kind)) throw fail(400, 'Stay type must be one of: ' + STAYS.join(', ') + '.');
  const name = String(req.body.name || '').trim().slice(0, 100); if (!name) throw fail(400, 'Stay name is required.');
  const lo = Math.round(num(req.body.minPrice, 0, 1e5, 'Minimum price')), hi = Math.round(num(req.body.maxPrice, 0, 1e5, 'Maximum price')); if (hi < lo) throw fail(400, 'Maximum price must not be below the minimum price.');
  const s = await Stay.create({ destination: d._id, name, kind, price: lo, minPrice: lo, maxPrice: hi, baseRating: 0, baseCount: 0 }); res.status(201).json({ stayId: s._id }); }));
app.post('/api/photos', auth('admin'), wrap(async (req, res) => { const d = await findD(req.body.destinationId), url = String(req.body.url || '').trim();
  if (!/^https?:\/\/\S+$/i.test(url) || url.length > 500) throw fail(400, 'Enter a valid http or https photo URL.');
  if (await Photo.countDocuments({ destination: d._id }) >= 10) throw fail(400, 'A destination can have at most 10 photos.');
  const p = await Photo.create({ destination: d._id, url, caption: String(req.body.caption || '').slice(0, 200) }); res.status(201).json({ photoId: p._id }); }));
app.post('/api/admin/regions', auth('admin'), wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 60), hub = String(req.body.hubName || '').trim().slice(0, 60);
  if (!name || !hub) throw fail(400, 'Region name and hub name are required.');
  res.status(201).json(await Region.create({ name, description: String(req.body.description || '').slice(0, 300),
    hub: { name: hub, lat: num(req.body.hubLat, -90, 90, 'Hub latitude'), lon: num(req.body.hubLon, -180, 180, 'Hub longitude') } })); }));
app.post('/api/admin/coupons', auth('admin'), wrap(async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase(); if (!/^[A-Z0-9]{4,15}$/.test(code)) throw fail(400, 'Code must be 4-15 letters or digits.');
  const c = await Coupon.create({ code, percent: Math.round(num(req.body.percent, 1, 90, 'Discount %')), maxDiscount: Math.round(num(req.body.maxDiscount, 1, 1e5, 'Max discount')),
    validTill: new Date(Date.now() + 864e5 * Math.round(num(req.body.validDays, 1, 365, 'Validity days'))) }).catch(e => { if (e.code === 11000) throw fail(409, 'That coupon code already exists.'); throw e; });
  log(req.user.name, 'ADD_COUPON', code); res.status(201).json(c); }));
app.delete('/api/admin/coupons/:id', auth('admin'), wrap(async (req, res) => { await Coupon.findByIdAndDelete(req.params.id); log(req.user.name, 'DELETE_COUPON', req.params.id); res.json({ message: 'Coupon deleted.' }); }));
app.get('/api/admin/dashboard', auth('admin'), wrap(async (q, res) => res.json({
  destinations: await Destination.countDocuments(), regions: await Region.countDocuments(), users: await User.countDocuments(), reviews: await Review.countDocuments(),
  missingData: (await Destination.find()).filter(d => !hasCost(d) || !d.travel?.howToReach).map(d => d.name), costRecords: (await Destination.find()).filter(hasCost).length,
  latestReviews: await Review.find().sort('-createdAt').limit(20).populate('destination', 'name'),
  userList: await User.find().sort('-createdAt').select('name email role createdAt'), audit: await Audit.find().sort('-createdAt').limit(40), coupons: await Coupon.find().sort('-createdAt') })));

// ---------- bookings + resort owner portal ----------
const streams = new Map();   // ownerId -> open Server-Sent-Event connections (live booking alerts)
const push = (owner, data) => (streams.get(String(owner)) || new Set()).forEach(r => r.write(`data: ${JSON.stringify(data)}\n\n`));
app.get('/api/owner/stream', auth('owner'), (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); res.flushHeaders?.(); res.write('retry: 3000\n\n');
  const k = String(req.user.id); if (!streams.has(k)) streams.set(k, new Set()); streams.get(k).add(res);
  const hb = setInterval(() => res.write(': ping\n\n'), 25000); req.on('close', () => { clearInterval(hb); streams.get(k)?.delete(res); }); });
app.get('/api/owner/dashboard', auth('owner'), wrap(async (req, res) => { const oid = req.user.id;
  const [stays, bookings, notes] = await Promise.all([Stay.find({ owner: oid }), Booking.find({ owner: oid }).sort('-createdAt').limit(100), Notification.find({ owner: oid }).sort('-createdAt').limit(20)]);
  const names = Object.fromEntries((await Destination.find({ _id: { $in: stays.map(s => s.destination) } }).select('name')).map(d => [String(d._id), d.name]));
  const unread = notes.filter(n => !n.read).length; Notification.updateMany({ owner: oid, read: false }, { read: true }).catch(() => {});
  res.json({ stays: stays.map(s => ({ ...stayOut(s), place: names[String(s.destination)], rooms: s.rooms })), bookings, notifications: notes, revenue: bookings.reduce((a, b) => a + b.amount, 0), unread }); }));
app.post('/api/owner/stays', auth('owner'), wrap(async (req, res) => { const b = req.body, d = await findD(b.destinationId), kind = String(b.type || '').toUpperCase();
  if (!STAYS.includes(kind)) throw fail(400, 'Stay type must be one of: ' + STAYS.join(', ') + '.');
  const name = String(b.name || '').trim().slice(0, 100); if (!name) throw fail(400, 'Stay name is required.');
  const lo = Math.round(num(b.minPrice, 0, 1e5, 'Minimum price')), hi = Math.round(num(b.maxPrice, 0, 1e5, 'Maximum price')); if (hi < lo) throw fail(400, 'Maximum price must not be below the minimum price.');
  const image = String(b.image || '').trim(); if (image && !/^https?:\/\/\S+$/i.test(image)) throw fail(400, 'Image must be a valid http or https URL.');
  const s = await Stay.create({ destination: d._id, name, kind, price: lo, minPrice: lo, maxPrice: hi, rooms: Math.round(num(b.rooms, 1, 500, 'Rooms')), image, owner: req.user.id, baseRating: 0, baseCount: 0 });
  log(req.user.name, 'OWNER_ADD_STAY', name); res.status(201).json({ stayId: s._id }); }));
app.get('/api/bookings', wrap(async (req, res) => res.json(await Booking.find({ user: req.user.id }).sort('-createdAt'))));
app.post('/api/bookings', wrap(async (req, res) => {
  const it = await Itinerary.findOne({ _id: req.body.itineraryId, user: req.user.id }).catch(() => null); if (!it) throw fail(404, 'Itinerary not found.');
  if (await Booking.exists({ itinerary: it._id })) throw fail(409, 'This itinerary is already booked.');
  const start = new Date(req.body.checkIn), today = new Date(); today.setHours(0, 0, 0, 0);
  if (isNaN(start) || start < today || start > new Date(Date.now() + 365 * 864e5)) throw fail(400, 'Choose a check-in date within the next 12 months.');
  const guests = Math.round(+req.body.guests); if (!(guests >= 1 && guests <= 20)) throw fail(400, 'Guests must be 1 to 20.');
  const me = await User.findById(req.user.id), out = []; let offset = 0;
  for (const s of it.result.stops) {
    const nights = it.result.days_plan.filter(p => p.place === s.name).length, from = new Date(start.getTime() + offset * 864e5); offset += nights;
    if (s.id === 'ext') continue;
    const pick = (req.body.picks || {})[s.id]; let stay = pick ? await Stay.findOne({ _id: pick, destination: s.id }).catch(() => null) : null;
    if (!stay) stay = (await Stay.find({ destination: s.id })).sort((a, b) => (rate(b).avg || 0) - (rate(a).avg || 0))[0];
    if (!stay) continue;
    const amount = stay.price * nights * Math.ceil(guests / 2), ref = 'OSMW-' + require('crypto').randomBytes(3).toString('hex').toUpperCase();
    const bk = await Booking.create({ ref, user: me._id, userName: me.name, userEmail: me.email, itinerary: it._id, stay: stay._id, stayName: stay.name, owner: stay.owner, destination: s.id, place: s.name, checkIn: from, nights, guests, amount });
    const text = `${me.name} booked ${stay.name} (${s.name}) for ${nights} night(s) from ${from.toLocaleDateString('en-IN')} · ${guests} guest(s) · ₹${amount.toLocaleString('en-IN')} · Ref ${ref}`;
    if (stay.owner) { await Notification.create({ owner: stay.owner, text, booking: bk._id }); push(stay.owner, { text, ref }); }
    log(me.email, 'BOOKING', `${ref} ${stay.name}`); out.push({ ref, stay: stay.name, place: s.name, checkIn: from, nights, amount }); }
  if (!out.length) throw fail(400, 'No bookable stays are listed for this itinerary yet.');
  res.status(201).json({ bookings: out }); }));

app.use((err, q, res, n) => res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong.' }));

// ---------- seed + start ----------
const D = (name, category, lat, lon, recDays, transport, stay, food, activity, activities, description) =>
  ({ name, category, lat, lon, recDays, activities, description, travel: { howToReach: 'Road from Bengaluru (bus or car).', hub: 'Bengaluru', hours: Math.max(1, Math.round(transport / 120)) }, cost: { transport, stay, food, activity } });
async function seedKerala() {
  let r = await Region.findOne({ name: 'Kerala' });
  if (!r) r = await Region.create({ name: 'Kerala', description: "God's own country.", hub: { name: 'Kochi', lat: 9.9312, lon: 76.2673 } });
  const rows = [
    D('Munnar', ['Nature'], 10.0889, 77.0595, 2, 400, 1200, 400, 300, ['Tea garden trails', 'Eravikulam National Park', 'Top Station viewpoint'], 'Rolling tea hills and misty peaks in the Western Ghats.'),
    D('Alleppey', ['Coast', 'Culture'], 9.4981, 76.3388, 2, 250, 1500, 450, 500, ['Houseboat cruise', 'Village canoe tour', 'Vembanad lake sunset'], 'Iconic backwaters, tranquil canals and floating houseboats.'),
    D('Varkala', ['Coast', 'Wellness and Yoga'], 8.7379, 76.7163, 2, 450, 1000, 400, 250, ['Cliff beach walk', 'Ayurvedic rejuvenation', 'Sunset yoga'], 'Red laterite cliff beach overlooking the Arabian Sea with authentic Ayurveda.'),
    D('Thekkady', ['Nature', 'Adventure'], 9.6, 77.1667, 2, 300, 1100, 400, 600, ['Periyar boat safari', 'Spice plantation trail', 'Bamboo rafting'], 'Dense evergreen forests, wildlife and aromatic spice hills.'),
    D('Fort Kochi', ['Heritage', 'Culture', 'Coast'], 9.9656, 76.2421, 1, 100, 1200, 450, 300, ['Chinese fishing nets', 'Mattancherry Dutch Palace', 'Kathakali cultural show'], 'Historic port town steeped in Portuguese, Dutch and British colonial charm.'),
    D('Wayanad', ['Nature', 'Adventure', 'Wellness and Yoga'], 11.6854, 76.1320, 2, 450, 1200, 400, 400, ['Edakkal prehistoric caves', 'Chembra heart-lake trek', 'Forest wellness retreat'], 'Mist-clad mountains, prehistoric cave art and holistic forest wellness.'),
    D('Kovalam', ['Coast', 'Wellness and Yoga'], 8.4004, 76.9787, 2, 400, 1300, 450, 350, ['Lighthouse beach', 'Traditional Ayurvedic spa', 'Coastal yoga sessions'], 'World-famous crescent beach known for authentic Ayurvedic healing and yoga.'),
    D('Marari', ['Coast', 'Nature', 'Wellness and Yoga'], 9.5997, 76.3000, 1, 200, 1400, 400, 250, ['Quiet beach walk', 'Village cycling', 'Eco-wellness therapy'], 'Peaceful, offbeat fishing village with pristine beaches and eco-retreats.'),
    D('Bekal', ['Heritage', 'Coast'], 12.3927, 75.0331, 2, 600, 1100, 400, 300, ['Bekal sea fort walk', 'Kappil beach estuary', 'Backwater boating'], 'Majestic keyhole-shaped sea fort with panoramic coastal horizons.')
  ];
  for (const x of rows) await Destination.updateOne({ name: x.name, region: r._id }, { $setOnInsert: { ...x, travel: { ...x.travel, hub: 'Kochi' }, region: r._id } }, { upsert: true });
}
async function seed() {
  if (await Meta.exists({ key: 'seed-v2' })) return;   // seed once: never overwrite admin edits or resurrect deleted destinations
  await seedKerala();
  let r = await Region.findOne({ name: 'Karnataka' });
  if (!r) r = await Region.create({ name: 'Karnataka', description: 'One state, many worlds.', hub: { name: 'Bengaluru', lat: 12.9716, lon: 77.5946 } });
  const rows = [
    D('Agumbe', ['Nature'], 13.5014, 75.0903, 2, 600, 900, 400, 300, ['Sunset point', 'Rainforest walk', 'Barkana falls view'], 'Cherrapunji of the South with dense rainforests and king cobras.'),
    D('Badami', ['Heritage'], 15.9149, 75.6768, 2, 900, 800, 350, 250, ['Cave temples', 'Agastya lake walk', 'Bhutanatha temple complex'], 'Ancient rock-cut cave temples and red sandstone cliffs of the Chalukyas.'),
    D('Hampi', ['Heritage', 'Culture'], 15.335, 76.46, 2, 700, 900, 400, 300, ['Virupaksha temple', 'Vijaya Vittala stone chariot', 'Coracle ride'], 'UNESCO World Heritage boulder-strewn capital of the Vijayanagara Empire.'),
    D('Gokarna', ['Coast', 'Wellness and Yoga'], 14.5479, 74.3188, 2, 800, 1000, 450, 350, ['Om beach trek', 'Beachside yoga & meditation', 'Mahabaleshwar temple'], 'Idyllic crescent beaches, yoga retreats and sacred seaside temples.'),
    D('Mullayanagiri', ['Nature', 'Adventure'], 13.3917, 75.7217, 2, 450, 1100, 400, 300, ['Summit peak trek', 'Coffee estate walk', 'Bababudangiri visit'], 'Karnataka\'s highest peak offering panoramic misty Western Ghats vistas.'),
    D('Dandeli', ['Adventure', 'Nature'], 15.2667, 74.6167, 2, 950, 1200, 400, 900, ['White-water rafting', 'Kali river kayaking', 'Jungle safari'], 'Adrenaline-packed river rafting and wildlife safaris in the Kali river reserve.'),
    D('Melkote', ['Culture', 'Heritage'], 12.66, 76.65, 1, 200, 600, 300, 150, ['Cheluvanarayana temple', 'Yoga Narasimha hill climb', 'Kalyani sacred pond'], 'Historic hilltop temple town renowned for ancient Iyengar culture and scholarship.'),
    D('Kabini', ['Adventure', 'Nature'], 11.974, 76.355, 2, 400, 1500, 500, 600, ['Nagarhole jeep safari', 'Kabini boat safari', 'Bird watching'], 'Premier wildlife haven on the banks of Kabini river famed for leopards and elephants.'),
    D('Kudremukh', ['Adventure', 'Nature'], 13.2167, 75.25, 2, 500, 900, 350, 400, ['Horse-face peak trek', 'Rainforest stream walk', 'Hanumangundi falls'], 'Verdant rolling grass peaks and pristine mountain rivers.'),
    D('Mysuru', ['Heritage', 'Culture', 'Wellness and Yoga'], 12.2958, 76.6394, 2, 300, 1100, 400, 300, ['Mysore Palace tour', 'Chamundi hill temple', 'Ashtanga Yoga & wellness'], 'Royal heritage city renowned for illuminated palaces, silk and yoga traditions.'),
    D('Coorg', ['Nature', 'Wellness and Yoga'], 12.4244, 75.7382, 2, 500, 1300, 450, 350, ['Abbey Falls visit', 'Coffee plantation trail', 'Ayurvedic wellness & rejuvenation'], 'Lush green coffee valleys, misty waterfalls and traditional Kodava hospitality.'),
    D('Murudeshwar', ['Coast', 'Heritage'], 14.0940, 74.4899, 1, 750, 900, 350, 300, ['Colossal Shiva statue', 'Temple beach walk', 'Netrani island boat trip'], 'Towering coastal Shiva monument flanked by the Arabian sea on three sides.')
  ];
  for (const x of rows) await Destination.updateOne({ name: x.name, region: r._id }, { $setOnInsert: { ...x, travel: { ...x.travel, hub: 'Bengaluru' }, region: r._id } }, { upsert: true });
  for (const c of ['Nature', 'Heritage', 'Adventure', 'Coast', 'Culture', 'Wellness and Yoga']) {
    await Category.updateOne({ name: c }, { $set: { name: c } }, { upsert: true });
  }
  await Meta.create({ key: 'seed-v2' });
  console.log('Seeded Karnataka & Kerala destinations and categories.');
}
const BEST = {
  Agumbe: 'Oct–Feb', Badami: 'Oct–Mar', Hampi: 'Oct–Feb', Gokarna: 'Nov–Feb', Mullayanagiri: 'Sep–Feb',
  Dandeli: 'Oct–Feb', Melkote: 'Oct–Mar', Kabini: 'Nov–May', Kudremukh: 'Oct–Feb', Mysuru: 'Oct–Mar',
  Coorg: 'Oct–Apr', Murudeshwar: 'Oct–Mar', Munnar: 'Sep–Mar', Alleppey: 'Nov–Feb', Varkala: 'Nov–Mar',
  Thekkady: 'Oct–Mar', 'Fort Kochi': 'Oct–Mar', Wayanad: 'Oct–May', Kovalam: 'Sep–Mar', Marari: 'Oct–Mar', Bekal: 'Oct–Mar'
};
async function seedExtras() {   // sample stays (demo data), coupons, best-time
  for (const [n, b] of Object.entries(BEST)) await Destination.updateMany({ name: n, bestTime: { $exists: false } }, { bestTime: b });
  if (!(await Stay.exists({}))) for (const d of await Destination.find()) { const h = [...d.name].reduce((a, c) => a + c.charCodeAt(0), 0), p = (m) => Math.round(d.cost.stay * m / 50) * 50;
    await Stay.insertMany([{ name: `${d.name} Heritage Resort`, kind: 'Resort', price: p(1.4), baseRating: 4.3 + (h % 5) / 10, baseCount: 20 + h % 30 },
      { name: `${d.name} Valley Homestay`, kind: 'Homestay', price: p(0.6), baseRating: 3.9 + (h % 7) / 10, baseCount: 10 + h % 20 },
      { name: `${d.name} Grand Lodge`, kind: 'Hotel', price: p(1), baseRating: 4 + (h % 6) / 10, baseCount: 15 + h % 25 }].map(s => ({ ...s, destination: d._id }))); }
  let demo = await User.findOne({ email: 'owner@onestate.com' });
  if (!demo) { demo = await User.create({ name: 'Demo Resort Owner', email: 'owner@onestate.com', role: 'owner', hash: await bcrypt.hash('Owner@12345', 10) }); console.log('Demo owner account: owner@onestate.com / Owner@12345'); }
  await Stay.updateMany({ owner: { $exists: false } }, { owner: demo._id, rooms: 12 });
  if (!(await Coupon.exists({}))) await Coupon.insertMany([{ code: 'WELCOME10', percent: 10, maxDiscount: 1000, validTill: new Date(Date.now() + 365 * 864e5) }, { code: 'KARNATAKA15', percent: 15, maxDiscount: 2000, validTill: new Date(Date.now() + 365 * 864e5) }]);
}
let filling = false;
async function backfillImages() {   // fills missing destination photos from Wikimedia (needs internet)
  if (filling) return; filling = true;
  try { for (const d of await Destination.find({ $or: [{ image: { $exists: false } }, { image: '' }] })) { const r = await Region.findById(d.region), u = await wikiImage(d.name, r?.name || '');
    if (u) { d.image = u; await d.save(); } await new Promise(x => setTimeout(x, 300)); } } finally { filling = false; } }
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/onestate').then(async () => {
  await seed(); await seedExtras();
  if (!(await Meta.exists({ key: 'img-v2' }))) {   // one-time: drop auto-filled Wikimedia images chosen by the old, looser matcher so they are refetched with title matching
    await Destination.updateMany({ image: /upload\.wikimedia\.org/ }, { $set: { image: '' } }); await Meta.create({ key: 'img-v2' }); }
  if (!(await User.exists({ role: 'admin' }))) {
    const ae = (process.env.ADMIN_EMAIL || 'admin@onestate.com').toLowerCase();
    await User.create({ name: 'Admin', email: ae, role: 'admin', hash: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@12345', 10) });
    console.log(`Admin account created: ${ae} (set ADMIN_EMAIL / ADMIN_PASSWORD to change)`); }
  const PORT = process.env.PORT || 3000; app.listen(PORT, () => { console.log('API on port ' + PORT); backfillImages(); });
}).catch(e => { console.error('MongoDB connection failed:', e.message); process.exit(1); });