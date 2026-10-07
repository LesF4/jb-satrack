/* JB-SATRACK — logique de suivi (SGP4 via satellite.js, calculs côté navigateur) */
'use strict';

const C = 299792.458;                 // km/s
const D = Math.PI / 180;
const S = {
  station: null, catalog: null, tle: null,
  tracked: null,                      // {sat, mode, rec, name}
  passes: [], selectedPass: null, observer: null, tleInfo: null, tleError: null
};

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const hhmm = d => pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
const tzOf = () => (S.station && S.station.timezone) || 'Europe/Paris';
const hhmmssLoc = d => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: tzOf() });
const hhmmLoc = d => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tzOf() });
const fmt = (n, d = 0) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const mhz = f => Number(f).toFixed(4);
/* dur() rend « 4:12 », bon pour un tableau, illisible dans une phrase */
const durLong = s => s >= 3600
  ? Math.floor(s / 3600) + ' h ' + pad(Math.round(s % 3600 / 60))
  : Math.floor(s / 60) + ' min ' + pad(Math.round(s % 60)) + ' s';
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
  /* Satellite déjà levé au moment du calcul : sans ce retour en arrière, son
     passage en cours disparaissait (seuls les levers sont détectés) — IO-117 à 8°
     le 24/09 à 15:25, bandeau « Rien au-dessus de toi ». On remonte jusqu'à son
     lever (3 h au plus : un passage LEO/MEO dure bien moins). */
  if (prevEl > 0) {
    let back = fromMs;
    while (elevationAt(rec, back) > 0 && back > fromMs - 3 * 3600e3) back -= STEP;
    prevEl = elevationAt(rec, back); t = back + STEP;
  }

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
        // aos/los = horizon géométrique (0°). workStart/workEnd = instants où le
        // satellite franchit min_elevation_deg : c'est la fenêtre RÉELLEMENT
        // exploitable, celle que montrent l'empreinte radio et la liaison sur la
        // carte. Le bandeau d'orientation se cale dessus, pas sur aos/los.
        const workStart = crossEl(rec, aos, maxT, minEl);
        const workEnd = crossEl(rec, maxT, los, minEl);
        out.push({ aos, los, tca: maxT, maxEl, duration: (los - aos) / 1000, workStart, workEnd });
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
  /* Au lever comme au coucher : avant le 24/09 le coucher restait collé à lo,
     LOS jusqu'à 30 s trop tôt. */
  const upAtLo = elevationAt(rec, lo) > 0;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if ((elevationAt(rec, mid) > 0) !== upAtLo) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/* Instant entre tA et tB où l'élévation vaut `target` (un seul croisement
   supposé dans l'intervalle). Sert à trouver la fenêtre exploitable (>= minEl). */
function crossEl(rec, tA, tB, target) {
  let lo = tA, hi = tB;
  const sideA = elevationAt(rec, lo) >= target;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if ((elevationAt(rec, mid) >= target) === sideA) lo = mid; else hi = mid;
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
  $('antbadge').querySelector('.t').textContent = st.antenna.type + ' · ' + st.antenna.height_m + ' m';
  $('rigbadge').querySelector('.t').textContent = st.rig.model;
  /* la bande matériel se remplit depuis station.json au lieu d'être écrite en dur */
  const g = (id, txt) => { const e = $(id); if (e) e.innerHTML = txt; };
  g('gear-ant', st.antenna.type + ' · ' + st.antenna.height_m + ' m sol<br>' +
    (st.antenna.rotor ? 'Rotor' : 'Pas de rotor — aucune orientation à faire'));
  g('gear-rig', st.rig.model + '<br>' +
    (st.rig.cat ? 'Doppler piloté par CAT' : 'Doppler à la molette (pas de commande CAT)'));
  g('gear-sc', (st.rig.soundcard || '—') + '<br>Audio + PTT — APRS, SSTV, télémétrie');
  renderTleChip();
}

/* L'âge des TLE, dérivé de fetched_at (horodatage absolu renvoyé par le serveur)
   et recalculé à chaque seconde par tickClock — donc il AVANCE tout seul, et un
   rafraîchissement réussi le remet à « il y a 0 s » parce que fetched_at a
   changé côté serveur, pas parce qu'on a réécrit un libellé. */
function tleAge(sec) {
  if (sec < 60) return 'il y a ' + Math.floor(sec) + ' s';
  if (sec < 3600) return 'il y a ' + Math.floor(sec / 60) + ' min';
  if (sec < 86400) return 'il y a ' + Math.floor(sec / 3600) + ' h ' + pad(Math.floor(sec % 3600 / 60));
  return 'il y a ' + Math.floor(sec / 86400) + ' j ' + Math.floor(sec % 86400 / 3600) + ' h';
}

function renderTleChip() {
  const el = $('tlestatus'); if (!el) return;
  const t = el.querySelector('.t');
  const info = S.tleInfo;
  /* className complet, sinon la puce perd son habillage : c'était le bug du badge TLE */
  if (!info || !info.count) {
    t.textContent = 'TLE indisponibles'; el.className = 'chip bad';
    el.title = S.tleError || 'Aucun TLE chargé — vérifie la connexion de JB-SERVER.';
    return;
  }
  const age = info.fetched_at
    ? tleAge(Math.max(0, Date.now() / 1000 - info.fetched_at))
    : 'fichier de secours';
  t.textContent = info.count + ' TLE · ' + age + (info.stale ? ' · cache' : '');
  el.className = 'chip ' + (info.stale ? 'warn' : 'ok');
  /* le survol dit POURQUOI c'est en cache, et quoi faire */
  el.title = info.stale
    ? (S.tleError ? 'Dernière mise à jour : ' + S.tleError + '. ' : '') +
      info.count + ' satellites servis depuis le cache local. Clique sur « Rafraîchir » pour réessayer.'
    : info.count + ' satellites, TLE téléchargés ' + age + '.';
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
      '<td><span class="q ' + q.k + '" title="' + q.why + '">' + q.t + '</span></td>';
    tr.onclick = () => selectPass(p);
    tb.appendChild(tr);
  });
}

