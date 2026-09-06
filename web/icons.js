/* JB-SATRACK — banque d'icônes Reicon (graisse Filled).

   TOUTE icône de l'interface vient d'ici. Pas d'emoji décoratif, pas d'autre
   jeu d'icônes, pas de SVG dessiné à la main.

   Le serveur (app.py, ensure_icon) récupère chaque icône depuis le paquet npm
   « reicon » (version épinglée), en extrait le tracé Filled, l'enregistre en
   SVG dans data/vendor/icons/<Nom>.svg et la sert sur /vendor/icon/<Nom>.svg —
   même schéma de mise en cache que satellite.js et Leaflet.

   Ajouter une icône :
     1. prendre son nom PascalCase sur https://reicon.dev/icons?weight=filled
     2. l'utiliser — dans le HTML :   <span class="ic" data-ic="Radio"></span>
                    — ou en JS :       Icons.html('Radio', { size: 18 })
     3. l'ajouter à MANIFEST ci-dessous (préchargement au démarrage).
   Le style monochrome suit currentColor (voir .ic dans style.css). */
'use strict';

const Icons = (function () {
  const cache = new Map();        // nom -> chaîne <svg> ('' si indisponible)
  const inflight = new Map();

  // icônes utilisées par l'interface — préchargées au démarrage
  const MANIFEST = [
    'Setting', 'Refresh', 'Download', 'Save', 'Home', 'Check', 'X',
    'Plus', 'Minus',
    'SignalStream', 'Radio', 'Sliders', 'Satellite',
    'Clock', 'Timer', 'Calendar', 'Activity', 'Bell',
    'Globe', 'Target', 'Compass', 'Route', 'Ruler', 'Gauge',
    'ArrowUp', 'ArrowDown', 'Eye', 'Moon', 'VolumeHigh', 'VolumeMute',
    'List', 'Notebook', 'Book',
    'Sun', 'CloudSun', 'Cloud', 'CloudFog', 'CloudDrizzle', 'CloudRain',
    'CloudSnow', 'CloudLightning', 'CloudStorm', 'CloudBolt', 'TriangleWarning'
  ];

  function fetchOne(name) {
    if (cache.has(name)) return Promise.resolve(cache.get(name));
    if (inflight.has(name)) return inflight.get(name);
    const p = fetch('/vendor/icon/' + encodeURIComponent(name) + '.svg')
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (txt) {
        const svg = txt && txt.lastIndexOf('<svg', 0) === 0 ? txt.trim() : '';
        cache.set(name, svg);
        inflight.delete(name);
        fillAll(name);
        return svg;
      })
      .catch(function () { inflight.delete(name); cache.set(name, ''); return ''; });
    inflight.set(name, p);
    return p;
  }

  function preload(names) { return Promise.all((names || MANIFEST).map(fetchOne)); }

  function fill(el) {
    if (!el || el.firstChild) return;
    const n = el.getAttribute('data-ic');
    if (!n) return;
    const svg = cache.get(n);
    if (svg) el.innerHTML = svg;
    else if (svg === undefined) fetchOne(n);
  }

  /* Change l'icône d'un <span class="ic"> déjà en place. fill() sort tout de
     suite si l'élément a déjà un enfant, et le MutationObserver ne surveille
     que les ajouts de nœuds — pas les changements d'attribut. Il faut donc
     vider avant de re-remplir. */
  function set(el, name) {
    if (!el) return;
    el.setAttribute('data-ic', name);
    el.textContent = '';
    fill(el);
  }

  function fillAll(name) {
    const q = document.querySelectorAll('span.ic[data-ic="' + name + '"]');
    for (let i = 0; i < q.length; i++) fill(q[i]);
  }

  /* Chaîne prête à insérer dans un innerHTML. Le contenu SVG est posé tout de
     suite s'il est en cache, sinon dès son arrivée (fillAll / MutationObserver). */
  function html(name, opts) {
    opts = opts || {};
    const cls = 'ic' + (opts.className ? ' ' + opts.className : '');
    let st = opts.style || '';
    if (opts.size) st = 'font-size:' + opts.size + 'px;' + st;
    const svg = cache.get(name) || '';
    return '<span class="' + cls + '" data-ic="' + name + '"' +
           (st ? ' style="' + st + '"' : '') + '>' + svg + '</span>';
  }

  function scan(root) {
    const q = (root || document).querySelectorAll('span.ic[data-ic]');
    for (let i = 0; i < q.length; i++) fill(q[i]);
  }

  function start() {
    scan(document);
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(function (muts) {
        for (const m of muts) {
          for (const node of m.addedNodes) {
            if (!node || node.nodeType !== 1) continue;
            if (node.matches && node.matches('span.ic[data-ic]')) fill(node);
            if (node.querySelectorAll) scan(node);
          }
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start);
  else start();

  return { html: html, preload: preload, fetch: fetchOne, set: set, MANIFEST: MANIFEST };
})();
