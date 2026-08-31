/**
 * ============================================================================
 *  VR-TEMP para Shapespark — Temperatura de color GLOBAL (WebXR + desktop)
 * ============================================================================
 *  4 presets: 2700K / 3000K / 4000K (neutro = original) / 6000K.
 *
 *  Activación (tres vías, simultáneas):
 *   1) Botones 3D del editor con Type = btn_2700 | btn_3000 | btn_4000 | btn_6000
 *      -> viewer.onNodeTypeClicked. La documentación no garantiza múltiples
 *      oyentes simultáneos, así que este registro ÚNICO también REPLICA el
 *      manejo de esferas de intensidad del editor de vr-compat.js
 *      (node.type = vista -> viewer.switchToView(vista, 0)). Así los clicks
 *      de intensidad funcionan tanto si el viewer soporta un solo oyente
 *      (el nuestro reemplaza al de vr-compat y lo replica) como si soporta
 *      varios (vr-compat también responde; el doble switchToView a la MISMA
 *      vista con maxTime=0 es inofensivo).
 *   2) Botones DOM .temp-btn (desktop) -> reemplaza SOLO su onclick anterior
 *      (el overlay CSS). Sliders de intensidad y .reset-btn de zonas: intactos.
 *   3) Fallback VR: 4 esferas 3D auto-generadas SOLO dentro del casco
 *      (segunda fila, debajo de las esferas de intensidad de vr-compat).
 *
 *  Efecto (engine-side, visible en VR):
 *   - Capa A (primaria): lerp de Material.baseColor de TODOS los materiales
 *     editables hacia el color del preset + viewer.requestFrame().
 *     4000K = intensidad 0 = restaurar colores originales.
 *   - Capa B (solo XR): quad translúcido anclado a la cabeza, opacidad baja.
 *
 *  GARANTÍAS (no afectar intensidades):
 *   - NO modifica vr-compat.js, ZONES_CONFIG, sliders, exposure, gamma,
 *     cameraVolumes ni viewer.switchToView.
 *   - Usa SUS PROPIOS oyentes de sesión XR (sessionstart/selectstart) y SU PROPIO
 *     requestAnimationFrame; múltiples callbacks por sesión son válidos en WebXR.
 *   - La temperatura es global y PERSISTE entre cambios de vista/intensidad.
 *
 *  Debug: window.VRTEMP.state() / VRTEMP.apply('2700') / VRTEMP.reset()
 *  Integración (body-end.html, DESPUÉS de vr-compat.js):
 *    <script src="extra-assets/vr-temp.js?v=1"></script>
 * ============================================================================
 */