function selectPass(p) {
  if (!p) {                                   // aucun passage sur l'horizon de prédiction
    S.selectedPass = null; S.tracked = null;
    $('nextname').textContent = 'Aucun passage prévu';
    $('nextmode').textContent = '—';
    $('countdown').textContent = '--:--:--';
    $('cdlabel').textContent = 'Rien sur les ' + ((S.station && S.station.forecast_hours) || 48) + ' prochaines heures';
    renderOrient(); renderPassTable();
    return;
  }
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
  $('passnote').textContent = p.mode.note || 'Pas de note pour ce mode.';
  const pm = $('polar-meta'); if (pm) pm.textContent = 'culmine à ' + p.maxEl.toFixed(0) + '°';
  renderOrient();
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

/* L'export des mémoires est plus bas, au format CHIRP (exportChirp). L'ancien
   CSV générique n'était lu par aucun logiciel de programmation réel. */

/* --------------------------------------------------------------- carte */
const MAP = (function () {
  let map, satMarker, staMarker, linkLine, trackPast, trackFuture, footprint, nightLayer,
      wxLayer = null, lastNight = 0;

  const WORLD = [[-85.0511, -180], [85.0511, 180]];
  const IMAGERY = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const LABELS  = 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
  const WHEEL_PX = 250;   // px de molette par niveau — rendu exactement (mesuré)
  const PINCH_PX = 60;    // px de pincement trackpad par niveau — deltas bien plus fins
  /* Suivi = CENTRAGE, pas confinement. Les 90 px de zone morte de
     docs/design/DECISIONS.md ont été mesurés à ~60× la vitesse réelle : là, un
     recentrage continu coûtait cher. En usage réel le satellite avance ~1,5 px/s
     au zoom 4 — la carte glisse d'un pixel et demi par seconde, ça ne coûte
     rien et ça garde le satellite au centre. Il reste une zone morte de 2 px :
     c'est le bruit d'arrondi de panBy, pas une marge de cadrage. */
  const DEADZONE = 2, TAU = 260;   // px · ms
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let follow = true, flying = false, primedFor = null,
      resid = null, satAt = null, satT = 0;

  function build() {
    const el = $('worldmap'); if (!el || typeof L === 'undefined') return false;
    map = L.map(el, {
      worldCopyJump: false,       // le monde est unique : plus de duplication au dézoom
      zoomSnap: 0,                // zoom fractionnaire continu — la carte suit le geste
      zoomDelta: 0.5,             // boutons + / − et clavier
      scrollWheelZoom: false,     // molette native débranchée, voir wireWheel()
      maxBoundsViscosity: 1,
      /* Le rendeur SVG de Leaflet découpe les tracés aux limites du viewport
         plus un padding (0.1 par défaut). En agrandissant la fenêtre, la trace
         au sol et l'empreinte restaient coupées jusqu'au prochain zoom, qui
         seul recalculait le découpage. Un padding d'une pleine hauteur d'écran
         laisse de la marge, et draw() est rappelé au redimensionnement. */
      renderer: L.svg({ padding: 1 })
    }).setView([S.station.lat, S.station.lon], 4);
    map.setMaxBounds(WORLD);
    /* les informations de la carte passent en bas à GAUCHE : le coin bas-droit
       est celui des boutons de cadrage, et l'attribution les tronquait */
    map.attributionControl.setPosition('bottomleft');
    /* on ouvre sur le monde entier : la trace au sol en fait le tour */
    map.setView([22, 8], Math.log2(Math.max(el.clientWidth, el.clientHeight) / 256), { animate: false });

    const TO = { maxZoom: 17, noWrap: true, bounds: WORLD,
                 updateWhenZooming: false, updateWhenIdle: false };
    /* Socle permanent : les MÊMES tuiles, figées au zoom natif 3 — 64 tuiles
       couvrent le monde entier, donc elles sont déjà là quoi qu'on fasse.
       Leaflet les étire au zoom : au pire du flou une fraction de seconde,
       jamais le fond nu du conteneur. C'est ça qui supprime le « cut noir ». */
    L.tileLayer(IMAGERY, Object.assign({ maxNativeZoom: 3, keepBuffer: 12 }, TO)).addTo(map);
    L.tileLayer(IMAGERY, Object.assign({ keepBuffer: 4,
      attribution: 'Esri, Maxar, Earthstar Geographics &amp; contributors' }, TO)).addTo(map);
    L.tileLayer(LABELS, Object.assign({ keepBuffer: 4 }, TO)).addTo(map);

    nightLayer = L.polygon([], { stroke: false, fillColor: '#04080f', fillOpacity: 0.55, interactive: false }).addTo(map);
    trackPast = L.polyline([], { color: '#4be3c7', weight: 2, opacity: 0.35, interactive: false }).addTo(map);
    trackFuture = L.polyline([], { color: '#4be3c7', weight: 2.5, opacity: 0.85, interactive: false }).addTo(map);
    footprint = L.polygon([], { color: 'rgba(75,227,199,0.4)', weight: 1.5, fillColor: '#4be3c7', fillOpacity: 0.08, interactive: false }).addTo(map);
    linkLine = L.polyline([], { color: '#ffb454', weight: 1.5, opacity: 0.65, dashArray: '6,6', interactive: false }).addTo(map);

    staMarker = L.marker([S.station.lat, S.station.lon], {
      icon: L.divIcon({ className: '', iconAnchor: [0, 0],
        html: '<div class="sat-icon station">' + Icons.html('Home', { className: 'house', size: 16 }) + S.station.callsign + '</div>' })
    }).addTo(map);

    satMarker = L.marker([0, 0], {
      icon: L.divIcon({ className: '', iconAnchor: [0, 0], html: '<div class="sat-icon sat"><span class="dot"></span>—</div>' })
    }).addTo(map);

    /* Les glyphes textuels « + » et « − » de Leaflet ne peuvent pas être
       centrés : align-items centre la BOÎTE DE LIGNE, pas l'encre, et l'encre
       d'un « − » est une barre posée sur l'axe mathématique — 2,2 px sous le
       centre du bouton (le « + », mesuré, l'est tout autant). On passe donc à
       la banque Reicon : les tracés Plus et Minus sont centrés sur (12,12) de
       leur viewBox, le centrage redevient géométrique. Le nom accessible reste
       porté par le <a> (aria-label et title posés par Leaflet), et l'icône en
       est masquée. */
    for (const z of [['in', 'Plus'], ['out', 'Minus']]) {
      const a = el.querySelector('.leaflet-control-zoom-' + z[0]);
      if (!a) continue;
      a.innerHTML = Icons.html(z[1], { size: 18 });
      a.firstElementChild.setAttribute('aria-hidden', 'true');
    }

    /* Leaflet libelle ses contrôles en anglais ; l'interface est en français. */
    const zc = el.querySelector('.leaflet-control-zoom');
    if (zc) {
      const [zin, zout] = zc.querySelectorAll('a');
      if (zin) { zin.title = 'Zoom avant'; zin.setAttribute('aria-label', 'Zoom avant'); }
      if (zout) { zout.title = 'Zoom arrière'; zout.setAttribute('aria-label', 'Zoom arrière'); }
    }

    wireWheel(el);
    wireFollow(el);
    fitMinZoom();
    watchSize(el);
    return true;
  }

  /* Le rendeur SVG de Leaflet DÉCOUPE chaque tracé aux limites du viewport
     élargi de son padding, et ne recalcule ce découpage que sur « viewreset »
     (L.Renderer._reset → _updatePaths). invalidateSize() n'émet que
     move/moveend : le conteneur SVG est bien redimensionné, mais les attributs
     « d » restent ceux de l'ancienne fenêtre — d'où la trace tronquée qui ne
     réapparaît qu'au premier zoom. On redemande donc le recalcul explicitement.
     ResizeObserver plutôt que window.resize : la carte grandit aussi quand un
     dépliant s'ouvre dans la colonne de gauche, sans que la fenêtre bouge. */
  function onResize() {
    if (!map) return;
    map.invalidateSize({ animate: false });
    fitMinZoom();
    map.fire('viewreset');
    /* la bande d'attribution s'arrête là où commence le groupe de boutons :
       on lui donne sa largeur réelle plutôt qu'une réserve devinée en CSS */
    const btns = document.querySelector('.mapbtns');
    if (btns) $('worldmap').style.setProperty('--map-btns-w',
      Math.ceil(btns.getBoundingClientRect().width) + 1 + 'px');
  }
  function watchSize(el) {
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(onResize).observe(el);
    else window.addEventListener('resize', onResize);
  }

  /* Le monde couvre toujours le conteneur : jamais de vide autour, jamais de
     copies côte à côte. On prend max(largeur, hauteur) et pas la largeur seule,
     sinon un conteneur haut et étroit laisse apparaître le fond. */
  function fitMinZoom() {
    const el = $('worldmap'); if (!el || !map) return;
    const z = Math.log2(Math.max(el.clientWidth, el.clientHeight) / 256);
    map.setMinZoom(z);
    if (map.getZoom() < z) map.setZoom(z, { animate: false });
  }

  /* Molette réécrite. Leaflet sature : dz = 4·log2(2/(1+e^-|n|)) ne dépasse
     jamais 4 niveaux par rafale, et wheelDebounceTime la recoupe avant —
     mesuré à 2 544 px de molette pour 1 seul niveau, et ça se DÉGRADE quand on
     pousse. Ici le gain est linéaire, sans palier : dz = −deltaY / px.
     L'ancre est figée pour toute la rafale, sinon setZoomAround repart de
     l'état de la carte, dont l'origine en pixels est arrondie à chaque vue, et
     l'erreur est multipliée par 2 à chaque niveau (22 px de dérive sur 5). */
  function wireWheel(el) {
    let acc = 0, raf = 0, aLL = null, aPt = null, tLast = 0;
    const flush = () => {
      raf = 0;
      if (!acc || !aLL) return;
      let z = map.getZoom() + acc; acc = 0;
      z = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), z));
      const half = map.getSize().divideBy(2);
      map.setView(map.unproject(map.project(aLL, z).subtract(aPt).add(half), z), z, { animate: false });
    };
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const t = e.timeStamp, pt = map.mouseEventToContainerPoint(e);
      if (!aLL || t - tLast > 250 || Math.abs(pt.x - aPt.x) > 2 || Math.abs(pt.y - aPt.y) > 2) {
        aPt = pt; aLL = map.containerPointToLatLng(pt);
      }
      tLast = t;
      let d = e.deltaY;
      if (e.deltaMode === 1) d *= 16;                     // lignes
      else if (e.deltaMode === 2) d *= el.clientHeight;   // pages
      acc += -d / (e.ctrlKey ? PINCH_PX : WHEEL_PX);      // ctrlKey = pincement trackpad
      if (!raf) raf = requestAnimationFrame(flush);
    }, { passive: false });
  }

  /* La consigne est clampée AVANT d'être demandée, au lieu de laisser
     maxBounds refuser : elle reste atteignable, donc la boucle converge et la
     carte ne tremble pas contre ses bornes près des pôles. */
  function clampPx(pt, z) {
    const half = map.getSize().divideBy(2);
    const nw = map.project(L.latLng(85.0511, -180), z), se = map.project(L.latLng(-85.0511, 180), z);
    const x0 = Math.min(nw.x, se.x) + half.x, x1 = Math.max(nw.x, se.x) - half.x;
    const y0 = Math.min(nw.y, se.y) + half.y, y1 = Math.max(nw.y, se.y) - half.y;
    return L.point(x1 < x0 ? (nw.x + se.x) / 2 : Math.min(Math.max(pt.x, x0), x1),
                   y1 < y0 ? (nw.y + se.y) / 2 : Math.min(Math.max(pt.y, y0), y1));
  }

  /* Suivi : le satellite est CENTRÉ, en continu, avec un amorti léger (τ = 260 ms)
     pour que le glissement reste doux. Le retard en régime établi vaut v·τ,
     soit ~0,4 px à 1,5 px/s : invisible. La machine d'état « rattrapage »
     n'existe plus — elle n'avait de sens qu'avec une grande zone morte.
     Au zoom minimum le monde entier tient dans le conteneur : clampPx bloque
     alors le centre, et le satellite ne PEUT pas être centré. C'est correct, et
     la consigne étant clampée AVANT d'être demandée, la boucle converge sur la
     position bloquée au lieu de trembler contre les bornes. */
  function stepFollow(dt) {
    if (!follow || flying || !map || !S.tracked) return;
    const now = Date.now();
    if (now - satT > 200) {                    // SGP4 à 5 Hz, pas à 60
      const st = stateAt(S.tracked.rec, new Date(now));
      if (!st) return;
      satAt = L.latLng(st.lat, st.lon); satT = now;
    }
    if (!satAt) return;
    const z = map.getZoom();
    const tgt = clampPx(map.project(satAt, z), z);
    const d = tgt.subtract(map.project(map.getCenter(), z));
    /* antiméridien : détecté en pixels, pas en degrés. Avec noWrap la cible est
       réellement à l'autre bout — aucun glissé ne peut y mener, on téléporte. */
    /* premier centrage — au démarrage, ou quand on change de satellite : la vue
       d'ouverture ([22, 8], monde entier) ne doit pas contredire le suivi, et un
       amorti sur une demi-planète serait un long glissement inutile. Saut sec. */
    if (primedFor !== S.tracked) {
      primedFor = S.tracked;
      map.setView(map.unproject(tgt, z), z, { animate: false });
      resid = null; return;
    }
    if (Math.abs(d.x) > 256 * Math.pow(2, z) * 0.4) {
      map.setView(map.unproject(tgt, z), z, { animate: false });
      resid = null; return;
    }
    const drift = Math.hypot(d.x, d.y);
    /* zone morte réduite au bruit d'arrondi : panBy travaille en pixels entiers,
       sous 2 px il n'y a rien à corriger et on évite un aller-retour permanent */
    if (drift < DEADZONE) { resid = null; return; }
    const k = reduceMotion.matches ? 1 : 1 - Math.exp(-dt / TAU);
    const move = L.point(d.x * k, d.y * k).add(resid || L.point(0, 0));
    const r = L.point(Math.round(move.x), Math.round(move.y));
    resid = move.subtract(r);                  // panBy arrondit : on garde le reste
    if (r.x || r.y) map.panBy(r, { animate: false, noMoveStart: true });
  }

  function setFollow(v) {
    follow = v;
    const b = $('btn-follow'); if (!b) return;
    b.setAttribute('aria-pressed', v ? 'true' : 'false');
    b.querySelector('.lbl').textContent = v ? 'Suivi' : 'Reprendre le suivi';
  }
  /* On n'écoute QUE les entrées humaines. Un drapeau autour des mouvements
     programmés devrait couvrir setView, panBy, flyTo, l'inertie post-glissé,
     invalidateSize, le resize et l'animation de zoom — en oublier un casse
     tout. L'ensemble des entrées humaines, lui, est fermé et court.
     Corollaire assumé : les boutons +/− ne coupent pas le suivi (ils zooment
     sur le centre, donc sur le satellite), la molette si (elle est ancrée au
     curseur, c'est un acte de cadrage). */
  function human() {
    if (!follow && !flying) return;
    if (flying) { map.stop(); flying = false; }
    setFollow(false);
  }
  function resumeFollow() {
    if (follow || !satAt || !map) return;
    const z = map.getZoom();
    const tgt = map.unproject(clampPx(map.project(satAt, z), z), z);
    const far = Math.abs(map.project(tgt, z).x - map.project(map.getCenter(), z).x)
                > 256 * Math.pow(2, z) * 0.4;
    resid = null; primedFor = S.tracked;
    setFollow(true);
    if (reduceMotion.matches || far) map.setView(tgt, z, { animate: false });
    else { flying = true; map.flyTo(tgt, z, { duration: 0.9 });
           map.once('moveend', () => { flying = false; }); }
  }
  /* Zoom de la vue « Ma station ». Choisi en regardant les tuiles Esri : à 10 la
     commune est un tapis gris sans rue lisible, à 12 on est déjà dans le
     quartier et le relief vosgien sort du cadre. À 11 la ville tient en entier,
     les axes et le relief autour se lisent, et l'imagerie Esri est encore nette
     à cette échelle partout dans le monde (au-delà, la couverture haute
     résolution devient inégale selon les régions). */
  const HOME_ZOOM = 11;

  /* Cadrer sur la station est un acte de cadrage manuel : ça coupe le suivi,
     exactement comme un glissé. Sinon la carte repartirait aussitôt.
     Vol animé, saut sec si l'utilisateur a demandé moins d'animation. */
  function focusHome() {
    if (!map || !S.station) return;
    human();
    const z = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), HOME_ZOOM));
    const tgt = map.unproject(clampPx(map.project(L.latLng(S.station.lat, S.station.lon), z), z), z);
    if (reduceMotion.matches) { map.setView(tgt, z, { animate: false }); return; }
    flying = true;
    map.flyTo(tgt, z, { duration: 0.9 });
    map.once('moveend', () => { flying = false; });
  }

  function wireFollow(el) {
    map.on('dragstart', human);
    el.addEventListener('wheel', human, { passive: true, capture: true });
    el.addEventListener('dblclick', human);
    el.addEventListener('keydown', (e) => {
      if (/^(Arrow(Up|Down|Left|Right)|\+|-|=|_)$/.test(e.key)) human(); });
    el.addEventListener('touchstart', (e) => { if (e.touches.length > 1) human(); }, { passive: true });
    const b = $('btn-follow');
    if (b) b.addEventListener('click', () => follow ? human() : resumeFollow());
    const bh = $('btn-home'); if (bh) bh.addEventListener('click', focusHome);
    document.addEventListener('keydown', (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      const veil = $('setup-veil'); if (veil && !veil.hidden) return;   // dialogue modal ouvert
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault(); SFX.play(follow ? SND.free : SND.lock, .06);
        follow ? human() : resumeFollow();
      } });
    let tPrev = 0;
    (function raf(ts) { requestAnimationFrame(raf);
      const dt = tPrev ? ts - tPrev : 16; tPrev = ts; stepFollow(dt); })(0);
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
    const t = Date.now();
    if (t - lastNight > 60000) { nightLayer.setLatLngs(nightPolygon(t)); lastNight = t; }
    const rec = S.tracked.rec;
    const st = stateAt(rec, new Date(t));
    if (!st) return;

    // trace au sol : une orbite avant / après
    const period = 2 * Math.PI / rec.no * 60 * 1000;   // no en rad/min
    const past = [], future = [];
    for (let dt = -period; dt <= 0; dt += period / 90) { const p = stateAt(rec, new Date(t + dt)); if (p) past.push([p.lat, p.lon]); }
    for (let dt = 0; dt <= period; dt += period / 90) { const p = stateAt(rec, new Date(t + dt)); if (p) future.push([p.lat, p.lon]); }
    trackPast.setLatLngs(splitAtDateline(past));
    trackFuture.setLatLngs(splitAtDateline(future));

    // empreinte radio : rayon utile à ton élévation mini configurée (pas l'horizon géométrique à 0°,
    // bien plus large et donc trompeur — on montre où le signal est réellement exploitable)
    const RE = 6371, r = RE + st.alt;
    const minEl = S.station.min_elevation_deg || 5, audible = st.el > minEl;
    const minElR = minEl * D;
    const foot = Math.PI / 2 - minElR - Math.asin((RE / r) * Math.cos(minElR));
    const ring = [];
    for (let a = 0; a <= 360; a += 3) {
      const br = a * D;
      const la = Math.asin(Math.sin(st.lat * D) * Math.cos(foot) + Math.cos(st.lat * D) * Math.sin(foot) * Math.cos(br));
      const lo = st.lon * D + Math.atan2(Math.sin(br) * Math.sin(foot) * Math.cos(st.lat * D), Math.cos(foot) - Math.sin(st.lat * D) * Math.sin(la));
      ring.push([la / D, ((lo / D + 180) % 360 + 360) % 360 - 180]);
    }
    footprint.setLatLngs(splitAtDateline(ring));
    footprint.setStyle(audible
      ? { color: 'rgba(255,180,84,0.6)', fillColor: '#ffb454', fillOpacity: 0.13 }
      : { color: 'rgba(75,227,199,0.4)', fillColor: '#4be3c7', fillOpacity: 0.08 });

    // station, satellite, liaison — la liaison ne s'affiche que si le signal est exploitable
    satMarker.setLatLng([st.lat, st.lon]);
    satMarker.setIcon(L.divIcon({ className: '', iconAnchor: [0, 0],
      html: '<div class="sat-icon sat"><span class="dot"></span>' + S.tracked.name.split(' ')[0] + '</div>' }));
    linkLine.setLatLngs(audible ? [[S.station.lat, S.station.lon], [st.lat, st.lon]] : []);

    // lectures + Doppler live
    const rr = rangeRate(rec, new Date(t));
    $('ro-dist').innerHTML = fmt(st.range, 0) + ' <small>km</small>';
    $('ro-speed').innerHTML = fmt(st.speed * 3600, 0) + ' <small>km/h</small>';
    $('ro-alt').innerHTML = fmt(st.alt, 0) + ' <small>km</small>';
    $('ro-pos').textContent = Math.abs(st.lat).toFixed(1) + '°' + (st.lat >= 0 ? 'N' : 'S') + ' ' +
      Math.abs(st.lon).toFixed(1) + '°' + (st.lon >= 0 ? 'E' : 'O');
    $('ro-azel').textContent = st.az.toFixed(0) + '° / ' + st.el.toFixed(1) + '°';
    const vis = $('ro-vis');
    vis.textContent = audible ? 'AUDIBLE' : (st.el > 0 ? 'trop bas' : 'sous horizon');
    vis.className = audible ? 'v live' : 'v';

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
      el.className = 'step' + (s && t >= s.start && t <= s.end ? ' now' : '');
    });
  }

  /* au plus 2 pictogrammes (maintenant / bientôt si ça change), semi-transparents,
     décalés au-dessus de la maison pour ne pas la cacher */
  function setWeather(data) {
    if (!map) return;
    if (wxLayer) wxLayer.clearLayers(); else wxLayer = L.layerGroup().addTo(map);
    if (!data || !data.now) return;
    const at = [S.station.lat, S.station.lon];

    const pin = (p, label, anchor) => {
      const marker = L.marker(at, {
        icon: L.divIcon({ className: '', iconAnchor: anchor,
          html: '<div class="wx-icon">' + Icons.html(p.icon, { size: 22 }) + '<div class="t">' + (p.temp != null ? Math.round(p.temp) + '°' : '—') + '</div></div>' })
      });
      marker.bindPopup('<b>' + label + '</b><br>' + p.label +
        (p.temp != null ? '<br>' + p.temp.toFixed(1) + ' °C' : '') +
        (p.wind != null ? ' · vent ' + Math.round(p.wind) + ' km/h' : '') +
        (p.cloud != null ? '<br>nébulosité ' + p.cloud + ' %' : ''));
      wxLayer.addLayer(marker);
    };

    pin(data.now, 'Maintenant', [18, 44]);
    if (data.later) pin(data.later, 'Dans ' + data.later.hours + ' h', [-2, 44]);
  }

  /* La station a changé de place (« Me localiser » ou saisie manuelle, appliqué
     à l'enregistrement). Le marqueur maison était posé une seule fois au build()
     et rien ne le redéplaçait — d'où l'impression que « rien ne bouge ». On le
     recale, on rafraîchit son étiquette (l'indicatif a pu changer) et on recadre
     dessus. focusHome() coupe le suivi comme un geste manuel : voulu, on vient
     de redéfinir où est « chez soi ». */
  function setStation() {
    if (!map || !S.station) return;
    staMarker.setLatLng([S.station.lat, S.station.lon]);
    staMarker.setIcon(L.divIcon({ className: '', iconAnchor: [0, 0],
      html: '<div class="sat-icon station">' + Icons.html('Home', { className: 'house', size: 16 }) + S.station.callsign + '</div>' }));
    focusHome();
  }

  return { build, draw, setStation, setWeather, resumeFollow, fitMinZoom };
})();

