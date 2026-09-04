/* TEST UNIQUEMENT — remplaçant grossier de satellite.js (orbite circulaire, pas de SGP4).
   Sert à valider l'interface hors ligne. Ne jamais utiliser en exploitation :
   l'application télécharge la vraie bibliothèque satellite.js via /vendor/satellite.min.js. */
(function (g) {
  const D = Math.PI / 180, MU = 398600.4418, RE = 6378.137;

  function twoline2satrec(l1, l2) {
    const inc = parseFloat(l2.substring(8, 16));
    const raan = parseFloat(l2.substring(17, 25));
    const argp = parseFloat(l2.substring(34, 42));
    const m0 = parseFloat(l2.substring(43, 51));
    const n = parseFloat(l2.substring(52, 63));          // rev/jour
    const yy = parseInt(l1.substring(18, 20), 10);
    const dd = parseFloat(l1.substring(20, 32));
    const epoch = Date.UTC(2000 + yy, 0, 1) + (dd - 1) * 86400000;
    return { inc: inc * D, raan: raan * D, argp: argp * D, m0: m0 * D,
             no: n * 2 * Math.PI / 1440, epoch, error: 0 };
  }

  function propagate(rec, date) {
    const t = (date.getTime() - rec.epoch) / 60000;      // minutes
    const a = Math.cbrt(MU / Math.pow(rec.no / 60, 2));
    const u = rec.m0 + rec.argp + rec.no * t;
    const cu = Math.cos(u), su = Math.sin(u);
    const ci = Math.cos(rec.inc), si = Math.sin(rec.inc);
    const O = rec.raan, cO = Math.cos(O), sO = Math.sin(O);
    const v = Math.sqrt(MU / a);
    return {
      position: { x: a * (cu * cO - su * ci * sO), y: a * (cu * sO + su * ci * cO), z: a * su * si },
      velocity: { x: v * (-su * cO - cu * ci * sO), y: v * (-su * sO + cu * ci * cO), z: v * cu * si }
    };
  }

  function gstime(date) {
    const jd = date.getTime() / 86400000 + 2440587.5;
    const T = (jd - 2451545) / 36525;
    let th = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T;
    return (((th % 360) + 360) % 360) * D;
  }

  const eciToEcf = (p, g) => ({ x: p.x * Math.cos(g) + p.y * Math.sin(g),
                                y: -p.x * Math.sin(g) + p.y * Math.cos(g), z: p.z });

  function eciToGeodetic(p, g) {
    const e = eciToEcf(p, g);
    const r = Math.sqrt(e.x * e.x + e.y * e.y);
    return { longitude: Math.atan2(e.y, e.x), latitude: Math.atan2(e.z, r),
             height: Math.sqrt(r * r + e.z * e.z) - RE };
  }

  function ecfToLookAngles(obs, sat) {
    const lat = obs.latitude, lon = obs.longitude, h = obs.height;
    const R = RE + h;
    const o = { x: R * Math.cos(lat) * Math.cos(lon), y: R * Math.cos(lat) * Math.sin(lon), z: R * Math.sin(lat) };
    const r = { x: sat.x - o.x, y: sat.y - o.y, z: sat.z - o.z };
    const s = Math.sin(lat) * Math.cos(lon) * r.x + Math.sin(lat) * Math.sin(lon) * r.y - Math.cos(lat) * r.z;
    const e = -Math.sin(lon) * r.x + Math.cos(lon) * r.y;
    const z = Math.cos(lat) * Math.cos(lon) * r.x + Math.cos(lat) * Math.sin(lon) * r.y + Math.sin(lat) * r.z;
    const rng = Math.sqrt(r.x * r.x + r.y * r.y + r.z * r.z);
    let az = Math.atan2(-e, s) + Math.PI;
    return { azimuth: az, elevation: Math.asin(z / rng), rangeSat: rng };
  }

  g.satellite = { twoline2satrec, propagate, gstime, eciToEcf, eciToGeodetic, ecfToLookAngles,
                  degreesLat: r => r / D, degreesLong: r => r / D };
})(window);