(function () {
  'use strict';

  var TAG = '[VRTEMP]';

  function log() { console.log.apply(console, [TAG].concat(Array.prototype.slice.call(arguments))); }
  function warn() { console.warn.apply(console, [TAG].concat(Array.prototype.slice.call(arguments))); }

  // ==========================================================================
  // PRESETS (paleta derivada de script (2).js:123-128, afinada para global)
  // ==========================================================================
  var PRESETS = {
    '2700': { hexNum: 0xFFCC5A, css: '#FFCC5A', intensity: 0.42, label: '2700K' },
    '3000': { hexNum: 0xFFE3A3, css: '#FFE3A3', intensity: 0.28, label: '3000K' },
    '4000': { hexNum: 0xFFFFFF, css: '#FFFFFF', intensity: 0.00, label: '4000K' },
    '6000': { hexNum: 0xCBE9FF, css: '#CBE9FF', intensity: 0.30, label: '6000K' }
  };
  var ORDER = ['2700', '3000', '4000', '6000'];
  var TINT_SCALE = 0.55;      // atenuación global del lerp (evita sobresaturar)
  var QUAD_OPACITY_SCALE = 0.18;
  var QUAD_SIZE = 2.6;        // m a 0.62 m de la cabeza cubre ~130° (Quest ~110°)
  var QUAD_DIST = 0.62;
  var STORAGE_KEY = 'vrtemp';
  var SKIP_MATERIAL = /sky|cielo/i;   // materiales que NO se tintan
  // Botones del editor: acepta btn_2700 / boton-2700 / Btn 2700, etc.
  var BTN_ANCHORED = /^(?:btn|boton|botón)[-_ ]?(2700|3000|4000|6000)$/i;
  var BTN_LOOSE = /(?:^|[^0-9])(2700|3000|4000|6000)(?:[^0-9]|$)/; // fallback sobre node.type
  var STORE_LIMIT = 8; // máx. ancestros a revisar buscando el type del botón

  // ==========================================================================
  // ESTADO
  // ==========================================================================
  var viewer = null;
  var T3 = null;                       // window.THREE (el mismo que carga el viewer)
  var originals = {};                  // name -> THREE.Color original
  var originalsSaved = false;
  var pendingTemp = null;              // temp pedida antes de guardar originales
  var activeTemp = null;
  var domWired = false;

  // VR
  var xrSession = null;
  var xrRefSpace = null;
  var xrScene = null;
  var sceneOffset = { x: 0, y: 0, z: 0 };  // calibración igual que VRCOMPAT.sceneOffset
  var group = null;                    // grupo de esferas de temperatura
  var spheres = [];                    // {mesh, temp, baseScale}
  var laser = null;
  var quad = null;                     // capa B
  var vrReady = false;
  var raycaster = null;                // THREE.Raycaster propio (instancia propia)
  var tmpV1 = null, tmpQ1 = null, tmpV2 = null; // temporales de matemáticas

  // ==========================================================================
  // UTILIDADES
  // ==========================================================================
  function getTHREE() {
    if (T3) return T3;
    T3 = window.THREE || null;
    return T3;
  }

  function hexToRgb01(hexNum) {
    return {
      r: ((hexNum >> 16) & 255) / 255,
      g: ((hexNum >> 8) & 255) / 255,
      b: (hexNum & 255) / 255
    };
  }

  // Búsqueda profunda del objeto escena por feature detection (misma técnica
  // que vr-compat.js:149-153; NO importa el THREE del viewer, solo busca).
  function deepFind(root, match, depth) {
    if (depth > 4 || root == null) return null;
    var keys;
    try { keys = Object.keys(root); } catch (e) { return null; }
    for (var i = 0; i < keys.length; i++) {
      var v;
      try { v = root[keys[i]]; } catch (e) { continue; }
      if (!v) continue;
      if (typeof v === 'object') {
        try {
          if (v.isScene === true || v.isScene === 1) return v;
        } catch (e) { /* sin getter */ }
        var found = deepFind(v, match, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  // ==========================================================================
  // CAPA A — TINTE GLOBAL POR MATERIALES (primaria, VR-compatible)
  // ==========================================================================
  function storeOriginals() {
    if (originalsSaved) return;
    var mats = [];
    try {
      if (typeof viewer.getEditableMaterials === 'function') mats = viewer.getEditableMaterials() || [];
      else { warn('getEditableMaterials no disponible en este viewer'); }
    } catch (e) { warn('getEditableMaterials error:', e); }

    var missingBase = 0;
    for (var i = 0; i < mats.length; i++) {
      var m = mats[i];
      if (!m || !m.name) continue;
      if (SKIP_MATERIAL.test(m.name)) continue;
      if (!m.baseColor) { missingBase++; continue; }
      if (originals[m.name]) continue;
      try { originals[m.name] = m.baseColor.clone(); } catch (e) { /* clone no disp. */ }
    }
    originalsSaved = true;
    log('materiales originales guardados:', Object.keys(originals).length,
        missingBase ? ('(sin baseColor: ' + missingBase + ')') : '');

    if (pendingTemp) {
      var k = pendingTemp; pendingTemp = null;
      applyTemp(k);
    } else {
      restoreSaved();
    }
  }

  function applyTemp(key) {
    key = String(key);
    var p = PRESETS[key];
    if (!p) { warn('preset desconocido:', key); return; }

    if (!originalsSaved) { pendingTemp = key; log('escena aún no lista; temp en cola:', key); return; }
    if (!getTHREE()) { warn('THREE no disponible aún'); return; }

    activeTemp = key;
    var tint = hexToRgb01(p.hexNum);
    var k = p.intensity * TINT_SCALE;

    var changed = 0;
    for (var name in originals) {
      if (!Object.prototype.hasOwnProperty.call(originals, name)) continue;
      var m = null;
      try { m = viewer.findMaterial(name); } catch (e) { m = null; }
      if (!m || !m.baseColor) continue;
      var o = originals[name];
      try {
        if (p.intensity === 0) {
          m.baseColor.copy(o);
        } else {
          // lerp MANUAL por componentes: evita mezclar instancias THREE distintas
          m.baseColor.r = o.r + (tint.r - o.r) * k;
          m.baseColor.g = o.g + (tint.g - o.g) * k;
          m.baseColor.b = o.b + (tint.b - o.b) * k;
        }
        changed++;
      } catch (e) { /* material sin baseColor editable */ }
    }

    try { viewer.requestFrame(); } catch (e) { /* no crítico */ }

    updateDomActive(key);
    persist(key);
    updateQuad(p);
    vrFeedback();
    log('temperatura aplicada:', key, '(', p.label, ') materiales:', changed);
  }

  function resetTemp() { applyTemp('4000'); } // 4000K = neutro = originales

  function persist(key) {
    try { localStorage.setItem(STORAGE_KEY, key); } catch (e) { /* privado */ }
  }

  function restoreSaved() {
    var k = null;
    try { k = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (k && PRESETS[k]) { log('restaurando temp guardada:', k); applyTemp(k); }
  }

  // ==========================================================================
  // VÍA 1 — BOTONES 3D DEL EDITOR (btn_2700 .. btn_6000)
  // ==========================================================================
  function keyFromType(type) {
    if (!type || typeof type !== 'string') return null;
    var m = type.match(BTN_ANCHORED);
    if (m) return m[1];
    m = type.match(BTN_LOOSE);
    return m ? m[1] : null;
  }

  function findBtnKey(node) {
    var cur = node, hops = 0;
    while (cur && hops < STORE_LIMIT) {
      var key = keyFromType(cur.type);   // propiedad documentada: node.type
      if (key) return key;
      if (cur.parent) cur = cur.parent;  // propiedad documentada: node.parent
      else break;
      hops++;
    }
    return null;
  }

  // Vistas de intensidad (de ZONES_CONFIG en vr-compat.js:34-103) para el
  // respaldo del manejo de esferas del editor (ver wireEditorButtons).
  var INTENSITY_BASE_VIEWS = ['sala_de_descanso', 'sala de descanso', 'panel_cocina',
    'coworking_marketing', 'coworking_diseño', 'sala_de_juntas', 'sala de juntas',
    'oficina_contabilidad', 'circulacion_vertical', 'privado_1', 'privado_2', 'Intro'];
  var INTENSITY_SUFFIX_RE = /_(10|40|60|80|100)$/;

  function isIntensityViewType(type) {
    if (!type || typeof type !== 'string') return false;
    if (INTENSITY_SUFFIX_RE.test(type)) return true;
    return INTENSITY_BASE_VIEWS.indexOf(type) !== -1;
  }

  function wireEditorButtons() {
    if (typeof viewer.onNodeTypeClicked !== 'function') {
      warn('onNodeTypeClicked no disponible; usarás fallback de esferas VR');
      return;
    }
    // Registro ÚNICO con doble función (ver cabecera):
    //  (a) temperatura: type btn_2700..btn_6000 (o ancestros) -> applyTemp
    //  (b) respaldo de intensidades: type = nombre de vista -> switchToView(v,0)
    //      (replica el manejo de esferas del editor de vr-compat.js por si el
    //      viewer solo soporta un oyente de clicks; idempotente si hay varios).
    try {
      viewer.onNodeTypeClicked(function (node) {
        if (!node) return;
        var key = findBtnKey(node);
        if (key) { applyTemp(key); return true; } // click de temperatura: no toca intensidades
        var t = node.type;
        if (isIntensityViewType(t)) {
          try { viewer.switchToView(t, 0); } catch (e) { /* sin esa vista */ }
        }
      });
      log('oyente de clicks 3D registrado (temperatura btn_* + respaldo de vistas)');
    } catch (e) { warn('onNodeTypeClicked error:', e); }
  }

  // ==========================================================================
  // VÍA 2 — BOTONES DOM (desktop). Solo .temp-btn (onclick) y .reset-btn
  // (addEventListener aditivo). Sliders/track/thumb: NUNCA se tocan.
  // ==========================================================================
  function wireDomButtons() {
    if (domWired) return;
    domWired = true;

    var btns = document.querySelectorAll('.temp-btn');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        // Reemplaza onclick (overlay CSS anterior) por el sistema global.
        // Solo afecta a .temp-btn; los sliders quedan intactos.
        btn.onclick = function () {
          var t = btn.getAttribute('data-temp') || btn.dataset && btn.dataset.temp;
          if (t) applyTemp(t);
        };
      })(btns[i]);
    }
    log('botones DOM .temp-btn cableados:', btns.length);

    var resets = document.querySelectorAll('.reset-btn');
    for (var j = 0; j < resets.length; j++) {
      // ADITIVO: conserva el reset de materiales por zona del script principal.
      resets[j].addEventListener('click', function () { resetTemp(); });
    }
  }

  function updateDomActive(key) {
    var btns = document.querySelectorAll('.temp-btn');
    for (var i = 0; i < btns.length; i++) {
      var t = btns[i].getAttribute('data-temp') || (btns[i].dataset && btns[i].dataset.temp);
      if (t === key) btns[i].classList.add('active');
      else btns[i].classList.remove('active');
    }
  }

  // ==========================================================================
  // CAPA B — QUAD TRANSLÚCIDO ANCLADO A LA CABEZA (solo XR)
  // ==========================================================================
  function buildQuad() {
    if (quad || !getTHREE() || !xrScene) return;
    try {
      var geo = new T3.PlaneGeometry(QUAD_SIZE, QUAD_SIZE);
      var mat = new T3.MeshBasicMaterial({
        color: PRESETS['2700'].hexNum,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        side: T3.DoubleSide,
        toneMapped: false
      });
      quad = new T3.Mesh(geo, mat);
      quad.renderOrder = 999;
      quad.visible = false;
      xrScene.add(quad);
      log('quad de temperatura creado');
    } catch (e) { quad = null; warn('quad no creado:', e); }
  }

  function updateQuad(p) {
    if (!quad) return;
    try {
      quad.material.color.setHex(p.hexNum);
      quad.material.opacity = p.intensity > 0 ? p.intensity * QUAD_OPACITY_SCALE : 0;
      quad.visible = p.intensity > 0;
    } catch (e) { /* instancia THREE distinta: omitir capa B */ }
  }

  // ==========================================================================
  // VÍA 3 — FALLBACK: ESFERAS 3D DE TEMPERATURA (solo sesión XR)
  // ==========================================================================
  function makeTextSprite(text, cssColor, scale) {
    var T = getTHREE();
    var c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    var ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, 256, 128);
    ctx.font = 'bold 64px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = cssColor;
    ctx.fillText(text, 128, 64);
    var tex = new T.CanvasTexture(c);
    var mat = new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    var spr = new T.Sprite(mat);
    spr.renderOrder = 1000;
    spr.scale.set(scale * 2, scale, 1);
    return spr;
  }

  function placeGroupInFront() {
    if (!group || !xrScene || !getTHREE()) return;
    // Misma técnica que vr-compat.js: usa la posición world de la cámara
    // interna de la escena (si existe) para ubicar el grupo frente al usuario.
    var cam = null;
    try { xrScene.traverse(function (o) { if (!cam && o.isCamera) cam = o; }); } catch (e) {}
    var T = getTHREE();
    var pos, quat = null;
    if (cam && cam.getWorldPosition) {
      pos = cam.getWorldPosition(new T.Vector3());
      if (cam.getWorldQuaternion) quat = cam.getWorldQuaternion(new T.Quaternion());
    }
    if (!pos) return;
    var fwd = new T.Vector3(0, 0, -1);
    if (quat) fwd.applyQuaternion(quat); else if (cam && cam.getWorldDirection) fwd = cam.getWorldDirection(new T.Vector3());
    pos.add(fwd.multiplyScalar(1.4));
    pos.y -= 0.55; // SEGUNDA fila: por debajo del grupo de intensidades (-0.2)
    pos.x += sceneOffset.x; pos.y += sceneOffset.y; pos.z += sceneOffset.z;
    group.position.copy(pos);
    if (cam) group.lookAt(cam.getWorldPosition(new T.Vector3()));
  }

  function buildTempSpheres() {
    var T = getTHREE();
    if (!T || !xrScene) return;
    if (group) { group.visible = true; placeGroupInFront(); return; }

    group = new T.Group();
    spheres = [];
    var spacing = 0.22;
    var startX = -(ORDER.length - 1) * spacing / 2;

    for (var i = 0; i < ORDER.length; i++) {
      var key = ORDER[i];
      var p = PRESETS[key];
      var geo = new T.SphereGeometry(0.055, 24, 16);
      var mat = new T.MeshBasicMaterial({ color: p.hexNum, toneMapped: false });
      var mesh = new T.Mesh(geo, mat);
      mesh.position.set(startX + i * spacing, 0, 0);
      mesh.renderOrder = 998;
      group.add(mesh);
      spheres.push({ mesh: mesh, temp: key, baseScale: 1 });

      var lbl = makeTextSprite(p.label, p.css, 0.09);
      lbl.position.set(startX + i * spacing, 0.11, 0);
      group.add(lbl);
    }

    // Láser propio: SOLO se dibuja al apuntar una esfera de temperatura
    // (evita duplicar el láser permanente de vr-compat.js).
    var lgeo = new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(0, 0, -1)]);
    laser = new T.Line(lgeo, new T.LineBasicMaterial({ color: 0xFFCC5A, transparent: true, opacity: 0.9 }));
    laser.visible = false;
    laser.renderOrder = 999;
    xrScene.add(laser);

    xrScene.add(group);
    placeGroupInFront();
    vrReady = true;
    log('esferas de temperatura VR construidas:', spheres.length);
  }

  function hitTempSphere(origin, dir) {
    // Intersección rayo-esfera manual (sin Raycaster; evita doble THREE).
    var best = null, bestD = Infinity;
    for (var i = 0; i < spheres.length; i++) {
      var s = spheres[i].mesh;
      var ce = s.position; // coordenadas locales del grupo
      var cx = group.position.x + ce.x + sceneOffset.x;
      var cy = group.position.y + ce.y + sceneOffset.y;
      var cz = group.position.z + ce.z + sceneOffset.z;
      var ox = cx - origin.x, oy = cy - origin.y, oz = cz - origin.z;
      var tca = ox * dir.x + oy * dir.y + oz * dir.z;
      if (tca < 0) continue;
      var d2 = ox * ox + oy * oy + oz * oz - tca * tca;
      var r = 0.055 * (spheres[i].baseScale || 1);
      if (d2 > r * r) continue;
      var thc = Math.sqrt(r * r - d2);
      var dist = tca - thc;
      if (dist < 0) dist = tca + thc;
      if (dist < bestD) { bestD = dist; best = spheres[i]; }
    }
    return best ? { s: best, dist: bestD } : null;
  }

  function resetHover() {
    for (var i = 0; i < spheres.length; i++) {
      spheres[i].baseScale = 1;
      spheres[i].mesh.scale.set(1, 1, 1);
    }
  }

  function xrTick(time, frame) {
    if (!xrSession) return;
    try {
      var pose = frame && xrRefSpace ? frame.getViewerPose(xrRefSpace) : null;
      var head = null;
      if (pose && pose.views && pose.views.length) {
        var tr = pose.views[0].transform;
        head = {
          p: tr.position,
          q: tr.orientation
        };
        // Quad anclado a la cabeza (capa B)
        if (quad && quad.visible && getTHREE()) {
          var T = getTHREE();
          tmpV1 = tmpV1 || new T.Vector3();
          tmpQ1 = tmpQ1 || new T.Quaternion();
          tmpV1.set(head.p.x + sceneOffset.x, head.p.y + sceneOffset.y, head.p.z + sceneOffset.z);
          tmpQ1.set(head.q.x, head.q.y, head.q.z, head.q.w);
          quad.position.copy(tmpV1);
          quad.quaternion.copy(tmpQ1);
          var fwd = new T.Vector3(0, 0, -1).applyQuaternion(tmpQ1);
          quad.position.add(fwd.multiplyScalar(QUAD_DIST));
        }
        // Hover de esferas de temperatura con el mando
        var sources = xrSession.inputSources || [];
        var hovered = null;
        for (var i = 0; i < sources.length; i++) {
          var src = sources[i];
          if (!src || !src.targetRaySpace) continue;
          var rp = frame.getPose(src.targetRaySpace, xrRefSpace);
          if (!rp) continue;
          var o = rp.transform.position;
          var q = rp.transform.orientation;
          if (!getTHREE()) break;
          var T2 = getTHREE();
          var dir = new T2.Vector3(0, 0, -1).applyQuaternion(new T2.Quaternion(q.x, q.y, q.z, q.w));
          var origin = { x: o.x + sceneOffset.x, y: o.y + sceneOffset.y, z: o.z + sceneOffset.z };
          var hit = hitTempSphere(origin, dir);
          if (hit && (!hovered || hit.dist < hovered.dist)) {
            hovered = hit;
            if (laser) {
              laser.visible = true;
              laser.position.set(origin.x, origin.y, origin.z);
              laser.quaternion.copy(new T2.Quaternion(q.x, q.y, q.z, q.w));
              laser.scale.z = hit.dist;
            }
            break;
          }
        }
        if (!hovered && laser) laser.visible = false;
        resetHover();
        if (hovered) {
          hovered.s.baseScale = 1.35;
          hovered.s.mesh.scale.set(hovered.s.baseScale, hovered.s.baseScale, hovered.s.baseScale);
        }
      }
    } catch (e) { /* frame sin pose: omitir */ }
    xrSession.requestAnimationFrame(xrTick);
  }

  function vrFeedback() {
    if (!xrSession) return;
    try {
      var sources = xrSession.inputSources || [];
      for (var i = 0; i < sources.length; i++) {
        var gp = sources[i] && sources[i].gamepad;
        if (gp && gp.hapticActuators && gp.hapticActuators[0] && gp.hapticActuators[0].pulse) {
          gp.hapticActuators[0].pulse(0.5, 40);
        }
      }
    } catch (e) { /* haptics opcional */ }
  }

  // ==========================================================================
  // SESIÓN XR — oyentes PROPIOS (aditivos a los de vr-compat.js)
  // ==========================================================================
  function onSessionStart() {
    if (xrSession) return; // blindaje: evitar doble registro de oyentes/rAF
    vrReady = false;
    xrSession = null;
    if (!navigator.xr || typeof navigator.xr.getSession !== 'function') {
      log('navigator.xr.getSession no disponible; esperando evento con sesión');
      return;
    }
    xrSession = navigator.xr.getSession();
    if (!xrSession) { log('sesión XR aún no expuesta'); return; }
    xrSession.requestReferenceSpace('local').then(function (ref) {
      xrRefSpace = ref;
      log('refSpace XR lista');
    }).catch(function () {
      warn('local no disponible; intentando viewer');
      xrSession.requestReferenceSpace('viewer').then(function (ref) { xrRefSpace = ref; })
        .catch(function (e) { warn('sin refSpace:', e); });
    });

    xrSession.addEventListener('selectstart', onSelectStart);
    xrSession.requestAnimationFrame(xrTick);
    log('sesión XR detectada; reconstruyendo UI de temperatura');
  }

  function ensureScene() {
    if (xrScene) return true;
    if (!viewer) return false;
    xrScene = deepFind(viewer, null, 0);
    return !!xrScene;
  }

  function onSelectStart() {
    if (!xrSession || !xrRefSpace || !vrReady) return;
    try {
      var sources = xrSession.inputSources || [];
      for (var i = 0; i < sources.length; i++) {
        var src = sources[i];
        if (!src || !src.targetRaySpace) continue;
        var frame = null; // selectstart no trae frame; usar pose actual vía rAF
        // Raycast diferido al próximo frame (el pose se lee en xrTick)
        pendingSelect = { src: src };
        return;
      }
    } catch (e) { /* ignore */ }
  }

  var pendingSelect = null;

  // Si hay pendingSelect, resolver en el siguiente xrTick (necesita frame)
  var origXrTick = xrTick;
  xrTick = function (time, frame) {
    if (pendingSelect && frame && xrRefSpace) {
      var src = pendingSelect.src;
      pendingSelect = null;
      try {
        var rp = frame.getPose(src.targetRaySpace, xrRefSpace);
        if (rp) {
          var o = rp.transform.position, q = rp.transform.orientation;
          var T = getTHREE();
          if (T) {
            var dir = new T.Vector3(0, 0, -1).applyQuaternion(new T.Quaternion(q.x, q.y, q.z, q.w));
            var origin = { x: o.x + sceneOffset.x, y: o.y + sceneOffset.y, z: o.z + sceneOffset.z };
            var hit = hitTempSphere(origin, dir);
            if (hit) { applyTemp(hit.s.temp); }
          }
        }
      } catch (e) { /* ignore */ }
    }
    origXrTick(time, frame);
  };

  function onSessionEnd() {
    log('sesión XR terminada');
    if (group) group.visible = false;
    if (laser) laser.visible = false;
    if (quad) quad.visible = false;
    xrSession = null;
    xrRefSpace = null;
    vrReady = false;
  }

  function watchXR() {
    if (!navigator.xr || !navigator.xr.addEventListener) { log('WebXR no disponible (desktop)'); return; }
    navigator.xr.addEventListener('sessionstart', function () {
      // La sesión aún no siempre está expuesta al disparar el evento; reintento corto.
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        if (navigator.xr.getSession && navigator.xr.getSession()) { clearInterval(iv); onSessionStart(); }
        else if (tries > 20) { clearInterval(iv); warn('sesión XR no expuesta tras 2s'); }
      }, 100);
    });
    navigator.xr.addEventListener('sessionend', onSessionEnd);
    log('oyentes XR registrados (sessionstart/sessionend)');
  }

  // ==========================================================================
  // INIT
  // ==========================================================================
  function init() {
    if (typeof window.WALK === 'undefined' || typeof window.WALK.getViewer !== 'function') {
      setTimeout(init, 300);
      return;
    }
    viewer = window.WALK.getViewer();
    if (!viewer) { setTimeout(init, 300); return; }
    log('viewer obtenido');

    // Idempotente: el script principal ya lo llama; llamarlo 2x no rompe nada.
    try { viewer.setAllMaterialsEditable(); } catch (e) { warn('setAllMaterialsEditable:', e); }

    try {
      viewer.onSceneReadyToDisplay(function () {
        storeOriginals();
        ensureScene();
        wireDomButtons();
        wireEditorButtons();
      });
    } catch (e) { warn('onSceneReadyToDisplay:', e); }

    // Fallback si onSceneReadyToDisplay no dispara (escena ya cargada)
    setTimeout(function () {
      if (!originalsSaved) {
        log('fallback: guardando originales por timeout');
        storeOriginals();
        ensureScene();
        wireDomButtons();
        wireEditorButtons();
      }
    }, 8000);

    watchXR();
  }

  // ==========================================================================
  // API PÚBLICA (debug en desktop y chrome://inspect en Quest)
  // ==========================================================================
  window.VRTEMP = {
    apply: applyTemp,
    reset: resetTemp,
    state: function () {
      return {
        viewer: !!viewer,
        scene: !!xrScene,
        session: !!xrSession,
        vrReady: vrReady,
        active: activeTemp,
        pending: pendingTemp,
        materials: Object.keys(originals).length,
        quad: !!quad,
        spheres: spheres.length,
        offset: sceneOffset
      };
    },
    presets: PRESETS,
    sceneOffset: sceneOffset,
    rebuild: function () { if (ensureScene()) buildTempSpheres(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