/* ------------------------------------------------------------------ boucle */
function tickClock() {
  const t = Date.now();
  $('localclock').textContent = hhmmssLoc(new Date(t));
  renderTleChip();                     // « il y a … » compte en temps réel
  const p = S.selectedPass;
  if (p) {
    /* le compte à rebours vise la FENÊTRE EXPLOITABLE (>= minEl), pas l'horizon
       géométrique : « exploitable dans … », puis « fenêtre utile … », puis
       « avant LOS » sur la queue de descente. */
    const ws = p.workStart || p.aos, we = p.workEnd || p.los;
    let target, label;
    if (t < ws) { target = ws; label = 'avant fenêtre utile'; }
    else if (t <= we) { target = we; label = 'fenêtre utile'; }
    else { target = p.los; label = 'avant LOS'; }
    let s = Math.max(0, Math.round((target - t) / 1000));
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    $('countdown').innerHTML = pad(h) + '<i>:</i>' + pad(m) + '<i>:</i>' + pad(s);
    $('cdlabel').textContent = label + ' — AOS ' + hhmmssLoc(new Date(p.aos)) +
      ' · utile ' + hhmmssLoc(new Date(ws)) + ' loc.';
    $('countdown').classList.toggle('live', t >= ws && t <= we);
    renderMemo(); renderOrient();
    if (t > p.los + 5000) computeAll();       // passage terminé : on recalcule
  }
  /* hors du bloc ci-dessus : l'alerte porte sur TOUS les passages à venir, pas
     seulement sur celui qu'on suit à l'écran */
  checkAlerts();
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
    Icons.preload();                    // banque d'icônes : elles se posent dès qu'elles arrivent
    S.observer = {
      longitude: station.lon * D, latitude: station.lat * D,
      height: (station.alt_m + (station.antenna.height_m || 0)) / 1000
    };
    renderHeader();
    try { ALERTS.on = localStorage.getItem(ALERT_KEY) === '1'; } catch (e) {}
    renderAlertBtn();
    /* Pas de fenêtre bloquante au 1er lancement : l'appli démarre avec les
       valeurs par défaut et computeAll() affiche un rappel non bloquant. L'OM
       met son indicatif/locator quand il veut via le bouton Réglages (même
       formulaire, même enregistrement). */
    if (typeof satellite === 'undefined') {
      $('banner').textContent = 'satellite.js non chargé : le serveur n\'a pas pu le télécharger. Vérifie la connexion internet de JB-SERVER puis recharge.';
      $('banner').className = 'banner bad';
      return;
    }
    if (typeof L === 'undefined') {
      $('banner').textContent = 'Leaflet non chargé : le serveur n\'a pas pu le télécharger. Vérifie la connexion internet de JB-SERVER puis recharge.';
      $('banner').className = 'banner bad';
      return;
    }
    computeAll();
    if (location.search.indexOf('alertdemo') >= 0) demoAlert();
    MAP.build();
    loadIssStatus();
    loadWeather();
    setInterval(tickClock, 1000); tickClock();
    setInterval(() => { MAP.draw(); drawPolar(); }, 1000); MAP.draw();
    setInterval(computeAll, 15 * 60 * 1000);
    setInterval(loadIssStatus, 30 * 60 * 1000);
    setInterval(loadWeather, 30 * 60 * 1000);
    setInterval(reloadTle, 30 * 60 * 1000);      // le serveur rafraîchit toutes les heures

    /* Le serveur a servi un cache vieilli (stale) sans bloquer la page et
       rafraîchit en tâche de fond : on revient chercher les TLE frais quelques
       fois, puis on laisse l'intervalle de 30 min prendre le relais. */
    if (S.tleInfo && S.tleInfo.stale) {
      let tries = 0;
      const catchUp = setInterval(async () => {
        await reloadTle();
        if (++tries >= 10 || !(S.tleInfo && S.tleInfo.stale)) clearInterval(catchUp);
      }, 7000);
    }
  } catch (e) {
    $('banner').textContent = 'Erreur de démarrage : ' + e.message;
    $('banner').className = 'banner bad';
  }
}

