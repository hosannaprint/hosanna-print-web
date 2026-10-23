/* =====================================================================
   Hosanna print – 3D tlačiareň viazaná na scroll (Three.js r160)
   ---------------------------------------------------------------------
   AKO FUNGUJE SCROLL:
   1. Sekcia #uvod je vysoká (560vh) a obsahuje sticky „stage" na celú výšku okna.
   2. Z pozície scrollu v rámci sekcie počítame progres P ∈ ⟨0, 1⟩.
   3. P sa každý snímok vyhladzuje (exponenciálny lerp) – aj trhaný scroll kolieskom
      tak vyzerá plynulo a prémiovo.
   4. Celá scéna je ČISTÁ FUNKCIA P: kamera, skener, valce, papier, tlačová hlava aj
      odtlačok na papieri sa počítajú len z P. Preto sa dá animácia „pretáčať"
      oboma smermi a pri rýchlom scrolle nič nepreskočí.
   5. Časová os (hodnoty P):
        0.00–0.10  hero – video na pozadí, tlačiareň sa jemne vznáša
        0.10–0.30  fáza 1 – vloženie papiera (zadný podávač sa vyklopí, hárok vkĺzne dnu)
        0.30–0.50  fáza 2 – skener sa otvorí, valce sa roztočia a vedú papier pod hlavu
        0.50–0.78  fáza 3 – nanášanie tlače (hlava prechádza, odtlačok pribúda po pásoch)
        0.78–0.96  fáza 4 – výstupný zásobník sa vysunie, výtlačok vyjde a „predstaví sa"
   Model je postavený procedurálne podľa referenčnej fotky (čierna A3+ fototlačiareň:
   lesklý predný panel, dotykový displej vpravo, okno atramentových zásobníkov vpravo dole).
   ===================================================================== */
