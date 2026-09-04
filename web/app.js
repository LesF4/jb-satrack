/* JB-SATRACK — logique de suivi (SGP4 via satellite.js, calculs côté navigateur) */
'use strict';

const C = 299792.458;                 // km/s
const D = Math.PI / 180;
const S = {
  station: null, catalog: null, tle: null,
  tracked: null,                      // {sat, mode, rec, name}
  passes: [], selectedPass: null, observer: null, tleInfo: null
};

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const hhmm = d => pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
const tzOf = () => (S.station && S.station.timezone) || 'Europe/Paris';
const hhmmssLoc = d => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: tzOf() });
const hhmmLoc = d => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tzOf() });
const fmt = (n, d = 0) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const mhz = f => Number(f).toFixed(4);
const dur = s => s >= 3600 ? (Math.floor(s / 3600) + ' h ' + pad(Math.round(s % 3600 / 60)))
                           : (Math.floor(s / 60) + ':' + pad(Math.round(s % 60)));

/* ------------------------------------------------------------ propagation */
function stateAt(rec, date) {
  const pv = satellite.propagate(rec, date);
  if (!pv || !pv.position) return null;
  const gmst = satellite.gstime(date);
  const geo = satellite.eciToGeodetic(pv.position, gmst);
  const ecf = satellite.eciToEcf(pv.position, gmst);
  const look = satellite.ecfToLookAngles(S.observer, ecf);
  const v = pv.velocity;
  return {
    lat: satellite.degreesLat(geo.latitude),
    lon: satellite.degreesLong(geo.longitude),
    alt: geo.height,
    az: look.azimuth / D,
    el: look.elevation / D,
    range: look.rangeSat,
    speed: Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
  };
}

function elevationAt(rec, ms) {
  const s = stateAt(rec, new Date(ms));
  return s ? s.el : -90;
}

function rangeRate(rec, date) {                     // km/s (+ = s'éloigne)
  const dt = 1000;
  const a = stateAt(rec, new Date(date.getTime() - dt));
  const b = stateAt(rec, new Date(date.getTime() + dt));
  if (!a || !b) return 0;
  return (b.range - a.range) / (2 * dt / 1000);
}

/* frequence a afficher, corrigee du Doppler */
const rxTune = (f, rr) => f * (1 - rr / C);
const txTune = (f, rr) => f * (1 + rr / C);

/* ------------------------------------------------------------- prédiction */
function findPasses(rec, fromMs, hours, minEl) {
  const out = [];
  const end = fromMs + hours * 3600e3;
  const STEP = 30e3;
  let prevEl = elevationAt(rec, fromMs), t = fromMs + STEP;

  while (t < end) {
    const el = elevationAt(rec, t);
    if (prevEl <= 0 && el > 0) {                       // AOS entre t-STEP et t
      const aos = refine(rec, t - STEP, t);
      let tt = t, maxEl = el, maxT = t, lastEl = el;
      while (tt < end) {
        tt += STEP;
        const e = elevationAt(rec, tt);
        if (e > maxEl) { maxEl = e; maxT = tt; }
        if (lastEl > 0 && e <= 0) break;
        lastEl = e;
      }
      const los = refine(rec, tt - STEP, tt);
      // affinage du maximum (pas de 5 s)
      for (let k = maxT - STEP; k <= maxT + STEP; k += 5000) {
        const e = elevationAt(rec, k);
        if (e > maxEl) { maxEl = e; maxT = k; }
      }
      if (maxEl >= minEl && los > aos) {
        out.push({ aos, los, tca: maxT, maxEl, duration: (los - aos) / 1000 });
      }
      t = los + 60e3;
      prevEl = elevationAt(rec, t);
      continue;
    }
    prevEl = el;
    t += STEP;
  }
  return out;
}