async function reloadTle() {
  try {
    const t = await fetch('/api/tle').then(r => r.json());
    if (t && t.count) {
      S.tle = t.sats; S.tleInfo = t;
      if (!t.stale) S.tleError = null;      // le rafraîchissement de fond a abouti
      renderHeader(); computeAll();
    }
  } catch (e) { /* réseau indisponible : on garde les TLE en mémoire */ }
}

/* Traduit la liste d'erreurs réseau du serveur (par groupe TLE) en une cause
   lisible. Sert au message affiché quand « Rafraîchir » échoue. */
function netReason(errs) {
  const s = (errs || []).join(' | ').toLowerCase();
  if (/\b403\b|forbidden/.test(s)) return 'accès refusé par CelesTrak (403)';
  if (/timed out|timeout|10060|10054|connection reset|réseau|network is unreachable/.test(s)) return 'pas de réponse (connexion internet du serveur ?)';
  if (/11001|getaddrinfo|name or service|résolution|nodename/.test(s)) return 'nom de domaine non résolu (DNS)';
  if (/ssl|certificate|certificat/.test(s)) return 'erreur de certificat TLS';
  if (/\b404\b|not found/.test(s)) return 'ressource introuvable (404)';
  return 'sources injoignables';
}

function matchTle(sat) {
  const keys = Object.keys(S.tle);
  /* Le NUMÉRO NORAD d'abord : c'est sans ambiguïté. Avec ~1600 TLE en catalogue,
     chercher « ISS » comme sous-chaîne attrape SWISSCUBE, AISSAT, ISS (NAUKA)…
     avant la vraie station. Le nom ne sert que de repli pour un satellite sans
     numéro (aucun aujourd'hui). */
  if (sat.norad) {
    const hit = keys.find(k => S.tle[k].norad === sat.norad);
    if (hit) return S.tle[hit];
  }
  for (const alias of sat.match) {
    const A = alias.toUpperCase();
    let hit = keys.find(k => k.toUpperCase() === A);         // nom exact
    if (!hit) hit = keys.find(k => k.toUpperCase().indexOf(A) >= 0);  // puis sous-chaîne
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
      modeLabel: mode.label || shortMode(mode), color: COLORS[idx % COLORS.length]
    })));
  });

  all.sort((a, b) => a.aos - b.aos);
  S.passes = all;
  const nowMs = Date.now();
  const live = all.find(p => nowMs >= p.aos && nowMs <= p.los);
  selectPass(live || all[0] || null);
  renderPassTable();
  /* La bande d'avertissement ne sert QU'aux vrais soucis actionnables : le
     rafraîchissement a échoué, ou un satellite du catalogue n'a aucun TLE. Un
     TLE simplement ancien n'y figure pas — ça faisait douter de tout le reste. */
  const warn = [];
  if (S.station && S.station.configured === false)
    warn.push('Indicatif et locator par défaut (F4MAJ / JN37QS) — bouton Réglages pour mettre les tiens.');
  if (S.tleError) warn.push('Mise à jour TLE : ' + S.tleError);
  if (missing.length) warn.push('TLE absents : ' + missing.join(', '));
  $('missing').textContent = warn.join(' · ');
  $('banner').hidden = !warn.length;
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
  catch (e) { data = { now: null, later: null, error: e.message }; }
  S.weather = data;
  MAP.setWeather(data);
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
      mode.note = (m.aprs.state === 'off' ? 'APRS signalé hors service par ARISS. ' : '') + (m.aprs.excerpt || mode.note);
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
  /* PHONIE en tête : c'est ce qu'on travaille (SSB/FM voix). On ne met en avant
     qu'un mode VOIX actif ; APRS (données) et SSTV restent en dessous même
     signalés « actifs » par ARISS — ils auront leur propre entrée plus tard. */
  const actif = iss.modes.find(x => x.type === 'fm' && x.state === 'active');
  if (actif && iss.modes[0] !== actif) {
    iss.modes = [actif].concat(iss.modes.filter(x => x !== actif));
    if (S.passes.length) computeAll();     // les passages portent modes[0] : on recalcule
  } else if (S.passes.length) {
    renderPassTable(); renderNextPass();   // sinon simple maj des fréquences/notes en place
  }
}

/* ------------------------------------------------------- trajectoire Az/El */
function drawPolar() {
  const cv = $('polar'), p = S.selectedPass;
  if (!cv) return;
  const det = $('det-polar');
  if (det && !det.open) return;               // replié : rien à dessiner
  const T = getComputedStyle(document.documentElement);
  const TOK = k => T.getPropertyValue(k).trim();
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, R = W / 2 - 30;
  ctx.clearRect(0, 0, W, H);
  const proj = (az, el) => {
    const r = Math.max(0, (90 - el) / 90) * R;
    return [cx + r * Math.sin(az * D), cy - r * Math.cos(az * D)];
  };
  // cercles d'élévation
  ctx.strokeStyle = TOK('--line'); ctx.lineWidth = 2;
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
  const t = Date.now();
  if (t >= p.aos && t <= p.los) {
    const s = stateAt(p.rec, new Date(t));
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

/* ------------------------------------------------------------- config station */
/* locator Maidenhead (4 ou 6 caractères) -> centre de la case en lat/lon */
function locatorToLatLon(loc) {
  loc = (loc || '').trim().toUpperCase();
  if (!/^[A-R]{2}[0-9]{2}([A-X]{2})?$/.test(loc)) return null;
  const A = 'A'.charCodeAt(0), Z = '0'.charCodeAt(0);
  let lon = (loc.charCodeAt(0) - A) * 20 - 180;
  let lat = (loc.charCodeAt(1) - A) * 10 - 90;
  lon += (loc.charCodeAt(2) - Z) * 2;
  lat += (loc.charCodeAt(3) - Z) * 1;
  if (loc.length >= 6) {
    lon += (loc.charCodeAt(4) - A) * (2 / 24) + (2 / 24) / 2;
    lat += (loc.charCodeAt(5) - A) * (1 / 24) + (1 / 24) / 2;
  } else {
    lon += 1; lat += 0.5;
  }
  return { lat: Math.round(lat * 10000) / 10000, lon: Math.round(lon * 10000) / 10000 };
}

/* lat/lon -> locator Maidenhead 6 caractères (case du sous-carré qui contient le
   point). Inverse de locatorToLatLon à la résolution du sous-carré près :
   locatorToLatLon(latLonToLocator(p)) retombe dans la même case. Sert au bouton
   « Me localiser » — la position arrive en lat/lon, le reste du code ne connaît
   que le locator. */
function latLonToLocator(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || !isFinite(lat) || !isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  lat = Math.min(89.99999, lat) + 90;         // le pôle exact retombe dans la dernière case
  lon = Math.min(179.99999, lon) + 180;
  const A = 'A'.charCodeAt(0), Z = '0'.charCodeAt(0);
  return String.fromCharCode(A + Math.floor(lon / 20))
       + String.fromCharCode(A + Math.floor(lat / 10))
       + String.fromCharCode(Z + Math.floor((lon % 20) / 2))
       + String.fromCharCode(Z + Math.floor(lat % 10))
       + String.fromCharCode(A + Math.floor((lon % 2) / (2 / 24)))
       + String.fromCharCode(A + Math.floor((lat % 1) / (1 / 24)));
}

/* ---- modale de configuration ---------------------------------------------
   Un dialogue modal se ferme au clic sur le voile et à Échap, prend le focus à
   l'ouverture, le garde (Tab ne sort pas derrière) et le rend au bouton qui l'a
   ouverte. Une exception, et une seule : au tout premier lancement il n'y a pas
   de station — refermer laisserait l'application sans rien à calculer. Ce
   cas-là se verrouille (setupLocked) : ni voile, ni Échap, et pas de bouton
   « Annuler ». La seule sortie est d'enregistrer. */
let setupLocked = false, setupTrigger = null;

/* Position renvoyée par « Me localiser » : lat/lon exacts de l'appareil + le
   locator qu'on en a déduit. Tant que le champ Locator vaut encore ce
   locator-là, saveSetup enregistre ces coordonnées exactes plutôt que le centre
   de la case (~3 km d'écart). Une saisie manuelle dans le champ la remet à null :
   la valeur tapée l'emporte. */
let deviceFix = null;

function openSetup(firstRun) {
  const st = S.station || {};
  deviceFix = null;
  $('s-call').value = firstRun ? '' : (st.callsign || '');
  $('s-loc').value = firstRun ? '' : (st.locator || '');
  $('s-city').value = st.city || '';
  $('s-tz').value = st.timezone || 'Europe/Paris';
  $('s-error').textContent = '';
  updateSetupPreview();
  $('s-cancel').style.display = firstRun ? 'none' : '';
  setupLocked = !!firstRun;
  setupTrigger = document.activeElement;
  $('setup-veil').hidden = false;
  $('s-call').focus();
}

function closeSetup() {
  if (setupLocked) return;
  SFX.play(SND.shut, .05);
  $('setup-veil').hidden = true;
  const back = setupTrigger; setupTrigger = null;
  if (back && back.isConnected && back.focus) back.focus();
}

/* Éléments réellement atteignables : « Annuler » est masqué au premier
   lancement (display:none → offsetParent nul) et les deux boutons sont
   désactivés pendant l'enregistrement. */
function setupFocusables() {
  return [...$('setup-veil').querySelectorAll('button, input, [href], select, textarea')]
    .filter(el => !el.disabled && el.offsetParent !== null);
}

function wireSetupModal() {
  const veil = $('setup-veil');
  let downOnVeil = false;
  /* on exige que le geste COMMENCE ET FINISSE sur le voile : sinon une
     sélection de texte relâchée hors de la boîte fermerait le dialogue */
  veil.addEventListener('mousedown', e => { downOnVeil = e.target === veil; });
  veil.addEventListener('click', e => {
    if (downOnVeil && e.target === veil) closeSetup();
    downOnVeil = false;
  });
  document.addEventListener('keydown', e => {
    if (veil.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeSetup(); return; }
    if (e.key !== 'Tab') return;
    const f = setupFocusables(); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !veil.contains(document.activeElement))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !veil.contains(document.activeElement))) {
      e.preventDefault(); first.focus();
    }
  });
}

function updateSetupPreview() {
  const loc = $('s-loc').value.trim().toUpperCase();
  if (deviceFix && deviceFix.loc === loc) {
    $('s-preview').textContent = 'Position de l\'appareil : '
      + deviceFix.lat.toFixed(4) + '°, ' + deviceFix.lon.toFixed(4) + '° · locator ' + loc;
    return;
  }
  const p = locatorToLatLon($('s-loc').value);
  $('s-preview').textContent = p ? ('Position calculée : ' + p.lat.toFixed(4) + '°, ' + p.lon.toFixed(4) + '°') : '';
}

