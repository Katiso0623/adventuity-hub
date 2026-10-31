 
(function (root) {
  'use strict';
  const FL = root.FL = root.FL || {};
  const A = 6378137.0, F = 1 / 298.257223563;
  const E2 = F * (2 - F), EP2 = E2 / (1 - E2);
  const E4 = E2 * E2, E6 = E4 * E2;
  const M1 = 1 - E2 / 4 - 3 * E4 / 64 - 5 * E6 / 256;
  const M2 = 3 * E2 / 8 + 3 * E4 / 32 + 45 * E6 / 1024;
  const M3 = 15 * E4 / 256 + 45 * E6 / 1024;
  const M4 = 35 * E6 / 3072;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  function meridianArc(phi) {
    return A * (M1 * phi - M2 * Math.sin(2 * phi) + M3 * Math.sin(4 * phi) - M4 * Math.sin(6 * phi));
  }
  function tmForward(lat, lon, lon0, k0) {
    const phi = lat * D2R, lam = (lon - lon0) * D2R;
    const s = Math.sin(phi), c = Math.cos(phi), t = Math.tan(phi);
    const N = A / Math.sqrt(1 - E2 * s * s), T = t * t, C = EP2 * c * c, Aa = lam * c;
    const M = meridianArc(phi);
    const x = k0 * N * (Aa + (1 - T + C) * Aa ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * Aa ** 5 / 120);
    const y = k0 * (M + N * t * (Aa * Aa / 2 + (5 - T + 9 * C + 4 * C * C) * Aa ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Aa ** 6 / 720));
    return { x, y };
  }
  function tmInverse(x, y, lon0, k0) {
    const M = y / k0;
    const mu = M / (A * M1);
    const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
    const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
      + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
    const s = Math.sin(phi1), c = Math.cos(phi1), t = Math.tan(phi1);
    const C1 = EP2 * c * c, T1 = t * t, N1 = A / Math.sqrt(1 - E2 * s * s), R1 = A * (1 - E2) / Math.pow(1 - E2 * s * s, 1.5);
    const D = x / (N1 * k0);
    const phi = phi1 - (N1 * t / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4 / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6 / 720);
    const lam = (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5 / 120) / c;
    return { lat: phi * R2D, lon: lon0 + lam * R2D };
  }
  function loCM(lon) { return 2 * Math.floor(lon / 2) + 1; }
  function toLoEN(lat, lon, cm) { const p = tmForward(lat, lon, cm, 1); return { E: p.x, N: p.y }; }
  function fromLoEN(E, N, cm) { return tmInverse(E, N, cm, 1); }
  function loYX(E, N) { return { Y: -E, X: -N }; }
  function utmZone(lon) { return Math.floor((lon + 180) / 6) + 1; }
  function toUTM(lat, lon, zone) {
    const cm = zone * 6 - 183; const p = tmForward(lat, lon, cm, 0.9996);
    return { E: p.x + 500000, N: p.y + (lat < 0 ? 10000000 : 0), zone };
  }
  function fromUTM(E, N, zone, south) {
    const cm = zone * 6 - 183; return tmInverse(E - 500000, N - (south ? 10000000 : 0), cm, 0.9996);
  }
  function lonToPx(lon, z) { return (lon + 180) / 360 * 256 * Math.pow(2, z); }
  function latToPx(lat, z) {
    const s = Math.sin(lat * D2R);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * Math.pow(2, z);
  }
  function pxToLon(px, z) { return px / (256 * Math.pow(2, z)) * 360 - 180; }
  function pxToLat(py, z) {
    const n = Math.PI - 2 * Math.PI * py / (256 * Math.pow(2, z));
    return R2D * Math.atan(Math.sinh(n));
  }
  function terrariumDecode(r, g, b) { return r * 256 + g + b / 256 - 32768; }
  function mercRes(lat, z) { return 156543.03392804097 * Math.cos(lat * D2R) / Math.pow(2, z); }
  function fmtDMS(v, pos, neg) {
    const h = v < 0 ? neg : pos; v = Math.abs(v);
    const d = Math.floor(v), mf = (v - d) * 60, m = Math.floor(mf), s = (mf - m) * 60;
    return d + '°' + String(m).padStart(2, '0') + '′' + s.toFixed(2).padStart(5, '0') + '″' + h;
  }
  function parseLatLon(str) {
    if (!str) return null;
    const s = String(str).trim().replace(/[,;]+/g, ' ');
    const dms = /(\d+(?:\.\d+)?)\s*[°d\s]\s*(\d+(?:\.\d+)?)?\s*['′m]?\s*(\d+(?:\.\d+)?)?\s*["″s]?\s*([NSEW])/gi;
    const parts = []; let m;
    while ((m = dms.exec(s))) {
      let v = parseFloat(m[1]) + (m[2] ? parseFloat(m[2]) / 60 : 0) + (m[3] ? parseFloat(m[3]) / 3600 : 0);
      const h = m[4].toUpperCase(); if (h === 'S' || h === 'W') v = -v;
      parts.push({ v, h });
    }
    if (parts.length === 2) {
      const lat = parts.find(p => p.h === 'N' || p.h === 'S'), lon = parts.find(p => p.h === 'E' || p.h === 'W');
      if (lat && lon) return valid(lat.v, lon.v);
    }
    const nums = s.match(/-?\d+(?:\.\d+)?/g);
    if (nums && nums.length === 2) {
      let a = parseFloat(nums[0]), b = parseFloat(nums[1]);
      const south = !!(FL.geo && FL.geo.assumeSouth);
      if ((Math.abs(a) > 90 && Math.abs(b) <= 90) || (south && a > 15 && a < 34 && b < -21 && b > -36)) { const t = a; a = b; b = t; }
      if (south && a > 0 && a < 36 && b > 15 && b < 34) a = -a;
      return valid(a, b);
    }
    return null;
    function valid(lat, lon) { return (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) ? { lat, lon } : null; }
  }
  const ZA_POLY = [[16.3, -28.6], [17.4, -28.7], [18.2, -28.9], [19.0, -28.9], [20.0, -28.4], [20.0, -24.75], [20.8, -26.8], [22.6, -26.0], [23.5, -25.6], [25.2, -25.7], [26.0, -24.7], [26.9, -23.6], [28.0, -22.6], [29.4, -22.2], [31.3, -22.4], [31.9, -24.0], [32.0, -25.0], [32.95, -26.85], [32.6, -28.6], [31.6, -29.9], [30.3, -31.4], [28.4, -32.9], [26.6, -34.0], [25.0, -34.2], [23.0, -34.2], [20.0, -35.0], [18.3, -34.6], [17.8, -33.3], [17.6, -32.7], [17.0, -31.0]];
  function inPoly(x, y, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function region(lat, lon) { return (lat == null || lon == null) ? 'za' : inPoly(lon, lat, ZA_POLY) ? 'za' : 'intl'; }
  function siteCM(lat, lon, reg) { return (reg || region(lat, lon)) === 'za' ? loCM(lon) : utmZone(lon) * 6 - 183; }
  function crsInfo(reg, cm, lat) {
    if (reg !== 'intl') return { kind: 'lo', cm };
    return { kind: 'utm', cm, zone: Math.round((cm + 183) / 6), south: lat < 0 };
  }
  function crsOf(info) {
    const c = info && info.kind ? info : { kind: 'lo', cm: info && info.cm != null ? info.cm : 29 };
    if (c.kind !== 'utm') {
      return { kind: 'lo', cm: c.cm, label: 'Hartebeesthoek94 Lo' + c.cm, short: 'Lo' + c.cm, datum: 'HARTEBEESTHOEK94', zoneName: 'Lo' + c.cm, ax: ['Y', 'X'],
        note: 'Y positive west, X positive south', cadNote: 'X = −Y(Lo), Y = −X(Lo), metres', out: (E, N) => [-E, -N], inv: (a, b) => [-a, -b], cad: (E, N) => [E, N] };
    }
    const k = 0.9996, FN = c.south ? 10000000 : 0, hemi = c.south ? 'S' : 'N';
    return { kind: 'utm', cm: c.cm, zone: c.zone, south: c.south, label: 'WGS 84 / UTM zone ' + c.zone + hemi, short: 'UTM ' + c.zone + hemi, datum: 'WGS84', zoneName: 'UTM ' + c.zone + hemi, ax: ['E', 'N'],
      note: 'Easting and northing in metres', cadNote: 'X = easting, Y = northing (UTM zone ' + c.zone + hemi + '), metres',
      out: (E, N) => [500000 + k * E, FN + k * N], inv: (a, b) => [(a - 500000) / k, (b - FN) / k], cad: (E, N) => [500000 + k * E, FN + k * N] };
  }
  function fmtLatLon(lat, lon, d) { d = d == null ? 5 : d; return Math.abs(lat).toFixed(d) + '° ' + (lat < 0 ? 'S' : 'N') + ', ' + Math.abs(lon).toFixed(d) + '° ' + (lon < 0 ? 'W' : 'E'); }
  FL.geo = {
    tmForward, tmInverse, loCM, toLoEN, fromLoEN, loYX, utmZone, toUTM, fromUTM,
    lonToPx, latToPx, pxToLon, pxToLat, terrariumDecode, mercRes, fmtDMS, parseLatLon, D2R, R2D,
    region, siteCM, crsInfo, crsOf, fmtLatLon, inPoly, ZA_POLY, assumeSouth: true,
  };
})(typeof window !== 'undefined' ? window : globalThis);
(function (root) {
  'use strict';
  const FL = root.FL = root.FL || {};
  const G = () => FL.geo;
  class Grid {
    constructor(nx, ny, e0, n0, dx, z) {
      this.nx = nx; this.ny = ny; this.e0 = e0; this.n0 = n0; this.dx = dx;
      this.z = z || new Float32Array(nx * ny).fill(NaN);
    }
    E(i) { return this.e0 + i * this.dx; }
    N(j) { return this.n0 - j * this.dx; }
    idx(i, j) { return j * this.nx + i; }
    ij(k) { return [k % this.nx, (k / this.nx) | 0]; }
    EN(k) { const i = k % this.nx, j = (k / this.nx) | 0; return [this.e0 + i * this.dx, this.n0 - j * this.dx]; }
    cellOf(E, N) {
      const i = Math.round((E - this.e0) / this.dx), j = Math.round((this.n0 - N) / this.dx);
      return (i < 0 || j < 0 || i >= this.nx || j >= this.ny) ? -1 : j * this.nx + i;
    }
    sample(E, N, field) {
      const f = field || this.z;
      const fi = (E - this.e0) / this.dx, fj = (this.n0 - N) / this.dx;
      if (fi < 0 || fj < 0 || fi > this.nx - 1 || fj > this.ny - 1) return NaN;
      const i = Math.min(Math.floor(fi), this.nx - 2), j = Math.min(Math.floor(fj), this.ny - 2);
      const u = fi - i, v = fj - j, k = j * this.nx + i;
      const a = f[k], b = f[k + 1], c = f[k + this.nx], d = f[k + this.nx + 1];
      if (a !== a || b !== b || c !== c || d !== d) { 
        const n = f[Math.round(fj) * this.nx + Math.round(fi)];
        return n;
      }
      return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
    }
    bounds() { return { e0: this.e0 - this.dx / 2, e1: this.e0 + (this.nx - 0.5) * this.dx, n1: this.n0 + this.dx / 2, n0: this.n0 - (this.ny - 0.5) * this.dx }; }
    stats() {
      let mn = Infinity, mx = -Infinity, nv = 0;
      for (const v of this.z) { if (v === v) { if (v < mn) mn = v; if (v > mx) mx = v; } else nv++; }
      return { min: mn, max: mx, nodata: nv };
    }
    resample(e0, n0, nx, ny, dx2) {
      const g = new Grid(nx, ny, e0, n0, dx2);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) g.z[j * nx + i] = this.sample(e0 + i * dx2, n0 - j * dx2);
      return g;
    }
  }
  const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
  const tileCache = new Map();
  const TERRARIUM_ALT = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
  function browserTileLoader(z, x, y, url) {
    const key = z + '/' + x + '/' + y;
    if (tileCache.has(key)) return tileCache.get(key);
    const p = loadTerrainTile(z, x, y, url || TERRARIUM_URL).catch(e => url ? Promise.reject(e) : loadTerrainTile(z, x, y, TERRARIUM_ALT));
    p.catch(() => tileCache.delete(key));
    tileCache.set(key, p);
    return p;
  }
  function loadTerrainTile(z, x, y, url) {
    const key = z + '/' + x + '/' + y;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const t = setTimeout(() => reject({ code: 'timeout', message: 'Terrain tile ' + key + ' timed out' }), 20000);
      img.onload = () => {
        clearTimeout(t);
        try {
          const c = document.createElement('canvas'); c.width = 256; c.height = 256;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          const d = ctx.getImageData(0, 0, 256, 256).data, h = new Float32Array(65536);
          for (let i = 0, k = 0; i < 65536; i++, k += 4) h[i] = d[k] * 256 + d[k + 1] + d[k + 2] / 256 - 32768;
          resolve(h);
        } catch (e) { reject({ code: 'blocked', message: 'The browser blocked reading terrain pixels (CORS).' }); }
      };
      img.onerror = () => { clearTimeout(t); reject({ code: 'blocked', message: 'Terrain tile ' + key + ' could not be downloaded.' }); };
      img.src = url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    });
  }
  function zoomFor(lat, cell) {
    for (let z = 15; z >= 8; z--) if (G().mercRes(lat, z) >= cell * 0.55) return z;
    return 8;
  }
  async function fetchLiveTerrain(opts) {
    const geo = G();
    const cm = opts.cm != null ? opts.cm : geo.siteCM(opts.lat, opts.lon);
    const c = (opts.cE != null) ? { E: opts.cE, N: opts.cN } : geo.toLoEN(opts.lat, opts.lon, cm);
    const cell = opts.cell, halfW = opts.halfW, halfH = opts.halfH || opts.halfW;
    const nx = Math.round(2 * halfW / cell) + 1, ny = Math.round(2 * halfH / cell) + 1;
    const e0 = c.E - (nx - 1) * cell / 2, n0 = c.N + (ny - 1) * cell / 2;
    const ll = geo.fromLoEN(c.E, c.N, cm);
    const z = opts.zoom || zoomFor(ll.lat, cell);
    let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180;
    const edge = (E, N) => { const p = geo.fromLoEN(E, N, cm); la0 = Math.min(la0, p.lat); la1 = Math.max(la1, p.lat); lo0 = Math.min(lo0, p.lon); lo1 = Math.max(lo1, p.lon); };
    for (let t = 0; t <= 16; t++) {
      const fe = e0 + (nx - 1) * cell * t / 16, fn = n0 - (ny - 1) * cell * t / 16;
      edge(fe, n0); edge(fe, n0 - (ny - 1) * cell); edge(e0, fn); edge(e0 + (nx - 1) * cell, fn);
    }
    const px0 = geo.lonToPx(lo0, z) - 2, px1 = geo.lonToPx(lo1, z) + 2, py0 = geo.latToPx(la1, z) - 2, py1 = geo.latToPx(la0, z) + 2;
    const tx0 = Math.floor(px0 / 256), tx1 = Math.floor(px1 / 256), ty0 = Math.floor(py0 / 256), ty1 = Math.floor(py1 / 256);
    const mw = (tx1 - tx0 + 1) * 256, mh = (ty1 - ty0 + 1) * 256;
    const mosaic = new Float32Array(mw * mh).fill(NaN);
    const loader = opts.loader || ((zz, x, y) => browserTileLoader(zz, x, y, opts.url));
    const jobs = [];
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push([tx, ty]);
    let done = 0, firstErr = null;
    const worker = async () => {
      while (jobs.length) {
        const [tx, ty] = jobs.shift();
        try {
          const h = await loader(z, tx, ty);
          const ox = (tx - tx0) * 256, oy = (ty - ty0) * 256;
          for (let r = 0; r < 256; r++) mosaic.set(h.subarray(r * 256, r * 256 + 256), (oy + r) * mw + ox);
        } catch (e) { firstErr = firstErr || e; }
        done++; if (opts.onProgress) opts.onProgress(done / ((tx1 - tx0 + 1) * (ty1 - ty0 + 1)), 'Downloading terrain tiles ' + done + '/' + ((tx1 - tx0 + 1) * (ty1 - ty0 + 1)));
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    if (firstErr) throw firstErr;
    const grid = new Grid(nx, ny, e0, n0, cell);
    const pxBase = tx0 * 256, pyBase = ty0 * 256;
    for (let j = 0; j < ny; j++) {
      let prev = null;
      for (let i = 0; i < nx; i += 8) {
        const i2 = Math.min(i + 8, nx - 1);
        const a = prev || proj(i, j), b = proj(i2, j);
        for (let ii = i; ii <= i2 && ii < nx; ii++) {
          const t = i2 === i ? 0 : (ii - i) / (i2 - i);
          const fx = a[0] + (b[0] - a[0]) * t - pxBase - 0.5, fy = a[1] + (b[1] - a[1]) * t - pyBase - 0.5;
          grid.z[j * nx + ii] = bilin(mosaic, mw, mh, fx, fy);
        }
        prev = b;
      }
    }
    grid.meta = { source: 'live', zoom: z, tileRes: geo.mercRes(ll.lat, z), cm, url: opts.url || TERRARIUM_URL };
    return grid;
    function proj(i, j) { const p = geo.fromLoEN(e0 + i * cell, n0 - j * cell, cm); return [geo.lonToPx(p.lon, z), geo.latToPx(p.lat, z)]; }
  }
  function bilin(f, w, h, fx, fy) {
    if (fx < 0 || fy < 0 || fx > w - 1 || fy > h - 1) return NaN;
    const i = Math.min(Math.floor(fx), w - 2), j = Math.min(Math.floor(fy), h - 2), u = fx - i, v = fy - j, k = j * w + i;
    const a = f[k], b = f[k + 1], c = f[k + w], d = f[k + w + 1];
    if (a !== a || b !== b || c !== c || d !== d) return f[Math.round(fy) * w + Math.round(fx)];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  function parseAsciiGrid(text) {
    const lines = text.split(/\r?\n/);
    const hdr = {}; let li = 0;
    for (; li < lines.length; li++) {
      const m = lines[li].trim().match(/^([a-zA-Z_]+)\s+(-?[\d.eE+-]+)$/);
      if (!m) break; hdr[m[1].toLowerCase()] = parseFloat(m[2]);
    }
    const w = hdr.ncols, h = hdr.nrows;
    if (!w || !h) throw new Error('Not an ESRI ASCII grid: missing ncols/nrows header.');
    const dxv = hdr.cellsize || hdr.dx, dyv = hdr.cellsize || hdr.dy || dxv;
    const nod = hdr.nodata_value != null ? hdr.nodata_value : -9999;
    let xl = hdr.xllcorner, yl = hdr.yllcorner;
    if (xl == null) xl = hdr.xllcenter - dxv / 2;
    if (yl == null) yl = hdr.yllcenter - dyv / 2;
    const data = new Float32Array(w * h); let k = 0;
    const body = lines.slice(li).join(' ');
    const re = /-?[\d.]+(?:[eE][-+]?\d+)?/g; let m;
    while ((m = re.exec(body)) && k < w * h) { const v = parseFloat(m[0]); data[k++] = (v === nod) ? NaN : v; }
    if (k < w * h) throw new Error('ASCII grid ended early: read ' + k + ' of ' + (w * h) + ' values.');
    return { w, h, data, x0: xl, y0: yl + h * dyv, rx: dxv, ry: -dyv };
  }
  async function parseGeoTiff(buffer) {
    if (!root.GeoTIFF) throw new Error('GeoTIFF reader not loaded.');
    const tiff = await root.GeoTIFF.fromArrayBuffer(buffer);
    const img = await tiff.getImage();
    const w = img.getWidth(), h = img.getHeight();
    if (w * h > 64e6) throw new Error('This GeoTIFF has ' + (w * h / 1e6).toFixed(0) + ' million cells. Please clip it to the study area (under 64 million cells).');
    const [ox, oy] = img.getOrigin(), [rx, ry] = img.getResolution();
    const ras = await img.readRasters({ samples: [0], interleave: true });
    const nodRaw = img.getGDALNoData ? img.getGDALNoData() : null;
    const data = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) { const v = ras[i]; data[i] = (nodRaw != null && v === nodRaw) || v < -1000 || v > 9000 ? NaN : v; }
    const keys = img.getGeoKeys ? img.getGeoKeys() : {};
    const epsg = keys.ProjectedCSTypeGeoKey || keys.GeographicTypeGeoKey || null;
    return { w, h, data, x0: ox, y0: oy, rx, ry, epsg, crs: crsFromEpsg(epsg) };
  }
  function crsFromEpsg(code) {
    if (!code) return null;
    if (code === 4326 || code === 4148) return { kind: 'geo' };
    if (code >= 32701 && code <= 32760) return { kind: 'utm', zone: code - 32700, south: true };
    if (code >= 32601 && code <= 32660) return { kind: 'utm', zone: code - 32600, south: false };
    if (code >= 2046 && code <= 2055) return { kind: 'lo-survey', cm: 15 + 2 * (code - 2046), note: 'Hartebeesthoek94 Lo' + (15 + 2 * (code - 2046)) + ' (EPSG:' + code + ')' };
    if (code >= 22275 && code <= 22293) return { kind: 'lo-survey', cm: 15 + (code - 22275), warn: 'Cape datum (pre-1999). Heights and positions may be offset from Hartebeesthoek94.' };
    return { kind: 'unknown', epsg: code };
  }
  function sourceProjector(crs) {
    const geo = G();
    switch (crs.kind) {
      case 'geo': return (lat, lon) => [lon, lat];
      case 'utm': return (lat, lon) => { const u = geo.toUTM(lat, lon, crs.zone); return [u.E, u.N]; };
      case 'lo-gis': return (lat, lon) => { const p = geo.toLoEN(lat, lon, crs.cm); return [p.E, p.N]; };
      case 'lo-survey': return (lat, lon) => { const p = geo.toLoEN(lat, lon, crs.cm); return [-p.E, -p.N]; };
      default: throw new Error('Choose the coordinate system of the uploaded terrain file.');
    }
  }
  function sourceInverse(crs) {
    const geo = G();
    switch (crs.kind) {
      case 'geo': return (x, y) => ({ lat: y, lon: x });
      case 'utm': return (x, y) => geo.fromUTM(x, y, crs.zone, crs.south !== false);
      case 'lo-gis': return (x, y) => geo.fromLoEN(x, y, crs.cm);
      case 'lo-survey': return (x, y) => geo.fromLoEN(-x, -y, crs.cm);
      default: throw new Error('Unknown coordinate system');
    }
  }
  function rasterToGrid(src, crs, cm, cell, extent) {
    const geo = G(), toSrc = sourceProjector(crs), inv = sourceInverse(crs);
    let e0, n0, nx, ny;
    if (extent) { ({ e0, n0, nx, ny } = extent); }
    else {
      let emin = Infinity, emax = -Infinity, nmin = Infinity, nmax = -Infinity;
      for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5]]) {
        const ll = inv(src.x0 + fx * src.w * src.rx, src.y0 + fy * src.h * src.ry);
        const p = geo.toLoEN(ll.lat, ll.lon, cm);
        emin = Math.min(emin, p.E); emax = Math.max(emax, p.E); nmin = Math.min(nmin, p.N); nmax = Math.max(nmax, p.N);
      }
      e0 = Math.ceil(emin / cell) * cell; n0 = Math.floor(nmax / cell) * cell;
      nx = Math.floor((emax - e0) / cell) + 1; ny = Math.floor((n0 - nmin) / cell) + 1;
      if (nx * ny > 9e6) throw new Error('The uploaded terrain is too large for this cell size. Increase the cell size or clip the file.');
    }
    const g = new Grid(nx, ny, e0, n0, cell);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const ll = geo.fromLoEN(e0 + i * cell, n0 - j * cell, cm);
      const [x, y] = toSrc(ll.lat, ll.lon);
      g.z[j * nx + i] = bilin(src.data, src.w, src.h, (x - src.x0) / src.rx - 0.5, (y - src.y0) / src.ry - 0.5);
    }
    g.meta = { source: 'upload', cm, srcRes: Math.abs(src.rx) };
    return g;
  }
  function patchHoles(g, maxIter) {
    const { nx, ny, z } = g;
    for (let it = 0; it < (maxIter || 6); it++) {
      let changed = 0; const copy = z.slice();
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i; if (copy[k] === copy[k]) continue;
        let s = 0, n = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
          const v = copy[jj * nx + ii]; if (v === v) { s += v; n++; }
        }
        if (n >= 3) { z[k] = s / n; changed++; }
      }
      if (!changed) break;
    }
    return g;
  }
  function liveProvider(cm, opts) {
    return {
      kind: 'live', cm, label: 'SRTM-derived global terrain (AWS Terrain Tiles, ~30 m)',
      async getGrid(o) { return fetchLiveTerrain({ cm, cE: o.cE, cN: o.cN, halfW: o.halfW, halfH: o.halfH, cell: o.cell, onProgress: o.onProgress, loader: opts && opts.loader }); },
    };
  }
  FL.dem = { liveProvider, Grid, fetchLiveTerrain, browserTileLoader, zoomFor, parseAsciiGrid, parseGeoTiff, crsFromEpsg, rasterToGrid, patchHoles, bilin, TERRARIUM_URL };
})(typeof window !== 'undefined' ? window : globalThis);
(function (root) {
  'use strict';
  const FL = root.FL = root.FL || {};
  const TABLE = {
    1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[0, 1]], 6: [[0, 2]], 7: [[3, 0]], 8: [[3, 0]], 9: [[0, 2]],
    11: [[0, 1]], 12: [[3, 1]], 13: [[1, 2]], 14: [[2, 3]],
  };
  function contour(f, nx, ny, level, opts) {
    opts = opts || {};
    const pad = !!opts.pad;
    const W = pad ? nx + 2 : nx, H = pad ? ny + 2 : ny;
    const val = pad
      ? (i, j) => { const ii = i - 1, jj = j - 1; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) return -Infinity; const v = f[jj * nx + ii]; return v === v ? v : -Infinity; }
      : (i, j) => f[j * nx + i];
    const segs = []; 
    const off = pad ? -1 : 0;
    for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
      const a = val(i, j), b = val(i + 1, j), c = val(i + 1, j + 1), d = val(i, j + 1);
      if (!pad && (a !== a || b !== b || c !== c || d !== d)) continue;
      const idx = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      let pairs = TABLE[idx];
      if (idx === 5 || idx === 10) {
        const fin = x => x === -Infinity ? level - 1 : x;
        const centre = (fin(a) + fin(b) + fin(c) + fin(d)) / 4 > level;
        if (idx === 5) pairs = centre ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]];
        else pairs = centre ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]];
      }
      for (const [e1, e2] of pairs) {
        const p1 = edgePt(e1), p2 = edgePt(e2);
        segs.push(edgeKey(e1), edgeKey(e2), p1[0], p1[1], p2[0], p2[1]);
      }
      function lerp(v1, v2) { if (v1 === -Infinity) return 0.999; if (v2 === -Infinity) return 0.001; const t = (level - v1) / (v2 - v1); return t < 0 ? 0 : t > 1 ? 1 : t; }
      function edgePt(e) {
        switch (e) {
          case 0: return [i + lerp(a, b) + off, j + off];
          case 1: return [i + 1 + off, j + lerp(b, c) + off];
          case 2: return [i + lerp(d, c) + off, j + 1 + off];
          default: return [i + off, j + lerp(a, d) + off];
        }
      }
      function edgeKey(e) {
        switch (e) {
          case 0: return 2 * (j * W + i);
          case 1: return 2 * (j * W + i + 1) + 1;
          case 2: return 2 * ((j + 1) * W + i);
          default: return 2 * (j * W + i) + 1;
        }
      }
    }
    const nS = segs.length / 6, byKey = new Map(), used = new Uint8Array(nS);
    for (let s = 0; s < nS; s++) for (const e of [0, 1]) { const k = segs[s * 6 + e]; const l = byKey.get(k); if (l) l.push(s); else byKey.set(k, [s]); }
    const lines = [];
    for (let s0 = 0; s0 < nS; s0++) {
      if (used[s0]) continue; used[s0] = 1;
      const pts = [[segs[s0 * 6 + 2], segs[s0 * 6 + 3]], [segs[s0 * 6 + 4], segs[s0 * 6 + 5]]];
      const kStart = segs[s0 * 6]; let kEnd = segs[s0 * 6 + 1];
      for (;;) {
        const l = byKey.get(kEnd); let nxt = -1;
        if (l) for (const s of l) if (!used[s]) { nxt = s; break; }
        if (nxt < 0) break; used[nxt] = 1;
        if (segs[nxt * 6] === kEnd) { pts.push([segs[nxt * 6 + 4], segs[nxt * 6 + 5]]); kEnd = segs[nxt * 6 + 1]; }
        else { pts.push([segs[nxt * 6 + 2], segs[nxt * 6 + 3]]); kEnd = segs[nxt * 6]; }
      }
      let closed = kEnd === kStart;
      if (!closed) { 
        let kb = kStart;
        for (;;) {
          const l = byKey.get(kb); let nxt = -1;
          if (l) for (const s of l) if (!used[s]) { nxt = s; break; }
          if (nxt < 0) break; used[nxt] = 1;
          if (segs[nxt * 6] === kb) { pts.unshift([segs[nxt * 6 + 4], segs[nxt * 6 + 5]]); kb = segs[nxt * 6 + 1]; }
          else { pts.unshift([segs[nxt * 6 + 2], segs[nxt * 6 + 3]]); kb = segs[nxt * 6]; }
        }
        closed = kb === kEnd;
      }
      lines.push({ pts, closed });
    }
    return lines;
  }
  function toEN(g, line) { return line.map(([fi, fj]) => [g.e0 + fi * g.dx, g.n0 - fj * g.dx]); }
  function ringArea(p) { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return a / 2; }
  function polyLength(p) { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; }
  function chaikin(p, iter, closed) {
    for (let it = 0; it < (iter || 2); it++) {
      const q = []; const n = p.length;
      if (n < 3) return p;
      if (!closed) q.push(p[0]);
      const last = closed ? n : n - 1;
      for (let i = 0; i < last; i++) {
        const a = p[i], b = p[(i + 1) % n];
        q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
      }
      if (!closed) q.push(p[n - 1]);
      p = q;
    }
    return p;
  }
  function simplify(p, tol) { 
    if (p.length < 3) return p.slice();
    const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1;
    const stack = [[0, p.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop(); let md = 0, mi = -1;
      const [x1, y1] = p[s], [x2, y2] = p[e], dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
      for (let i = s + 1; i < e; i++) {
        let t = L2 ? ((p[i][0] - x1) * dx + (p[i][1] - y1) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(p[i][0] - x1 - t * dx, p[i][1] - y1 - t * dy); if (d > md) { md = d; mi = i; }
      }
      if (md > tol && mi > 0) { keep[mi] = 1; stack.push([s, mi], [mi, e]); }
    }
    return p.filter((_, i) => keep[i]);
  }
  function pointInRing(x, y, r) {
    let ins = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  }
  function segIntersect(a, b, c, d) {
    const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-12) return null;
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    return (t >= 0 && t <= 1 && u >= 0 && u <= 1) ? { t, u, p: [a[0] + t * r[0], a[1] + t * r[1]] } : null;
  }
  function resample(p, ds) {
    const out = [p[0]]; let acc = 0, next = ds;
    for (let i = 1; i < p.length; i++) {
      const L = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      while (acc + L >= next) { const t = (next - acc) / L; out.push([p[i - 1][0] + t * (p[i][0] - p[i - 1][0]), p[i - 1][1] + t * (p[i][1] - p[i - 1][1])]); next += ds; }
      acc += L;
    }
    const last = p[p.length - 1], lo = out[out.length - 1];
    if (Math.hypot(last[0] - lo[0], last[1] - lo[1]) > ds * 0.3) out.push(last); else out[out.length - 1] = last;
    return out;
  }
  function movingAverage(p, w) {
    const out = []; for (let i = 0; i < p.length; i++) {
      let sx = 0, sy = 0, n = 0;
      for (let k = Math.max(0, i - w); k <= Math.min(p.length - 1, i + w); k++) { sx += p[k][0]; sy += p[k][1]; n++; }
      out.push(i === 0 || i === p.length - 1 ? p[i] : [sx / n, sy / n]);
    }
    return out;
  }
  FL.geom = { contour, toEN, ringArea, polyLength, chaikin, simplify, pointInRing, segIntersect, resample, movingAverage };
})(typeof window !== 'undefined' ? window : globalThis);
(function (root) {
  'use strict';
  const FL = root.FL = root.FL || {};
  const DI = [1, 1, 0, -1, -1, -1, 0, 1], DJ = [0, -1, -1, -1, 0, 1, 1, 1]; 
  const DL = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];
  class MinHeap {
    constructor(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
    push(key, val) {
      let i = this.n++; const k = this.k, v = this.v;
      while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
      k[i] = key; v[i] = val;
    }
    pop() {
      const k = this.k, v = this.v, top = v[0], n = --this.n;
      if (n > 0) {
        const key = k[n], val = v[n]; let i = 0;
        for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= key) break; k[i] = k[c]; v[i] = v[c]; i = c; }
        k[i] = key; v[i] = val;
      }
      return top;
    }
  }
  function fillDepressions(g, eps) {
    const { nx, ny, z } = g, n = nx * ny, zf = new Float64Array(n), closed = new Uint8Array(n);
    eps = eps || 1e-5;
    const heap = new MinHeap(n);
    for (let k = 0; k < n; k++) zf[k] = z[k];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (zf[k] !== zf[k]) { closed[k] = 1; continue; }
      let edge = i === 0 || j === 0 || i === nx - 1 || j === ny - 1;
      if (!edge) for (let d = 0; d < 8; d++) { const v = z[(j + DJ[d]) * nx + i + DI[d]]; if (v !== v) { edge = true; break; } }
      if (edge) { closed[k] = 1; heap.push(zf[k], k); }
    }
    while (heap.n) {
      const c = heap.pop(), ci = c % nx, cj = (c / nx) | 0, zc = zf[c];
      for (let d = 0; d < 8; d++) {
        const ii = ci + DI[d], jj = cj + DJ[d];
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const nb = jj * nx + ii; if (closed[nb]) continue; closed[nb] = 1;
        if (zf[nb] <= zc + eps * 0.5) zf[nb] = zc + eps;
        heap.push(zf[nb], nb);
      }
    }
    return zf;
  }
  function d8(g, zf) {
    const { nx, ny } = g, n = nx * ny, dir = new Int8Array(n).fill(-1);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, zc = zf[k]; if (zc !== zc) continue;
      let best = 0, bd = -1;
      for (let d = 0; d < 8; d++) {
        const ii = i + DI[d], jj = j + DJ[d];
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const zn = zf[jj * nx + ii]; if (zn !== zn) continue;
        const s = (zc - zn) / DL[d]; if (s > best) { best = s; bd = d; }
      }
      dir[k] = bd;
    }
    return dir;
  }
  function downstream(g, dir, k) { const d = dir[k]; if (d < 0) return -1; const i = k % g.nx + DI[d], j = ((k / g.nx) | 0) + DJ[d]; return j * g.nx + i; }
  function accumulate(g, dir) {
    const { nx, ny } = g, n = nx * ny, indeg = new Int32Array(n), acc = new Float64Array(n), order = new Int32Array(n);
    for (let k = 0; k < n; k++) { const t = downstream(g, dir, k); if (t >= 0) indeg[t]++; }
    let head = 0, tail = 0;
    for (let k = 0; k < n; k++) { if (g.z[k] === g.z[k] && indeg[k] === 0) order[tail++] = k; }
    while (head < tail) {
      const c = order[head++]; acc[c] += 1;
      const t = downstream(g, dir, c);
      if (t >= 0) { acc[t] += acc[c]; if (--indeg[t] === 0) order[tail++] = t; }
    }
    return { acc, order: order.subarray(0, tail) };
  }
  function snapToStream(g, acc, E, N, minKm2, radius) {
    const cellKm2 = g.dx * g.dx / 1e6, thr = minKm2 / cellKm2;
    const ci = Math.round((E - g.e0) / g.dx), cj = Math.round((g.n0 - N) / g.dx), r = Math.ceil(radius / g.dx);
    let best = -1, bd = Infinity, bigK = -1, bigA = 0;
    for (let j = Math.max(0, cj - r); j <= Math.min(g.ny - 1, cj + r); j++) for (let i = Math.max(0, ci - r); i <= Math.min(g.nx - 1, ci + r); i++) {
      const k = j * g.nx + i, d = Math.hypot(i - ci, j - cj) * g.dx; if (d > radius) continue;
      if (acc[k] >= thr && d < bd) { bd = d; best = k; }
      if (acc[k] > bigA) { bigA = acc[k]; bigK = k; }
    }
    return best >= 0 ? { k: best, dist: bd, areaKm2: acc[best] * cellKm2 } : (bigK >= 0 ? { k: bigK, dist: Math.hypot(bigK % g.nx - ci, ((bigK / g.nx) | 0) - cj) * g.dx, areaKm2: bigA * cellKm2, weak: true } : null);
  }
  function delineate(g, dir, outlet) {
    const { nx, ny } = g, n = nx * ny, mask = new Uint8Array(n), flen = new Float64Array(n).fill(-1);
    const q = new Int32Array(n); let h = 0, t = 0; q[t++] = outlet; mask[outlet] = 1; flen[outlet] = 0;
    let touches = false, count = 0;
    while (h < t) {
      const c = q[h++], ci = c % nx, cj = (c / nx) | 0; count++;
      if (ci === 0 || cj === 0 || ci === nx - 1 || cj === ny - 1) touches = true;
      for (let d = 0; d < 8; d++) {
        const ii = ci + DI[d], jj = cj + DJ[d];
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const nb = jj * nx + ii;
        if (g.z[nb] !== g.z[nb]) { touches = true; continue; }
        if (mask[nb]) continue;
        const dd = dir[nb]; if (dd < 0) continue;
        if (ii + DI[dd] === ci && jj + DJ[dd] === cj) { mask[nb] = 1; flen[nb] = flen[c] + DL[dd] * g.dx; q[t++] = nb; }
      }
    }
    return { mask, flen, cells: count, areaKm2: count * g.dx * g.dx / 1e6, touchesEdge: touches };
  }
  function longestPath(g, dir, del, outlet) {
    let far = outlet, fl = 0;
    for (let k = 0; k < del.flen.length; k++) if (del.flen[k] > fl) { fl = del.flen[k]; far = k; }
    const path = [far]; let c = far, guard = 0;
    while (c !== outlet && guard++ < 1e6) { c = downstream(g, dir, c); if (c < 0) break; path.push(c); }
    return { path, lengthM: fl };
  }
  function profile(g, path, zfield) {
    const out = []; let s = 0;
    for (let i = path.length - 1; i >= 0; i--) {
      if (i < path.length - 1) { const [e1, n1] = g.EN(path[i]), [e2, n2] = g.EN(path[i + 1]); s += Math.hypot(e1 - e2, n1 - n2); }
      out.push({ s, z: zfield[path[i]] });
    }
    for (let i = 1; i < out.length; i++) if (out[i].z < out[i - 1].z) out[i].z = out[i - 1].z;
    return out;
  }
  function zAtS(prof, s) {
    if (s <= 0) return prof[0].z; const L = prof[prof.length - 1].s; if (s >= L) return prof[prof.length - 1].z;
    let lo = 0, hi = prof.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (prof[m].s <= s) lo = m; else hi = m; }
    const a = prof[lo], b = prof[hi]; return a.z + (b.z - a.z) * (s - a.s) / ((b.s - a.s) || 1);
  }
  function slope1085(prof) {
    const L = prof[prof.length - 1].s; const h10 = zAtS(prof, 0.10 * L), h85 = zAtS(prof, 0.85 * L);
    return { S: (h85 - h10) / (0.75 * L), h10, h85, L };
  }
  function slopeEqualArea(prof) {
    const L = prof[prof.length - 1].s, HB = prof[0].z; let area = 0;
    for (let i = 1; i < prof.length; i++) { const l = prof[i].s - prof[i - 1].s; area += l * ((prof[i].z + prof[i - 1].z) / 2 - HB); }
    return { S: 2 * area / (L * L), L };
  }
  function hornSlope(g, k) {
    const { nx, ny, z, dx } = g, i = k % nx, j = (k / nx) | 0;
    const at = (ii, jj) => { ii = Math.max(0, Math.min(nx - 1, ii)); jj = Math.max(0, Math.min(ny - 1, jj)); const v = z[jj * nx + ii]; return v === v ? v : z[k]; };
    const a = at(i - 1, j - 1), b = at(i, j - 1), c = at(i + 1, j - 1), d = at(i - 1, j), f = at(i + 1, j), gg = at(i - 1, j + 1), h = at(i, j + 1), ii2 = at(i + 1, j + 1);
    const dzdx = ((c + 2 * f + ii2) - (a + 2 * d + gg)) / (8 * dx), dzdy = ((gg + 2 * h + ii2) - (a + 2 * b + c)) / (8 * dx);
    return Math.hypot(dzdx, dzdy);
  }
  function catchmentSlopes(g, mask) {
    let n = 0, sum = 0; const cls = [0, 0, 0, 0]; let zmin = Infinity, zmax = -Infinity, ce = 0, cn = 0;
    for (let k = 0; k < mask.length; k++) {
      if (!mask[k]) continue; const s = hornSlope(g, k); n++; sum += s;
      const p = s * 100; cls[p < 3 ? 0 : p < 10 ? 1 : p < 30 ? 2 : 3]++;
      const v = g.z[k]; if (v < zmin) zmin = v; if (v > zmax) zmax = v;
      const [e, nn] = g.EN(k); ce += e; cn += nn;
    }
    return { mean: sum / n, classes: cls.map(c => c / n), zmin, zmax, centroid: { E: ce / n, N: cn / n } };
  }
  function streams(g, dir, acc, thrKm2, mask) {
    const { nx, ny } = g, n = nx * ny, thr = thrKm2 / (g.dx * g.dx / 1e6);
    const isS = new Uint8Array(n);
    for (let k = 0; k < n; k++) if (acc[k] >= thr && (!mask || mask[k])) isS[k] = 1;
    const up = new Int32Array(n), ord = new Int8Array(n), maxUp = new Int8Array(n), cntMax = new Int8Array(n);
    for (let k = 0; k < n; k++) if (isS[k]) { const t = downstream(g, dir, k); if (t >= 0 && isS[t]) up[t]++; }
    const q = []; for (let k = 0; k < n; k++) if (isS[k] && up[k] === 0) { q.push(k); }
    const indeg = up.slice(); let h = 0;
    while (h < q.length) {
      const c = q[h++];
      ord[c] = maxUp[c] === 0 ? 1 : (cntMax[c] >= 2 ? maxUp[c] + 1 : maxUp[c]);
      const t = downstream(g, dir, c);
      if (t >= 0 && isS[t]) {
        if (ord[c] > maxUp[t]) { maxUp[t] = ord[c]; cntMax[t] = 1; } else if (ord[c] === maxUp[t]) cntMax[t]++;
        if (--indeg[t] === 0) q.push(t);
      }
    }
    const visited = new Uint8Array(n), lines = [];
    const starts = [];
    for (const c of q) { 
      if (up[c] === 0) { starts.push(c); continue; }
      const t = c; let sameUp = false;
      for (let d = 0; d < 8; d++) { const ii = t % nx - DI[d], jj = ((t / nx) | 0) - DJ[d]; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const nb = jj * nx + ii; if (isS[nb] && downstream(g, dir, nb) === t && ord[nb] === ord[t]) { sameUp = true; break; } }
      if (!sameUp) starts.push(c);
    }
    for (const s of starts) {
      if (visited[s]) continue;
      const pts = []; let c = s; const o = ord[s];
      while (c >= 0 && isS[c] && !visited[c] && ord[c] === o) { visited[c] = 1; pts.push(g.EN(c)); c = downstream(g, dir, c); }
      if (c >= 0 && isS[c]) pts.push(g.EN(c));
      if (pts.length >= 2) lines.push({ order: o, pts });
    }
    return { lines, maxOrder: Math.max(1, ...lines.map(l => l.order)) };
  }
  function traceDown(g, dir, k, maxLen) {
    const out = [k]; let L = 0, c = k;
    while (L < maxLen) { const t = downstream(g, dir, c); if (t < 0) break; L += DL[dir[c]] * g.dx; out.push(t); c = t; }
    return out;
  }
  function traceUp(g, dir, acc, k, maxLen) {
    const out = [k]; let L = 0, c = k; const { nx, ny } = g;
    while (L < maxLen) {
      let best = -1, ba = 0, bd = 0; const ci = c % nx, cj = (c / nx) | 0;
      for (let d = 0; d < 8; d++) {
        const ii = ci + DI[d], jj = cj + DJ[d]; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const nb = jj * nx + ii; if (downstream(g, dir, nb) !== c) continue;
        if (acc[nb] > ba) { ba = acc[nb]; best = nb; bd = dir[nb]; }
      }
      if (best < 0 || ba < 4) break;
      L += DL[bd] * g.dx; out.push(best); c = best;
    }
    return out;
  }
  FL.terrain = { fillDepressions, d8, downstream, accumulate, snapToStream, delineate, longestPath, profile, zAtS, slope1085, slopeEqualArea, hornSlope, catchmentSlopes, streams, traceDown, traceUp, DI, DJ, DL, MinHeap };
})(typeof window !== 'undefined' ? window : globalThis);
(function (root) {
  'use strict';
  const FL = root.FL = root.FL || {};
  async function screen(provider, site, onProgress) {
    const T = FL.terrain, cm = provider.cm != null ? provider.cm : FL.geo.siteCM(site.lat, site.lon);
    const p = site.E != null ? site : Object.assign({}, site, FL.geo.toLoEN(site.lat, site.lon, cm));
    const g = await provider.getGrid({ cE: p.E, cN: p.N, halfW: 3500, cell: 30, onProgress });
    FL.dem.patchHoles(g, 3);
    const zf = T.fillDepressions(g), dir = T.d8(g, zf), { acc, order } = T.accumulate(g, dir);
    const thr = 0.25 / (g.dx * g.dx / 1e6), n = g.nx * g.ny;
    const isS = new Uint8Array(n); for (let k = 0; k < n; k++) if (acc[k] >= thr) isS[k] = 1;
    const drain = new Float32Array(n).fill(NaN), hand = new Float32Array(n).fill(NaN), drainA = new Float32Array(n);
    for (let i = order.length - 1; i >= 0; i--) {
      const k = order[i]; if (g.z[k] !== g.z[k]) continue;
      if (isS[k]) { drain[k] = g.z[k]; drainA[k] = acc[k]; }
      else { const t = T.downstream(g, dir, k); if (t >= 0 && drain[t] === drain[t]) { drain[k] = drain[t]; drainA[k] = drainA[t]; } else drain[k] = g.z[k]; }
      hand[k] = Math.max(0, g.z[k] - drain[k]);
    }
    const snap = T.snapToStream(g, acc, p.E, p.N, 0.25, 2500);
    const siteK = g.cellOf(p.E, p.N);
    const res = { grid: g, hand, drainA, acc, cm, site: p, siteHAND: siteK >= 0 ? hand[siteK] : NaN, siteZ: siteK >= 0 ? g.z[siteK] : NaN };
    if (snap && !snap.weak) {
      const [sE, sN] = g.EN(snap.k); res.stream = { E: sE, N: sN, dist: snap.dist, areaKm2: snap.areaKm2 };
    }
    const streams = T.streams(g, dir, acc, 0.25, null); res.streams = streams.lines;
    const d = res.stream ? res.stream.dist : Infinity, h = res.siteHAND;
    if (d < 150 && h < 2.5) res.level = 'high';
    else if (d < 400 || h < 5) res.level = 'moderate';
    else res.level = 'low';
    return res;
  }
  function handCanvas(r) {
    const g = r.grid, c = document.createElement('canvas'); c.width = g.nx; c.height = g.ny;
    const ctx = c.getContext('2d'), img = ctx.createImageData(g.nx, g.ny), d = img.data;
    for (let k = 0; k < g.nx * g.ny; k++) {
      const h = r.hand[k], p = k * 4;
      if (h <= 2) { d[p] = 200; d[p + 1] = 54; d[p + 2] = 43; d[p + 3] = 150; }
      else if (h <= 5) { d[p] = 230; d[p + 1] = 140; d[p + 2] = 60; d[p + 3] = 95; }
      else d[p + 3] = 0;
    }
    ctx.putImageData(img, 0, 0); return c;
  }
  function riskBands(r, opts) {
    opts = opts || {}; const g = r.grid, n = g.nx * g.ny, minA = (opts.minKm2 || 1) / (g.dx * g.dx / 1e6), G = FL.geom;
    const band = lim => {
      const f = new Float32Array(n); for (let k = 0; k < n; k++) { const h = r.hand[k]; f[k] = h === h && r.drainA[k] >= minA ? lim - h : -1; }
      return G.contour(f, g.nx, g.ny, 0, { pad: true }).filter(l => l.closed && l.pts.length > 5).map(l => G.chaikin(G.toEN(g, l.pts), 2, true)).filter(rg => Math.abs(G.ringArea(rg)) > g.dx * g.dx * 3);
    };
    const lines = (r.streams || []).map(l => ({ order: l.order || 1, pts: G.chaikin(l.pts, 2, false) }));
    return { high: band(2), moderate: band(5), lines };
  }
  FL.screening = { screen, handCanvas, riskBands };
})(typeof window !== 'undefined' ? window : globalThis);
(function (root) {
  'use strict';
  const FL = root.FL = root.FL || {};
  const CM = 29;
  const ORIGIN = { E: -18000, N: -2893000 };          
  const RIVERS = [
    { name: 'Main', bed0: 1594, bed1: 1527, fp: 110, sv: 0.045, hc: 2.4, wc: 14,
      pts: [[1500, 10600], [2600, 9900], [3500, 9000], [4400, 8500], [5200, 7650], [6000, 7350], [6800, 6900], [7500, 6450], [8200, 6050], [9000, 5650], [9600, 5200], [10300, 4750], [11000, 4300], [11800, 3950], [12600, 3600], [13400, 3250], [14200, 2950]] },
    { name: 'Demo Spruit', bed0: 1589, joinMain: true, fp: 55, sv: 0.06, hc: 1.7, wc: 9,
      pts: [[5000, 11950], [5600, 11450], [6150, 10850], [6450, 10300], [6750, 9800], [6950, 9250], [7120, 8700], [7180, 8150], [7330, 7600], [7420, 7020], [7500, 6450]] },
    { name: 'Trib B', bed0: 1592, joinMain: true, fp: 45, sv: 0.055, hc: 1.4, wc: 8,
      pts: [[2300, 3300], [3300, 4200], [4500, 5000], [5200, 6000], [5600, 6700], [5800, 7340]] },
    { name: 'Trib C', bed0: 1582, joinMain: true, fp: 45, sv: 0.06, hc: 1.4, wc: 8,
      pts: [[12700, 9700], [12100, 8500], [11500, 7500], [10900, 6500], [10500, 5600], [10300, 4750]] },
    { name: 'Trib D', bed0: 1606, joinMain: true, fp: 30, sv: 0.07, hc: 1.1, wc: 6,
      pts: [[10200, 11900], [9900, 10900], [9500, 9800], [9150, 8600], [8850, 7300], [8600, 5850]] },
  ];
  function prep() {
    for (const r of RIVERS) {
      const p = r.pts, dense = [];
      for (let s = 0; s < p.length - 1; s++) {
        const [x0, y0] = p[s], [x1, y1] = p[s + 1], L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(L / 40));
        const nxv = -(y1 - y0) / L, nyv = (x1 - x0) / L;
        for (let k = 0; k < n; k++) {
          const t = k / n, amp = (r.name === 'Main' ? 70 : 38) * Math.sin(Math.PI * t);
          const wob = amp * Math.sin(2 * Math.PI * t * (r.name === 'Main' ? 1.5 : 1.25) + s * 1.7);
          dense.push([x0 + (x1 - x0) * t + nxv * wob, y0 + (y1 - y0) * t + nyv * wob]);
        }
      }
      dense.push(p[p.length - 1]);
      let acc = 0; r.d = dense; r.cum = [0];
      for (let i = 1; i < dense.length; i++) { acc += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]); r.cum.push(acc); }
      r.len = acc;
      r.bb = [Infinity, -Infinity, Infinity, -Infinity];
      for (const q of dense) { r.bb[0] = Math.min(r.bb[0], q[0] - 2600); r.bb[1] = Math.max(r.bb[1], q[0] + 2600); r.bb[2] = Math.min(r.bb[2], q[1] - 2600); r.bb[3] = Math.max(r.bb[3], q[1] + 2600); }
    }
    const main = RIVERS[0];
    for (const r of RIVERS) {
      if (r.joinMain || r.joinTo != null) {
        const host = r.joinMain ? main : RIVERS[r.joinTo];
        const end = r.d[r.d.length - 1];
        const q = nearest(host, end[0], end[1]);
        r.bed1 = bedAt(host, q.s) + 0.3;
      }
    }
  }
  function bedAt(r, s) {
    const t = Math.min(1, Math.max(0, s / r.len));
    return r.bed1 + (r.bed0 - r.bed1) * Math.pow(1 - t, 1.25);
  }
  function nearest(r, x, y) {
    const d = r.d, n = d.length;
    let bi = 0, bd2 = Infinity;
    for (let i = 0; i < n; i += 8) { const dx = d[i][0] - x, dy = d[i][1] - y, q = dx * dx + dy * dy; if (q < bd2) { bd2 = q; bi = i; } }
    let best = Infinity, bs = 0;
    for (let i = Math.max(0, bi - 14); i < Math.min(n - 1, bi + 14); i++) {
      const ax = d[i][0], ay = d[i][1], bx = d[i + 1][0], by = d[i + 1][1];
      const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
      let t = ((x - ax) * vx + (y - ay) * vy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + vx * t - x, py = ay + vy * t - y, dd = px * px + py * py;
      if (dd < best) { best = dd; bs = r.cum[i] + t * (r.cum[i + 1] - r.cum[i]); }
    }
    return { dist: Math.sqrt(best), s: bs };
  }
  function hash(i, j, s) { let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  function vnoise(x, y, s) {
    const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j;
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s);
    return (a + (b - a) * su) * (1 - sv) + (c + (d - c) * su) * sv;
  }
  function fbm(x, y, oct, s) { let a = 0, amp = 1, f = 1, n = 0; for (let o = 0; o < oct; o++) { a += amp * (vnoise(x * f, y * f, s + o) - 0.5); n += amp; amp *= 0.5; f *= 2.03; } return a / n * 2; }
  function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  function elevLocal(x, y) {
    let zp = 1655 - 0.0042 * x + 0.0016 * y + 18 * fbm(x / 3200, y / 3200, 4, 11) + 5 * fbm(x / 900, y / 900, 3, 29);
    zp += 16 * Math.exp(-Math.pow((y - 12500) / 1300, 2));
    zp -= 0.012 * Math.max(0, y - 12900) + 0.010 * Math.max(0, -x - 600) + 0.006 * Math.max(0, x - 15200);
    let z = zp, dNear = Infinity;
    for (const r of RIVERS) {
      if (x < r.bb[0] || x > r.bb[1] || y < r.bb[2] || y > r.bb[3]) continue;
      const q = nearest(r, x, y);
      if (q.dist > 2600) continue;
      const zb = bedAt(r, q.s);
      const d = q.dist; if (d < dNear) dNear = d;
      let v = Math.max(0, d - r.fp) * r.sv + 0.9 * Math.min(d, r.fp) / r.fp
        + 1.6 * Math.max(0, Math.min(1, (d - r.fp) / 60)) 
        - r.hc * Math.exp(-Math.pow(d / r.wc, 2));
      const head = Math.min(1, q.s / 500);
      const zv = zb + v + (1 - head) * 6;
      z = smin(z, zv, 9);
    }
    const calm = Math.min(1, 0.25 + dNear / 90); 
    z += calm * (0.7 * fbm(x / 160, y / 160, 3, 47) + 0.25 * fbm(x / 45, y / 45, 2, 61));
    return z;
  }
  prep();
  function toLocal(E, N) { return [E - ORIGIN.E, N - ORIGIN.N]; }
  const provider = {
    kind: 'demo', cm: CM, label: 'Built-in demo terrain (synthetic Highveld valley; not a real site)',
    async getGrid(o) {
      const { Grid } = FL.dem;
      const cell = o.cell, nx = Math.round(2 * o.halfW / cell) + 1, ny = Math.round(2 * (o.halfH || o.halfW) / cell) + 1;
      const e0 = Math.round((o.cE - (nx - 1) * cell / 2) / cell) * cell, n0 = Math.round((o.cN + (ny - 1) * cell / 2) / cell) * cell;
      const g = new Grid(nx, ny, e0, n0, cell);
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const [x, y] = toLocal(e0 + i * cell, n0 - j * cell);
          g.z[j * nx + i] = (x < -4000 || y < -4000 || x > 18000 || y > 17000) ? NaN : elevLocal(x, y);
        }
        if (o.onProgress && j % 40 === 0) o.onProgress(j / ny, 'Generating demo terrain');
      }
      g.meta = { source: 'demo', cm: CM, srcRes: 30 };
      return g;
    },
    site() {
      const E = ORIGIN.E + 6990, N = ORIGIN.N + 9200; const ll = FL.geo.fromLoEN(E, N, CM);
      return { E, N, lat: ll.lat, lon: ll.lon, name: 'Erf 1024 Demo Spruit (synthetic)' };
    },
    bounds: { e0: ORIGIN.E - 4000, e1: ORIGIN.E + 18000, n0: ORIGIN.N - 4000, n1: ORIGIN.N + 17000 },
  };
  function structures() {
    if (!FL.structures) return [];
    const b = FL.structures.create('bridge', 400, { zmin: 1565.38, chWidth: 20 });
    Object.assign(b, { name: 'Road bridge', lowChord: 1567.6, road: 1568.4, opening: 26, piers: 2, demo: true });
    const c = FL.structures.create('culvert', 1100, { zmin: 1569, chWidth: 20 });
    Object.assign(c, { name: 'Farm road culvert', road: 1571.5, barrels: 3, demo: true });
    return [b, c];
  }
  FL.demo = { provider, elevLocal, ORIGIN, CM, structures };
})(typeof window !== 'undefined' ? window : globalThis);
(function (root) {
  'use strict';
  const FL = root.FL = root.FL || {};
  const PAL = {
    paper: '#f4f6f5', contour: 'rgba(92,84,70,0.32)', contourMajor: 'rgba(92,84,70,0.62)', river: '#2a7fc0', stream: 'rgba(42,127,192,0.55)',
    catch: '#2f7d4f', xs: '#2b2f36', f100: '#c8362b', f50: '#1f63c6', site: '#7a2b8f', fill100: 'rgba(200,54,43,0.10)', fill50: 'rgba(31,99,198,0.16)',
  };
  function hillshadeCanvas(g, opts) {
    opts = opts || {};
    const { nx, ny, z, dx } = g, c = document.createElement('canvas'); c.width = nx; c.height = ny;
    const ctx = c.getContext('2d'), img = ctx.createImageData(nx, ny), d = img.data;
    const st = g.stats(), zr = Math.max(1, st.max - st.min);
    const az = (360 - 315 + 90) * Math.PI / 180, alt = 45 * Math.PI / 180, zen = Math.PI / 2 - alt, zf = opts.zFactor || 1.6;
    const at = (i, j) => { i = i < 0 ? 0 : i >= nx ? nx - 1 : i; j = j < 0 ? 0 : j >= ny ? ny - 1 : j; const v = z[j * nx + i]; return v === v ? v : NaN; };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, v = z[k], p = k * 4;
      if (v !== v) { d[p + 3] = 0; continue; }
      const a = at(i - 1, j - 1), b = at(i, j - 1), cc = at(i + 1, j - 1), dd = at(i - 1, j), f = at(i + 1, j), gg = at(i - 1, j + 1), h = at(i, j + 1), ii = at(i + 1, j + 1);
      const fx = ((cc + 2 * f + ii) - (a + 2 * dd + gg)) / (8 * dx) * zf, fy = ((gg + 2 * h + ii) - (a + 2 * b + cc)) / (8 * dx) * zf;
      const slope = Math.atan(Math.hypot(fx, fy)); const aspect = Math.atan2(fy, -fx); 
      let sh = Math.cos(zen) * Math.cos(slope) + Math.sin(zen) * Math.sin(slope) * Math.cos(az - aspect);
      if (sh !== sh) sh = 0.7; sh = Math.max(0, sh);
      const t = (v - st.min) / zr;
      const r0 = 214 + 22 * t, g0 = 222 + 6 * t, b0 = 206 - 10 * t;
      const m = 0.55 + 0.55 * sh;
      d[p] = Math.min(255, r0 * m); d[p + 1] = Math.min(255, g0 * m); d[p + 2] = Math.min(255, b0 * m); d[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  function depthCanvas(nx, ny, depth, maxD, alpha) {
    const c = document.createElement('canvas'); c.width = nx; c.height = ny;
    const ctx = c.getContext('2d'), img = ctx.createImageData(nx, ny), d = img.data, M = maxD || 3;
    for (let k = 0; k < nx * ny; k++) {
      const v = depth[k]; const p = k * 4;
      if (!(v > 0.02)) { d[p + 3] = 0; continue; }
      const t = Math.min(1, v / M);
      d[p] = 170 - 150 * t; d[p + 1] = 220 - 140 * t; d[p + 2] = 245 - 60 * t; d[p + 3] = (alpha || 200) * (0.55 + 0.45 * t);
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  function contours(g, interval, majorEvery) {
    const st = g.stats(), out = { minor: [], major: [], labels: [] };
    const start = Math.ceil(st.min / interval) * interval;
    for (let lv = start; lv <= st.max; lv += interval) {
      const isMajor = Math.abs(lv / (interval * majorEvery) - Math.round(lv / (interval * majorEvery))) < 1e-6;
      const lines = FL.geom.contour(g.z, g.nx, g.ny, lv, { pad: false });
      for (const l of lines) {
        if (l.pts.length < 4) continue;
        let p = FL.geom.toEN(g, l.pts); p = FL.geom.simplify(p, g.dx * 0.25); p = FL.geom.chaikin(p, 1, l.closed);
        (isMajor ? out.major : out.minor).push({ z: lv, pts: p, closed: l.closed });
        if (isMajor && p.length > 12) out.labels.push({ z: lv, at: p[Math.floor(p.length / 2)], dir: p[Math.floor(p.length / 2) + 1] });
      }
    }
    return out;
  }
  class MapView {
    constructor(el, opts) {
      this.el = el; this.opts = opts || {};
      this.canvas = document.createElement('canvas'); this.canvas.className = 'fl-map-canvas'; el.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.view = { cx: 0, cy: 0, scale: 10 };
      this.layers = { imagery: false, hillshade: true, contours: true, catchment: true, streams: true, centreline: true, xs: true, flood50: true, flood100: true, depth: false, dyn: false, site: true, hand: true };
      this.data = null; this.cache = {}; this.tiles = new Map(); this.dynFrame = null; this.pickMode = false;
      this._bind(); this.resize();
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(el);
    }
    resize() {
      const r = this.el.getBoundingClientRect(), dpr = Math.min(2, root.devicePixelRatio || 1);
      this.w = Math.max(50, r.width); this.h = Math.max(50, r.height); this.dpr = dpr;
      this.canvas.width = this.w * dpr; this.canvas.height = this.h * dpr; this.canvas.style.width = this.w + 'px'; this.canvas.style.height = this.h + 'px';
      this.render();
    }
    cmNow() { return this.data ? this.data.cm : this.opts.cm; }
    toScreen(E, N) { return [(E - this.view.cx) / this.view.scale + this.w / 2, (this.view.cy - N) / this.view.scale + this.h / 2]; }
    toWorld(x, y) { return [this.view.cx + (x - this.w / 2) * this.view.scale, this.view.cy - (y - this.h / 2) * this.view.scale]; }
    fit(e0, e1, n0, n1, pad) {
      pad = pad || 0.08; const w = (e1 - e0) * (1 + 2 * pad), h = (n1 - n0) * (1 + 2 * pad);
      this.view.cx = (e0 + e1) / 2; this.view.cy = (n0 + n1) / 2; this.view.scale = Math.max(w / this.w, h / this.h, 0.5); this.render();
    }
    _bind() {
      const c = this.canvas; let drag = null, pinch = null; const pts = new Map();
      c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.offsetX, e.offsetY]); if (pts.size === 1) drag = { x: e.offsetX, y: e.offsetY, cx: this.view.cx, cy: this.view.cy, moved: false }; else if (pts.size === 2) { const a = [...pts.values()]; pinch = { d: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]), s: this.view.scale }; drag = null; } });
      c.addEventListener('pointermove', e => {
        pts.set(e.pointerId, [e.offsetX, e.offsetY]);
        if (pinch && pts.size === 2) { const a = [...pts.values()], d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); this.view.scale = pinch.s * pinch.d / Math.max(10, d); this.render(); return; }
        if (drag) { const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; this.view.cx = drag.cx - dx * this.view.scale; this.view.cy = drag.cy + dy * this.view.scale; this.render(); }
        if (this.opts.onHover) { const [E, N] = this.toWorld(e.offsetX, e.offsetY); this.opts.onHover(E, N); }
      });
      const end = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (drag && !drag.moved && pts.size === 0 && this.opts.onClick) { const [E, N] = this.toWorld(e.offsetX, e.offsetY); this.opts.onClick(E, N, e); } drag = null; };
      c.addEventListener('pointerup', end); c.addEventListener('pointercancel', e => { pts.delete(e.pointerId); drag = null; pinch = null; });
      c.addEventListener('wheel', e => { if (this.opts.cooperative && !(e.ctrlKey || e.metaKey)) { if (this.opts.onWheelHint) this.opts.onWheelHint(); return; } e.preventDefault(); const f = Math.exp(e.deltaY * 0.0015); const [E, N] = this.toWorld(e.offsetX, e.offsetY); this.view.scale = Math.min(400, Math.max(0.3, this.view.scale * f)); const [E2, N2] = this.toWorld(e.offsetX, e.offsetY); this.view.cx += E - E2; this.view.cy += N - N2; this.render(); }, { passive: false });
    }
    zoom(f) { this.view.scale = Math.min(400, Math.max(0.3, this.view.scale * f)); this.render(); }
    setData(R) {
      this.data = R; this.cache = {};
      if (!R) { this.render(); return; }
      if (R.coarse) this.cache.hsCoarse = hillshadeCanvas(R.coarse);
      if (R.fine) { this.cache.hsFine = hillshadeCanvas(R.fine); this.cache.ctFine = contours(R.fine, 1, 5); }
      if (R.coarse) this.cache.ctCoarse = contours(R.coarse, 10, 5);
      this.cache.depth = {};
      for (const T of Object.keys(R.maps || {})) this.cache.depth[T] = depthCanvas(R.fine.nx, R.fine.ny, R.maps[T].depth, Math.max(1, R.maps[T].maxDepth));
      this.render();
    }
    setHand(h) { this.hand = h; this.cache.hand = h ? h.canvas : null; this.render(); }
    setDyn(dyn) { this.dyn = dyn; this.dynCanvas = null; this.render(); }
    showFrame(i) {
      if (!this.dyn) return; const fr = this.dyn.out.frames[i]; if (!fr) return;
      const d = this.dyn.dom; this.dynCanvas = depthCanvas(d.nx, d.ny, fr.h, Math.max(1, this.dyn.maxD || 3), 230); this.dynT = fr.t; this.render();
    }
    showDynMax() { if (!this.dyn) return; const d = this.dyn.dom; this.dynCanvas = depthCanvas(d.nx, d.ny, this.dyn.out.hmax, Math.max(1, this.dyn.maxD || 3), 230); this.dynT = null; this.render(); }
    _rasterTo(ctx, cv, e0, n0, dx, nx, ny) { const [x, y] = this.toScreen(e0 - dx / 2, n0 + dx / 2); ctx.drawImage(cv, x, y, nx * dx / this.view.scale, ny * dx / this.view.scale); }
    _path(ctx, pts, closed) { if (!pts || pts.length < 2) return; ctx.beginPath(); let p = this.toScreen(pts[0][0], pts[0][1]); ctx.moveTo(p[0], p[1]); for (let i = 1; i < pts.length; i++) { p = this.toScreen(pts[i][0], pts[i][1]); ctx.lineTo(p[0], p[1]); } if (closed) ctx.closePath(); }
    _imagery(ctx) {
      const cm = this.cmNow(); if (cm == null) return;
      const geo = FL.geo, [cE, cN] = [this.view.cx, this.view.cy], ll = geo.fromLoEN(cE, cN, cm);
      const maxZ = this.opts.imageryMaxZoom || 19, dz = this.dpr >= 1.5 ? 1 : 0;
      const z = Math.max(3, Math.min(maxZ, Math.round(Math.log2(156543.03 * Math.cos(ll.lat * Math.PI / 180) / this.view.scale)) + dz));
      const c0 = geo.fromLoEN(...this.toWorld(0, 0), cm), c1 = geo.fromLoEN(...this.toWorld(this.w, this.h), cm);
      const tx0 = Math.floor(geo.lonToPx(Math.min(c0.lon, c1.lon), z) / 256), tx1 = Math.floor(geo.lonToPx(Math.max(c0.lon, c1.lon), z) / 256);
      const ty0 = Math.floor(geo.latToPx(Math.max(c0.lat, c1.lat), z) / 256), ty1 = Math.floor(geo.latToPx(Math.min(c0.lat, c1.lat), z) / 256);
      if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 140) return;
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        const key = z + '/' + tx + '/' + ty; let im = this.tiles.get(key);
        if (!im) { im = new Image(); im.onload = () => this.render(); im.onerror = () => { im.failed = true; }; im.src = (this.opts.imageryUrl || (FL.imagery ? FL.imagery.source().url : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}')).replace('{z}', z).replace('{x}', tx).replace('{y}', ty); this.tiles.set(key, im); }
        if (!im.complete || im.failed || !im.naturalWidth) continue;
        const corner = (px, py) => { const p = geo.toLoEN(geo.pxToLat(py, z), geo.pxToLon(px, z), cm); return this.toScreen(p.E, p.N); };
        const p0 = corner(tx * 256, ty * 256), p1 = corner(tx * 256 + 256, ty * 256), p2 = corner(tx * 256, ty * 256 + 256);
        ctx.save(); ctx.setTransform(this.dpr * (p1[0] - p0[0]) / 256, this.dpr * (p1[1] - p0[1]) / 256, this.dpr * (p2[0] - p0[0]) / 256, this.dpr * (p2[1] - p0[1]) / 256, this.dpr * p0[0], this.dpr * p0[1]);
        ctx.drawImage(im, -0.5, -0.5, 257, 257); ctx.restore();
      }
    }
    render() {
      if (this._raf) return;
      this._raf = (root.requestAnimationFrame || (f => setTimeout(f, 16)))(() => { this._raf = null; this._draw(); });
    }
    _draw() {
      const ctx = this.ctx, R = this.data, L = this.layers, s = this.view.scale;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = PAL.paper; ctx.fillRect(0, 0, this.w, this.h);
      ctx.imageSmoothingEnabled = true;
      if (L.imagery) this._imagery(ctx);
      if (R) {
        const ga = L.imagery ? 0.35 : 1;
        if (L.hillshade && this.cache.hsCoarse) { ctx.globalAlpha = ga; this._rasterTo(ctx, this.cache.hsCoarse, R.coarse.e0, R.coarse.n0, R.coarse.dx, R.coarse.nx, R.coarse.ny); }
        if (L.hillshade && this.cache.hsFine && s < R.coarse.dx * 1.2) { ctx.globalAlpha = ga; this._rasterTo(ctx, this.cache.hsFine, R.fine.e0, R.fine.n0, R.fine.dx, R.fine.nx, R.fine.ny); }
        ctx.globalAlpha = 1;
        if (L.contours) {
          const fineOn = s < 4 && this.cache.ctFine, ct = fineOn ? this.cache.ctFine : this.cache.ctCoarse;
          if (ct && s < (fineOn ? 4 : 40)) {
            ctx.lineWidth = 0.6; ctx.strokeStyle = L.imagery ? 'rgba(255,244,214,0.38)' : PAL.contour; for (const c of ct.minor) { this._path(ctx, c.pts, c.closed); ctx.stroke(); }
            ctx.lineWidth = 1.0; ctx.strokeStyle = L.imagery ? 'rgba(255,244,214,0.75)' : PAL.contourMajor; for (const c of ct.major) { this._path(ctx, c.pts, c.closed); ctx.stroke(); }
            if (s < (fineOn ? 2.2 : 18)) { ctx.font = '600 10px "IBM Plex Mono", ui-monospace, monospace'; ctx.fillStyle = 'rgba(80,70,55,0.9)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              for (const lb of ct.labels) { const [x, y] = this.toScreen(lb.at[0], lb.at[1]); if (x < 0 || y < 0 || x > this.w || y > this.h) continue; const [x2, y2] = this.toScreen(lb.dir[0], lb.dir[1]); let a = Math.atan2(y2 - y, x2 - x); if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI; ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = PAL.paper; ctx.fillRect(-14, -6, 28, 12); ctx.fillStyle = 'rgba(80,70,55,0.95)'; ctx.fillText(String(lb.z), 0, 0); ctx.restore(); } }
          }
        }
        if (L.hand && this.cache.hand && this.hand) { ctx.globalAlpha = 0.85; this._rasterTo(ctx, this.cache.hand, this.hand.g.e0, this.hand.g.n0, this.hand.g.dx, this.hand.g.nx, this.hand.g.ny); ctx.globalAlpha = 1; }
        if (L.streams && R.catchment) {
          for (const l of R.catchment.streams.lines) { ctx.strokeStyle = PAL.stream; ctx.lineWidth = 0.6 + 0.6 * l.order; this._path(ctx, l.pts); ctx.stroke(); }
        }
        if (L.catchment && R.catchment && R.catchment.outline.length) {
          ctx.strokeStyle = PAL.catch; ctx.lineWidth = 2; ctx.setLineDash([10, 4, 2, 4]); this._path(ctx, R.catchment.outline, true); ctx.stroke(); ctx.setLineDash([]);
          if (R.catchment.longest) { ctx.strokeStyle = 'rgba(47,125,79,0.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); this._path(ctx, R.catchment.longest.pathEN); ctx.stroke(); ctx.setLineDash([]); }
        }
        if (L.depth && R.fine) { const T = this.depthT || Math.max(...Object.keys(this.cache.depth || {}).map(Number)); const cv = this.cache.depth && this.cache.depth[T]; if (cv) this._rasterTo(ctx, cv, R.fine.e0, R.fine.n0, R.fine.dx, R.fine.nx, R.fine.ny); }
        if (L.dyn && this.dynCanvas && this.dyn) { const d = this.dyn.dom; this._rasterTo(ctx, this.dynCanvas, d.E0, d.N0, d.cell, d.nx, d.ny); }
        for (const T of [100, 50]) {
          if (!L['flood' + T] || !R.maps || !R.maps[T]) continue;
          const m = R.maps[T];
          ctx.beginPath(); for (const r of m.rings) { let p = this.toScreen(r[0][0], r[0][1]); ctx.moveTo(p[0], p[1]); for (let i = 1; i < r.length; i++) { p = this.toScreen(r[i][0], r[i][1]); ctx.lineTo(p[0], p[1]); } ctx.closePath(); }
          if (!L.depth && !L.dyn) { ctx.fillStyle = T === 100 ? PAL.fill100 : PAL.fill50; ctx.fill('evenodd'); }
          ctx.strokeStyle = T === 100 ? PAL.f100 : PAL.f50; ctx.lineWidth = T === 100 ? 2.4 : 1.8; ctx.setLineDash(T === 100 ? [] : [9, 5]); ctx.stroke(); ctx.setLineDash([]);
        }
        if (R.extraMaps && L.extra !== false) {
          const ex = R.extraMaps;
          if (ex.buf) { ctx.strokeStyle = '#5a6772'; ctx.lineWidth = 1.4; ctx.setLineDash([3, 4]); ctx.beginPath(); for (const r of ex.buf.rings) { this._path(ctx, r, true); ctx.stroke(); } ctx.setLineDash([]); }
          if (ex.fb) { ctx.strokeStyle = '#7a2b8f'; ctx.lineWidth = 1.6; ctx.setLineDash([12, 4, 2, 4]); for (const r of ex.fb.rings) { this._path(ctx, r, true); ctx.stroke(); } ctx.setLineDash([]); }
        }
        if (L.centreline && R.geometry) { ctx.strokeStyle = PAL.river; ctx.lineWidth = 2; this._path(ctx, R.geometry.centreline); ctx.stroke(); }
        if (L.structures !== false && R.structures && R.structures.length && FL.structures) {
          for (const st of R.structures) {
            const pr = R.hydraulics && R.hydraulics.profiles, fp = FL.structures.footprint(st, R.geometry, pr && (pr[100] || pr[Math.max(...Object.keys(pr).map(Number))])); if (!fp) continue;
            if (fp.road) { this._path(ctx, fp.road, true); ctx.fillStyle = st.type === 'weir' ? 'rgba(122,91,43,0.35)' : 'rgba(150,140,120,0.55)'; ctx.fill(); ctx.strokeStyle = '#4a4f55'; ctx.lineWidth = 1.2; ctx.stroke(); }
            this._path(ctx, fp.poly, true); ctx.fillStyle = st.type === 'weir' ? 'rgba(122,91,43,0.85)' : st.type === 'culvert' ? 'rgba(70,80,92,0.92)' : 'rgba(43,49,58,0.92)'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = '#141b22'; ctx.lineWidth = 1.3; ctx.stroke();
            const [lx, ly] = this.toScreen(fp.label[0], fp.label[1]); ctx.font = '700 12px "Barlow Condensed", "Arial Narrow", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeText(fp.name.toUpperCase(), lx, ly); ctx.fillStyle = '#1d2731'; ctx.fillText(fp.name.toUpperCase(), lx, ly);
          }
        }
        if (this.pending && this.pending.length) {
          for (const pd of this.pending) {
            const [x, y] = this.toScreen(pd.E, pd.N); ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-7, -7, 14, 14); ctx.strokeStyle = '#e08a00'; ctx.lineWidth = 2.5; ctx.strokeRect(-7, -7, 14, 14); ctx.restore();
            ctx.font = '700 12px "Barlow Condensed", "Arial Narrow", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; const t = pd.label.toUpperCase() + ' (PRESS APPLY)'; ctx.strokeText(t, x + 12, y); ctx.fillStyle = '#9a5f00'; ctx.fillText(t, x + 12, y);
          }
        }
        if (L.xs && R.geometry) {
          ctx.font = '600 10px "IBM Plex Mono", ui-monospace, monospace'; ctx.textBaseline = 'middle';
          for (const x of R.geometry.xs) {
            ctx.strokeStyle = this.selXS === x.id ? '#e08a00' : PAL.xs; ctx.lineWidth = this.selXS === x.id ? 2.4 : 0.9; this._path(ctx, x.cut); ctx.stroke();
            if (s < 6 && !x.struct) { const [px, py] = this.toScreen(x.cut[0][0], x.cut[0][1]); ctx.fillStyle = PAL.xs; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.85)'; const t = String(Math.round(x.rs)); ctx.fillRect(px - t.length * 3.5 - 3, py - 7, t.length * 7 + 6, 14); ctx.fillStyle = PAL.xs; ctx.fillText(t, px, py); }
          }
        }
      }
      if (this.overlays) for (const o of this.overlays) { try { o(ctx, this); } catch (e) {   } }
      const mark = (p, col, label) => { if (!p) return; const [x, y] = this.toScreen(p.E, p.N); ctx.fillStyle = col; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 6.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); if (label) { ctx.font = '700 12px "Barlow Condensed", "Arial Narrow", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeText(label, x + 10, y); ctx.fillStyle = col; ctx.fillText(label, x + 10, y); } };
      if (this.layers.site) { mark(this.site || (R && R.site), PAL.site, this.siteLabel || 'SITE'); if (this.river) mark(this.river, PAL.river, 'RIVER POINT'); }
      this._scaleBar(ctx); this._north(ctx);
      if (!R && this.emptyText && !L.imagery) { ctx.fillStyle = 'rgba(28,50,70,0.75)'; ctx.font = '600 15px "Source Sans 3", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(this.emptyText, this.w / 2, this.h / 2); }
      if (this.dynT != null && this.layers.dyn) { ctx.fillStyle = 'rgba(28,50,70,0.85)'; ctx.fillRect(12, 12, 150, 26); ctx.fillStyle = '#fff'; ctx.font = '600 13px "IBM Plex Mono", ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('t = ' + (this.dynT / 3600).toFixed(2) + ' h', 22, 25); }
      if (this.opts.onView) this.opts.onView();
    }
    _scaleBar(ctx) {
      const target = this.w * 0.18 * this.view.scale; const pow = Math.pow(10, Math.floor(Math.log10(target))); let L = pow; for (const m of [1, 2, 5, 10]) if (m * pow <= target) L = m * pow;
      const px = L / this.view.scale, x = 16, y = this.h - 22;
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x - 6, y - 16, px + 60, 28);
      ctx.fillStyle = '#1c3246'; ctx.fillRect(x, y, px / 2, 5); ctx.strokeStyle = '#1c3246'; ctx.lineWidth = 1; ctx.strokeRect(x, y, px, 5);
      ctx.font = '600 11px "IBM Plex Mono", ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(L >= 1000 ? (L / 1000) + ' km' : L + ' m', x + px + 6, y + 7);
    }
    _north(ctx) {
      const x = this.w - 30, y = this.opts.northBottom ? this.h - 56 : 44; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(x, y, 18, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = '#1c3246'; ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + 6, y + 8); ctx.lineTo(x, y + 4); ctx.lineTo(x - 6, y + 8); ctx.closePath(); ctx.fill();
      ctx.font = '700 10px "Barlow Condensed", "Arial Narrow", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('N', x, y + 16);
    }
    snapshot() { return this.canvas.toDataURL('image/png'); }
  }
  FL.MapView = MapView; FL.mapfx = { hillshadeCanvas, depthCanvas, contours, PAL };
})(typeof window !== 'undefined' ? window : globalThis);
(function (root) {
  'use strict';
  const FL = root.FL = root.FL || {};
  const URL_ = 'https://nominatim.openstreetmap.org/search';
  function timeout(ms) { return new Promise((_, rj) => setTimeout(() => rj(new Error('The search took too long. Try again.')), ms)); }
  async function query(q, countries, limit) {
    const p = new URLSearchParams({ q, format: 'jsonv2', limit: String(limit || 8), addressdetails: '0', 'accept-language': 'en' });
    if (countries) p.set('countrycodes', countries);
    const r = await Promise.race([fetch(URL_ + '?' + p.toString(), { headers: { Accept: 'application/json' } }), timeout(12000)]);
    if (!r.ok) throw new Error('Place search is not available right now (' + r.status + ').');
    const j = await r.json();
    return (Array.isArray(j) ? j : []).map(x => {
      const parts = String(x.display_name || '').split(',').map(s => s.trim()).filter(Boolean);
      const bb = Array.isArray(x.boundingbox) && x.boundingbox.length === 4 ? x.boundingbox.map(Number) : null;
      return { name: parts[0] || q, detail: parts.slice(1, 4).concat(parts.length > 4 ? [parts[parts.length - 1]] : []).join(', '), lat: +x.lat, lon: +x.lon, bbox: bb, kind: String(x.type || x.category || '').replace(/_/g, ' ') };
    }).filter(x => x.lat === x.lat && x.lon === x.lon);
  }
  async function search(q, opts) {
    q = String(q || '').trim(); if (q.length < 2) return [];
    const o = opts || {}, limit = o.limit || 8, intl = ((root.FL_CONFIG || {}).market === 'intl');
    if (o.countries != null) return query(q, o.countries, limit);
    if (intl) return query(q, '', limit);
    const local = await query(q, 'za', limit);
    if (local.length) return local;
    return query(q, '', limit);
  }
  FL.places = { search };
})(typeof window !== 'undefined' ? window : globalThis);
(function () {
  'use strict';
  const FL = window.FL, CFG = window.FL_CONFIG || {}, ARTIFACT = !!window.FL_ARTIFACT;
  const $ = (s, el) => (el || document).querySelector(s), $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n = (v, d) => (v == null || v !== v) ? '—' : Number(v).toFixed(d == null ? 1 : d);
  let demoR = null, liveOK = ARTIFACT ? false : null;
  if (CFG.market === 'intl' && FL.geo) FL.geo.assumeSouth = false;
  async function hero() {
    const box = $('#hero-map'); if (!box) return;
    if (!FL.pipeline) return heroStatic(box);
    const mv = new FL.MapView(box, {});
    Object.assign(mv.layers, { streams: false, catchment: false, depth: false, dyn: false, imagery: false, site: true });
    mv.siteLabel = 'SITE';
    try {
      const cfg = FL.pipeline.defaults(); const s = FL.demo.provider.site();
      cfg.provider = FL.demo.provider; cfg.site = { E: s.E, N: s.N }; cfg.structures = FL.demo.structures ? FL.demo.structures() : [];
      demoR = await FL.pipeline.analyse(cfg);
      mv.setData(demoR);
      let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity;
      for (const r of demoR.maps[100].rings) for (const p of r) { e0 = Math.min(e0, p[0]); e1 = Math.max(e1, p[0]); n0 = Math.min(n0, p[1]); n1 = Math.max(n1, p[1]); }
      mv.fit(e0 - 140, e1 + 140, n0 - 100, n1 + 100, 0.02);
      $('#hb-q100').textContent = n(demoR.hydro.design[100], 1) + ' m³/s';
      $('#hb-a').textContent = n(demoR.catchment.areaKm2, 1) + ' km²';
      window.FL_HERO_STATS = { q100: demoR.hydro.design[100], areaKm2: demoR.catchment.areaKm2, xs: demoR.geometry.xs.length, structures: demoR.structures.length };
      thumbs();
    } catch (e) { console.error(e); }
  }
  async function heroStatic(box) {
    const v = '?v=' + (window.FL_BUILD || '1');
    const img = new Image(); img.alt = ''; img.className = 'hero-img'; img.src = 'assets/hero.jpg' + v; img.decoding = 'async'; box.insertBefore(img, box.firstChild);
    for (const [id, f, a] of [['th-plan', 'sample/thumb-plan.jpg', 'Sample flood line plan drawing'], ['th-sect', 'sample/thumb-section.jpg', 'Sample longitudinal and cross-section drawing']]) { const el = $('#' + id); if (el) el.innerHTML = `<img src="${f}${v}" alt="${a}" loading="lazy" decoding="async">`; }
    try {
      const st = await (await fetch('sample/stats.json' + v, { cache: 'no-cache' })).json();
      $('#hb-q100').textContent = n(st.q100, 1) + ' m³/s'; $('#hb-a').textContent = n(st.areaKm2, 1) + ' km²';
      if (!st.structures) $('#hb-xs').textContent = 'the river';
    } catch (e) { $('#hb-q100').textContent = '—'; $('#hb-a').textContent = '—'; }
  }
  function thumbs() {
    if (!demoR || !FL.drawing) return;
    const meta = { company: (CFG.brand || {}).company, slogan: (CFG.brand || {}).slogan, client: 'Sample client', project: 'Sample flood line study', siteName: 'Sample site', reportNo: 'SAMPLE', drawingNo: 'SAMPLE', rev: 'A', date: new Date().toISOString().slice(0, 10), demo: true, status: 'SAMPLE' };
    try {
      const a = FL.drawing.planSheet(demoR, meta, { pxPerMm: 1.6 }), b = FL.drawing.sectionSheet(demoR, meta);
      const fit = svg => svg.replace(/width="420mm" height="297mm"/, 'width="100%" height="100%" preserveAspectRatio="xMidYMid meet"');
      $('#th-plan').innerHTML = fit(a.svg); $('#th-sect').innerHTML = fit(b.svg);
    } catch (e) { console.error(e); }
  }
  let checkMap = null, lastCheck = null;
  async function runCheck(useDemo) {
    const out = $('#chk-out'), btn = $('#chk-go');
    let prov, site;
    if (useDemo) { prov = FL.demo.provider; const s = prov.site(); site = { E: s.E, N: s.N, lat: s.lat, lon: s.lon }; }
    else {
      const p = FL.geo.parseLatLon($('#chk-coord').value);
      if (!p) { findPlace($('#chk-coord').value); return; }
      $('#chk-places').hidden = true;
      if (ARTIFACT) { out.innerHTML = '<p class="note err">This preview cannot download map data. The check works on the published website.</p><button class="btn" type="button" id="chk-demo2">Try it on the demonstration site</button>'; $('#chk-demo2').addEventListener('click', () => runCheck(true)); return; }
      prov = FL.dem.liveProvider(FL.geo.siteCM(p.lat, p.lon)); site = p;
    }
    btn.disabled = true; out.innerHTML = '<p class="note">Analysing the terrain around the site…</p>';
    try {
      const r = await FL.screening.screen(prov, site, (f, m) => { out.innerHTML = '<p class="note">' + esc(m) + '</p>'; });
      lastCheck = { r, demo: !!useDemo, site };
      const lv = { high: ['High', 'The site is low-lying ground next to a watercourse. A flood line will almost certainly be required before development.'], moderate: ['Moderate', 'A watercourse is close to the site. Most municipalities require a flood line for development near a watercourse.'], low: ['Low', 'No significant watercourse was found close to the site. A flood line may still be required by your municipality or for other water courses not visible in satellite terrain.'] }[r.level];
      out.innerHTML = `<div class="result"><div class="level ${r.level}"><i></i>Flood risk indication: ${lv[0]}${useDemo ? ' (demo site)' : ''}</div><p>${lv[1]}</p>
        <div class="kv"><span>Nearest watercourse</span><b>${r.stream ? n(r.stream.dist, 0) + ' m' : 'none within 2.5 km'}</b><span>Catchment draining past that point</span><b>${r.stream ? n(r.stream.areaKm2, 1) + ' km²' : '—'}</b><span>Site height above the watercourse</span><b>${r.siteHAND === r.siteHAND ? n(r.siteHAND, 1) + ' m' : '—'}</b></div>
        <p class="note">A quick indication only. It is not a flood line and cannot be used for approvals.</p>
        <div><a class="btn red" href="#quote" id="chk-quote">Request a certified flood line</a></div></div>`;
      $('#chk-quote').addEventListener('click', () => {
        if (!useDemo) { $('#q-coord').value = site.lat.toFixed(6) + ', ' + site.lon.toFixed(6); if (lastPlace && $('#q-address') && !$('#q-address').value) $('#q-address').value = lastPlace.slice(0, 300); }
        $('#q-notes').value = ($('#q-notes').value ? $('#q-notes').value + '\n' : '') + 'Free check: risk ' + lv[0] + (r.stream ? ', watercourse ' + n(r.stream.dist, 0) + ' m away, catchment ' + n(r.stream.areaKm2, 1) + ' km²' : '') + '.';
      });
      showCheckMap(r, !!useDemo);
      if (!useDemo) liveOK = true;
    } catch (e) {
      console.error(e);
      out.innerHTML = '<p class="note err">' + esc(e && e.code === 'blocked' ? 'The terrain data for this site could not be downloaded. Check your internet connection and try again, or request a quote below.' : ((e && e.message) || 'The check could not be completed.')) + '</p><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn red" type="button" id="chk-retry">Try again</button><button class="btn" type="button" id="chk-demo3">Try the demonstration site</button></div>';
      $('#chk-retry').addEventListener('click', () => runCheck(false)); $('#chk-demo3').addEventListener('click', () => runCheck(true));
    } finally { btn.disabled = false; }
  }
  let checkBands = null, checkRes = null, checkBase = 'photo', hintT = null;
  function showCheckMap(r, demo) {
    const box = $('#chk-map'); box.hidden = false; const ph = $('#chk-ph'); if (ph) ph.hidden = true;
    if (!checkMap) {
      checkMap = new FL.MapView(box, { cooperative: true, northBottom: true, onWheelHint: () => { const h = $('#chk-hint'); h.hidden = false; clearTimeout(hintT); hintT = setTimeout(() => { h.hidden = true; }, 1600); } });
      checkMap.overlays = [(ctx, m) => drawCheck(ctx, m)];
      $$('[data-base]', box).forEach(b => b.addEventListener('click', () => { if (b.disabled) return; checkBase = b.dataset.base; applyBase(); }));
      $$('[data-z]', box).forEach(b => b.addEventListener('click', () => { if (b.dataset.z === 'in') checkMap.zoom(1 / 1.6); else if (b.dataset.z === 'out') checkMap.zoom(1.6); else fitCheck(); }));
    }
    checkRes = r; checkBands = FL.screening.riskBands(r, { minKm2: 0.5 });
    const g = r.grid;
    checkMap.data = { coarse: g, fine: null, catchment: { streams: { lines: [] }, outline: [] }, maps: {}, site: r.site, cm: r.cm };
    checkMap.cache = { hsCoarse: FL.mapfx.hillshadeCanvas(g), ctCoarse: FL.mapfx.contours(g, 5, 5) }; checkMap.hand = null;
    Object.assign(checkMap.layers, { streams: false, catchment: false, flood50: false, flood100: false, xs: false, centreline: false, hand: false, site: false, depth: false, dyn: false });
    checkBase = demo ? 'terrain' : 'photo';
    const sat = $('[data-base=photo]', box); sat.disabled = demo; sat.title = demo ? 'The demonstration valley is synthetic, so there is no photo of it' : '';
    $('#chk-title').textContent = demo ? 'Flood risk map · demonstration valley' : 'Flood risk map · your site';
    applyBase(); fitCheck();
    if (window.innerWidth < 900) setTimeout(() => box.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
  }
  function applyBase() {
    const photo = checkBase === 'photo';
    Object.assign(checkMap.layers, { imagery: photo, hillshade: !photo, contours: !photo });
    $$('#chk-map [data-base]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.base === checkBase)));
    const narrow = $('#chk-map').clientWidth < 560;
    $('#chk-attr').textContent = (photo ? (narrow ? 'Imagery © Esri, Maxar · ' : 'Imagery: Esri, Maxar, Earthstar Geographics · ') : '') + (lastCheck && lastCheck.demo ? 'Demonstration terrain' : (narrow ? 'Terrain © AWS (SRTM)' : 'Terrain: AWS Terrain Tiles (Mapzen; SRTM, NASA)'));
    checkMap.render();
  }
  function fitCheck() {
    const r = checkRes; if (!r) return; const box = $('#chk-map'), d = r.stream ? r.stream.dist : 500;
    const W = Math.min(2600, Math.max(900, 3 * d + 600));
    checkMap.view.cx = r.stream ? (r.site.E * 0.65 + r.stream.E * 0.35) : r.site.E; checkMap.view.cy = r.stream ? (r.site.N * 0.65 + r.stream.N * 0.35) : r.site.N;
    checkMap.view.scale = W / Math.max(300, box.clientWidth); checkMap.resize();
  }
  function drawCheck(ctx, m) {
    const b = checkBands, r = checkRes; if (!b || !r) return;
    const ring = rings => { ctx.beginPath(); for (const rg of rings) { let p = m.toScreen(rg[0][0], rg[0][1]); ctx.moveTo(p[0], p[1]); for (let i = 1; i < rg.length; i++) { p = m.toScreen(rg[i][0], rg[i][1]); ctx.lineTo(p[0], p[1]); } ctx.closePath(); } };
    const photo = m.layers.imagery;
    ring(b.moderate); ctx.fillStyle = photo ? 'rgba(255,176,46,0.30)' : 'rgba(240,150,40,0.26)'; ctx.fill('evenodd'); ctx.setLineDash([7, 4]); ctx.lineWidth = 1.6; ctx.strokeStyle = photo ? 'rgba(255,200,90,0.95)' : 'rgba(205,120,20,0.9)'; ctx.stroke(); ctx.setLineDash([]);
    ring(b.high); ctx.fillStyle = photo ? 'rgba(235,48,38,0.42)' : 'rgba(200,54,43,0.36)'; ctx.fill('evenodd'); ctx.lineWidth = 2.2; ctx.strokeStyle = photo ? '#ff5a4a' : '#c8362b'; ctx.stroke();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const l of b.lines) {
      const w = 1.3 + 1.1 * Math.min(4, l.order); ctx.beginPath(); let p = m.toScreen(l.pts[0][0], l.pts[0][1]); ctx.moveTo(p[0], p[1]); for (let i = 1; i < l.pts.length; i++) { p = m.toScreen(l.pts[i][0], l.pts[i][1]); ctx.lineTo(p[0], p[1]); }
      ctx.strokeStyle = photo ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.8)'; ctx.lineWidth = w + 2.4; ctx.stroke(); ctx.strokeStyle = '#2b8cff'; ctx.lineWidth = w; ctx.stroke();
    }
    const [sx, sy] = m.toScreen(r.site.E, r.site.N);
    if (r.stream && r.stream.dist > 5) {
      const [wx, wy] = m.toScreen(r.stream.E, r.stream.N);
      ctx.setLineDash([5, 5]); ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(wx, wy); ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#2b8cff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(wx, wy, 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      const near = Math.hypot(wx - sx, wy - sy) < 130;
      pill(ctx, near ? sx : (sx + wx) / 2, near ? sy + 20 : (sy + wy) / 2, Math.round(r.stream.dist) + ' m to the watercourse', '#17222c', '#fff');
    }
    ctx.save(); ctx.translate(sx, sy); ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-4, -9, -12, -14, -12, -24); ctx.arc(0, -24, 12, Math.PI, 0); ctx.bezierCurveTo(12, -14, 4, -9, 0, 0); ctx.closePath();
    ctx.fillStyle = '#7a2b8f'; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -24, 4.5, 0, 2 * Math.PI); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    pill(ctx, sx, sy - 50, lastCheck && lastCheck.demo ? 'DEMO SITE' : 'YOUR SITE', '#fff', '#7a2b8f');
  }
  function pill(ctx, x, y, text, bg, fg) {
    ctx.font = '700 12px "Barlow Condensed", "Arial Narrow", sans-serif'; const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = bg; ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w / 2, y - 10, w, 20, 10); else ctx.rect(x - w / 2, y - 10, w, 20); ctx.fill(); ctx.stroke();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 0.5);
  }
  async function findPlace(text) {
    const out = $('#chk-out'), box = $('#chk-places'); text = String(text || '').trim();
    if (text.length < 2) { out.innerHTML = '<p class="note err">Type your town, suburb or street address, or paste coordinates such as ' + (CFG.market === 'intl' ? '-15.38720, 28.32280' : '-26.10512, 28.05741') + '.</p>'; return; }
    if (!FL.places) return;
    box.hidden = false; box.innerHTML = '<p class="note">Searching…</p>'; out.innerHTML = '';
    try {
      const res = await FL.places.search(text);
      if (!res.length) { box.innerHTML = '<p class="note err">No place found. Try the town or suburb name, or paste coordinates from Google Maps.</p>'; return; }
      box.innerHTML = '<span class="hint">Choose the place:</span>' + res.map((r, i) => `<button type="button" data-i="${i}"><b>${esc(r.name)}</b><span>${esc(r.detail)}</span></button>`).join('');
      $$('button[data-i]', box).forEach(b => b.addEventListener('click', () => { const r = res[+b.dataset.i]; $('#chk-coord').value = r.lat.toFixed(6) + ', ' + r.lon.toFixed(6); box.hidden = true; lastPlace = r.name + (r.detail ? ', ' + r.detail : ''); runCheck(false); }));
    } catch (e) { box.innerHTML = '<p class="note err">' + esc(e.message || 'The place search is not available right now.') + ' You can paste coordinates instead.</p>'; }
  }
  let lastPlace = '';
  function quoteForm() {
    const f = $('#q-form'); if (!f) return;
    $('#q-started').value = String(Date.now());
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const msg = $('#q-msg'); msg.textContent = '';
      const val = id => ($('#' + id) ? $('#' + id).value.trim() : '');
      const coord = FL.geo.parseLatLon(val('q-coord'));
      const data = {
        full_name: val('q-name'), company: val('q-company'), email: val('q-email'), phone: val('q-phone'),
        site_description: val('q-site'), address: val('q-address'), lat: coord ? +coord.lat.toFixed(6) : null, lon: coord ? +coord.lon.toFixed(6) : null,
        purpose: val('q-purpose'), return_periods: $$('input[name=q-rp]:checked').map(i => i.value), survey: val('q-survey'),
        size_ha: val('q-size') ? parseFloat(val('q-size')) : null, deadline: val('q-deadline'), referral: val('q-ref'), notes: val('q-notes'),
        consent: $('#q-consent').checked ? 'yes' : '', website: val('q-website'), started_at: val('q-started'),
        screening: lastCheck && !lastCheck.demo ? { level: lastCheck.r.level, stream_m: lastCheck.r.stream ? Math.round(lastCheck.r.stream.dist) : null, catchment_km2: lastCheck.r.stream ? +lastCheck.r.stream.areaKm2.toFixed(2) : null, hand_m: +(lastCheck.r.siteHAND || 0).toFixed(1) } : null,
        page: location.href.split('#')[0].slice(0, 200),
      };
      const errs = [];
      if (data.full_name.length < 2) errs.push('your name');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) errs.push('a valid e-mail address');
      if (data.phone.replace(/\D/g, '').length < 9) errs.push('a phone number');
      if (!data.site_description && !data.address && !coord) errs.push('the site (erf number, address or coordinates)');
      if (!data.purpose) errs.push('what the flood line is for');
      if (!data.consent) errs.push('your consent to store the request');
      if (errs.length) { msg.innerHTML = '<p class="note err">Please add ' + errs.join(', ') + '.</p>'; return; }
      if (ARTIFACT) { msg.innerHTML = '<p class="note">Preview only: on the published website this request goes to your inbox, e-mail and phone. Nothing was sent from this preview.</p>'; return; }
      const btn = $('#q-send'); btn.disabled = true; btn.textContent = 'Sending…';
      let r = null, j = {};
      try { r = await fetch(CFG.quotes.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.quotes.key }, body: JSON.stringify(data) }); j = await r.json().catch(() => ({})); }
      catch (netErr) { r = null; }
      btn.disabled = false; btn.textContent = 'Send request';
      if (r && r.ok && j.ok) {
        $('#q-done').hidden = false; $('#q-done-ref').textContent = j.ref; f.hidden = true;
        $('#q-done').scrollIntoView({ block: 'center' });
        const ads = CFG.ads || {}; if (ads.gtagId && ads.conversionLabel && window.gtag) window.gtag('event', 'conversion', { send_to: ads.gtagId + '/' + ads.conversionLabel });
        return;
      }
      if (r && j.error && r.status !== 404) { msg.innerHTML = '<p class="note err">' + esc(j.error) + '</p>'; return; }
      const c = CFG.contact || {};
      const text = ['Flood line quote request', 'Name: ' + data.full_name + (data.company ? ' (' + data.company + ')' : ''), 'E-mail: ' + data.email, 'Phone: ' + data.phone, 'Site: ' + [data.site_description, data.address].filter(Boolean).join(', '), data.lat != null ? 'Coordinates: ' + data.lat + ', ' + data.lon : '', 'Purpose: ' + data.purpose, 'Flood lines: ' + data.return_periods.join(', '), data.survey ? 'Survey: ' + data.survey : '', data.size_ha ? 'Size: ' + data.size_ha + ' ha' : '', data.deadline ? 'Needed by: ' + data.deadline : '', data.notes ? 'Notes: ' + data.notes : ''].filter(Boolean).join('\n');
      const ways = [c.whatsapp ? `<a class="btn red" target="_blank" rel="noopener" href="https://wa.me/${esc(c.whatsapp.replace(/\D/g, ''))}?text=${encodeURIComponent(text)}">Send on WhatsApp</a>` : '', c.email ? `<span>E-mail: <b>${esc(c.email)}</b></span>` : '', c.phone ? `<span>Phone: <b>${esc(c.phone)}</b></span>` : ''].filter(Boolean).join(' ');
      msg.innerHTML = `<div class="note err" style="display:grid;gap:8px"><span>We could not send the request online right now. Please copy it and send it to us${ways ? ':' : ' later.'}</span><textarea id="q-copytext" readonly rows="6">${esc(text)}</textarea><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button class="btn" type="button" id="q-copy">Copy request</button>${ways}</div></div>`;
      $('#q-copy').addEventListener('click', () => { const ta = $('#q-copytext'); navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(ta.value).then(() => { $('#q-copy').textContent = 'Copied'; }, () => { ta.select(); }) : ta.select(); });
    });
  }
  function contacts() {
    const lg = $('#brand-logo'); if (lg && (CFG.brand || {}).logo) { lg.src = CFG.brand.logo; lg.hidden = false; }
    const c = CFG.contact || {}, el = $('#contacts'); if (!el) return;
    const rows = [];
    if (c.phone) rows.push(`<div>Phone: <b>${esc(c.phone)}</b></div>`);
    if (c.whatsapp) rows.push(`<div>WhatsApp: <a href="https://wa.me/${esc(c.whatsapp.replace(/\D/g, ''))}" target="_blank" rel="noopener">${esc(c.whatsapp)}</a></div>`);
    if (c.email) rows.push(`<div>E-mail: <b>${esc(c.email)}</b></div>`);
    if (c.area) rows.push(`<div>Service area: ${esc(c.area)}</div>`);
    el.innerHTML = rows.join('');
    const wa = c.whatsapp ? c.whatsapp.replace(/\D/g, '') : '', tel = c.phone ? c.phone.replace(/[^\d+]/g, '') : '';
    if (wa || tel) {
      const waBtn = wa ? `<a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/${esc(wa)}?text=${encodeURIComponent('Hi Adventuity, I need a flood line for a site. ')}" aria-label="WhatsApp us">WhatsApp</a>` : '';
      const telBtn = tel ? `<a class="btn" href="tel:${esc(tel)}">Call ${esc(c.phone)}</a>` : '';
      const hc = $('.hero .ctas'); if (hc) hc.insertAdjacentHTML('beforeend', waBtn + telBtn);
      const rv = $('.reveal .btn.red'); if (rv) rv.insertAdjacentHTML('afterend', waBtn);
      if (!$('#wa-float') && wa) document.body.insertAdjacentHTML('beforeend', `<a id="wa-float" href="https://wa.me/${esc(wa)}?text=${encodeURIComponent('Hi Adventuity, I need a flood line for a site. ')}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp"><svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><path fill="#fff" d="M16 3C9 3 3.3 8.6 3.3 15.6c0 2.4.7 4.7 1.9 6.7L3 29l6.9-2.1a12.9 12.9 0 0 0 6.1 1.5c7 0 12.7-5.6 12.7-12.7S23 3 16 3zm0 23.2c-1.9 0-3.8-.5-5.4-1.5l-.4-.2-4.1 1.3 1.3-3.9-.3-.4a10.4 10.4 0 0 1-1.6-5.5C5.5 9.9 10.2 5.3 16 5.3s10.5 4.6 10.5 10.3S21.8 26.2 16 26.2zm5.8-7.7c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.3-.5-2.5-1.6-.9-.8-1.6-1.8-1.8-2.1-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.3 1.4 3.5c.2.2 2.4 3.6 5.8 5 .8.3 1.4.5 1.9.7.8.3 1.5.2 2.1.1.6-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4z"/></svg></a>`);
    }
    const pr = CFG.pricing || [], pel = $('#pricing');
    if (pel) { if (pr.length) { pel.hidden = false; $('#price-cards').innerHTML = pr.map(p => `<article><h3>${esc(p.name)}</h3><div class="amt">${esc(p.price)}</div><p>${esc(p.text || '')}</p></article>`).join(''); } }
  }
  async function probe() {
    if (ARTIFACT) return;
    const z = 12, x = Math.floor(FL.geo.lonToPx(28.05, z) / 256), y = Math.floor(FL.geo.latToPx(-26.1, z) / 256);
    try { await Promise.race([FL.dem.browserTileLoader(z, x, y), new Promise((_, rj) => setTimeout(() => rj({ code: 'timeout' }), 10000))]); liveOK = true; } catch (e) { liveOK = false; }
  }
  function boot() {
    hero(); quoteForm(); contacts(); probe();
    $('#chk-form').addEventListener('submit', e => { e.preventDefault(); runCheck(false); });
    $('#chk-coord').addEventListener('input', () => { lastPlace = ''; });
    $('#chk-demo').addEventListener('click', () => runCheck(true));
    $$('[data-goto-studio]').forEach(a => a.addEventListener('click', e => { if (window.FL_SWITCH) { e.preventDefault(); window.FL_SWITCH('studio'); } }));
    const y = $('#year'); if (y) y.textContent = new Date().getFullYear();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