function refine(rec, lo, hi) {                        // bisection sur el = 0
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (elevationAt(rec, mid) > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/* qualité d'un passage vu d'une antenne omni fixe */
function quality(maxEl, cone) {
  if (maxEl < 10) return { k: 'poor', t: 'Rasant', why: 'Trop bas : obstacles et trajet atmosphérique long.' };
  if (maxEl < 20) return { k: 'ok', t: 'Basse', why: 'Passage bas mais exploitable en omni.' };
  if (maxEl > cone) return { k: 'ok', t: 'Zénith', why: 'Culmine dans le cône de silence de l\'antenne verticale : creux possible au TCA.' };
  return { k: 'good', t: 'Bonne', why: 'Élévation idéale pour une omni verticale.' };
}

/* ---------------------------------------------------------- plan Doppler */
function dopplerPlan(pass, rec, mode) {
  if (!mode || !mode.down) return [];
  const stepKhz = (S.station.rig && S.station.rig.tuning_step_khz) || 5;
  const stepMhz = stepKhz / 1000;
  const round = f => Math.round(f / stepMhz) * stepMhz;
  const N = 60, seg = [];
  for (let i = 0; i <= N; i++) {
    const t = pass.aos + (pass.los - pass.aos) * (i / N);
    const rr = rangeRate(rec, new Date(t));
    const rx = round(rxTune(mode.down, rr));
    const tx = mode.up ? round(txTune(mode.up, rr)) : null;
    const last = seg[seg.length - 1];
    if (last && Math.abs(last.rx - rx) < 1e-9 && (tx === null || Math.abs(last.tx - tx) < 1e-9)) {
      last.end = t;
    } else {
      seg.push({ start: t, end: t, rx, tx });
    }
  }
  return seg;
}

/* ------------------------------------------------------------------- rendu */
function renderHeader() {
  const st = S.station;
  $('callsign').textContent = st.callsign;
  $('locatorval').textContent = st.locator;
  $('city').textContent = st.city || '';
  $('antbadge').textContent = 'Antenne ' + st.antenna.type + ' · ' + st.antenna.height_m + ' m';
  $('rigbadge').textContent = st.rig.model;
  const info = S.tleInfo;
  const el = $('tlestatus');
  if (!info || !info.count) { el.textContent = 'TLE indisponibles'; el.className = 'tlestat bad'; return; }
  const h = info.age_s === null ? '?' : Math.round(info.age_s / 3600);
  el.textContent = info.count + ' TLE · maj il y a ' + h + ' h' + (info.stale ? ' (cache)' : '');
  el.className = 'tlestat ' + (info.stale ? 'warn' : 'ok');
}

function renderPassTable() {
  const tb = $('passtable');
  tb.innerHTML = '';
  S.passes.slice(0, 40).forEach((p, i) => {
    const q = quality(p.maxEl, S.station.antenna.cone_of_silence_deg || 75);
    const tr = document.createElement('tr');
    tr.className = (S.selectedPass === p ? 'sel' : '');
    tr.innerHTML =
      '<td class="satcell"><span class="satdot" style="background:' + p.color + '"></span>' + p.satName + '</td>' +
      '<td>' + p.modeLabel + '</td>' +
      '<td>' + hhmmLoc(new Date(p.aos)) + '<span class="loc"> ' + hhmm(new Date(p.aos)) + ' UTC</span></td>' +
      '<td class="num">' + p.maxEl.toFixed(0) + '°</td>' +
      '<td class="num">' + dur(p.duration) + '</td>' +
      '<td>' + (p.mode.down ? mhz(p.mode.down) : '—') + '</td>' +
      '<td><span class="q ' + q.k + '" title="' + q.why + '">● ' + q.t + '</span></td>';
    tr.onclick = () => selectPass(p);
    tb.appendChild(tr);
  });
}

function selectPass(p) {
  S.selectedPass = p;
  S.tracked = { rec: p.rec, name: p.satName, mode: p.mode, sat: p.sat };
  $('mapsat').textContent = p.sat.name;
  renderNextPass();
  renderPlan();
  renderPassTable();
  drawPolar();
}

function renderNextPass() {
  const p = S.selectedPass;
  if (!p) return;
  const q = quality(p.maxEl, S.station.antenna.cone_of_silence_deg || 75);
  $('nextname').textContent = p.satName;
  $('nextmode').textContent = p.modeLabel;
  $('nextmode').className = 'modepill ' + (p.mode.type === 'linear' ? 'linear' : '');
  $('f-maxel').textContent = p.maxEl.toFixed(0) + '°';
  $('f-maxel').className = 'v ' + (q.k === 'good' ? 'good' : q.k === 'ok' ? 'warn' : '');
  $('f-dur').textContent = p.duration > 3600 ? dur(p.duration) : (Math.floor(p.duration / 60) + ' min ' + pad(Math.round(p.duration % 60)) + ' s');
  const aosSt = stateAt(p.rec, new Date(p.aos)), losSt = stateAt(p.rec, new Date(p.los));
  $('f-az').textContent = (aosSt ? aosSt.az.toFixed(0) : '?') + '° → ' + (losSt ? losSt.az.toFixed(0) : '?') + '°';
  $('f-qual').textContent = q.t;
  $('f-qual').className = 'v ' + (q.k === 'good' ? 'good' : q.k === 'ok' ? 'warn' : '');
  $('passnote').textContent = p.mode.note || '';
  $('ctcssval').textContent = p.mode.ctcss ? ('PL ' + p.mode.ctcss.toFixed(1) + ' Hz') : (p.mode.mod || '');
  $('modval').textContent = p.mode.mod || '';
}

function renderPlan() {
  const p = S.selectedPass;
  const box = $('plangrid');
  if (!p || !p.mode.down) { box.innerHTML = '<div class="step">—</div>'; return; }
  const plan = dopplerPlan(p, p.rec, p.mode);
  S.plan = plan;
  box.innerHTML = plan.map((s, i) =>
    '<div class="step" data-i="' + i + '">' +
    '<div class="when">M-' + pad(i + 1) + ' · ' + hhmmLoc(new Date(s.start)) + ' → ' + hhmmLoc(new Date(s.end)) + '</div>' +
    '<div class="rx">RX ' + mhz(s.rx) + '</div>' +
    '<div class="tx">' + (s.tx ? 'TX ' + mhz(s.tx) : 'écoute seule') + '</div></div>').join('');
  $('planhead').textContent = 'PAS DE ' + ((S.station.rig.tuning_step_khz) || 5) + ' kHz · ' + plan.length + ' MÉMOIRES';
}

/* mémoires au format CSV (importable dans un logiciel de programmation) */
function exportMemories() {
  const p = S.selectedPass;
  if (!p || !S.plan) return;
  const rows = [['Channel', 'Name', 'RX Frequency', 'TX Frequency', 'Mode', 'Tone', 'Comment']];
  S.plan.forEach((s, i) => rows.push([
    i + 1,
    (p.sat.id + '-' + (i + 1)).slice(0, 16),
    mhz(s.rx), s.tx ? mhz(s.tx) : '',
    (p.mode.type === 'linear' ? 'USB' : 'FM'),
    p.mode.ctcss ? p.mode.ctcss.toFixed(1) : '',
    p.satName + ' ' + hhmm(new Date(s.start)) + 'Z'
  ]));
  const csv = rows.map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'memoires-' + p.sat.id + '.csv';
  a.click();
}

/* --------------------------------------------------------------- carte */
const MAP = (function () {
  let map, satMarker, staMarker, linkLine, trackPast, trackFuture, footprint, nightLayer,
      wxLayer = null, lastNight = 0;

  function build() {
    const el = $('worldmap'); if (!el || typeof L === 'undefined') return false;
    map = L.map(el, { worldCopyJump: true }).setView([S.station.lat, S.station.lon], 4);

    L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16,
      attribution: 'Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(map);
    L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16
    }).addTo(map);

    nightLayer = L.polygon([], { stroke: false, fillColor: '#04080f', fillOpacity: 0.55, interactive: false }).addTo(map);
    trackPast = L.polyline([], { color: '#4be3c7', weight: 2, opacity: 0.35, interactive: false }).addTo(map);
    trackFuture = L.polyline([], { color: '#4be3c7', weight: 2.5, opacity: 0.85, interactive: false }).addTo(map);
    footprint = L.polygon([], { color: 'rgba(75,227,199,0.4)', weight: 1.5, fillColor: '#4be3c7', fillOpacity: 0.08, interactive: false }).addTo(map);
    linkLine = L.polyline([], { color: '#ffb454', weight: 1.5, opacity: 0.65, dashArray: '6,6', interactive: false }).addTo(map);

    staMarker = L.marker([S.station.lat, S.station.lon], {
      icon: L.divIcon({ className: '', iconAnchor: [5, 10],
        html: '<div class="sat-icon station"><span class="dot"></span>' + S.station.callsign + '</div>' })
    }).addTo(map);

    satMarker = L.marker([0, 0], {
      icon: L.divIcon({ className: '', iconAnchor: [5, 10], html: '<div class="sat-icon sat"><span class="dot"></span>—</div>' })
    }).addTo(map);

    window.addEventListener('resize', () => map && map.invalidateSize());
    return true;
  }

  function subsolar(now) {
    const d = (now / 86400000) - 10957.5;
    const g = (357.529 + 0.98560028 * d) * D;
    const q = 280.459 + 0.98564736 * d;
    const Lc = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D;
    const dec = Math.asin(Math.sin(23.439 * D) * Math.sin(Lc)) / D;
    let lon = 180 - ((now / 3600000) % 24) * 15;
    lon = ((lon + 180) % 360 + 360) % 360 - 180;
    return { lat: dec, lon };
  }

  /* courbe du terminateur jour/nuit + fermeture par le pôle plongé dans la nuit */
  function nightPolygon(now) {
    const s = subsolar(now);
    let dec = s.lat; if (Math.abs(dec) < 0.2) dec = dec < 0 ? -0.2 : 0.2;
    const decR = dec * D, pts = [];
    for (let lon = -180; lon <= 180; lon += 4) {
      const lat = Math.atan(-Math.cos((lon - s.lon) * D) / Math.tan(decR)) / D;
      pts.push([lat, lon]);
    }
    const darkPole = dec > 0 ? -90 : 90;
    pts.push([darkPole, 180], [darkPole, -180]);
    return pts;
  }

  /* découpe une polyligne lat/lon en segments à chaque franchissement de l'antiméridien */
  function splitAtDateline(points) {
    const segs = []; let seg = [];
    for (const p of points) {
      if (seg.length && Math.abs(p[1] - seg[seg.length - 1][1]) > 180) { segs.push(seg); seg = []; }
      seg.push(p);
    }
    if (seg.length) segs.push(seg);
    return segs;
  }

  function draw() {
    if (!map || !S.tracked) return;
    const now = Date.now();
    if (now - lastNight > 60000) { nightLayer.setLatLngs(nightPolygon(now)); lastNight = now; }
    const rec = S.tracked.rec;
    const st = stateAt(rec, new Date(now));
    if (!st) return;

    // trace au sol : une orbite avant / après
    const period = 2 * Math.PI / rec.no * 60 * 1000;   // no en rad/min
    const past = [], future = [];
    for (let dt = -period; dt <= 0; dt += period / 90) { const p = stateAt(rec, new Date(now + dt)); if (p) past.push([p.lat, p.lon]); }
    for (let dt = 0; dt <= period; dt += period / 90) { const p = stateAt(rec, new Date(now + dt)); if (p) future.push([p.lat, p.lon]); }
    trackPast.setLatLngs(splitAtDateline(past));
    trackFuture.setLatLngs(splitAtDateline(future));

    // empreinte radio
    const RE = 6371, r = RE + st.alt, foot = Math.acos(RE / r), ring = [];
    for (let a = 0; a <= 360; a += 3) {
      const br = a * D;
      const la = Math.asin(Math.sin(st.lat * D) * Math.cos(foot) + Math.cos(st.lat * D) * Math.sin(foot) * Math.cos(br));
      const lo = st.lon * D + Math.atan2(Math.sin(br) * Math.sin(foot) * Math.cos(st.lat * D), Math.cos(foot) - Math.sin(st.lat * D) * Math.sin(la));
      ring.push([la / D, ((lo / D + 180) % 360 + 360) % 360 - 180]);
    }
    footprint.setLatLngs(splitAtDateline(ring));

    // station, satellite, liaison
    satMarker.setLatLng([st.lat, st.lon]);
    satMarker.setIcon(L.divIcon({ className: '', iconAnchor: [5, 10],
      html: '<div class="sat-icon sat"><span class="dot"></span>' + S.tracked.name.split(' ')[0] + '</div>' }));
    linkLine.setLatLngs(st.el > 0 ? [[S.station.lat, S.station.lon], [st.lat, st.lon]] : []);

    // lectures + Doppler live
    const rr = rangeRate(rec, new Date(now));
    $('ro-dist').innerHTML = fmt(st.range, 0) + ' <small>km</small>';
    $('ro-speed').innerHTML = fmt(st.speed * 3600, 0) + ' <small>km/h</small>';
    $('ro-alt').innerHTML = fmt(st.alt, 0) + ' <small>km</small>';
    $('ro-pos').textContent = Math.abs(st.lat).toFixed(1) + '°' + (st.lat >= 0 ? 'N' : 'S') + ' ' +
      Math.abs(st.lon).toFixed(1) + '°' + (st.lon >= 0 ? 'E' : 'O');
    $('ro-azel').textContent = st.az.toFixed(0) + '° / ' + st.el.toFixed(1) + '°';
    const vis = $('ro-vis');
    vis.textContent = st.el > 0 ? 'EN VUE' : 'sous horizon';
    vis.className = st.el > 0 ? 'v live' : 'v';

    const m = S.tracked.mode;
    if (m && m.down) {
      $('rxfreq').textContent = mhz(rxTune(m.down, rr));
      $('rxdop').textContent = (rr <= 0 ? '▲ +' : '▼ ') + fmt(-rr / C * m.down * 1000, 1) + ' kHz Doppler';
      $('txfreq').textContent = m.up ? mhz(txTune(m.up, rr)) : '—';
      $('txdop').textContent = m.up ? ((rr <= 0 ? '▼ ' : '▲ +') + fmt(rr / C * m.up * 1000, 1) + ' kHz Doppler') : 'écoute seule';
    }
    // surlignage du pas de tuning courant
    if (S.plan) document.querySelectorAll('#plangrid .step').forEach((el, i) => {
      const s = S.plan[i];
      el.className = 'step' + (s && now >= s.start && now <= s.end ? ' now' : '');
    });
  }

  function setWeather(points) {
    if (!map) return;
    if (wxLayer) wxLayer.clearLayers(); else wxLayer = L.layerGroup().addTo(map);
    (points || []).forEach(p => {
      if (p.lat == null || p.lon == null) return;
      const marker = L.marker([p.lat, p.lon], {
        icon: L.divIcon({ className: '', iconAnchor: [14, 14],
          html: '<div class="wx-icon">' + p.icon + '<div class="t">' + (p.temp != null ? Math.round(p.temp) + '°' : '—') + '</div></div>' })
      });
      marker.bindPopup(
        '<b>' + p.dir + '</b><br>' + p.label +
        '<br>' + (p.temp != null ? p.temp.toFixed(1) + ' °C' : '—') +
        ' · vent ' + (p.wind != null ? Math.round(p.wind) + ' km/h' : '—') +
        '<br>nébulosité ' + (p.cloud != null ? p.cloud + ' %' : '—')
      );
      wxLayer.addLayer(marker);
    });
  }

  return { build, draw, setWeather };
})();