/* « Me localiser » : demande sa position à l'appareil, remplit Locator (déduit
   des coordonnées) et Fuseau (lu sans permission via Intl). Rien ne part au
   serveur ici — l'opérateur relit puis Enregistre, comme une saisie manuelle.
   La permission ne s'obtient QUE depuis ce clic : hors geste utilisateur,
   Safari et Firefox l'ignorent (même règle que Notification.requestPermission). */
function locateFromDevice() {
  const btn = $('s-geo'), label = btn.querySelector('.geo-label');
  if (btn.disabled) return;
  if (!navigator.geolocation) {
    $('s-error').textContent = 'Cet appareil ne donne pas de position — saisis ton locator à la main.';
    SFX.play(SND.oops, .08); return;
  }
  $('s-error').textContent = '';
  const was = label.textContent;
  btn.disabled = true; btn.setAttribute('aria-busy', 'true'); label.textContent = 'Localisation…';
  const done = () => { btn.disabled = false; btn.removeAttribute('aria-busy'); label.textContent = was; };
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = Math.round(pos.coords.latitude * 10000) / 10000;
    const lon = Math.round(pos.coords.longitude * 10000) / 10000;
    const loc = latLonToLocator(lat, lon);
    if (!loc) {
      $('s-error').textContent = 'Position reçue mais hors grille Maidenhead — saisis ton locator à la main.';
      SFX.play(SND.oops, .08); done(); return;
    }
    deviceFix = { lat, lon, loc };
    $('s-loc').value = loc;
    try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (tz) $('s-tz').value = tz; } catch (e) {}
    updateSetupPreview();
    SFX.play(SND.done, .07);
    done();
    /* Le nom du lieu se traduit côté serveur (OpenStreetMap) : asynchrone, on
       n'attend pas pour rendre la main. Pas de réseau ou pas de correspondance
       -> champ vidé, jamais l'ancienne ville sous un locator neuf. */
    const cityEl = $('s-city');
    cityEl.value = ''; cityEl.placeholder = 'recherche du lieu…';
    fetch('/api/reverse?lat=' + lat + '&lon=' + lon)
      .then(r => r.json())
      .then(d => { cityEl.value = (d && d.city) || ''; })
      .catch(() => { cityEl.value = ''; })
      .finally(() => { cityEl.placeholder = 'ex. Illzach'; });
  }, err => {
    $('s-error').textContent = err && err.code === 1
      ? 'Localisation refusée. Autorise ton navigateur dans Réglages Système → Confidentialité et sécurité → Service de localisation, ou saisis ton locator à la main.'
      : 'Position indisponible pour l\'instant — saisis ton locator à la main.';
    SFX.play(SND.oops, .08);
    done();
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}

async function saveSetup() {
  if ($('s-save').disabled) return;   // évite un double envoi si déjà en cours
  const call = $('s-call').value.trim().toUpperCase();
  const loc = $('s-loc').value.trim().toUpperCase();
  const city = $('s-city').value.trim();
  const tz = $('s-tz').value.trim() || 'Europe/Paris';
  /* Locator inchangé depuis « Me localiser » : on garde les coordonnées exactes
     de l'appareil. Sinon (saisie manuelle) : centre de la case. */
  const pos = (deviceFix && deviceFix.loc === loc)
    ? { lat: deviceFix.lat, lon: deviceFix.lon }
    : locatorToLatLon(loc);
  if (!call || !pos) {
    $('s-error').textContent = !call ? 'Indicatif requis.' : 'Locator invalide (ex. JN37QS).';
    SFX.play(SND.oops, .08); return;
  }
  const payload = { callsign: call, locator: loc, city, timezone: tz, lat: pos.lat, lon: pos.lon, configured: true };

  $('s-error').textContent = '';
  $('s-save').disabled = true; $('s-cancel').disabled = true;
  $('s-save').textContent = 'Enregistrement...';

  let station;
  try {
    const resp = await fetch('/api/station', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    station = await resp.json();
  } catch (e) {
    $('s-error').textContent = 'Échec de l\'enregistrement : ' + e.message;
    SFX.play(SND.oops, .08);
    $('s-save').disabled = false; $('s-cancel').disabled = false;
    $('s-save').textContent = 'Enregistrer';
    return;
  }

  // la sauvegarde a réussi ici, quoi qu'il arrive ensuite — on le montre clairement
  $('s-save').textContent = '✓ Enregistré';
  SFX.play(SND.done, .09);        // même son que la fin d'un rafraîchissement : c'est passé
  $('s-preview').textContent = 'Configuration enregistrée.';

  try {
    S.station = station;
    S.observer = {
      longitude: station.lon * D, latitude: station.lat * D,
      height: (station.alt_m + (station.antenna.height_m || 0)) / 1000
    };
    renderHeader();
    computeAll();       // priorité : tous les passages recalculés depuis le nouvel observateur
    /* la maison rejoint la nouvelle position et la carte s'y recentre — isolé
       pour qu'un hoquet de la carte ne bloque jamais le recalcul ci-dessus */
    try { MAP.setStation(); } catch (e) { console.warn('recentrage carte :', e); }
    loadWeather();      // météo du nouveau lieu (le serveur retélécharge si on a bougé)
  } catch (e) {
    console.warn('rafraîchissement post-enregistrement :', e);
  }

  setupLocked = false;   // la station existe désormais : le dialogue peut se fermer
  setTimeout(() => {
    closeSetup();
    $('s-save').disabled = false; $('s-cancel').disabled = false;
    $('s-save').textContent = 'Enregistrer';
  }, 900);
}

window.addEventListener('DOMContentLoaded', () => {
  $('btn-mem').onclick = exportChirp;
  $('btn-qso').onclick = saveQso;
  $('btn-refresh').onclick = async () => {
    const b = $('btn-refresh');
    b.disabled = true; b.setAttribute('aria-busy', 'true');
    try {
      /* /api/tle/refresh force le serveur à RETÉLÉCHARGER les TLE (AMSAT +
         SatNOGS + R4UAB, fusionnés en gardant pour chaque satellite l'orbite la
         plus récente), à les reparser et à réécrire data/tle_cache.json, puis
         nous renvoie l'état complet. On réinjecte ces TLE (S.tle) et computeAll()
         relance la propagation SGP4 : ce sont les positions et les heures de
         passage qui changent, pas un libellé.
         C'est `stale` qui dit l'échec (aucune source fraîche → cache gardé) ;
         `errors` peut être non vide même en cas de succès. */
      const t = await fetch('/api/tle/refresh').then(r => r.json());
      if (t && t.count) { S.tle = t.sats; S.tleInfo = t; }

      if (t && t.count && !t.stale) {
        S.tleError = null;
        renderHeader(); computeAll();           // SGP4 relancé sur les TLE fraîchement téléchargés
        const part = (t.errors && t.errors.length)
          ? ' (' + t.errors.length + ' source' + (t.errors.length > 1 ? 's' : '') + ' sur plusieurs injoignable' + (t.errors.length > 1 ? 's' : '') + ')'
          : '';
        toast('TLE à jour', t.count + ' satellites, téléchargés à l\'instant' + part + '.');
        SFX.play(SND.done, .09);
      } else if (t && t.count) {
        S.tleError = netReason(t.errors);
        renderHeader(); computeAll();
        toast('Mise à jour TLE échouée', S.tleError +
          ' — ' + t.count + ' satellites conservés depuis le cache.');
        SFX.play(SND.oops, .08);               // le bouton seul ne dirait pas que c'est raté
      } else {
        throw new Error('aucun TLE disponible (' + netReason(t && t.errors) + ')');
      }
    } catch (e) {
      S.tleError = e.message;
      renderHeader();
      toast('Mise à jour TLE impossible', String(e.message || e));
      SFX.play(SND.oops, .08);
    } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
  };
  $('btn-alert').onclick = toggleAlerts;
  $('btn-settings').onclick = () => openSetup(false);
  $('btn-sound').onclick = toggleSound;
  renderSoundBtn();
  $('s-cancel').onclick = closeSetup;
  $('s-save').onclick = saveSetup;
  $('s-geo').onclick = locateFromDevice;
  $('s-loc').oninput = () => { deviceFix = null; updateSetupPreview(); };
  wireSetupModal();
  boot();
  /* ?selftest dans l'URL : vérifie la chorégraphie et le format CHIRP dans la
     console, sans rien changer à l'affichage. */
  if (location.search.indexOf('selftest') >= 0) selfTest();
});

/* ═══════════════════════════════════════════════════════════ interface ═════
   Thème, onglets, phrase d'orientation, palier Doppler courant, dépliants.
   Tout ce qui suit ne calcule rien : il met en forme ce que le reste produit.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ---- thème clair / sombre. Le choix est mémorisé ; « auto » suit le système.
        L'attribut est posé avant le premier rendu par un script inline dans
        index.html, donc pas de flash au rechargement. ---- */
const THEME_KEY = 'jbs-theme';
function currentTheme() { return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; }
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* navigation privée */ }
  const b = $('btn-theme');
  if (b) {
    Icons.set(b.querySelector('.ic'), t === 'light' ? 'Moon' : 'Sun');
    b.querySelector('.lbl').textContent = t === 'light' ? 'Sombre' : 'Clair';
    b.setAttribute('aria-label', t === 'light' ? 'Passer au thème sombre' : 'Passer au thème clair');
  }
  drawPolar();                       // le tracé lit ses couleurs dans les tokens
}

/* ---- onglets : rôles ARIA complets, flèches gauche/droite ---- */
function selectTab(btn) {
  const list = btn.closest('[role="tablist"]');
  [...list.querySelectorAll('[role="tab"]')].forEach(t => {
    const on = t === btn;
    t.setAttribute('aria-selected', on ? 'true' : 'false');
    $(t.getAttribute('aria-controls')).hidden = !on;
  });
}
function wireTabs() {
  const list = document.querySelector('[role="tablist"]'); if (!list) return;
  list.addEventListener('click', e => {
    const t = e.target.closest('[role="tab"]'); if (t) selectTab(t);
  });
  list.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const i = (tabs.indexOf(document.activeElement) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[i].focus(); selectTab(tabs[i]); e.preventDefault();
  });
}

/* ---- la phrase d'orientation : ce qui se passe, et ce qu'il faut en faire.
        C'est la seule chose de la page écrite comme on parle. ---- */