(function () {
  'use strict';

  var section = document.getElementById('uvod');
  var canvas = document.getElementById('printer-canvas');
  if (!section || !canvas) return;

  var stepEls = Array.prototype.slice.call(section.querySelectorAll('.story__step'));
  var dotEls = Array.prototype.slice.call(section.querySelectorAll('.story-progress__item'));
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Časová os ---------- */
  var PHASES = [
    [0.10, 0.30], // 1 · vloženie papiera
    [0.30, 0.50], // 2 · pohyb valcov
    [0.50, 0.78], // 3 · nanášanie tlače
    [0.78, 0.96]  // 4 · výstup produktu
  ];
  var HERO_END = 0.08;

  /* ---------- Pomocné funkcie ---------- */
  function clamp(v, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function seg(p, a, b) { return clamp((p - a) / (b - a)); }           // lokálny progres úseku ⟨a, b⟩
  function smooth(t) { return t * t * (3 - 2 * t); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  /* =====================================================================
     SCROLL → PROGRES + DOM (popisy fáz, indikátor, premenné pre CSS)
     ===================================================================== */
  var targetP = 0;
  var P = 0;
  var visible = true;
  var rafId = 0;
  var lastTime = 0;
  var scene3d = null;

  function readScroll() {
    var rect = section.getBoundingClientRect();
    var total = section.offsetHeight - window.innerHeight;
    targetP = total > 0 ? clamp(-rect.top / total) : 0;
  }

  var cssCache = {};
  function setVar(el, key, name, v) {
    var s = v.toFixed(4);
    if (cssCache[key] !== s) { cssCache[key] = s; el.style.setProperty(name, s); }
  }

  var lastStep = -2;
  function updateDom(p) {
    var heroOut = smooth(seg(p, 0, HERO_END));
    var stageIn = smooth(seg(p, 0.03, 0.105));
    setVar(section, 'h', '--hero-out', heroOut);
    setVar(section, 's', '--stage-in', stageIn);

    var tone = stageIn > 0.5 ? 'light' : 'dark';
    if (section.getAttribute('data-tone') !== tone) section.setAttribute('data-tone', tone);
    section.classList.toggle('is-past-hero', heroOut > 0.98);
    section.classList.toggle('in-story', p > PHASES[0][0] - 0.02);

    var step = -1;
    for (var i = 0; i < PHASES.length; i++) if (p >= PHASES[i][0] - 0.012) step = i;
    if (step !== lastStep) {
      lastStep = step;
      stepEls.forEach(function (el, i) { el.classList.toggle('is-active', i === step); });
      dotEls.forEach(function (el, i) {
        el.classList.toggle('is-active', i === step);
        if (i === step) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
      });
    }
    dotEls.forEach(function (el, i) { setVar(el, 'd' + i, '--fill', seg(p, PHASES[i][0], PHASES[i][1])); });
  }

  // Klik na indikátor fázy → plynulý posun na danú fázu
  dotEls.forEach(function (btn, i) {
    btn.addEventListener('click', function () {
      var total = section.offsetHeight - window.innerHeight;
      var top = section.getBoundingClientRect().top + window.scrollY;
      var ph = PHASES[i];
      window.scrollTo({ top: top + total * lerp(ph[0], ph[1], 0.62), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    });
  });

  /* ---------- Hlavná slučka ---------- */
  function frame(now) {
    rafId = 0;
    var dt = Math.min(0.1, (now - (lastTime || now)) / 1000);
    lastTime = now;

    // Vyhladenie progresu (nezávislé od FPS)
    var k = reduceMotion.matches ? 1 : 1 - Math.exp(-dt * 6.5);
    P += (targetP - P) * k;
    var settled = Math.abs(targetP - P) < 0.00004;
    if (settled) P = targetP;

    updateDom(P);

    var keepGoing = !settled;
    if (scene3d) {
      scene3d.update(P, now / 1000, dt);
      scene3d.render();
      keepGoing = keepGoing || scene3d.isAnimating();
    }
    if (keepGoing && visible && !document.hidden) rafId = requestAnimationFrame(frame);
  }
  function start() {
    if (!rafId && visible && !document.hidden) { lastTime = 0; rafId = requestAnimationFrame(frame); }
  }

  window.addEventListener('scroll', function () { readScroll(); start(); }, { passive: true });
  window.addEventListener('resize', function () { readScroll(); if (scene3d) scene3d.resize(); start(); });
  document.addEventListener('visibilitychange', start);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      start();
    }, { rootMargin: '100px 0px' }).observe(section);
  }

  readScroll();
  P = targetP;
  updateDom(P);
  start();

  /* =====================================================================
     3D SCÉNA
     ===================================================================== */
  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
    } catch (e) { return false; }
  }
  if (!hasWebGL()) { section.classList.add('no-webgl'); return; }

  // Three.js sa načíta dynamicky (import map v index.html) – stránka sa medzitým už zobrazuje.
  Promise.all([
    import('three'),
    import('three/addons/geometries/RoundedBoxGeometry.js'),
    import('three/addons/environments/RoomEnvironment.js')
  ]).then(function (mods) {
    scene3d = createPrinterScene(mods[0], mods[1].RoundedBoxGeometry, mods[2].RoomEnvironment);
    scene3d.resize();
    scene3d.update(P, performance.now() / 1000, 0);
    scene3d.render();
    section.classList.add('is-ready');
    start();
  }).catch(function (err) {
    console.warn('[Hosanna print] 3D scénu sa nepodarilo načítať, zobrazujem záložný obrázok.', err);
    section.classList.add('no-webgl');
  });

  function createPrinterScene(THREE, RoundedBoxGeometry, RoomEnvironment) {
    var V3 = THREE.Vector3;
    var stage = section.querySelector('.stage');
    var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    var smallScreen = Math.min(window.innerWidth, window.innerHeight) < 700;
    var logoD = (document.getElementById('logo-path') || { getAttribute: function () { return ''; } }).getAttribute('d');

    /* ---------- Renderer, scéna, kamera ---------- */
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, smallScreen ? 1.75 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0); // priehľadné pozadie – pod ním je video / svetlé štúdio z CSS

    var scene = new THREE.Scene();
    // Odrazy: procedurálne „štúdio" (RoomEnvironment) → lesklý čierny plast vyzerá realisticky
    var pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    pmrem.dispose();

    var camera = new THREE.PerspectiveCamera(30, 1, 0.5, 120);
    var camTarget = new V3();

    /* ---------- Svetlá: kľúčové (s tieňmi), protisvetlo v tóne značky, výplň ---------- */
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5f6f63, 0.35));

    var key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(-5, 10, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(smallScreen ? 1024 : 2048, smallScreen ? 1024 : 2048);
    key.shadow.camera.left = -7.5; key.shadow.camera.right = 7.5;
    key.shadow.camera.top = 7.5; key.shadow.camera.bottom = -7.5;
    key.shadow.camera.near = 1; key.shadow.camera.far = 32;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    scene.add(key);

    var rim = new THREE.DirectionalLight(0xdcebdc, 1.5);
    rim.position.set(7, 5, -7);
    scene.add(rim);

    var fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(7, 2.5, 8);
    scene.add(fill);

    // Podlaha, ktorá zachytáva iba tieň + mäkký kontaktný tieň pod tlačiarňou
    var groundMat = new THREE.ShadowMaterial({ opacity: 0.18 });
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.045;
    ground.receiveShadow = true;
    scene.add(ground);

    var blobMat = new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, depthWrite: false, toneMapped: false, opacity: 0.6 });
    var blob = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 6.6), blobMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = -0.04;
    scene.add(blob);

    var printer = new THREE.Group();
    scene.add(printer);

    /* ---------- Textúry generované v canvase ---------- */
    function canvasTex(w, h, draw, srgb) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      var t = new THREE.CanvasTexture(c);
      if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return t;
    }
    function makeBlobTexture() {
      return canvasTex(256, 256, function (g, w, h) {
        var grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        grd.addColorStop(0, 'rgba(10,16,12,0.55)');
        grd.addColorStop(0.55, 'rgba(10,16,12,0.22)');
        grd.addColorStop(1, 'rgba(10,16,12,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, w, h);
      });
    }
    // jemná „zrnitosť" plastu (bump mapa)
    var noiseTex = canvasTex(128, 128, function (g, w, h) {
      var img = g.createImageData(w, h);
      for (var i = 0; i < img.data.length; i += 4) {
        var v = 118 + Math.random() * 20;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }, false);
    noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
    noiseTex.repeat.set(6, 6);
    // ryhy na gumových valcoch – vďaka nim je vidieť ich otáčanie
    var rollerTex = canvasTex(256, 16, function (g, w, h) {
      g.fillStyle = '#1a1a1a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#3a3a3a';
      for (var x = 0; x < w; x += 16) g.fillRect(x, 0, 3, h);
    });
    rollerTex.wrapS = rollerTex.wrapT = THREE.RepeatWrapping;

    /* ---------- Materiály ---------- */
    var M = {
      body: new THREE.MeshPhysicalMaterial({ color: 0x131416, roughness: 0.6, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.55, bumpMap: noiseTex, bumpScale: 0.3, envMapIntensity: 0.55 }),
      body2: new THREE.MeshPhysicalMaterial({ color: 0x1c1d20, roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.4, envMapIntensity: 0.6 }),
      gloss: new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, roughness: 0.13, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.85 }),
      lid: new THREE.MeshPhysicalMaterial({ color: 0x0e0f11, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.14, envMapIntensity: 0.7 }),
      bezel: new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03 }),
      slot: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.95 }),
      interior: new THREE.MeshStandardMaterial({ color: 0x25282c, roughness: 0.8, metalness: 0.05, envMapIntensity: 0.5 }),
      interiorLight: new THREE.MeshStandardMaterial({ color: 0x43474d, roughness: 0.6, envMapIntensity: 0.6 }),
      metal: new THREE.MeshStandardMaterial({ color: 0xd0d4d8, metalness: 1, roughness: 0.2 }),
      sheet: new THREE.MeshStandardMaterial({ color: 0x9aa1a7, metalness: 0.85, roughness: 0.42 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0xffffff, map: rollerTex, roughness: 0.9 }),
      foot: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 }),
      whitePl: new THREE.MeshStandardMaterial({ color: 0xe6e6e1, roughness: 0.45, envMapIntensity: 0.5 }),
      sage: new THREE.MeshPhysicalMaterial({ color: 0x798c7d, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.25, envMapIntensity: 0.45 }),
      carriage: new THREE.MeshStandardMaterial({ color: 0x34383d, roughness: 0.5 }),
      ring: new THREE.MeshStandardMaterial({ color: 0xc4c9c6, metalness: 0.9, roughness: 0.25 }),
      tankShell: new THREE.MeshPhysicalMaterial({ color: 0xe8eeea, roughness: 0.15, transparent: true, opacity: 0.16, clearcoat: 1, depthWrite: false }),
      tankMark: new THREE.MeshBasicMaterial({ color: 0xdfe5e1, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    };

    /* ---------- Pomocníci na stavbu modelu ---------- */
    var geoCache = {};
    function rbox(w, h, d, r, mat, x, y, z, parent, segs) {
      segs = segs || 3;
      var k = [w, h, d, r, segs].join('|');
      var g = geoCache[k] || (geoCache[k] = new RoundedBoxGeometry(w, h, d, segs, Math.min(r, w / 2.01, h / 2.01, d / 2.01)));
      var m = new THREE.Mesh(g, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      (parent || printer).add(m);
      return m;
    }
    // valec s osou v smere X (valce, tyče)
    function cylX(r, len, mat, x, y, z, parent, segs) {
      var g = new THREE.CylinderGeometry(r, r, len, segs || 28);
      g.rotateZ(Math.PI / 2);
      var m = new THREE.Mesh(g, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      (parent || printer).add(m);
      return m;
    }
    function gearGeo(rOuter, rInner, teeth, depth) {
      var s = new THREE.Shape();
      var n = teeth * 4;
      for (var i = 0; i <= n; i++) {
        var a = (i / n) * Math.PI * 2;
        var r = (i % 4 === 1 || i % 4 === 2) ? rOuter : rInner;
        if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      var g = new THREE.ExtrudeGeometry(s, { depth: depth, bevelEnabled: false, curveSegments: 1 });
      g.translate(0, 0, -depth / 2);
      g.rotateY(Math.PI / 2); // os otáčania = X
      return g;
    }

    /* Rozmery (1 jednotka ≈ 10 cm): šírka 5.2, hĺbka 3.8, výška 1.72 – pomer podľa referencie */
    var FZ = 1.9;           // predná stena tela
    var PAPER_Y = 1.055;    // výška dráhy papiera vo vnútri
    var FEED_Z = -1.0, HEAD_Z = 0.05, EXIT_Z = 1.5;
    var RAIL_Y = 1.215, RAIL_Z = -0.36;

    /* ===== Spodné telo ===== */
    rbox(5.2, 1.0, 3.8, 0.1, M.body, 0, 0.5, 0, printer, 4);
    var footGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.05, 20);
    [[-2.2, -1.5], [2.2, -1.5], [-2.2, 1.5], [2.2, 1.5]].forEach(function (p) {
      var f = new THREE.Mesh(footGeo, M.foot);
      f.position.set(p[0], -0.02, p[1]);
      printer.add(f);
    });
    // kazeta na papier + úchyt, štrbina výstupného zásobníka
    rbox(3.7, 0.52, 0.03, 0.014, M.body2, -0.55, 0.38, FZ + 0.004);
    rbox(0.7, 0.045, 0.03, 0.02, M.slot, -0.55, 0.17, FZ + 0.016);
    rbox(3.15, 0.035, 0.02, 0.008, M.slot, 0, 0.97, FZ + 0.002);

    // vetracie otvory na bokoch
    var vents = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.3, 0.045), M.slot, 28);
    var dummy = new THREE.Object3D();
    var vi = 0;
    [-1, 1].forEach(function (side) {
      for (var i = 0; i < 14; i++) {
        dummy.position.set(side * 2.603, 0.55, -0.85 + i * 0.1);
        dummy.updateMatrix();
        vents.setMatrixAt(vi++, dummy.matrix);
      }
    });
    printer.add(vents);

    /* ===== Okno atramentových zásobníkov (vpravo dole, ako na referenčnej fotke) ===== */
    var TANK_X = 1.95;
    rbox(0.98, 0.62, 0.03, 0.035, M.gloss, TANK_X, 0.43, FZ + 0.006);
    var INK_COLORS = [0x2a2420, 0x00a0dc, 0xd6007a, 0xf3cc00, 0x8b8f92, 0x141414];
    var INK_BASE = [0.78, 0.66, 0.72, 0.84, 0.6, 0.7];
    var inks = INK_COLORS.map(function (c, i) {
      var x = TANK_X - 0.36 + i * 0.144;
      rbox(0.11, 0.5, 0.032, 0.022, M.tankShell, x, 0.43, FZ + 0.032).castShadow = false;
      var mat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, emissive: new THREE.Color(c), emissiveIntensity: 0.35, envMapIntensity: 0.4 });
      var ink = new THREE.Mesh(new THREE.BoxGeometry(0.084, 1, 0.012), mat);
      ink.position.set(x, 0.43, FZ + 0.03);
      printer.add(ink);
      [0.25, 0.63].forEach(function (y) {
        var mark = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.006), M.tankMark);
        mark.position.set(x, y, FZ + 0.0495);
        printer.add(mark);
      });
      return ink;
    });
    function setInk(i, level) {
      var h = 0.44 * level;
      inks[i].scale.y = h;
      inks[i].position.y = 0.205 + h / 2;
    }

    /* ===== Zadný chrbát so štrbinou zadného podávača ===== */
    rbox(5.2, 0.76, 0.44, 0.07, M.body, 0, 1.34, -1.68);
    var MOUTH_Z = -1.83;
    rbox(2.5, 0.012, 0.055, 0.005, M.slot, 0, 1.722, MOUTH_Z);
    [-1.1, 1.1].forEach(function (x) { rbox(0.05, 0.05, 0.14, 0.012, M.interiorLight, x, 1.738, MOUTH_Z + 0.02); });

    // Vyklápacia podpera papiera (v pokoji visí dolu po zadnej stene)
    var support = new THREE.Group();
    support.position.set(0, 1.72, -1.9);
    printer.add(support);
    rbox(2.7, 1.25, 0.035, 0.03, M.body2, 0, 0.64, 0.018, support);
    var supportExt = rbox(2.2, 0.9, 0.025, 0.02, M.body2, 0, 0.66, 0.046, support);

    /* ===== Vnútorný mechanizmus (viditeľný po otvorení skenera) ===== */
    // Plochy tesne pod papierom dostanú polygonOffset (posun v hĺbke) – na GPU s nižšou presnosťou
    // hĺbkového bufferu by inak „presvitali" cez papier (z-fighting).
    var underPaper = function (mat) {
      var m = mat.clone();
      m.polygonOffset = true; m.polygonOffsetFactor = 4; m.polygonOffsetUnits = 4;
      return m;
    };
    rbox(4.95, 0.02, 3.25, 0.008, underPaper(M.interior), 0, 1.005, 0.17);
    [-1, 1].forEach(function (s) { rbox(0.06, 0.34, 3.2, 0.01, M.sheet, s * 2.42, 1.17, 0.17); });

    // vodiace rebrá (platňa) pod papierom
    var ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.04, 2.3), underPaper(M.interiorLight), 17);
    for (var ri = 0; ri < 17; ri++) {
      dummy.position.set(-1.2 + ri * 0.15, 1.0, 0.25);
      dummy.updateMatrix();
      ribs.setMatrixAt(ri, dummy.matrix);
    }
    ribs.receiveShadow = true;
    printer.add(ribs);

    // Valce: všetko, čo sa otáča úmerne posunu papiera s (uhol = s / polomer)
    var spinners = [];
    cylX(0.022, 4.75, M.metal, 0, PAPER_Y - 0.055, FEED_Z);
    for (var fr = -2; fr <= 2; fr++) {
      spinners.push({ m: cylX(0.055, 0.32, M.rubber, fr * 0.5, PAPER_Y - 0.055, FEED_Z), r: 0.055 });
      spinners.push({ m: cylX(0.028, 0.12, M.whitePl, fr * 0.5, PAPER_Y + 0.029, FEED_Z), r: -0.028 });
    }
    rbox(4.5, 0.035, 0.08, 0.01, M.sheet, 0, PAPER_Y + 0.09, FEED_Z - 0.02);
    spinners.push({ m: cylX(0.04, 3.1, M.rubber, 0, PAPER_Y - 0.04, EXIT_Z), r: 0.04 });
    var starGeo = gearGeo(0.037, 0.026, 14, 0.006);
    for (var si = 0; si < 7; si++) {
      var star = new THREE.Mesh(starGeo, M.metal);
      star.position.set(-1.2 + si * 0.4, PAPER_Y + 0.037, EXIT_Z);
      printer.add(star);
      spinners.push({ m: star, r: -0.037 });
    }
    rbox(4.4, 0.03, 0.1, 0.01, M.interiorLight, 0, PAPER_Y + 0.095, EXIT_Z);

    // prevodovka na ľavej strane
    var gearBig = new THREE.Mesh(gearGeo(0.17, 0.15, 26, 0.03), M.whitePl);
    gearBig.position.set(-2.3, PAPER_Y - 0.055, FEED_Z);
    printer.add(gearBig);
    spinners.push({ m: gearBig, r: 0.055 });
    var gearSmall = new THREE.Mesh(gearGeo(0.07, 0.055, 10, 0.03), M.sage);
    gearSmall.position.set(-2.3, PAPER_Y + 0.17, FEED_Z - 0.12);
    printer.add(gearSmall);
    spinners.push({ m: gearSmall, r: -0.055 * 0.07 / 0.17 });
    cylX(0.08, 0.3, M.sheet, -2.1, PAPER_Y + 0.17, FEED_Z - 0.12);

    // vodiaca tyč, remeň, kladky
    cylX(0.028, 4.8, M.metal, 0, RAIL_Y, RAIL_Z);
    var beltGeo = new THREE.BoxGeometry(4.64, 0.008, 0.03);
    [1.165, 1.245].forEach(function (y) {
      var b = new THREE.Mesh(beltGeo, M.foot);
      b.position.set(0, y, -0.52);
      printer.add(b);
    });
    var pulleys = [-2.32, 2.32].map(function (x) {
      var g = new THREE.CylinderGeometry(0.04, 0.04, 0.05, 20);
      g.rotateX(Math.PI / 2);
      var m = new THREE.Mesh(g, M.metal);
      m.position.set(x, 1.205, -0.52);
      printer.add(m);
      return m;
    });

    // parkovacia stanica tlačovej hlavy (vpravo)
    rbox(0.55, 0.04, 0.45, 0.01, M.interiorLight, 2.05, 1.03, HEAD_Z);
    rbox(0.36, 0.02, 0.2, 0.008, M.foot, 2.05, 1.055, HEAD_Z);

    // Tlačová hlava (vozík)
    var carriage = new THREE.Group();
    printer.add(carriage);
    rbox(0.72, 0.25, 0.72, 0.035, M.carriage, 0, 1.205, -0.14, carriage);
    rbox(0.68, 0.03, 0.6, 0.014, M.sage, 0, 1.345, -0.12, carriage);
    var nozzle = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.01, 0.3), M.metal);
    nozzle.position.set(0, 1.076, HEAD_Z);
    carriage.add(nozzle);
    cylX(0.045, 0.74, M.interiorLight, 0, RAIL_Y, RAIL_Z, carriage);
    rbox(0.18, 0.05, 0.2, 0.01, M.carriage, 0, 1.31, -0.58, carriage);
    INK_COLORS.forEach(function (c, i) {
      var dot = new THREE.Mesh(new THREE.CircleGeometry(0.026, 20), new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(-0.25 + i * 0.1, 1.3612, 0.05);
      carriage.add(dot);
    });

    // Plochý kábel s atramentovými hadičkami – slučka v tvare U, ktorá sa prepočítava podľa polohy hlavy
    var RIB_A = 0.3, RIB_LEN = 3.0, RIB_R = 0.1, RIB_Y0 = 1.11, RIB_Z = -0.64, RIB_W = 0.1;
    var RIB_N = 64;
    var ribbonTex = canvasTex(64, 8, function (g, w, h) {
      g.fillStyle = '#e9ece9';
      g.fillRect(0, 0, w, h);
      ['#2a2420', '#00a0dc', '#d6007a', '#f3cc00', '#8b8f92', '#141414'].forEach(function (col, i) {
        g.fillStyle = col;
        g.fillRect(6 + i * 9, 0, 5, h);
      });
    });
    var ribbonGeo = new THREE.BufferGeometry();
    var ribPos = new Float32Array(RIB_N * 2 * 3);
    var ribUv = new Float32Array(RIB_N * 2 * 2);
    var ribIdx = [];
    for (var rn = 0; rn < RIB_N; rn++) {
      ribUv[rn * 4] = 0; ribUv[rn * 4 + 1] = rn / (RIB_N - 1);
      ribUv[rn * 4 + 2] = 1; ribUv[rn * 4 + 3] = rn / (RIB_N - 1);
      if (rn < RIB_N - 1) {
        var a0 = rn * 2;
        ribIdx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
      }
    }
    ribbonGeo.setAttribute('position', new THREE.BufferAttribute(ribPos, 3));
    ribbonGeo.setAttribute('uv', new THREE.BufferAttribute(ribUv, 2));
    ribbonGeo.setIndex(ribIdx);
    var ribbon = new THREE.Mesh(ribbonGeo, new THREE.MeshStandardMaterial({ map: ribbonTex, roughness: 0.4, side: THREE.DoubleSide }));
    ribbon.castShadow = true;
    ribbon.frustumCulled = false;
    printer.add(ribbon);
    rbox(0.14, 0.05, 0.14, 0.01, M.interiorLight, RIB_A + 0.06, RIB_Y0 - 0.01, RIB_Z);

    function updateRibbon(cx) {
      // spodná vetva od ukotvenia (RIB_A) doľava k ohybu T, polkruh, horná vetva k vozíku (cx)
      var straight = RIB_LEN;
      var T = (RIB_A + cx - straight) / 2;
      var lower = RIB_A - T, upper = cx - T, arc = Math.PI * RIB_R;
      var total = lower + arc + upper;
      for (var n = 0; n < RIB_N; n++) {
        var d = (n / (RIB_N - 1)) * total, x, y;
        if (d <= lower) { x = RIB_A - d; y = RIB_Y0; }
        else if (d <= lower + arc) {
          var ang = (d - lower) / RIB_R; // 0..π
          x = T - Math.sin(ang) * RIB_R;
          y = RIB_Y0 + RIB_R - Math.cos(ang) * RIB_R;
        } else { x = T + (d - lower - arc); y = RIB_Y0 + 2 * RIB_R; }
        ribPos[n * 6] = x; ribPos[n * 6 + 1] = y; ribPos[n * 6 + 2] = RIB_Z - RIB_W / 2;
        ribPos[n * 6 + 3] = x; ribPos[n * 6 + 4] = y; ribPos[n * 6 + 5] = RIB_Z + RIB_W / 2;
      }
      ribbonGeo.attributes.position.needsUpdate = true;
      ribbonGeo.computeVertexNormals();
    }

    // vnútorné osvetlenie – rozsvieti sa po otvorení skenera
    var innerLight = new THREE.PointLight(0xfff3e2, 0, 7, 2);
    innerLight.position.set(0, 2.0, -0.1);
    printer.add(innerLight);

    /* ===== Výstupný zásobník (vysúva sa vo fáze 4) ===== */
    var tray = new THREE.Group();
    printer.add(tray);
    rbox(3.0, 0.03, 1.7, 0.012, underPaper(M.body2), 0, 0.97, 1.04, tray);
    rbox(2.6, 0.006, 0.9, 0.003, underPaper(M.body), 0, 0.987, 1.35, tray);

    /* ===== Skenerová jednotka s vekom a ovládacím panelom (otvára sa na zadnom pánte) ===== */
    var scanner = new THREE.Group();
    scanner.position.set(0, 1.72, -1.46);
    printer.add(scanner);
    var sc = new THREE.Group();          // deti umiestňujeme v súradniciach tlačiarne
    sc.position.set(0, -1.72, 1.46);
    scanner.add(sc);
    rbox(5.2, 0.25, 3.32, 0.06, M.body, 0, 1.495, 0.2, sc);
    [-1, 1].forEach(function (s) { rbox(0.07, 0.4, 3.3, 0.025, M.body, s * 2.565, 1.2, 0.2, sc); });
    rbox(5.2, 0.4, 0.07, 0.025, M.body, 0, 1.2, -1.425, sc);
    rbox(5.2, 0.57, 0.11, 0.045, M.gloss, 0, 1.335, 1.855, sc);   // lesklý predný panel
    rbox(5.16, 0.1, 3.3, 0.05, M.lid, 0, 1.672, 0.2, sc);         // veko skenera
    var underside = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 3.1), M.interior);
    underside.rotation.x = Math.PI / 2;
    underside.position.set(0, 1.368, 0.2);
    sc.add(underside);

    var PZ = 1.912;
    // Tlačidlo napájania + LED
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.009, 12, 48), M.ring);
    ring.position.set(-2.12, 1.36, PZ);
    sc.add(ring);
    var pwr = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.012, 40), M.gloss);
    pwr.rotation.x = Math.PI / 2;
    pwr.position.set(-2.12, 1.36, PZ);
    sc.add(pwr);
    var ledMat = new THREE.MeshBasicMaterial({ color: 0xa8e6b8, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    var led = new THREE.Mesh(new THREE.CircleGeometry(0.013, 16), ledMat);
    led.position.set(-2.12, 1.225, PZ + 0.001);
    sc.add(led);

    // Logo značky na prednom paneli (namiesto pôvodného loga výrobcu)
    var wordTex = canvasTex(1024, 128, function (g, w, h) { drawWordmark(g, w, h); });
    var word = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.2), new THREE.MeshStandardMaterial({ map: wordTex, transparent: true, metalness: 0.45, roughness: 0.32, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    word.position.set(-0.2, 1.36, PZ + 0.001);
    sc.add(word);

    // Dotykový displej
    rbox(0.88, 0.47, 0.03, 0.03, M.bezel, 1.62, 1.345, PZ + 0.003, sc);
    var screenCanvas = document.createElement('canvas');
    screenCanvas.width = 512; screenCanvas.height = 256;
    var screenCtx = screenCanvas.getContext('2d');
    var screenTex = new THREE.CanvasTexture(screenCanvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    screenTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    var screen = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.39), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    screen.position.set(1.62, 1.345, PZ + 0.0195);
    sc.add(screen);
    var glass = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.43), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.04, clearcoat: 1, depthWrite: false }));
    glass.position.set(1.62, 1.345, PZ + 0.021);
    sc.add(glass);

    /* ===== Papier – sieť, ktorá sa ohýba po dráhe cez tlačiareň ===== */
    var PW = 2.1, PL = 2.97;          // formát A4
    var SX = 8, SL = 150;
    var paperGeo = new THREE.BufferGeometry();
    var pPos = new Float32Array((SX + 1) * (SL + 1) * 3);
    var pUv = new Float32Array((SX + 1) * (SL + 1) * 2);
    var pIdx = [];
    for (var j = 0; j <= SL; j++) {
      for (var i2 = 0; i2 <= SX; i2++) {
        var vIdx = j * (SX + 1) + i2;
        // u = 0 pri ľavom okraji motívu; v = 1 pri nábežnej hrane (vrch motívu sa tlačí ako prvý)
        pUv[vIdx * 2] = 1 - i2 / SX;
        pUv[vIdx * 2 + 1] = 1 - j / SL;
        if (j < SL && i2 < SX) {
          var a = vIdx, b = vIdx + 1, c = vIdx + SX + 1, d = c + 1;
          pIdx.push(a, b, c, b, d, c);
        }
      }
    }
    paperGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    paperGeo.setAttribute('uv', new THREE.BufferAttribute(pUv, 2));
    paperGeo.setIndex(pIdx);

    // Motív výtlačku + shader, ktorý ho odkrýva presne tam, kde už prešla tlačová hlava
    var printCanvas = document.createElement('canvas');
    printCanvas.width = 1024; printCanvas.height = 1448;
    var printTex = new THREE.CanvasTexture(printCanvas);
    printTex.colorSpace = THREE.SRGBColorSpace;
    printTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    drawPrintDesign(printCanvas.getContext('2d'), 1024, 1448);

    var printU = {
      uPrint: { value: printTex },
      uDone: { value: 2 },      // riadky s v ≥ uDone sú celé vytlačené
      uBandLow: { value: 2 },   // spodná hranica práve tlačeného pásu
      uHeadU: { value: 0 },     // poloha hlavy v súradnici u
      uDir: { value: 1 }        // smer prechodu hlavy
    };
    // nižší podiel odrazu prostredia → farby výtlačku ostanú verné (nevyblednú)
    var paperMat = new THREE.MeshStandardMaterial({ color: 0xfbfaf6, roughness: 0.82, side: THREE.DoubleSide, envMapIntensity: 0.3 });
    paperMat.onBeforeCompile = function (shader) {
      Object.keys(printU).forEach(function (k) { shader.uniforms[k] = printU[k]; });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vPrintUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPrintUv = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', [
          '#include <common>',
          'varying vec2 vPrintUv;',
          'uniform sampler2D uPrint;',
          'uniform float uDone, uBandLow, uHeadU, uDir;'
        ].join('\n'))
        .replace('#include <map_fragment>', [
          '#include <map_fragment>',
          '{',
          '  float printed = step(uDone, vPrintUv.y);',
          '  float inBand = step(uBandLow, vPrintUv.y) * (1.0 - step(uDone, vPrintUv.y));',
          '  float swept = uDir > 0.0 ? step(uHeadU, vPrintUv.x) : step(vPrintUv.x, uHeadU);',
          '  printed = max(printed, inBand * swept);',
          '  if (!gl_FrontFacing) printed = 0.0;',   // zadná strana hárku ostáva čistá
          '  vec3 ink = texture2D(uPrint, vPrintUv).rgb;',
          '  diffuseColor.rgb *= mix(vec3(1.0), ink, printed);',
          '}'
        ].join('\n'));
    };
    var paper = new THREE.Mesh(paperGeo, paperMat);
    paper.castShadow = true;
    paper.receiveShadow = true;
    paper.frustumCulled = false;
    printer.add(paper);

    /* ---------- Dráha papiera (krivka v rovine YZ) ----------
       Hárok sa opiera o podperu, vkĺzne do zadnej štrbiny, otočí sa okolo podávacieho valca,
       ide rovno pod tlačovou hlavou, vyjde prednou štrbinou na zásobník a za jeho koncom sa prehne. */
    var INCL = new V3(0, Math.cos(0.26), -Math.sin(0.26));
    var MOUTH = new V3(0, 1.72, MOUTH_Z);
    var curve = new THREE.CatmullRomCurve3([
      MOUTH.clone().addScaledVector(INCL, 3.4),
      MOUTH.clone().addScaledVector(INCL, 1.7),
      MOUTH.clone(),
      new V3(0, 1.48, -1.81),
      new V3(0, 1.24, -1.74),
      new V3(0, 1.1, -1.56),
      new V3(0, PAPER_Y + 0.007, -1.3),
      new V3(0, PAPER_Y, -0.95),
      new V3(0, PAPER_Y, 0.0),
      new V3(0, PAPER_Y, 1.0),
      new V3(0, PAPER_Y, 1.72),
      new V3(0, 1.03, 1.96),
      new V3(0, 1.01, 2.25),
      new V3(0, 1.0, 2.7),
      new V3(0, 0.998, 3.35),
      new V3(0, 0.955, 3.9),
      new V3(0, 0.8, 4.7),
      new V3(0, 0.58, 5.5)
    ], false, 'centripetal');
    var SAMPLES = 1400;
    var pathPts = curve.getSpacedPoints(SAMPLES);
    var pathLen = curve.getLength();
    var startDir = pathPts[0].clone().sub(pathPts[1]).normalize();
    var endDir = pathPts[SAMPLES].clone().sub(pathPts[SAMPLES - 1]).normalize();

    function pathAt(s, out) {
      if (s <= 0) return out.copy(pathPts[0]).addScaledVector(startDir, -s);
      if (s >= pathLen) return out.copy(pathPts[SAMPLES]).addScaledVector(endDir, s - pathLen);
      var f = (s / pathLen) * SAMPLES, i = Math.floor(f);
      return out.copy(pathPts[i]).lerp(pathPts[Math.min(SAMPLES, i + 1)], f - i);
    }
    function sAtZ(z) { // prvý bod vo vnútri tlačiarne, kde dráha dosiahne danú hĺbku z
      for (var i = 0; i <= SAMPLES; i++) {
        if (pathPts[i].y < 1.2 && pathPts[i].z >= z) return (i / SAMPLES) * pathLen;
      }
      return pathLen;
    }
    function sAtPoint(p) {
      var best = 0, bd = Infinity;
      for (var i = 0; i <= SAMPLES; i++) { var d = pathPts[i].distanceToSquared(p); if (d < bd) { bd = d; best = i; } }
      return (best / SAMPLES) * pathLen;
    }

    var N_BANDS = 14;
    var BAND = PL / N_BANDS;
    var HEAD_R = 1.32, X_PARK = 2.05;
    var S_MOUTH = sAtPoint(MOUTH);
    var S_ABOVE = S_MOUTH - 2.7;                  // hárok ešte nad tlačiarňou
    var S_REST = S_MOUTH;                         // opretý o podperu, nábežná hrana v štrbine
    var S_FEED = sAtZ(FEED_Z) + 0.06;             // zachytený podávacím valcom
    var S_PRINT0 = sAtZ(HEAD_Z) + BAND * 0.5;     // prvý pás pod hlavou
    var S_PRINT_END = S_PRINT0 + PL;
    var S_OUT = sAtZ(1.96) + PL + 0.12;           // zadná hrana vyšla von

    /* ---------- Výpočet stavu tlače (hlava + odkrytie motívu) z lokálneho progresu fázy 3 ---------- */
    function printState(t3) {
      if (t3 <= 0) return { x: X_PARK, adv: 0, done: 2, low: 2, u: 0, dir: 1, frac: 0 };
      var tp = seg(t3, 0.06, 0.97);
      if (tp <= 0) return { x: lerp(X_PARK, HEAD_R, easeInOut(seg(t3, 0, 0.06))), adv: 0, done: 2, low: 2, u: 0, dir: -1, frac: 0 };
      if (tp >= 1) return { x: N_BANDS % 2 === 0 ? HEAD_R : -HEAD_R, adv: N_BANDS, done: -1, low: -1, u: 0, dir: 1, frac: 1 };
      var f = tp * N_BANDS, k = Math.floor(f), tl = f - k;
      var sweep = easeInOut(clamp(tl / 0.8));          // 80 % času prechod hlavy
      var adv = easeInOut(clamp((tl - 0.8) / 0.2));    // 20 % času posun papiera o jeden pás
      var dir = k % 2 === 0 ? -1 : 1;                  // hlava tlačí oboma smermi
      var x = dir < 0 ? lerp(HEAD_R, -HEAD_R, sweep) : lerp(-HEAD_R, HEAD_R, sweep);
      var bandDone = tl >= 0.8;
      var done = 1 - (k + (bandDone ? 1 : 0)) / N_BANDS;
      return {
        x: x, adv: k + adv, done: done,
        low: bandDone ? done : 1 - (k + 1) / N_BANDS,
        u: (PW / 2 - x) / PW, dir: dir,
        frac: (k + (bandDone ? 1 : sweep)) / N_BANDS
      };
    }

    /* ---------- Kamera: kľúčové pozície (sférické súradnice okolo cieľa) ----------
       az = uhol okolo zvislej osi (0 = spredu), pol = uhol od zvislice, r = vzdialenosť */
    var CAM = [
      { p: 0.00, az: 0.62, pol: 1.13, r: 13.6, t: [0, 0.85, 0] },     // hero
      { p: 0.10, az: 0.56, pol: 1.06, r: 13.6, t: [0, 0.95, 0] },
      { p: 0.19, az: 2.25, pol: 1.0, r: 16.5, t: [0, 2.2, -1.2] },    // zozadu – vkladanie papiera
      { p: 0.29, az: 2.5, pol: 1.02, r: 14.0, t: [0, 1.7, -1.3] },
      { p: 0.40, az: 0.34, pol: 0.62, r: 14.0, t: [0, 1.3, 0.1] },    // zhora – otvorený skener
      { p: 0.52, az: 0.14, pol: 0.6, r: 13.4, t: [0.1, 1.2, 0.2] },
      { p: 0.65, az: -0.26, pol: 0.62, r: 12.6, t: [0, 1.2, 0.25] },  // detail tlače
      { p: 0.78, az: 0.08, pol: 0.72, r: 13.2, t: [0, 1.15, 0.5] },
      { p: 0.88, az: 0.45, pol: 1.05, r: 14.0, t: [0, 1.0, 1.4] },    // výstup na zásobník
      { p: 0.96, az: 0.08, pol: 1.3, r: 15.0, t: [0, 2.1, 1.2] },     // predstavenie výtlačku
      { p: 1.00, az: -0.04, pol: 1.3, r: 15.0, t: [0, 2.1, 1.2] }
    ];

    /* ---------- Displej tlačiarne ---------- */
    var screenKey = '';
    function drawScreen(state, pct) {
      var g = screenCtx, w = 512, h = 256;
      var grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#141a16'); grd.addColorStop(1, '#202a23');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.font = '600 15px Manrope, sans-serif';
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText('Hosanna print', 22, 24);
      g.textAlign = 'right';
      g.fillText(state === 'print' ? 'Tlač' : 'Wi-Fi', w - 22, 24);
      g.textAlign = 'center';

      if (state === 'ready') {
        // náhľad fotky – západ slnka so „stromom" v tvare listu z loga (odkaz na referenčnú fotku)
        var x0 = 136, y0 = 50, pw = 240, ph = 150;
        var sky = g.createLinearGradient(0, y0, 0, y0 + ph);
        sky.addColorStop(0, '#2b2d6e'); sky.addColorStop(0.45, '#c2508a'); sky.addColorStop(0.75, '#f59a4a'); sky.addColorStop(1, '#ffd27a');
        roundRect(g, x0, y0, pw, ph, 12); g.save(); g.clip();
        g.fillStyle = sky; g.fillRect(x0, y0, pw, ph);
        g.fillStyle = 'rgba(255,230,170,0.9)'; g.beginPath(); g.arc(x0 + pw * 0.66, y0 + ph * 0.72, 22, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1b1d24'; g.fillRect(x0, y0 + ph - 22, pw, 22);
        drawLogo(g, x0 + pw * 0.3 - 46, y0 + 30, 92, '#1b1d24');
        g.restore();
        g.fillStyle = '#fff'; g.font = '700 19px Manrope, sans-serif';
        g.fillText('Pripravené na tlač', w / 2, 226);
      } else if (state === 'load' || state === 'prep') {
        drawLogo(g, w / 2 - 34, 62, 68, '#798c7d');
        g.fillStyle = '#fff'; g.font = '700 26px Manrope, sans-serif';
        g.fillText(state === 'load' ? 'Vkladanie papiera' : 'Podávanie papiera', w / 2, 170);
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = '500 17px Manrope, sans-serif';
        g.fillText(state === 'load' ? 'Zadný podávač · A4 · 300 g/m²' : 'Príprava tlačovej hlavy…', w / 2, 204);
      } else if (state === 'print') {
        g.fillStyle = '#fff'; g.font = '700 22px Manrope, sans-serif';
        g.fillText('Tlačím…', w / 2, 70);
        g.font = '300 76px Fraunces, Georgia, serif';
        g.fillText(Math.round(pct * 100) + ' %', w / 2, 138);
        roundRect(g, 76, 190, w - 152, 12, 6); g.fillStyle = 'rgba(255,255,255,0.14)'; g.fill();
        roundRect(g, 76, 190, Math.max(12, (w - 152) * pct), 12, 6); g.fillStyle = '#9fb3a3'; g.fill();
      } else {
        g.strokeStyle = '#9fb3a3'; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); g.arc(w / 2, 104, 44, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(w / 2 - 20, 105); g.lineTo(w / 2 - 5, 120); g.lineTo(w / 2 + 22, 90); g.stroke();
        g.fillStyle = '#fff'; g.font = '700 26px Manrope, sans-serif';
        g.fillText('Hotovo', w / 2, 184);
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = '500 17px Manrope, sans-serif';
        g.fillText('Výtlačok je pripravený', w / 2, 214);
      }
      screenTex.needsUpdate = true;
    }

    function roundRect(g, x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }
    function drawLogo(g, x, y, size, color) {
      if (!logoD || typeof Path2D !== 'function') return;
      g.save();
      g.translate(x, y);
      g.scale(size / 1643, size / 1643);
      g.fillStyle = color;
      g.fill(new Path2D(logoD));
      g.restore();
    }
    function spaced(g, text, x, y, spacing) {
      // text s rozostupom písmen (funguje aj v prehliadačoch bez ctx.letterSpacing)
      var widths = text.split('').map(function (ch) { return g.measureText(ch).width; });
      var total = widths.reduce(function (a, b) { return a + b; }, 0) + spacing * (text.length - 1);
      var cx = x - total / 2;
      var align = g.textAlign;
      g.textAlign = 'left';
      text.split('').forEach(function (ch, i) { g.fillText(ch, cx, y); cx += widths[i] + spacing; });
      g.textAlign = align;
    }
    function drawWordmark(g, w, h) {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#cfd5d1';
      g.font = '700 54px Manrope, sans-serif';
      g.textBaseline = 'middle';
      g.textAlign = 'center';
      var text = 'HOSANNA PRINT', sp = 14, logo = 64, gap = 26;
      var tw = g.measureText(text).width + sp * (text.length - 1);
      var x0 = (w - (logo + gap + tw)) / 2;
      drawLogo(g, x0, h / 2 - logo / 2, logo, '#cfd5d1');
      spaced(g, text, x0 + logo + gap + tw / 2, h / 2 + 2, sp);
    }

    // Motív, ktorý tlačiareň vytlačí (vrch = nábežná hrana)
    function drawPrintDesign(g, W, H) {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, W, H);
      var blockH = Math.round(H * 0.56);
      var grd = g.createLinearGradient(0, 0, W, blockH);
      grd.addColorStop(0, '#839685'); grd.addColorStop(1, '#6f8273');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, blockH);
      // rastrové bodky – jemný tlačiarenský detail
      for (var y = 24; y < blockH; y += 26) {
        for (var x = 24; x < W; x += 26) {
          var r = 1 + 4.2 * Math.pow(y / blockH, 2) * (0.55 + 0.45 * Math.sin(x * 0.012 + y * 0.004));
          g.fillStyle = 'rgba(255,255,255,0.085)';
          g.beginPath(); g.arc(x + ((y / 26) % 2) * 13, y, r, 0, Math.PI * 2); g.fill();
        }
      }
      drawLogo(g, W / 2 - 150, blockH * 0.14, 300, '#ffffff');
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.font = '400 96px Fraunces, Georgia, serif';
      g.fillText('Hosanna print', W / 2, blockH * 0.8);
      g.font = '700 22px Manrope, sans-serif';
      spaced(g, 'TLAČ · DIZAJN · S LÁSKOU K DETAILU', W / 2, blockH * 0.89, 7);

      g.textAlign = 'left';
      g.fillStyle = '#18211b';
      g.font = '400 70px Fraunces, Georgia, serif';
      g.fillText('Vaša predstava,', 84, blockH + 128);
      g.fillStyle = '#66796a';
      g.font = 'italic 300 70px Fraunces, Georgia, serif';
      g.fillText('naša tlač.', 84, blockH + 206);
      g.fillStyle = '#cdd5ce';
      [0, 1, 2, 3].forEach(function (i) { g.fillRect(84, blockH + 262 + i * 30, (W - 168) - (i === 3 ? 260 : i * 30), 10); });
      ['#00a0dc', '#d6007a', '#f3cc00', '#1d1d1b', '#798c7d', '#c9d4cb'].forEach(function (col, i) {
        g.fillStyle = col;
        g.beginPath(); g.arc(110 + i * 70, H - 92, 24, 0, Math.PI * 2); g.fill();
      });
      g.fillStyle = '#56625a';
      g.font = '700 20px Manrope, sans-serif';
      g.textAlign = 'right';
      g.fillText('hosannaprint.sk', W - 84, H - 84);
      // orezové značky
      g.strokeStyle = '#9aa49d'; g.lineWidth = 2;
      [[34, 34, 1, 1], [W - 34, 34, -1, 1], [34, H - 34, 1, -1], [W - 34, H - 34, -1, -1]].forEach(function (c) {
        g.beginPath();
        g.moveTo(c[0], c[1] + c[3] * 26); g.lineTo(c[0], c[1]); g.lineTo(c[0] + c[2] * 26, c[1]);
        g.stroke();
      });
    }

    // Po načítaní web fontov prekreslíme texty v textúrach
    if (document.fonts && document.fonts.load) {
      Promise.all([
        document.fonts.load('400 96px Fraunces'),
        document.fonts.load('italic 300 70px Fraunces'),
        document.fonts.load('700 22px Manrope'),
        document.fonts.load('600 15px Manrope')
      ]).then(function () {
        drawPrintDesign(printCanvas.getContext('2d'), 1024, 1448);
        printTex.needsUpdate = true;
        var c = wordTex.image; drawWordmark(c.getContext('2d'), c.width, c.height); wordTex.needsUpdate = true;
        screenKey = '';
        start();
      }).catch(function () {});
    }

    /* ---------- Interakcia: jemný paralax za kurzorom + otáčanie ťahaním myšou ---------- */
    var pointer = { x: 0, y: 0 };
    var rot = { x: 0, y: 0 };
    var drag = { active: false, startX: 0, base: 0, value: 0 };
    if (finePointer) {
      section.classList.add('can-drag');
      window.addEventListener('pointermove', function (e) {
        pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
        if (drag.active) drag.value = clamp(drag.base + (e.clientX - drag.startX) * 0.006, -0.9, 0.9);
        start();
      }, { passive: true });
      canvas.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        drag.active = true;
        drag.startX = e.clientX;
        drag.base = drag.value;
        section.classList.add('is-dragging');
        start();
      });
      window.addEventListener('pointerup', function () {
        drag.active = false;
        section.classList.remove('is-dragging');
        start();
      });
    }

    /* ---------- Zmena veľkosti ---------- */
    var view = { w: 1, h: 1 };
    function resize() {
      view.w = Math.max(1, stage.clientWidth);
      view.h = Math.max(1, stage.clientHeight);
      renderer.setSize(view.w, view.h, false);
      camera.aspect = view.w / view.h;
    }

    /* =====================================================================
       UPDATE: celý stav scény z progresu p
       ===================================================================== */
    var tmp = new V3(), tmp2 = new V3(), camLocal = new V3();
    var nrm = new V3(), axX = new V3(), axU = new V3(), center = new V3(0, 3.05, 2.5);
    var animating = false;

    function update(p, time, dt) {
      var t1 = seg(p, PHASES[0][0], PHASES[0][1]);
      var t2 = seg(p, PHASES[1][0], PHASES[1][1]);
      var t3 = seg(p, PHASES[2][0], PHASES[2][1]);
      var t4 = seg(p, PHASES[3][0], PHASES[3][1]);
      var heroF = 1 - smooth(seg(p, 0, 0.1));
      var stageIn = smooth(seg(p, 0.03, 0.105));
      var still = reduceMotion.matches;

      /* --- Fáza 1: podpera sa vyklopí, hárok zhora dosadne a vkĺzne do štrbiny --- */
      var supUp = easeInOut(seg(t1, 0, 0.3)) * (1 - easeInOut(seg(t4, 0.12, 0.42)));
      support.rotation.x = lerp(-Math.PI, -0.26, supUp);
      supportExt.position.y = 0.66 + 0.8 * easeOut(seg(t1, 0.18, 0.42)) * (1 - seg(t4, 0.05, 0.25));

      /* --- Fáza 2: skener sa otvorí na zadnom pánte --- */
      var open = easeInOut(seg(t2, 0, 0.4)) * (1 - easeInOut(seg(t4, 0, 0.28)));
      scanner.rotation.x = -0.95 * open;
      innerLight.intensity = open * 5;

      /* --- Fáza 4: vysunutie výstupného zásobníka --- */
      tray.position.z = 1.55 * easeInOut(seg(t4, 0.05, 0.32));

      /* --- Tlač: poloha hlavy a odkrytie motívu --- */
      var ps = printState(t3);
      var carX = ps.x;
      if (t4 > 0) carX = lerp(ps.x, X_PARK, easeInOut(seg(t4, 0, 0.22)));
      carriage.position.x = carX;
      pulleys.forEach(function (m) { m.rotation.z = -carX / 0.04; });
      updateRibbon(carX);
      printU.uDone.value = ps.done;
      printU.uBandLow.value = ps.low;
      printU.uHeadU.value = ps.u;
      printU.uDir.value = ps.dir;
      for (var i = 0; i < inks.length; i++) setInk(i, INK_BASE[i] - 0.12 * ps.frac * (0.6 + i * 0.08));
      ledMat.color.setHex(t3 > 0 && t3 < 1 ? (Math.sin(time * 9) > 0 ? 0xc8f5d2 : 0x6fbf86) : 0xa8e6b8);

      /* --- Poloha papiera na dráhe: súčet posunov jednotlivých fáz (spojité aj pri scrolle späť) --- */
      var s = S_ABOVE
        + (S_REST - S_ABOVE) * easeOut(seg(t1, 0.15, 0.55))
        + (S_FEED - S_REST) * easeInOut(seg(t1, 0.62, 1))
        + (S_PRINT0 - S_FEED) * easeInOut(seg(t2, 0.35, 1))
        + BAND * ps.adv
        + (S_OUT - S_PRINT_END) * easeInOut(seg(t4, 0.28, 0.66));
      var rollAngle = s - S_ABOVE;
      spinners.forEach(function (sp) { sp.m.rotation.x = rollAngle / sp.r; });

      /* --- Predstavenie výtlačku: hárok sa zdvihne a natočí ku kamere --- */
      var present = easeInOut(seg(t4, 0.66, 1));
      paper.visible = p > PHASES[0][0] + 0.004;

      /* --- Kamera --- */
      var portrait = camera.aspect < 1;
      var ci = 0;
      while (ci < CAM.length - 2 && p > CAM[ci + 1].p) ci++;
      var ka = CAM[ci], kb = CAM[ci + 1];
      var kt = easeInOut(seg(p, ka.p, kb.p));
      camera.fov = portrait ? 40 : 30;
      // na úzkych obrazovkách kameru oddialime, aby sa tlačiareň zmestila na šírku
      var fitK = lerp(1.22, 1.0, seg(camera.aspect, 0.75, 0.5)); // tablet na výšku potrebuje viac priestoru než telefón
      var fit = Math.max(1, (fitK / camera.aspect) * Math.tan(15 * Math.PI / 180) / Math.tan(camera.fov * Math.PI / 360));
      var R = lerp(ka.r, kb.r, kt) * fit;
      var az = lerp(ka.az, kb.az, kt), pol = lerp(ka.pol, kb.pol, kt);
      camTarget.set(lerp(ka.t[0], kb.t[0], kt), lerp(ka.t[1], kb.t[1], kt), lerp(ka.t[2], kb.t[2], kt));
      camera.position.set(
        camTarget.x + R * Math.sin(pol) * Math.sin(az),
        camTarget.y + R * Math.cos(pol),
        camTarget.z + R * Math.sin(pol) * Math.cos(az)
      );
      camera.lookAt(camTarget);
      // posun obrazu, aby tlačiareň neprekrývala texty (hero text / popisy fáz)
      var sx, sy;
      if (!portrait) { sx = lerp(0.15, 0.21, heroF); sy = lerp(0.0, 0.03, heroF); }
      else { sx = 0; sy = lerp(-0.13, 0.25, heroF); }
      camera.setViewOffset(view.w, view.h, -sx * view.w, -sy * view.h, view.w, view.h);
      camera.updateProjectionMatrix();

      /* --- Tlačiareň: vznášanie v hero, paralax, ťahanie --- */
      var kRot = 1 - Math.exp(-(dt || 0.016) * 4);
      var tx = finePointer ? pointer.x * 0.1 : 0, ty = finePointer ? pointer.y * 0.04 : 0;
      rot.y += (tx - rot.y) * kRot;
      rot.x += (ty - rot.x) * kRot;
      if (!drag.active) drag.value *= Math.exp(-(dt || 0.016) * 2.4);
      var idle = still ? 0 : heroF;
      printer.rotation.y = rot.y + drag.value + Math.sin(time * 0.45) * 0.06 * idle;
      printer.rotation.x = rot.x * 0.6;
      printer.position.y = Math.sin(time * 1.1) * 0.05 * idle + 0.05 * idle;

      groundMat.opacity = 0.07 + 0.13 * stageIn;
      blobMat.opacity = 0.35 + 0.3 * stageIn;

      /* --- Deformácia papiera --- */
      printer.updateMatrixWorld(true);
      camLocal.copy(camera.position);
      printer.worldToLocal(camLocal);
      if (present > 0) {
        nrm.copy(camLocal).sub(center).normalize();
        axX.crossVectors(nrm, tmp.set(0, 1, 0)).normalize();
        axU.crossVectors(axX, nrm);
      }
      var flutter = still ? 0 : 1;
      var lift = Math.sin(Math.PI * present);
      for (var jj = 0; jj <= SL; jj++) {
        var u = (jj / SL) * PL;
        pathAt(s - u, tmp);
        var vv = PL / 2 - u;
        for (var ii = 0; ii <= SX; ii++) {
          var x = -PW / 2 + (ii / SX) * PW;
          var o = (jj * (SX + 1) + ii) * 3;
          var px = x, py = tmp.y, pz = tmp.z;
          if (present > 0) {
            var bow = 0.09 * Math.pow(x / (PW / 2), 2) + flutter * Math.sin(time * 1.4 + u * 1.3) * 0.025;
            tmp2.copy(center).addScaledVector(axX, x).addScaledVector(axU, vv).addScaledVector(nrm, bow);
            px = lerp(px, tmp2.x, present);
            py = lerp(py, tmp2.y, present) + lift * 0.55;
            pz = lerp(pz, tmp2.z, present) + lift * 0.45;
          }
          pPos[o] = px; pPos[o + 1] = py; pPos[o + 2] = pz;
        }
      }
      paperGeo.attributes.position.needsUpdate = true;
      paperGeo.computeVertexNormals();

      /* --- Displej --- */
      var state = p < PHASES[0][0] ? 'ready' : p < PHASES[1][0] ? 'load' : p < PHASES[2][0] ? 'prep' : p < PHASES[3][0] ? 'print' : 'done';
      var keyStr = state + (state === 'print' ? Math.round(ps.frac * 100) : '');
      if (keyStr !== screenKey) { screenKey = keyStr; drawScreen(state, ps.frac); }

      // Ešte animujeme? (vznášanie v hero, doznievanie paralaxy/ťahania, chvenie výtlačku, blikanie LED)
      animating = (!still && (heroF > 0.001 || present > 0)) ||
        Math.abs(tx - rot.y) > 0.0005 || Math.abs(ty - rot.x) > 0.0005 ||
        drag.active || Math.abs(drag.value) > 0.0005 || (t3 > 0 && t3 < 1);
    }

    function render() { renderer.render(scene, camera); }

    return {
      update: update,
      render: render,
      resize: resize,
      isAnimating: function () { return animating; }
    };
  }
})();