/* ------------------------------------------------------------------ boucle */
function tickClock() {
  const d = new Date();
  $('localclock').textContent = hhmmssLoc(d);
  const p = S.selectedPass;
  if (p) {
    const now = Date.now();
    const target = now < p.aos ? p.aos : p.los;
    const label = now < p.aos ? 'avant AOS' : 'avant LOS';
    let s = Math.max(0, Math.round((target - now) / 1000));
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    $('countdown').textContent = pad(h) + ':' + pad(m) + ':' + pad(s);
    $('cdlabel').textContent = label + ' — AOS ' + hhmmssLoc(new Date(p.aos)) + ' loc.';
    $('countdown').classList.toggle('live', now >= p.aos && now <= p.los);
    if (now > p.los + 5000) computeAll();       // passage terminé : on recalcule
  }
}

/* --------------------------------------------------------------- amorçage */
async function boot() {
  try {
    const [station, catalog, tle] = await Promise.all([
      fetch('/api/station').then(r => r.json()),
      fetch('/api/satellites').then(r => r.json()),
      fetch('/api/tle').then(r => r.json())
    ]);
    S.station = station; S.catalog = catalog; S.tle = tle.sats || {}; S.tleInfo = tle;
    S.observer = {
      longitude: station.lon * D, latitude: station.lat * D,
      height: (station.alt_m + (station.antenna.height_m || 0)) / 1000
    };
    renderHeader();
    if (typeof satellite === 'undefined') {
      $('banner').textContent = 'satellite.js non chargé : le serveur n\'a pas pu le télécharger. Vérifie la connexion internet de JB-SERVER puis recharge.';
      $('banner').className = 'previewtag bad';
      return;
    }
    if (typeof L === 'undefined') {
      $('banner').textContent = 'Leaflet non chargé : le serveur n\'a pas pu le télécharger. Vérifie la connexion internet de JB-SERVER puis recharge.';
      $('banner').className = 'previewtag bad';
      return;
    }
    computeAll();
    MAP.build();
    loadIssStatus();
    loadWeather();
    setInterval(tickClock, 1000); tickClock();
    setInterval(() => { MAP.draw(); drawPolar(); }, 1000); MAP.draw();
    setInterval(computeAll, 15 * 60 * 1000);
    setInterval(loadIssStatus, 30 * 60 * 1000);
    setInterval(loadWeather, 30 * 60 * 1000);
    setInterval(reloadTle, 30 * 60 * 1000);      // le serveur rafraîchit toutes les heures
  } catch (e) {
    $('banner').textContent = 'Erreur de démarrage : ' + e.message;
    $('banner').className = 'previewtag bad';
  }
}