function renderOrient() {
  const box = $('orient'); if (!box) return;
  const p = S.selectedPass;
  if (!p) { box.hidden = true; return; }
  box.hidden = false;
  const t = Date.now();
  const q = quality(p.maxEl, (S.station.antenna && S.station.antenna.cone_of_silence_deg) || 75);
  const minEl = (S.station && S.station.min_elevation_deg) || 5;
  const ws = p.workStart || p.aos, we = p.workEnd || p.los;
  const workable = t >= ws && t <= we;              // au-dessus de minEl : la fenêtre utile
  const rising = t >= p.aos && t < ws;              // passage commencé mais encore trop bas
  const falling = t > we && t <= p.los;             // redescendu sous minEl, pas encore couché
  const stNow = (rising || falling) ? stateAt(p.rec, new Date(t)) : null;

  box.classList.toggle('calm', !workable);
  Icons.set(box.querySelector('.badge .ic'), workable ? 'Activity' : 'Clock');

  if (workable) {
    const reste = durLong(Math.max(0, Math.round((we - t) / 1000)));
    $('orient-head').innerHTML = '<b>' + p.satName + ' est exploitable en ce moment.</b>';
    let sub = 'Fenêtre utile encore <span class="num">' + reste + '</span>.';
    if (p.mode.down) sub += ' Écoute sur <span class="num">' + mhz(p.mode.down) + '</span> MHz';
    if (p.mode.up) sub += ', émets sur <span class="num">' + mhz(p.mode.up) + '</span>';
    sub += '. Culmine à ' + p.maxEl.toFixed(0) + '°';
    sub += q.k === 'good' ? ' — bonne élévation pour ton omni.' : ' — ' + q.why.toLowerCase();
    $('orient-sub').innerHTML = sub;
  } else if (rising) {
    $('orient-head').innerHTML = '<b>' + p.satName + ' se lève sur ton horizon.</b>';
    $('orient-sub').innerHTML = 'Encore trop bas (<span class="num">' +
      (stNow ? stNow.el.toFixed(0) : '0') + '°</span>) pour ton omni. Exploitable dans <span class="num">' +
      durLong(Math.max(0, Math.round((ws - t) / 1000))) + '</span>, quand il passera au-dessus de ' +
      minEl + '°. Il culminera à ' + p.maxEl.toFixed(0) + '°.';
  } else if (falling) {
    $('orient-head').innerHTML = '<b>' + p.satName + ' redescend.</b>';
    $('orient-sub').innerHTML = 'Repassé sous ' + minEl + '° (<span class="num">' +
      (stNow ? stNow.el.toFixed(0) : '0') + '°</span>) — bientôt hors de portée.';
  } else {
    $('orient-head').innerHTML = '<b>Rien au-dessus de toi en ce moment.</b>';
    $('orient-sub').innerHTML = 'Prochain passage : <b>' + p.satName + '</b> vers <span class="num">' +
      hhmmLoc(new Date(p.aos)) + '</span>, exploitable dès <span class="num">' + hhmmLoc(new Date(ws)) +
      '</span> (dans <span class="num">' + durLong(Math.max(0, Math.round((ws - t) / 1000))) +
      '</span>). Il montera à ' + p.maxEl.toFixed(0) + '° — ' + q.why.toLowerCase();
  }
}

/* ---- le palier Doppler courant, remonté hors des onglets : changer de
        mémoire à l'heure dite est l'action principale d'un passage. ---- */
function renderMemo() {
  const box = $('memo'); if (!box) return;
  const p = S.selectedPass, plan = S.plan, t = Date.now();
  if (!p || !plan || !plan.length || t < p.aos || t > p.los) { box.hidden = true; return; }
  const i = plan.findIndex(s => t >= s.start && t <= s.end);
  if (i < 0) { box.hidden = true; return; }
  box.hidden = false;
  $('memo-tag').textContent = 'M-' + pad(i + 1);
  $('memo-when').textContent = hhmmLoc(new Date(plan[i].start)) + ' → ' + hhmmLoc(new Date(plan[i].end));
  $('memo-hint').textContent = i + 1 < plan.length
    ? 'Passe à la mémoire suivante dans ' + durLong(Math.round((plan[i].end - t) / 1000))
    : 'Dernière mémoire du passage';
}

/* ==========================================================================
   ALERTE AVANT PASSAGE

   JB-SERVER tourne en permanence et ne prévient jamais de rien : il faut avoir
   la page sous les yeux. Une notification comble ce trou.

   Deux seuils, tous les deux dans station.json sous "alert", parce qu'annoncer
   trop c'est n'annoncer rien :
     - min_elevation_deg est VOLONTAIREMENT plus haut que celui des prédictions.
       Un passage à 6° mérite d'être listé, pas de faire sonner un téléphone.
     - skip_zenith écarte les passages qui culminent dans le cône de silence :
       la même règle que quality(), appliquée à ce qu'on dérange l'opérateur pour.
   ========================================================================== */

const ALERT_KEY = 'jbs-alerts';         // interrupteur, mémorisé comme le thème
const ALERT_DONE_KEY = 'jbs-alerts-done';   // passages déjà annoncés

const ALERTS = {
  on: false,
  get supported() { return typeof Notification !== 'undefined'; },
  get granted() { return this.supported && Notification.permission === 'granted'; },

  /* Les passages déjà annoncés survivent au rechargement : sans ça, un F5
     pendant la fenêtre d'annonce refait sonner la même notification. On ne
     garde que les AOS à venir, la liste ne grossit donc pas. */
  done() {
    let v = [];
    try { v = JSON.parse(localStorage.getItem(ALERT_DONE_KEY) || '[]'); } catch (e) {}
    const t = Date.now();
    return Array.isArray(v) ? v.filter(x => typeof x === 'number' && x > t) : [];
  },
  markDone(aosList) {
    try { localStorage.setItem(ALERT_DONE_KEY, JSON.stringify(this.done().concat(aosList))); }
    catch (e) { /* navigation privée : on annoncera peut-être deux fois, tant pis */ }
  }
};

/* Décision pure : quels passages doivent être annoncés à l'instant t.
   Séparée de l'effet pour être vérifiable sans navigateur. */
function dueAlerts(passes, t, cfg, done, cone) {
  const lead = (cfg.lead_min || 10) * 60e3;
  const minEl = cfg.min_elevation_deg || 20;
  return (passes || []).filter(p => {
    if (p.aos <= t || p.aos > t + lead) return false;   // hors fenêtre d'annonce
    if (p.maxEl < minEl) return false;                  // trop bas pour déranger
    if (cfg.skip_zenith && p.maxEl > cone) return false; // culmine dans le cône de silence
    return done.indexOf(p.aos) < 0;                     // pas déjà annoncé
  });
}

function checkAlerts() {
  if (!ALERTS.on || !ALERTS.granted || !S.passes.length) return;
  const cfg = (S.station && S.station.alert) || {};
  const cone = (S.station.antenna && S.station.antenna.cone_of_silence_deg) || 75;
  const due = dueAlerts(S.passes, Date.now(), cfg, ALERTS.done(), cone);
  if (!due.length) return;
  due.forEach(notifyPass);
  ALERTS.markDone(due.map(p => p.aos));
}

function notifyPass(p) {
  const min = Math.max(1, Math.round((p.aos - Date.now()) / 60000));
  const q = quality(p.maxEl, (S.station.antenna && S.station.antenna.cone_of_silence_deg) || 75);
  const corps = [
    'Culmine à ' + p.maxEl.toFixed(0) + '° · ' + q.t,
    p.mode.down ? 'RX ' + mhz(p.mode.down) + (p.mode.up ? ' · TX ' + mhz(p.mode.up) : '') : '',
    'AOS ' + hhmmLoc(new Date(p.aos)) + ' · ' + p.modeLabel
  ].filter(Boolean).join('\n');
  const titre = p.satName + ' dans ' + min + ' min';
  /* Trois canaux pour une même annonce, parce qu'aucun ne suffit seul : la
     pastille exige l'onglet visible, la bulle système exige une permission et un
     Mac qui la laisse passer, le son porte quand l'écran n'est pas regardé. */
  toast(titre, corps, () => selectPass(p));
  SFX.play([[784, 0, .13], [1175, .12, .26]], .13);   // deux notes montantes
  try {
    /* tag = l'AOS : si la notification précédente du même passage est encore
       affichée, celle-ci la REMPLACE au lieu de s'empiler */
    const n = new Notification(titre, { body: corps, tag: 'jbs-' + p.aos, lang: 'fr' });
    n.onclick = () => { window.focus(); selectPass(p); n.close(); };
  } catch (e) {
    console.warn('notification système impossible :', e);   // la pastille est déjà partie
  }
}

/* ?alertdemo dans l'URL : envoie tout de suite la notification du prochain
   passage, telle qu'elle sortira le jour J. Sans ça, vérifier une alerte
   demande d'attendre la fenêtre d'annonce — dix minutes pour voir une bulle. */
function demoAlert() {
  const p = S.passes && S.passes[0];
  if (!p) return renderAlertBtn('Aucun passage à venir : rien à annoncer en démo');
  /* pas de requestPermission() ici : hors geste utilisateur le navigateur
     l'ignore. La pastille et le son n'en ont pas besoin ; la bulle système
     sortira en plus si la permission a déjà été accordée. */
  notifyPass(p);          // pas de markDone : la vraie alerte partira quand même
}

/* ---- pastille dans la page + son -------------------------------------------
   Une notification système peut ne jamais sortir sans que la page l'apprenne :
   mode Concentration, réglages macOS, permission jamais accordée. La pastille,
   elle, s'affiche toujours. Le son fait le reste du travail quand l'écran n'est
   pas regardé. */

const SOUND_KEY = 'jbs-sound';   // interrupteur, mémorisé comme le thème et les alertes

const SFX = {
  ctx: null,
  /* Coupure du son. Il n'existe pas de « prefers-reduced-sound » : la pratique
     équivalente est un interrupteur visible, et le silence par défaut pour qui
     demande déjà moins d'effets au système. Un choix explicite l'emporte sur
     les deux. La coupure vaut aussi pour l'alerte de passage : la pastille et
     la bulle système continuent, elles, d'annoncer. */
  on: (function () {
    try { const v = localStorage.getItem(SOUND_KEY); if (v !== null) return v === '1'; } catch (e) {}
    return !matchMedia('(prefers-reduced-motion: reduce)').matches;
  })(),
  /* Un AudioContext créé hors d'un geste utilisateur naît suspendu et reste
     muet. On l'ouvre donc au premier clic de la session, une fois, et on le
     garde ouvert pour tout ce qui sonnera ensuite. */
  arm() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { try { this.ctx = new AC(); } catch (e) { /* audio indisponible */ } }
  },
  /* notes = [fréquence Hz, départ s, durée s]. Enveloppe douce aux deux bouts :
     une onde coupée net claque. */
  play(notes, vol) {
    if (!this.on || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t0 = this.ctx.currentTime + .01;
    notes.forEach(n => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = n[0];
      const a = t0 + n[1], b = a + n[2];
      g.gain.setValueAtTime(0, a);
      g.gain.linearRampToValueAtTime(vol || .12, a + .012);
      g.gain.exponentialRampToValueAtTime(.0001, b);
      o.connect(g).connect(this.ctx.destination);
      o.start(a); o.stop(b + .02);
    });
  }
};
document.addEventListener('pointerdown', () => SFX.arm(), { once: true });

/* Le vocabulaire sonore de l'interface. Un appui tient sous 60 ms, un événement
   sous 200 ms, et rien ne dépasse .1 de volume : la page reste ouverte toute la
   soirée à côté du poste sans qu'on ait envie de couper. */
const SND = {
  tap:  [[520, 0, .04]],                        // appui : un point, pas une note
  open: [[466, 0, .05], [622, .045, .06]],      // un dépliant s'ouvre
  shut: [[392, 0, .055]],                       // plus bas, une seule note : c'est refermé
  wait: [[392, 0, .05], [523, .045, .06]],      // « c'est parti »
  done: [[784, 0, .06], [1047, .055, .11]],     // le même une octave plus haut : c'est fini
  keep: [[698, 0, .05], [932, .045, .09]],      // c'est sorti / c'est gardé (CHIRP, QSO)
  oops: [[330, 0, .08], [247, .075, .12]],      // deux notes qui descendent : raté
  up:   [[659, 0, .05], [880, .045, .08]],      // bascule vers le clair
  down: [[880, 0, .05], [659, .045, .08]],      // la même à l'envers : vers le sombre
  zin:  [[880, 0, .04], [1319, .035, .055]],    // zoom avant : plus haut, plus court
  zout: [[1319, 0, .04], [880, .035, .055]],    // zoom arrière : le même en descendant
  home: [[523, 0, .05], [392, .045, .09]],      // on se pose sur la station
  lock: [[587, 0, .05], [784, .045, .06], [988, .09, .09]],   // le suivi s'accroche
  free: [[988, 0, .05], [784, .045, .06], [587, .09, .09]]    // il lâche
};

/* Quel son pour quel élément cliqué. Les cas particuliers sont ici et nulle part
   ailleurs ; tout le reste — onglets, sélection d'un passage, boutons ordinaires
   — prend le clic générique, qui dit seulement « c'est pris ». */
function clickSound(el) {
  const id = el.id, on = el.getAttribute('aria-pressed') === 'true';
  if (el.classList.contains('leaflet-control-zoom-in')) return SND.zin;
  if (el.classList.contains('leaflet-control-zoom-out')) return SND.zout;
  if (id === 'btn-theme') return currentTheme() === 'light' ? SND.down : SND.up;
  if (id === 'btn-follow') return on ? SND.free : SND.lock;
  if (id === 'btn-home') return SND.home;
  if (id === 'btn-refresh') return SND.wait;    // une attente commence
  if (id === 'btn-mem' || id === 'btn-qso') return SND.keep;
  if (el.tagName === 'A' && el.classList.contains('btn')) return SND.keep;   // ADIF
  if (id === 'btn-alert' && !on) return null;   // confirmAlerts sonne juste après
  if (id === 's-cancel') return null;           // closeSetup sonne
  return SND.tap;
}

/* Un seul écouteur pour tout ce qui se clique, en CAPTURE : il sonne avant le
   gestionnaire du bouton, donc les interrupteurs (thème, suivi, son) sont encore
   dans leur état d'avant et le son annonce ce que le clic va faire. */
document.addEventListener('click', e => {
  const el = e.target.closest('button, a[href], tr');
  if (!el || el.disabled) return;
  if (el.tagName === 'TR' && !el.onclick) return;   // les lignes inertes ne sonnent pas
  const snd = clickSound(el);
  if (snd) SFX.play(snd, snd === SND.tap ? .04 : .06);
}, true);

/* Les dépliants : « toggle » ne remonte pas, d'où la capture. Il couvre aussi
   l'ouverture au clavier, que le clic ne verrait pas. */
document.addEventListener('toggle', e => {
  if (e.target.tagName === 'DETAILS') SFX.play(e.target.open ? SND.open : SND.shut, .05);
}, true);

/* L'interrupteur. Même schéma que le thème : une préférence par poste. */
function toggleSound() {
  SFX.on = !SFX.on;
  try { localStorage.setItem(SOUND_KEY, SFX.on ? '1' : '0'); } catch (e) { /* navigation privée */ }
  SFX.arm(); SFX.play(SND.tap, .06);   // en rallumant, on entend tout de suite que c'est revenu
  renderSoundBtn();
}

function renderSoundBtn() {
  const b = $('btn-sound'); if (!b) return;
  Icons.set(b.querySelector('.ic'), SFX.on ? 'VolumeHigh' : 'VolumeMute');
  b.querySelector('.lbl').textContent = SFX.on ? 'Son' : 'Muet';
  b.title = SFX.on ? 'Couper les sons de l\'interface et de l\'alerte' : 'Rétablir les sons';
  b.setAttribute('aria-label', b.title);
}

/* Le compte à rebours mesure du TEMPS DE PRÉSENCE, pas du temps d'horloge : une
   annonce partie pendant qu'on est dans un autre logiciel attendrait sinon
   derrière une fenêtre que personne ne regarde, et aurait disparu au retour.
   Elle patiente donc tant que la page n'est pas devant, et ne s'accorde que
   cinq secondes une fois qu'on est là. */
const TOAST_MS = 5000;

function inFront() { return !document.hidden && document.hasFocus(); }

const SWIPE_PX = 70;     // au-delà, le geste est une intention, pas une hésitation
const SWIPE_VX = .5;     // px/ms : un geste court mais franc compte autant

function toast(title, body, onPick) {
  const box = $('toasts'); if (!box) return;
  while (box.children.length >= 4) box.firstChild.remove();
  const el = document.createElement('button');
  el.type = 'button'; el.className = 'toast';
  el.innerHTML = Icons.html('Bell', { size: 17 }) +
    '<span class="txt"><span class="t"></span><span class="b"></span></span>';
  /* textContent : un nom de satellite vient d'un TLE téléchargé, il ne s'injecte
     pas en HTML */
  el.querySelector('.t').textContent = title;
  el.querySelector('.b').textContent = body;

  let timer = null;
  const watch = () => {
    clearTimeout(timer); timer = null;
    if (inFront()) timer = setTimeout(close, TOAST_MS);   // repart à zéro au retour
  };
  function close() {
    if (!el.isConnected) return;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', watch);
    window.removeEventListener('focus', watch);
    window.removeEventListener('blur', watch);
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 220);
  }
  document.addEventListener('visibilitychange', watch);
  window.addEventListener('focus', watch);
  window.addEventListener('blur', watch);
  watch();

  swipeAway(el, close);
  el.onclick = () => { if (onPick) onPick(); close(); };
  box.appendChild(el);
}

/* Glisser vers la droite pour écarter — le sens dans lequel la pastille sort
   déjà. Vers la gauche il n'y a rien : le geste est borné à zéro plutôt que
   suivi puis annulé, sinon on tire une pastille qui ne partira pas. */