async function reloadTle() {
  try {
    const t = await fetch('/api/tle').then(r => r.json());
    if (t && t.count) { S.tle = t.sats; S.tleInfo = t; renderHeader(); computeAll(); }
  } catch (e) { /* réseau indisponible : on garde les TLE en mémoire */ }
}

function matchTle(sat) {
  const keys = Object.keys(S.tle);
  for (const alias of sat.match) {
    const hit = keys.find(k => k.toUpperCase().indexOf(alias.toUpperCase()) >= 0);
    if (hit) return S.tle[hit];
  }
  if (sat.norad) {
    const hit = keys.find(k => S.tle[k].norad === sat.norad);
    if (hit) return S.tle[hit];
  }
  return null;
}

const COLORS = ['#4be3c7', '#ffb454', '#b7a6ff', '#63e6a0', '#8ab4ff', '#ff9a8a'];

function computeAll() {
  const from = Date.now();
  const hours = S.station.forecast_hours || 48;
  const minEl = S.station.min_elevation_deg || 5;
  const all = [];
  const missing = [];

  S.catalog.satellites.forEach((sat, idx) => {
    const t = matchTle(sat);
    if (!t) { missing.push(sat.name); return; }
    let rec;
    try { rec = satellite.twoline2satrec(t.l1, t.l2); } catch (e) { return; }
    if (!rec || rec.error) return;
    const passes = findPasses(rec, from, hours, minEl);
    const mode = sat.modes[0];
    passes.forEach(p => all.push(Object.assign(p, {
      sat, rec, mode, satName: sat.name.split(' (')[0],
      modeLabel: shortMode(mode), color: COLORS[idx % COLORS.length]
    })));
  });

  all.sort((a, b) => a.aos - b.aos);
  S.passes = all;
  const live = all.find(p => Date.now() >= p.aos && Date.now() <= p.los);
  selectPass(live || all[0] || null);
  renderPassTable();
  $('missing').textContent = missing.length ? ('TLE absents : ' + missing.join(', ')) : '';
  $('passcount').textContent = all.length + ' passages / ' + hours + ' h';
}

function shortMode(m) {
  if (m.type === 'linear') return 'Linéaire SSB';
  if (m.type === 'digi') return 'Digipeater';
  if (m.type === 'sstv') return 'SSTV';
  return 'FM ' + (m.up && m.down && m.up < 200 ? 'V/U' : 'U/V');
}

/* ---------------------------------------------------------------- météo */
async function loadWeather() {
  let data;
  try { data = await fetch('/api/weather').then(r => r.json()); }
  catch (e) { data = { points: [], error: e.message }; }
  S.weather = data;
  $('wxradius').textContent = data.radius_km || S.station.weather_radius_km || 100;
  MAP.setWeather(data.points || []);
}

/* ------------------------------------------------------------- statut ISS */
const ISS_STATE_LABEL = { active: 'EN SERVICE', off: 'HORS SERVICE', scheduled: 'PROGRAMMÉ', idle: 'AU REPOS', unknown: 'INCONNU' };

async function loadIssStatus() {
  let data;
  try { data = await fetch('/api/iss-status').then(r => r.json()); }
  catch (e) { data = { modes: {}, error: e.message }; }
  S.iss = data;

  const grid = $('issgrid');
  const modes = data.modes || {};
  const order = ['aprs', 'repeater', 'voice', 'sstv'];
  const keys = order.filter(k => modes[k]);

  if (!keys.length) {
    grid.innerHTML = '<div class="issmode"><span class="statepill unknown">INCONNU</span>' +
      '<div class="lab">Statut ARISS indisponible</div><div class="ex">' +
      (data.error || 'Page non lue. Vérifie la connexion de JB-SERVER.') + '</div></div>';
  } else {
    grid.innerHTML = keys.map(k => {
      const m = modes[k];
      const f = m.freq ? mhz(m.freq) : (m.down ? mhz(m.down) + (m.up ? ' / ' + mhz(m.up) : '') : '—');
      return '<div class="issmode"><span class="statepill ' + m.state + '">' + (ISS_STATE_LABEL[m.state] || m.state) + '</span>' +
        '<div class="lab">' + m.label + '</div><div class="fq">' + f + (m.ctcss ? ' · PL ' + m.ctcss.toFixed(1) : '') + '</div>' +
        '<div class="ex">' + (m.excerpt || '') + '</div></div>';
    }).join('');
  }

  if (data.outages && data.outages.length) {
    grid.insertAdjacentHTML('beforeend',
      '<div class="issmode"><span class="statepill scheduled">COUPURES</span>' +
      '<div class="lab">Extinctions programmées</div><div class="ex">' +
      data.outages.map(o => '• ' + o).join('<br>') + '</div></div>');
  }

  const age = data.checked_at ? Math.round((Date.now() / 1000 - data.checked_at) / 60) : null;
  $('isscheck').textContent = age === null ? 'NON RELEVÉ' :
    ('RELEVÉ IL Y A ' + age + ' MIN' + (data.stale ? ' · CACHE' : ''));

  applyIssOverrides();
}