function swipeAway(el, close) {
  let x0 = 0, dx = 0, t0 = 0, dragging = false;
  el.addEventListener('pointerdown', e => {
    if (e.button) return;
    dragging = true; dx = 0; x0 = e.clientX; t0 = e.timeStamp;
    el.setPointerCapture(e.pointerId);
    el.style.transition = 'none';     // pendant le geste, la pastille colle au doigt
  });
  el.addEventListener('pointermove', e => {
    if (!dragging) return;
    dx = Math.max(0, e.clientX - x0);
    el.style.transform = 'translateX(' + dx + 'px)';
    el.style.opacity = String(Math.max(0, 1 - dx / 220));
  });
  const drop = e => {
    if (!dragging) return;
    dragging = false;
    el.style.transition = '';
    if (dx > SWIPE_PX || dx / Math.max(1, e.timeStamp - t0) > SWIPE_VX) return close();
    el.style.transform = ''; el.style.opacity = '';   // trop court : elle revient
  };
  el.addEventListener('pointerup', drop);
  el.addEventListener('pointercancel', drop);
  /* En capture, donc avant le onclick de la pastille : un glissement ne doit pas
     valoir un clic, sinon écarter une annonce sélectionnerait son passage. */
  el.addEventListener('click', e => {
    if (dx > 8) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
}

/* L'interrupteur. La permission ne peut être demandée que depuis un geste de
   l'utilisateur : c'est pour ça que c'est un bouton et pas un réglage de
   fichier. L'état est mémorisé par navigateur, comme le thème — une permission
   accordée sur ce poste ne dit rien du poste d'à côté. */
async function toggleAlerts() {
  if (!ALERTS.supported) return renderAlertBtn('Ce navigateur ne sait pas notifier');
  if (ALERTS.on) { ALERTS.on = false; saveAlertPref(false); return renderAlertBtn(); }
  if (Notification.permission === 'denied')
    return renderAlertBtn('Notifications bloquées pour ce site — à rouvrir dans les réglages du navigateur');
  if (Notification.permission !== 'granted') {
    let perm;
    try { perm = await Notification.requestPermission(); } catch (e) { perm = 'denied'; }
    if (perm !== 'granted') return renderAlertBtn('Permission refusée');
  }
  ALERTS.on = true; saveAlertPref(true); renderAlertBtn();
  confirmAlerts();   // le clic prouve tout de suite que la bulle sort vraiment
  checkAlerts();     // un passage déjà dans la fenêtre s'annonce tout de suite
}

/* Activer une alerte sans rien voir, c'est ne pas savoir si elle marchera dans
   dix minutes ou jamais. Le clic sur Alertes envoie donc immédiatement une
   notification — même canal, même apparence que la vraie. Si rien n'apparaît,
   le blocage est côté système (réglages de notifications, mode Concentration),
   pas côté page. */
function confirmAlerts() {
  const cfg = (S.station && S.station.alert) || {};
  const corps = 'Voilà à quoi ressemblera l\'alerte.\n' +
    'Prévenu ' + (cfg.lead_min || 10) + ' min avant un passage au-dessus de ' +
    (cfg.min_elevation_deg || 20) + '°.';
  toast('Alertes activées', corps);
  SFX.arm();                                       // le clic EST le geste attendu
  SFX.play([[659, 0, .11], [988, .1, .2]], .1);
  try {
    new Notification('Alertes activées', { body: corps, tag: 'jbs-on', lang: 'fr' });
  } catch (e) { /* la pastille et le son ont déjà annoncé */ }
}

function saveAlertPref(v) {
  try { localStorage.setItem(ALERT_KEY, v ? '1' : '0'); } catch (e) {}
}

function renderAlertBtn(msg) {
  const b = $('btn-alert'); if (!b) return;
  const on = ALERTS.on && ALERTS.granted;
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  const cfg = (S.station && S.station.alert) || {};
  b.title = msg || (on
    ? 'Notification ' + (cfg.lead_min || 10) + ' min avant un passage au-dessus de ' +
      (cfg.min_elevation_deg || 20) + '° (réglable dans data/station.json).\n' +
      'Aucune bulle ne sort ? Réglages système macOS › Notifications › ce navigateur, ' +
      'et vérifie le mode Concentration.'
    : 'Être prévenu avant un passage exploitable');
  if (msg) { $('banner').hidden = false; $('missing').textContent = msg; }
  renderAlertState(msg);
}

/* Ne s'affiche que quand une action est attendue de l'utilisateur : API absente,
   site refusé, permission jamais demandée. Permission accordée, la ligne
   disparaît — le bouton en accent porte déjà l'état. */
function renderAlertState(msg) {
  const el = $('alert-state'); if (!el) return;
  const perm = ALERTS.supported ? Notification.permission : 'unsupported';
  let cls = 'bad', txt = '';
  if (msg) txt = msg;
  else if (!ALERTS.supported) txt = 'Notifications indisponibles dans ce navigateur';
  else if (perm === 'denied') txt = 'Notifications refusées pour ce site — à réautoriser dans le navigateur';
  else if (perm === 'default') { cls = ''; txt = 'Clique pour autoriser les notifications'; }
  /* permission accordée : le bouton en accent dit déjà tout. Une ligne de plus
     serait du bruit permanent pour une information déjà lisible. */
  el.className = 'alert-state' + (cls ? ' ' + cls : '');
  el.textContent = txt;
  el.hidden = !txt;
}

/* ---- export CHIRP ----------------------------------------------------------
   CHIRP est le format que lisent la plupart des logiciels de programmation, et
   un débutant l'a déjà installé pour ses relais locaux. Les fichiers CHIRP de
   satellites qui circulent sont STATIQUES (cinq canaux à ±10/±5/0 kHz, les
   mêmes pour tout le monde) ; celui-ci est calculé pour CE passage depuis TA
   station, et le commentaire de chaque canal porte l'heure de bascule. */
const CHIRP_HEAD = ['Location', 'Name', 'Frequency', 'Duplex', 'Offset', 'Tone',
  'rToneFreq', 'cToneFreq', 'DtcsCode', 'DtcsPolarity', 'Mode', 'TStep', 'Skip',
  'Comment', 'URCALL', 'RPT1CALL', 'RPT2CALL', 'DVCODE'];

const csvCell = v => {
  v = String(v == null ? '' : v);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
};

function chirpRows(p, plan) {
  const f6 = x => Number(x).toFixed(6);
  return plan.map((s, i) => [
    i + 1,
    (p.sat.id + '-' + pad(i + 1)).slice(0, 16),   // CHIRP tronque les noms longs
    f6(s.rx),
    s.tx ? 'split' : '',                          // en split, Offset porte la TX absolue
    s.tx ? f6(s.tx) : f6(0),
    p.mode.ctcss ? 'Tone' : '',                   // tonalité à l'émission seulement
    (p.mode.ctcss || 88.5).toFixed(1),
    '88.5', '023', 'NN',
    p.mode.type === 'linear' ? 'USB' : 'FM',
    '5.00', '',
    p.satName + ' ' + hhmm(new Date(s.start)) + 'Z',
    '', '', '', ''
  ]);
}

function exportChirp() {
  const p = S.selectedPass;
  if (!p || !S.plan || !S.plan.length) return;
  const csv = [CHIRP_HEAD].concat(chirpRows(p, S.plan))
    .map(r => r.map(csvCell).join(',')).join('\n') + '\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'chirp-' + p.sat.id + '-' + hhmm(new Date(p.aos)) + 'z.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---- vérification ----------------------------------------------------------
   La chorégraphie et le format CHIRP échouent en silence : une consigne au
   mauvais moment ou une colonne décalée ne lèvent aucune erreur. Un seul
   contrôle, lancé par `?selftest` dans l'URL. */
function selfTest() {
  const out = [];
  const ok = (c, m) => { out.push((c ? '✓ ' : '✗ ') + m); if (!c) console.error('selftest:', m); };

  const aos = 1e12;
  const p = { aos, satName: 'SO-50', sat: { id: 'SO-50' },
              mode: { down: 436.795, up: 145.85, ctcss: 67, type: 'fm' } };
  const plan = [{ start: aos, end: aos + 300e3, rx: 436.8, tx: 145.85 },
                { start: aos + 300e3, end: aos + 600e3, rx: 436.79, tx: 145.85 }];

  /* Alerte : la fenêtre, les deux seuils, et le dédoublonnage. Une erreur ici
     ne lève rien — elle se traduit par un silence, ou par un téléphone qui
     sonne pour un passage rasant. */
  const cfg = { lead_min: 10, min_elevation_deg: 20, skip_zenith: true };
  const t0 = 1e12, cone = 75;
  const P = (dtMin, el) => ({ aos: t0 + dtMin * 60e3, maxEl: el, satName: 'X' });
  const dus = (list, done) => dueAlerts(list, t0, cfg, done || [], cone).map(p => p.maxEl);

  ok(dus([P(5, 45)]).length === 1, 'alerte : passage à 5 min dans la fenêtre');
  ok(dus([P(15, 45)]).length === 0, 'alerte : passage à 15 min encore trop loin');
  ok(dus([P(-1, 45)]).length === 0, 'alerte : passage déjà commencé, plus rien à annoncer');
  ok(dus([P(5, 12)]).length === 0, 'alerte : 12° sous le seuil de 20°, on ne dérange pas');
  ok(dus([P(5, 88)]).length === 0, 'alerte : culmine dans le cône de silence, écarté');
  ok(dueAlerts([P(5, 88)], t0, { lead_min: 10, min_elevation_deg: 20 }, [], cone).length === 1,
     'alerte : sans skip_zenith, le passage zénithal repasse');
  ok(dus([P(5, 45)], [t0 + 5 * 60e3]).length === 0, 'alerte : déjà annoncé, pas deux fois');
  ok(dus([P(5, 45), P(8, 60), P(30, 70)]).join() === '45,60',
     'alerte : deux passages dans la fenêtre, le troisième attend');

  // CHIRP : largeur de ligne, split, et tonalité
  const rows = chirpRows(p, plan);
  ok(rows.length === 2, 'CHIRP : une ligne par palier');
  ok(rows[0].length === CHIRP_HEAD.length, 'CHIRP : ' + CHIRP_HEAD.length + ' colonnes');
  ok(rows[0][3] === 'split' && rows[0][4] === '145.850000', 'CHIRP : duplex split, TX en Offset');
  ok(rows[0][5] === 'Tone' && rows[0][6] === '67.0', 'CHIRP : CTCSS à l\'émission');
  ok(csvCell('a,b') === '"a,b"' && csvCell('a"b') === '"a""b"', 'CSV : virgule et guillemet échappés');

  /* Le son : un interrupteur qui ne coupe pas ne lève aucune erreur, il agace.
     Et un son trop long non plus — d'où la borne sur le vocabulaire. */
  const ctx0 = SFX.ctx, on0 = SFX.on;
  let emis = false;
  SFX.ctx = { state: 'running', currentTime: 0, createOscillator() { emis = true; throw 0; } };
  SFX.on = false; try { SFX.play(SND.tap, .05); } catch (e) {}
  ok(!emis, 'son : coupé, aucun oscillateur');
  SFX.on = true; try { SFX.play(SND.tap, .05); } catch (e) {}
  ok(emis, 'son : rallumé, l\'oscillateur part');
  SFX.on = on0; SFX.ctx = ctx0;
  ok(Object.keys(SND).every(k => SND[k].every(n => n[1] + n[2] <= .2)),
     'son : tout le vocabulaire tient sous 200 ms');
  /* Le répartiteur : un bouton d'état doit sonner l'action à venir, pas celle
     qu'on vient de faire — et tout le reste doit retomber sur le clic générique. */
  const el = (id, on) => ({ id, classList: { contains: () => false },
                            getAttribute: () => (on ? 'true' : 'false') });
  ok(clickSound(el('btn-follow', true)) === SND.free &&
     clickSound(el('btn-follow', false)) === SND.lock, 'son : suivre et lâcher s\'opposent');
  ok(clickSound(el('tb1', false)) === SND.tap, 'son : un onglet prend le clic générique');

  /* matchTle : le NORAD prime sur le nom. Avec ~1600 TLE, « ISS » en sous-chaîne
     attrape SWISSCUBE, AISSAT, ISS (NAUKA)… avant la vraie station — et ça ne
     lève rien, juste des passages faux ou aucun passage ISS. */
  const savedTle = S.tle;
  S.tle = { 'ISS (ZARYA)': { norad: 99999, l1: 'DECOY', l2: 'x' },
            'ISS':         { norad: 25544, l1: 'REAL',  l2: 'x' } };
  ok(matchTle({ match: ['ISS (ZARYA)', 'ISS', 'ZARYA'], norad: 25544 }).l1 === 'REAL',
     'matchTle : le NORAD prime sur le nom (ISS pas confondue avec un homonyme)');
  ok(matchTle({ match: ['INTROUVABLE'], norad: 424242 }) === null,
     'matchTle : rien trouvé -> null');
  S.tle = savedTle;

  /* crossEl : trouve les instants où l'élévation franchit le seuil exploitable.
     Une erreur ici = un bandeau « écoute maintenant » décalé de plusieurs
     minutes par rapport à l'empreinte de la carte, sans rien signaler. */
  const _elevAt = elevationAt;
  elevationAt = (_r, ms) => 30 - (25 / 160000) * (ms - 500) * (ms - 500);  // 5° à t=100 et t=900
  const cA = crossEl(null, 0, 500, 5), cB = crossEl(null, 500, 1000, 5);
  ok(Math.abs(cA - 100) < 3 && Math.abs(cB - 900) < 3, 'crossEl : les deux franchissements du seuil');
  /* findPasses : un passage déjà commencé doit être trouvé (lever dans le passé),
     sinon le bandeau dit « Rien au-dessus de toi » alors qu'un satellite est levé. */
  elevationAt = (_r, ms) => 30 - (30 / 3.6e11) * ms * ms;                 // levé de -10 à +10 min
  const fpLive = findPasses(null, 0, 1, 5);
  ok(fpLive.length === 1 && Math.abs(fpLive[0].aos + 600e3) < 2000 && Math.abs(fpLive[0].los - 600e3) < 2000,
     'findPasses : passage en cours retrouvé avec son vrai lever');
  elevationAt = _elevAt;

  /* Locator <-> lat/lon : « Me localiser » convertit la position de l'appareil
     en locator, tout le reste du code repart de ce locator. Un aller-retour qui
     ne retombe pas dans la même case = station affichée au mauvais endroit, sans
     rien qui le signale. */
  ok(['JN37QS', 'IO91WM', 'FN20', 'GF15', 'RE78'].every(g => {
    const c = locatorToLatLon(g);
    return latLonToLocator(c.lat, c.lon).slice(0, g.length) === g;
  }), 'locator : aller-retour lat/lon sur plusieurs carrés');
  ok(latLonToLocator(999, 0) === null && latLonToLocator('x', 0) === null,
     'locator : lat/lon hors bornes ou non numérique -> null');
  /* saveSetup() compte sur ce hook pour redéplacer la maison sur la carte après
     un changement de position. Un renommage le casserait en silence : le calcul
     resterait juste, mais le marqueur figé à l'ancien endroit. */
  ok(typeof MAP.setStation === 'function', 'carte : hook de repositionnement de la station présent');

  const bad = out.filter(l => l[0] === '✗').length;
  console.log('%cselftest JB-SATRACK — ' + (out.length - bad) + '/' + out.length,
    'font-weight:700;color:' + (bad ? '#ff6b6b' : '#63e6a0'));
  out.forEach(l => console.log(l));
  return !bad;
}

window.addEventListener('DOMContentLoaded', () => {
  wireTabs();
  applyTheme(currentTheme());
  $('btn-theme').onclick = () => applyTheme(currentTheme() === 'light' ? 'dark' : 'light');
  $('memo-more').onclick = () => { const t = $('tb1'); selectTab(t); t.focus(); };
  /* un canvas dans un <details> replié a une taille nulle : on redessine à l'ouverture */
  $('det-polar').addEventListener('toggle', () => { if ($('det-polar').open) drawPolar(); });
});