/* la fréquence APRS de l'ISS change selon la radio utilisée (145.825 ou 437.825) */
function applyIssOverrides() {
  if (!S.iss || !S.catalog) return;
  const iss = S.catalog.satellites.find(s => s.id === 'ISS');
  if (!iss) return;
  const m = S.iss.modes || {};
  iss.modes.forEach(mode => {
    if (mode.type === 'digi' && m.aprs) {
      if (m.aprs.freq) { mode.up = m.aprs.freq; mode.down = m.aprs.freq; }
      mode.state = m.aprs.state;
      mode.note = (m.aprs.state === 'off' ? '⚠ APRS signalé hors service par ARISS. ' : '') + (m.aprs.excerpt || mode.note);
    }
    if (mode.type === 'fm' && mode.label.indexOf('Répéteur') === 0 && m.repeater) {
      if (m.repeater.up) mode.up = m.repeater.up;
      if (m.repeater.down) mode.down = m.repeater.down;
      mode.state = m.repeater.state;
      mode.note = m.repeater.excerpt || mode.note;
    }
    if (mode.type === 'sstv' && m.sstv) {
      mode.state = m.sstv.state;
      mode.note = m.sstv.excerpt || mode.note;
    }
  });
  // le mode ISS mis en avant = celui qui est actif
  const actif = iss.modes.find(x => x.state === 'active');
  if (actif) { iss.modes = [actif].concat(iss.modes.filter(x => x !== actif)); }
  if (S.passes.length) { renderPassTable(); renderNextPass(); }
}

/* ------------------------------------------------------- trajectoire Az/El */
function drawPolar() {
  const cv = $('polar'), p = S.selectedPass;
  if (!cv) return;
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, R = W / 2 - 30;
  ctx.clearRect(0, 0, W, H);
  const proj = (az, el) => {
    const r = Math.max(0, (90 - el) / 90) * R;
    return [cx + r * Math.sin(az * D), cy - r * Math.cos(az * D)];
  };
  // cercles d'élévation
  ctx.strokeStyle = '#1e2c46'; ctx.lineWidth = 2;
  [0, 30, 60].forEach(el => {
    ctx.beginPath(); ctx.arc(cx, cy, (90 - el) / 90 * R, 0, 6.283); ctx.stroke();
  });
  ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
  // cône de silence
  const cone = S.station.antenna.cone_of_silence_deg || 75;
  ctx.beginPath(); ctx.setLineDash([6, 6]); ctx.strokeStyle = '#5a3f1c';
  ctx.fillStyle = 'rgba(255,180,84,0.07)';
  ctx.arc(cx, cy, (90 - cone) / 90 * R, 0, 6.283); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
  // points cardinaux
  ctx.fillStyle = '#5b7085'; ctx.font = '600 22px JetBrains Mono, monospace'; ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy - R - 8); ctx.fillText('S', cx, cy + R + 26);
  ctx.fillText('E', cx + R + 16, cy + 8); ctx.fillText('O', cx - R - 16, cy + 8);
  if (!p) return;

  // trajectoire
  if (!S.polarPath || S.polarPathFor !== p) {
    const pts = [];
    for (let i = 0; i <= 120; i++) {
      const t = p.aos + (p.los - p.aos) * (i / 120);
      const s = stateAt(p.rec, new Date(t));
      if (s && s.el >= -1) pts.push([s.az, s.el, t]);
    }
    S.polarPath = pts; S.polarPathFor = p;
  }
  ctx.beginPath(); ctx.strokeStyle = '#4be3c7'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  S.polarPath.forEach((q, i) => { const [x, y] = proj(q[0], q[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();
  if (S.polarPath.length) {
    const a = proj(S.polarPath[0][0], S.polarPath[0][1]);
    const b = proj(S.polarPath[S.polarPath.length - 1][0], S.polarPath[S.polarPath.length - 1][1]);
    ctx.fillStyle = '#4be3c7'; ctx.beginPath(); ctx.arc(a[0], a[1], 8, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#245a52'; ctx.beginPath(); ctx.arc(b[0], b[1], 8, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#5b7085'; ctx.font = '500 18px JetBrains Mono, monospace';
    ctx.fillText('AOS', a[0], a[1] - 16); ctx.fillText('LOS', b[0], b[1] - 16);
  }
  // position courante
  const now = Date.now();
  if (now >= p.aos && now <= p.los) {
    const s = stateAt(p.rec, new Date(now));
    if (s && s.el > 0) {
      const [x, y] = proj(s.az, s.el);
      ctx.beginPath(); ctx.fillStyle = '#ffb454'; ctx.shadowColor = '#ffb454'; ctx.shadowBlur = 14;
      ctx.arc(x, y, 11, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
    }
  }
}

/* --------------------------------------------------------------- journal */
async function saveQso() {
  const p = S.selectedPass;
  const body = {
    call: ($('q-call').value || '').toUpperCase(),
    grid: $('q-grid').value || '',
    rst_s: $('q-rsts').value || '59',
    rst_r: $('q-rstr').value || '59',
    sat: p ? p.sat.id : '',
    mode: p && p.mode.type === 'linear' ? 'SSB' : 'FM',
    freq: p && p.mode.down ? mhz(p.mode.down) : '',
    band: p && p.mode.down && p.mode.down > 300 ? '70CM' : '2M',
    note: $('q-note').value || ''
  };
  if (!body.call) return;
  await fetch('/api/qso', { method: 'POST', body: JSON.stringify(body) });
  $('q-call').value = ''; $('q-grid').value = ''; $('q-note').value = '';
  $('qsomsg').textContent = 'QSO enregistré : ' + body.call;
  setTimeout(() => $('qsomsg').textContent = '', 4000);
}

window.addEventListener('DOMContentLoaded', () => {
  $('btn-mem').onclick = exportMemories;
  $('btn-qso').onclick = saveQso;
  $('btn-refresh').onclick = async () => {
    $('btn-refresh').textContent = '...';
    await fetch('/api/tle/refresh');
    const t = await fetch('/api/tle').then(r => r.json());
    S.tle = t.sats; S.tleInfo = t; renderHeader(); computeAll();
    $('btn-refresh').textContent = 'Rafraîchir TLE';
  };
  boot();
});
