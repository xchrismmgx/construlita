/**
 * ============================================================================
 *  VR-COMPAT para Shapespark — WebXR (Meta Quest 2/3/Pro) — v19 VR-only
 * ============================================================================
 *  En VR genera ESFERAS 3D propias (no dependen de extensiones del editor)
 *  que CAMBIAN DE VISTA/INTENSIDAD al clicar:
 *    - Una esfera por cada intensidad de la ZONA ACTIVA (10%,40%,60%,80%,100%)
 *      -> viewer.switchToView(nombreDeVista, 0)  (0 = instantáneo).
 *  También cablea las ESFERAS CREADAS EN EL EDITOR (Camino A): type/name del
 *  nodo = nombre de vista (con normalizeId para tolerar sufijos de C4D).
 *  La temperatura la gestiona vr-temp.js (botones 3D btn_* + dispatcher).
 *
 *  v10 (VR-only + diagnóstico):
 *   - Interruptor ?vrcompat=off (prueba A/B: desactiva todo el módulo).
 *   - Panel de log EN PANTALLA con ?diag=1 (DOM flotante, visible en la
 *     pantalla de inicio/carga del Quest, donde no hay consola).
 *   - Expone VRCOMPAT.diag(txt) para que vr-temp.js muestre sus logs ahí.
 *
 *  API verificada: WALK.getViewer(), viewer.switchToView(name,0),
 *  viewer.onSceneReadyToDisplay(), viewer.onViewSwitchDone(),
 *  viewer.getCameraPosition() (position-lock).
 *
 *  Integración (body-end.html VR-only, DESPUÉS de three.min.js): el body-end
 *  carga este script con versión dinámica?v=NN de la URL de la escena.
 * ============================================================================
 */
(function () {
  'use strict';

  // INTERRUPTOR DE DIAGNÓSTICO: ?vrcompat=off desactiva TODO el módulo.
  if (/[?&]vrcompat=off/.test(window.location.search)) {
    console.log('[VR-COMPAT] DESACTIVADO por ?vrcompat=off (diagnóstico A/B)');
    return;
  }

  var TAG = '[VR-COMPAT]';
  // v22: tolera BOTH '?diag' y '?diag=1' (el usuario escribe '?diag' a secas).
  var DIAG_MODE = /[?&]diag(?:=1)?(?:&|$)/.test(window.location.search);

  // ---------- Panel de diagnóstico en pantalla (Quest sin consola) ----------
  var diagEl = null;
  var diagBuf = [];

  function diagPush(txt) {
    if (!DIAG_MODE) return;
    diagBuf.push(String(txt));
    if (diagBuf.length > 60) diagBuf.shift();
    if (!diagEl) {
      // Crea el panel la primera vez que hay cuerpo disponible.
      if (!document.body) return;
      diagEl = document.createElement('div');
      diagEl.style.cssText = 'position:fixed;top:6px;left:6px;max-width:70vw;' +
        'max-height:40vh;overflow:auto;background:rgba(15,17,22,0.92);color:#9fe8a0;' +
        'font:11px/1.45 monospace;padding:8px 10px;border:1px solid #3a7d3a;' +
        'border-radius:6px;z-index:2147483647;pointer-events:none;white-space:pre-wrap;';
      document.body.appendChild(diagEl);
    }
    diagEl.textContent = diagBuf.join('\n');
  }

  if (DIAG_MODE && !document.body) {
    document.addEventListener('DOMContentLoaded', function () { diagPush('panel diag listo'); });
  }

  function log() {
    var args = Array.prototype.slice.call(arguments);
    console.log.apply(console, [TAG].concat(args));
    diagPush(args.join(' '));
  }
  function warn() {
    var args = Array.prototype.slice.call(arguments);
    console.warn.apply(console, [TAG].concat(args));
    diagPush('⚠ ' + args.join(' '));
  }

  // Sello de versión: PRIMERA línea de log (verifica caché al instante).
  log('versión 22 (v22) — escena vía viewer._scene + _renderer + diag tolerante');

  // ==========================================================================
  // v19: CAPTURA FIABLE DE LA SESIÓN XR.
  // Root cause v17: detectábamos la sesión con navigator.xr.getSession()
  // (API NO estándar; en el navegador del Quest devuelve null) => la capa de
  // entrada XR nunca se conectaba y ningún botón/mando funcionaba dentro del
  // casco. Solución: envolver navigator.xr.requestSession (API estándar, que
  // el viewer llama SIEMPRE al entrar a VR) y capturar la sesión real.
  // ==========================================================================
  var capturedSession = null; // sesión XR capturada vía requestSession

  function installSessionCapture() {
    if (!navigator.xr || !navigator.xr.requestSession) return;
    // Flag compartido: solo un script envuelve requestSession (evita doble wrap).
    if (navigator.xr.__vrtempCaptured) return;
    navigator.xr.__vrtempCaptured = true;
    var orig = navigator.xr.requestSession.bind(navigator.xr);
    navigator.xr.requestSession = function (mode, options) {
      var p = orig(mode, options);
      Promise.resolve(p).then(function (sess) {
        capturedSession = sess;
        log('requestSession interceptada OK -> sesión capturada');
        handleSession(sess); // conecta la capa XR con la sesión real
      }).catch(function (e) {
        warn('requestSession rechazada:', e && e.message ? e.message : e);
      });
      return p; // no alteramos la promesa que espera el viewer
    };
    log('requestSession interceptada (captura de sesión instalada)');
  }

  installSessionCapture();

  // ==========================================================================
  // v20: CAPTURA DE MATERIALES SIN getEditableMaterials.
  // Motivación (tus logs v19): en el build publicado getEditableMaterials()
  // devuelve SIEMPRE 0 — el filtro shader de vr-temp.js se quedaba con
  // 'shader: 0 mat' y nada se veía dentro del casco. Estrategia v20:
  //   1) Envolvemos THREE.WebGLRenderer.prototype.render (caso A: el viewer
  //      usa el THREE global de la página — el mismo que carga cdnjs) y
  //      viewer.renderer.render (caso B: el viewer expone su renderer, aunque
  //      sea de un THREE interno).
  //   2) El primer render() recibe (escena, cámara): la escena REAL, que no
  //      dependía de ninguna API editable.
  //   3) Recorremos la escena y recolectamos TODOS los materiales
  //      (isMaterial === true), cross-instancia (uuid).
  //   4) vr-temp.js los consume vía VRCOMPAT.getSceneMaterials().
  // Si el viewer usa un THREE propio sin exponer renderer, el log
  // 'SIN captura por render' lo indica y entra el rescate por grafo del nodo
  // (rescueSceneFromNode, en el dispatcher de clics) + las sondas.
  // ==========================================================================
  var capturedScene = null;
  var capturedMaterials = [];
  var captureCallbacks = [];
  var CAPTURE_RESYNC_EVERY = 240; // re-escaneo de materiales cada N renders
  var CAPTURE_FRAMES = 0;
  var CAPTURE_PROBE_DONE = false;
  var CAPTURE_GLOBAL_WRAPPED = false; // hook global instalado alguna vez (evita falso negativo en retries)

  function collectMaterials(scene) {
    var list = [];
    var seen = {};
    try {
      scene.traverse(function (o) {
        if (!o) return;
        var ms = Array.isArray(o.material) ? o.material
                 : (o.material ? [o.material] : []);
        for (var i = 0; i < ms.length; i++) {
          var m = ms[i];
          if (!m || typeof m !== 'object' || m.isMaterial !== true) continue;
          var id = m.uuid ? m.uuid : (m.id !== undefined ? 'id:' + m.id : null);
          if (id != null && seen[id]) continue;
          if (id != null) seen[id] = true;
          list.push(m);
        }
      });
    } catch (e) { /* escena de otro THREE */ }
    return list;
  }

  function notifyCaptured() {
    for (var i = 0; i < captureCallbacks.length; i++) {
      try { captureCallbacks[i](capturedScene, capturedMaterials); } catch (e) {}
    }
  }

  function captureSceneFromRender(scene, label) {
    if (capturedScene === scene || !scene) return;
    capturedScene = scene;
    capturedMaterials = collectMaterials(scene);
    log('ESCENA CAPTURADA (' + (label || 'vía render()') + ') — materiales recolectados:', capturedMaterials.length);
    notifyCaptured();
  }

  function installRenderHook(fn, owner, label) {
    if (typeof fn !== 'function' || !owner || owner.__vrtempWrapped) return false;
    owner.__vrtempWrapped = true;
    var orig = fn;
    owner.render = function (scene, camera) {
      try {
        if (scene && typeof scene.traverse === 'function') {
          if (!capturedScene) {
            captureSceneFromRender(scene);
          } else {
            CAPTURE_FRAMES++;
            if (CAPTURE_FRAMES >= CAPTURE_RESYNC_EVERY) {
              CAPTURE_FRAMES = 0;
              var fresh = collectMaterials(scene);
              if (fresh.length !== capturedMaterials.length) {
                capturedMaterials = fresh;
                log('rescan render — materiales ahora:', capturedMaterials.length);
                notifyCaptured();
              }
            }
          }
        }
      } catch (e) { /* nunca romper el render */ }
      return orig.apply(this, arguments);
    };
    log('hook de render instalado:', label);
    return true;
  }

  function installRenderHooks() {
    var any = false;
    try {
      var T = window.THREE;
      if (T && T.WebGLRenderer && T.WebGLRenderer.prototype &&
          typeof T.WebGLRenderer.prototype.render === 'function') {
        if (installRenderHook(T.WebGLRenderer.prototype.render, T.WebGLRenderer.prototype,
            'THREE.WebGLRenderer.prototype.render (three r' + (T.REVISION || '?') + ')')) {
          any = true;
          CAPTURE_GLOBAL_WRAPPED = true;
        }
      }
    } catch (e) {}
    try {
      // v22: tus logs revelaron que el viewer expone SU renderer como
      // `_renderer` (con guion bajo) — el caso B anterior solo miraba
      // `viewer.renderer` y por eso nunca capturaba.
      var rend = (viewer && (viewer.renderer || viewer._renderer)) || null;
      if (rend && typeof rend.render === 'function') {
        if (installRenderHook(rend.render, rend, 'viewer._renderer.render')) any = true;
      }
    } catch (e) {}
    // Solo log real negativo si el hook global NUNCA se instaló (el retry
    // de la sonda no debe reportar falso negativo cuando ya está cubierto).
    if (!any && !CAPTURE_GLOBAL_WRAPPED && !CAPTURE_PROBE_DONE) {
      CAPTURE_PROBE_DONE = true;
      log('SIN captura por render aún: ni THREE global ni viewer.renderer (¿THREE interno sin exponer?)');
    }
  }

  // v20: rescate por GRAFO DEL NODO — si el nodo clicado arrastra la escena
  // (node.scene, node.object3D.scene, node.mesh.scene o un ancestro con
  // traverse()), se captura igual que por render. Se llama desde el
  // dispatcher de clics. TODO acceso blindado (getters hostiles).
  function rescueSceneFromNode(node) {
    if (capturedScene || !node) return;
    var cands = [];
    try { cands.push(node.scene); } catch (e) {}
    try { cands.push(node.object3D && node.object3D.scene); } catch (e) {}
    try { cands.push(node.mesh && node.mesh.scene); } catch (e) {}
    for (var i = 0; i < cands.length; i++) {
      var s = cands[i];
      if (s && s !== node && typeof s.traverse === 'function') {
        captureSceneFromRender(s);
        return;
      }
    }
    var cur = null;
    try { cur = node.parent || null; } catch (e) { return; }
    var hops = 0;
    while (cur && hops < 12 && !capturedScene) {
      if (cur !== node && typeof cur.traverse === 'function') {
        captureSceneFromRender(cur);
        return;
      }
      var next = null;
      try { next = cur.parent || null; } catch (e) { next = null; }
      cur = next;
      hops++;
    }
  }

  installRenderHooks(); // caso A (THREE global) lo antes posible; caso B al obtener el viewer

  // ==========================================================================
  // v20: HOOK DEL PROTOTIPO Material.onBeforeCompile.
  // Si el viewer usa el THREE global, TODA asignación de onBeforeCompile en
  // CUALQUIER material (incluido su LUT nativo, si lo implementa vía shader)
  // pasa por este accessor. Además, como el constructor de Material asigna
  // `onBeforeCompile = null` al crear cada instancia, esa asignación también
  // cae en el setter y se convierte en nuestra envoltura: al compilar, three
  // encuentra la propiedad truthy y ejecuta la envoltura, que deriva a
  // window.__VRTEMP_INJECT__ (definido por vr-temp.js) — el filtro se inyecta
  // en CADA material que compile, SIN depender de listas de materiales.
  // Idempotente: la inyección revisa `if (!shader.uniforms.uVRTEMP_FilterColor)`.
  // ==========================================================================
  function installMaterialProtoHook() {
    var T = window.THREE;
    if (!T || !T.Material || !T.Material.prototype) return;
    var proto = T.Material.prototype;
    if (proto.__vrtempMaterialHooked) return;
    proto.__vrtempMaterialHooked = true;
    try {
      Object.defineProperty(proto, 'onBeforeCompile', {
        configurable: true,
        get: function () { return this.__vrtempStored || null; },
        set: function (fn) {
          var self = this;
          var prev = (typeof fn === 'function') ? fn : null;
          this.__vrtempStored = function (shader, renderer) {
            if (typeof prev === 'function') {
              try { prev.call(self, shader, renderer); } catch (e) {}
            }
            if (window.__VRTEMP_INJECT__) {
              try { window.__VRTEMP_INJECT__(self, shader, renderer); } catch (e) {}
            }
          };
        }
      });
      log('hook prototipo Material.onBeforeCompile instalado (three r' + (T.REVISION || '?') + ')');
    } catch (e) {
      warn('hook prototipo Material no instalado:', e && e.message ? e.message : e);
    }
  }

  installMaterialProtoHook();

  if (DIAG_MODE) {
    window.addEventListener('error', function (e) {
      diagPush('ERROR: ' + (e.message || e.type) + (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : ''));
    });
    window.addEventListener('unhandledrejection', function (e) {
      var r = e && e.reason;
      diagPush('PROMESA: ' + (r && r.message ? r.message : r));
    });
  }

  // ==========================================================================
  // CONFIGURACIÓN (duplicada de script.js; mantener sincronizada).
  // ==========================================================================
  var ZONES_CONFIG = [
    { panelHtmlId: "container-sala", title: "Sala de Descanso",
      triggerViews: ["sala_de_descanso", "sala de descanso", "sala_10", "sala_40", "sala_60", "sala_80", "sala_100"],
      sliderViews: ["sala_10", "sala_40", "sala_60", "sala_80", "sala_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"] },
    { panelHtmlId: "container-cocina", title: "Cocina",
      triggerViews: ["panel_cocina", "cocina_diez", "cocina_cuarenta", "cocina_sesenta", "cocina_ochenta", "cocina_cien"],
      sliderViews: ["cocina_diez", "cocina_cuarenta", "cocina_sesenta", "cocina_ochenta", "cocina_cien"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"] },
    { panelHtmlId: "container-cuarto", title: "Cuarto",
      triggerViews: ["panel_cuarto", "cuarto_10", "cuarto_40", "cuarto_80"],
      sliderViews: ["cuarto_10", "cuarto_40", "cuarto_80"],
      viewLabels: ["10%", "40%", "80%"] },
    { panelHtmlId: "container-decorativas", title: "Coworking Marketing",
      triggerViews: ["coworking_marketing", "deco_10", "deco_40", "deco_60", "deco_80", "deco_100"],
      sliderViews: ["deco_10", "deco_40", "deco_60", "deco_80", "deco_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"] },
    { panelHtmlId: "container-trabajo", title: "Coworking Diseño",
      triggerViews: ["coworking_diseño", "trab_10", "trab_40", "trab_60", "trab_80", "trab_100"],
      sliderViews: ["trab_10", "trab_40", "trab_60", "trab_80", "trab_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"] },
    { panelHtmlId: "container-ambiental", title: "Sala de Juntas",
      triggerViews: ["sala_de_juntas", "sala de juntas", "amb_10", "amb_40", "amb_60", "amb_80", "amb_100"],
      sliderViews: ["amb_10", "amb_40", "amb_60", "amb_80", "amb_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"] },
    { panelHtmlId: "container-lineal", title: "Oficina Contabilidad",
      triggerViews: ["oficina_contabilidad", "lineal_10", "lineal_40", "lineal_60", "lineal_80", "lineal_100"],
      sliderViews: ["lineal_10", "lineal_40", "lineal_60", "lineal_80", "lineal_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"] },
    { panelHtmlId: "container-texturas", title: "Privado 2",
      triggerViews: ["privado_2", "text_10", "text_40", "text_60", "text_80", "text_100"],
      sliderViews: ["text_10", "text_40", "text_60", "text_80", "text_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"] },
    { panelHtmlId: "container-grazer", title: "Circulación Vertical",
      triggerViews: ["circulacion_vertical", "graz_10", "graz_40", "graz_60", "graz_80", "graz_100"],
      sliderViews: ["graz_10", "graz_40", "graz_60", "graz_80", "graz_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"] },
    { panelHtmlId: "container-integracion", title: "Privado 1",
      triggerViews: ["privado_1", "int_10", "int_40", "int_60", "int_80", "int_100"],
      sliderViews: ["int_10", "int_40", "int_60", "int_80", "int_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"] },
    { panelHtmlId: "container-acento", title: "Sala de Espera",
      triggerViews: ["sala_espera", "ace_10", "ace_40", "ace_60", "ace_80", "ace_100"],
      sliderViews: ["ace_10", "ace_40", "ace_60", "ace_80", "ace_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"] },
    { panelHtmlId: "container-decorativas-general", title: "Coworking Administrativo",
      triggerViews: ["coworking_administrativo", "deco_g_10", "deco_g_40", "deco_g_60", "deco_g_80", "deco_g_100"],
      sliderViews: ["deco_g_10", "deco_g_40", "deco_g_60", "deco_g_80", "deco_g_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"] },
    { panelHtmlId: "container-resaltar-objetos", title: "Acentos Verticales",
      triggerViews: ["acentos_verticales", "res_10", "res_40", "res_60", "res_80", "res_100"],
      sliderViews: ["res_10", "res_40", "res_60", "res_80", "res_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"] }
  ];

  // Nombres de vistas de intensidad conocidos (deriva de ZONES_CONFIG).
  var INTENSITY_VIEWS = (function () {
    var s = {};
    ZONES_CONFIG.forEach(function (z) {
      z.sliderViews.forEach(function (v) { s[v] = true; });
    });
    return s;
  })();

  // Color de las esferas (gradiente tenue por intensidad).
  var SPHERE_COLORS = ['#5ea8ff', '#7ec0ff', '#a9d6ff', '#ffd97a', '#ffb04a'];
  var SPHERE_CFG = {
    distance: 1.4, heightOffset: -0.2, radius: 0.06, spacing: 0.22
  };

  // ==========================================================================
  // ESTADO
  // ==========================================================================
  var viewer = null;
  var xrScene = null;
  var xrSession = null;
  var refSpace = null;
  var activeZone = null;
  var vr = { ready: false, group: null, spheres: [], labels: [], laser: null, laserGeo: null, hover: null, basePos: null };
  var labels = {};

  // ==========================================================================
  // DETECCIÓN DE ESCENA INTERNA (feature detection)
  // v14: 1) candidatos por nombre, 2) DFS filtrado (typed arrays/funciones/DOM
  // descartados — eran los que agotaban el tope), profundidad 10.
  // ==========================================================================
  var SKIP_KEYS = { canvas: 1, domElement: 1, gl: 1, parent: 1, parentNode: 1,
                    parentElement: 1, children: 1, document: 1, window: 1 };
  var FIND_VISITS = 0;
  var FIND_LIMIT = 200000;

  function isFindable(v) {
    if (!v || typeof v !== 'object') return false;
    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(v)) return false; // typed arrays
    if (v.nodeType) return false; // DOM
    return true;
  }

  function deepFind(root, predicate, visited, depth) {
    if (depth > 10 || FIND_VISITS > FIND_LIMIT) return null;
    FIND_VISITS++;
    if (!isFindable(root) || visited.has(root)) return null;
    visited.add(root);
    try { if (predicate(root)) return root; } catch (e) {}
    var keys;
    try { keys = Object.getOwnPropertyNames(root); } catch (e) { return null; }
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (SKIP_KEYS[k]) continue;
      var v;
      try { v = root[k]; } catch (e) { continue; }
      if (isFindable(v)) {
        var f = deepFind(v, predicate, visited, depth + 1);
        if (f) return f;
      }
    }
    return null;
  }

  function probeEngine() {
    if (!viewer) return false;
    // v14 Paso 1: candidatos directos por nombre (casi gratis).
    var CAND = ['scene', 'threeScene', 'xrScene', 'renderer', 'camera'];
    for (var i = 0; i < CAND.length && !xrScene; i++) {
      try {
        var c = viewer[CAND[i]];
        if (c) {
          if (c.isScene === true || c.isScene === 1) xrScene = c;
          else if (c.scene && (c.scene.isScene === true || c.scene.isScene === 1)) xrScene = c.scene;
          else {
            FIND_VISITS = 0;
            xrScene = deepFind(c, function (o) { return o.isScene === true || o.isScene === 1; }, new Set(), 0);
          }
        }
      } catch (e) { /* candidato inexistente */ }
    }
    // v14 Paso 2: recorrido completo filtrado.
    if (!xrScene) {
      FIND_VISITS = 0;
      try { xrScene = deepFind(viewer, function (o) { return o.isScene === true || o.isScene === 1; }, new Set(), 0); }
      catch (e) { xrScene = null; }
    }
    if (xrScene) { log('Escena interna detectada OK'); return true; }
    log('escena interna no accesible (no crítico): esferas VR autogeneradas no se construirán');
    return false;
  }

  function getTHREE() { return window.THREE || null; }

  // ==========================================================================
  // v20: SONDA DE INTERNALS (descubre API no documentada del build publicado).
  // Genera logs ?diag=1 con las keys propias del viewer, su cadena de
  // prototipos y propiedades candidatas (scene/renderer/camera/...). Con eso
  // sabremos si hay un camino directo a la escena (p.ej. viewer.scene) o al
  // renderer (viewer.renderer.render) sin depender de conjeturas.
  // ==========================================================================
  var PROBED_VIEWER = false;

  function probeViewerInternals() {
    if (PROBED_VIEWER || !viewer) return;
    PROBED_VIEWER = true;
    try {
      var keys = Object.keys(viewer);
      log('sonda viewer — keys propias (' + keys.length + '):', keys.slice(0, 30).join(', ') || '(ninguna)');
    } catch (e) {}
    try {
      var chain = [], o = viewer, d = 0;
      while (o && d < 6) {
        o = Object.getPrototypeOf(o);
        if (!o) break;
        chain.push(o.constructor ? o.constructor.name : '?');
        d++;
      }
      log('sonda viewer — proto:', chain.join(' <- ') || '(sin proto)');
    } catch (e) {}
    ['scene', '_scene', 'renderer', '_renderer', 'camera', '_camera', '_vrManager', '_controls', 'xr', 'materials', 'nodes', 'root', 'container', 'three', 'webgl'].forEach(function (k) {
      var v = null;
      try { v = viewer[k]; } catch (e) {}
      if (v != null) {
        var info = typeof v;
        if (v.isScene) info += ' [isScene]';
        if (typeof v.render === 'function') info += ' [render()]';
        if (typeof v.traverse === 'function') info += ' [traverse()]';
        log('sonda viewer.' + k + ':', info);
      }
    });
    try {
      log('sonda API — getEditableMaterials:', typeof viewer.getEditableMaterials,
          '| setAllMaterialsEditable:', typeof viewer.setAllMaterialsEditable,
          '| findMaterial:', typeof viewer.findMaterial,
          '| getScene:', typeof viewer.getScene);
    } catch (e) {}
    installRenderHooks(); // caso B necesita el viewer

    // v22: CAPTURA DIRECTA vía las propiedades privadas del viewer que
    // reveló tu sonda v21 (viewer._scene / viewer._renderer existen).
    // Mucho más fiable que esperar al hook del render.
    try {
      if (!capturedScene && viewer._scene && typeof viewer._scene.traverse === 'function') {
        captureSceneFromRender(viewer._scene, 'viewer._scene');
      }
    } catch (e) { /* _scene con getter hostil */ }
  }

  // ==========================================================================
  // CLICK SHARED (Dispatcher único).
  // Problema resuelto: vr-temp.js también necesita clics 3D (btn_2700..6000)
  // y ANTES registraba su propio onNodeTypeClicked → doble disparo por clic y
  // riesgo de que el viewer reemplace el listener. Ahora hay UN SOLO
  // onNodeTypeClicked (éste), que resuelve esferas de intensidad Y reparte los
  // clics a handlers externos registrados con VRCOMPAT.onNodeClick().
  // ==========================================================================
  var clickHandlers = [];

  // Registra un handler externo de clics 3D (p.ej. el de temperatura de
  // vr-temp.js). Si el handler devuelve true se considera click consumido.
  function registerNodeClick(cb) {
    if (typeof cb === 'function') clickHandlers.push(cb);
  }

  // Normaliza ids de nodos que llegan alterados del modelo 3D (C4D añade
  // sufijos en duplicados): 'deco_g_80_' -> 'deco_g_80', 'deco_g_10_0' ->
  // 'deco_g_10', 'Mesh (1)' -> 'Mesh'. Conserva los nombres 'sala_10' etc.
  function normalizeId(id) {
    if (!id) return null;
    var s = String(id).trim();
    s = s.replace(/\s*\(\d+\)\s*$/, ''); // sufijo numerado de duplicado
    s = s.replace(/_0$/, '');             // sufijo '_0' de copia C4D
    s = s.replace(/_$/, '');              // guión bajo colgante
    return s || null;
  }

  // Encuentra la vista de intensidad del nodo (propio + ancestros, normalizados).
  function findIntensityView(node) {
    var cur = node, found = null;
    for (var depth = 0; cur && depth < 8; depth++) {
      var id = normalizeId(cur.type) || normalizeId(cur.name) || null;
      if (id && INTENSITY_VIEWS[id]) { found = id; break; }
      cur = cur.parent || null;
    }
    return found;
  }

  var INTENSITY_MATCHES = 0; // contador de matches (debug)
  var CLICK_PROBES = 0;      // v20: sonda de nodo (máx. 5 clics)

  // ==========================================================================
  // ESFERAS CREADAS EN EL EDITOR (Camino A).
  // Cada esfera que TÚ creas en Shapespark debe tener el TYPE (tipo de nodo)
  // igual al nombre de su vista destino, p.ej. 'sala_60'. Al clicar, el viewer
  // dispara onNodeTypeClicked (único) y hacemos switchToView(type, 0).
  // Nota B06: .type es la propiedad documentada; .name no está en el README.
  // ==========================================================================
  function wireEditorSpheres() {
    if (!viewer || !viewer.onNodeTypeClicked) {
      warn('onNodeTypeClicked no disponible; esferas del editor no cableadas.');
      return;
    }
    viewer.onNodeTypeClicked(function (node, point, distance) {
      if (!node) return;

      // DIAGNÓSTICO: cadena completa type/name del nodo y sus ancestros
      // (para saber exactamente qué se clicó y por qué coincide o no).
      var chainTypes = [], chainNames = [], chainNorm = [], cur = node;
      for (var cDepth = 0; cur && cDepth < 8; cDepth++) {
        chainTypes.push(cur.type || '∅');
        chainNames.push(cur.name || '∅');
        chainNorm.push(normalizeId(cur.type) || normalizeId(cur.name) || '∅');
        cur = cur.parent || null;
      }
      log('click 3D -> types:', chainTypes.join(' | '), '| names:', chainNames.join(' | '));
      log('click 3D -> normalizado:', chainNorm.join(' | '));

      // v20: sonda del nodo (máx. 5 clics) — estructura interna del objeto
      // clicado: dónde están material/mesh/scene (para el rescate si ni
      // getEditableMaterials ni el hook de render dieron materiales).
      if (CLICK_PROBES < 5) {
        CLICK_PROBES++;
        try {
          var nk = Object.keys(node);
          log('sonda nodo — keys (' + nk.length + '):', nk.slice(0, 30).join(', ') || '(ninguna)',
              '| ctor:', (node.constructor && node.constructor.name) || '?');
        } catch (e) {}
        ['material', 'mesh', 'object3D', 'object3d', 'threeObject', 'scene', 'geometry', 'userData', 'node'].forEach(function (k) {
          var v = null;
          try { v = node[k]; } catch (e) {}
          if (v != null) {
            var info = typeof v;
            if (v.isMaterial) info += ' [isMaterial]';
            if (v.isMesh) info += ' [isMesh]';
            if (v.isScene) info += ' [isScene]';
            if (typeof v.traverse === 'function') info += ' [traverse()]';
            log('sonda nodo.' + k + ':', info);
          }
        });
      }
      rescueSceneFromNode(node);

      // 1) Esferas de intensidad (este módulo)
      var found = findIntensityView(node);
      if (found) {
        INTENSITY_MATCHES++;
        log('Esfera de intensidad MATCH -> vista:', found, '(total matches:', INTENSITY_MATCHES + ')');
        try {
          viewer.switchToView(found, 0);
          log('switchToView OK:', found);
        } catch (e) {
          warn('switchToView FALLÓ para:', found, '-', e && e.message ? e.message : e);
        }
        lockView(found); // mitigación click-to-move (desktop)
      } else {
        log('click 3D -> sin match de intensidad (ningún type/name está en INTENSITY_VIEWS)');
      }

      // 2) Handlers externos (vr-temp: botones de temperatura btn_*)
      for (var i = 0; i < clickHandlers.length; i++) {
        try { clickHandlers[i](node, point, distance); }
        catch (e) { warn('handler externo de clic FALLÓ (índice ' + i + '):', e && e.message ? e.message : e); }
      }
    });
    log('Dispatcher de clics 3D cableado (intensidades + handlers externos). Handlers:', clickHandlers.length);
  }

  // ==========================================================================
  // CONSTRUCCIÓN DE ESFERAS 3D (menú VR de intensidades -> switchToView)
  // ==========================================================================
  function disposeGroup() {
    if (!vr.group) return;
    vr.group.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
    xrScene.remove(vr.group);
    vr.group = null; vr.spheres = []; vr.labels = []; vr.hover = null;
  }

  function makeTextSprite(text, hex) {
    var T3 = getTHREE();
    var c = document.createElement('canvas'); c.width = 256; c.height = 128;
    var g = c.getContext('2d');
    g.fillStyle = 'rgba(20,22,28,0.85)';
    var r = 24, w = c.width - 16, h = c.height - 16, x = 8, y = 8;
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 4; g.stroke();
    g.fillStyle = hex || '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 52px Segoe UI, Arial';
    g.fillText(text, c.width / 2, c.height / 2);
    var tex = new T3.CanvasTexture(c);
    var spr = new T3.Sprite(new T3.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    spr.scale.set(0.2, 0.1, 1);
    return spr;
  }

  function buildVRSpheres() {
    var T3 = getTHREE();
    if (!T3) { warn('window.THREE no disponible.'); return false; }
    disposeGroup();
    vr.group = new T3.Group();

    var views = activeZone ? activeZone.sliderViews : [];
    var labs = activeZone ? activeZone.viewLabels : [];
    var n = views.length;
    if (n === 0) {
      warn('Zona sin vistas de intensidad; no se crean esferas. activeZone=',
           activeZone ? activeZone.title : 'null');
      return false;
    }
    log('buildVRSpheres -> zona:', activeZone && activeZone.title, '| vistas:', views.join(', '));

    var totalW = (n - 1) * SPHERE_CFG.spacing;
    var startX = -totalW / 2;

    for (var i = 0; i < n; i++) {
      var x = startX + i * SPHERE_CFG.spacing;
      var color = SPHERE_COLORS[i % SPHERE_COLORS.length];
      var geo = new T3.SphereGeometry(SPHERE_CFG.radius, 24, 16);
      var mat = new T3.MeshBasicMaterial({ color: new T3.Color(color) });
      var mesh = new T3.Mesh(geo, mat);
      mesh.position.set(x, 0, 0);
      vr.group.add(mesh);
      vr.spheres.push({ mesh: mesh, view: views[i] });

      var lab = makeTextSprite(labs[i], color);
      lab.position.set(x, SPHERE_CFG.radius + 0.09, 0);
      vr.group.add(lab);
      vr.labels.push(lab);
    }

    vr.laserGeo = new T3.BufferGeometry();
    vr.laserGeo.setAttribute('position', new T3.BufferAttribute(new Float32Array(6), 3));
    vr.laser = new T3.Line(vr.laserGeo,
      new T3.LineBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.9 }));
    vr.laser.frustumCulled = false;
    vr.group.add(vr.laser);

    xrScene.add(vr.group);
    vr.ready = true;
    placeGroupInFront();
    startXRLoop();
    log('Esferas VR construidas. Zona=', activeZone && activeZone.title, 'esferas=', n);
    return true;
  }

  function placeGroupInFront() {
    var T3 = getTHREE();
    var cam = findCamera(xrScene);
    var pos = new T3.Vector3(); var quat = new T3.Quaternion();
    if (cam) { cam.getWorldPosition(pos); cam.getWorldQuaternion(quat); }
    var fwd = new T3.Vector3(0, 0, -1).applyQuaternion(quat);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    vr.basePos = pos.clone().add(fwd.multiplyScalar(SPHERE_CFG.distance));
    vr.basePos.y += SPHERE_CFG.heightOffset;
    vr.group.position.copy(vr.basePos);
    vr.group.lookAt(pos.x, vr.basePos.y, pos.z);
  }

  function findCamera(scene) {
    var cam = null;
    scene.traverse(function (o) { if (!cam && o.isCamera) cam = o; });
    return cam;
  }

  function startXRLoop() {
    function tick(time, frame) {
      if (!vr.ready || !xrSession) return;
      updateFrame(frame);
      xrSession.requestAnimationFrame(tick);
    }
    xrSession.requestAnimationFrame(tick);
  }

  // Rayo-esfera manual (evita Raycaster de THREE por posible cross-instance).
  function raycastSpheres(ox, oy, oz, dx, dy, dz) {
    if (!vr.group) return null;
    var best = null;
    for (var i = 0; i < vr.spheres.length; i++) {
      var s = vr.spheres[i];
      var c = s.mesh.getWorldPosition(new (getTHREE()).Vector3());
      var Lx = c.x - ox, Ly = c.y - oy, Lz = c.z - oz;
      var tca = Lx * dx + Ly * dy + Lz * dz;
      if (tca < 0) continue;
      var d2 = (Lx * Lx + Ly * Ly + Lz * Lz) - tca * tca;
      var r = SPHERE_CFG.radius * (s.mesh.scale.x || 1);
      if (d2 > r * r) continue;
      var thc = Math.sqrt(r * r - d2);
      var t = tca - thc;
      if (t < 0) t = tca + thc;
      if (t < 0) continue;
      if (!best || t < best.dist) best = { sphere: s, dist: t, px: ox + dx * t, py: oy + dy * t, pz: oz + dz * t };
    }
    return best;
  }

  function updateFrame(frame) {
    var T3 = getTHREE();
    if (!T3) return;
    var headPose = frame.getViewerPose(refSpace);
    if (headPose && headPose.views[0]) {
      var t = headPose.views[0].transform;
      vr.group.lookAt(t.position.x, vr.group.position.y, t.position.z); // billboard
    }
    var hovered = null, posed = false;
    var sources = xrSession.inputSources || [];
    for (var i = 0; i < sources.length; i++) {
      var src = sources[i];
      if (!src.targetRaySpace) continue;
      var pose = frame.getPose(src.targetRaySpace, refSpace);
      if (!pose) continue;
      var m = pose.transform.matrix;
      var ox = m[3], oy = m[7], oz = m[11];
      var dx = -m[2], dy = -m[6], dz = -m[10];
      var hit = raycastSpheres(ox, oy, oz, dx, dy, dz);
      if (hit) { hovered = hit.sphere; drawLaser(T3, ox, oy, oz, hit.px, hit.py, hit.pz); }
      else { drawLaser(T3, ox, oy, oz, ox + dx * 8, oy + dy * 8, oz + dz * 8); }
      posed = true; break;
    }
    if (!posed) hideLaser();
    if (hovered !== vr.hover) {
      if (vr.hover) vr.hover.mesh.scale.setScalar(1);
      vr.hover = hovered;
      if (vr.hover) vr.hover.mesh.scale.setScalar(1.3);
    }
  }

  var SCENE_OFFSET = { x: 0, y: 0, z: 0 }; // calibrar si el láser sale desplazado
  var lastViewName = null; // v13: B2 — reconstruir esferas VR solo si cambia la vista

  function drawLaser(T3, ax, ay, az, bx, by, bz) {
    var arr = vr.laserGeo.attributes.position.array;
    arr[0] = ax + SCENE_OFFSET.x; arr[1] = ay + SCENE_OFFSET.y; arr[2] = az + SCENE_OFFSET.z;
    arr[3] = bx + SCENE_OFFSET.x; arr[4] = by + SCENE_OFFSET.y; arr[5] = bz + SCENE_OFFSET.z;
    vr.laserGeo.attributes.position.needsUpdate = true;
    vr.laser.visible = true;
  }
  function hideLaser() { if (vr.laser) vr.laser.visible = false; }

  function onSelectStart(ev) {
    var src = ev.inputSource;
    if (!src.targetRaySpace || !ev.frame) return;
    var pose = ev.frame.getPose(src.targetRaySpace, refSpace);
    if (!pose) { warn('selectstart sin pose del mando'); return; }
    var m = pose.transform.matrix;
    var ox = m[3], oy = m[7], oz = m[11];
    var dx = -m[2], dy = -m[6], dz = -m[10];
    var hit = raycastSpheres(ox, oy, oz, dx, dy, dz);
    if (!hit) { log('selectstart -> rayo NO toca ninguna esfera VR'); return; }
    log('selectstart -> esfera VR tocada:', hit.sphere.view);
    handleSphere(hit.sphere);
  }

  function handleSphere(s) {
    if (!s || !s.view) { warn('handleSphere sin vista'); return; }
    var v = s.view;
    log('Esfera VR -> switchToView:', v);
    try {
      viewer.switchToView(v, 0); // 0 = instantáneo
      log('switchToView OK (esfera VR):', v);
    } catch (e) {
      warn('switchToView FALLÓ (esfera VR):', v, '-', e && e.message ? e.message : e);
    }
    lockView(v);
  }

  // ==========================================================================
  // BLOQUEO DE VISTA POR POSICIÓN (mitigación v2 + v11).
  // El clic nativo (desktop: "caminar hacia el punto clicado"; VR/Quest:
  // teleport nativo de la mira central) compite con nuestro switchToView.
  // NO existe API documentada para cancelarlo, así que MONITOREAMOS la
  // posición real de la cámara (Viewer.getCameraPosition, API verificada) y
  // si se aleja del punto de la vista > UMBRAL, re-teleportamos al instante.
  // v11: AHORA TAMBIÉN se aplica en sesión XR (antes se omitía porque en el
  // Quest no hay click-to-move de ratón, pero SÍ hay teleport nativo de la
  // mira + gatillo sobre el nodo). En XR el umbral es más amplio (0.25 m)
  // para no interferir con el movimiento normal de la cabeza.
  // NOTA HONESTA: mitigación pragmática, no cancelación real de la navegación.
  // ==========================================================================
  var LOCK_UMBRAL = 0.2;      // m de desvío permitido (desktop) antes de re-teleportar
  var LOCK_UMBRAL_XR = 0.25;  // m (VR): compensa el teleport nativo sin pelear con la cabeza
  var LOCK_MAX_MS = 2500;     // ventana máxima del lock tras el clic
  var LOCK_INTERVAL = 60;     // ms entre comprobaciones
  var LOCK_INTERVAL_XR = 40;  // ms en VR (reacción más rápida al teleport nativo)
  var viewLockTimer = null;
  var viewLockTarget = null; // {x,y,z} posición de la vista tras teleport
  var viewLockName = null;
  var viewLockStart = 0;
  var viewLockReasserts = 0;

  function posDist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function lockView(v) {
    if (!viewer || typeof viewer.getCameraPosition !== 'function') {
      log('lockView no disponible (sin getCameraPosition) para:', v);
      return;
    }
    clearViewLock();
    // Captura la posición destino justo después del teleport instantáneo.
    try {
      var p = viewer.getCameraPosition();
      viewLockTarget = { x: p.x, y: p.y, z: p.z };
    } catch (e) {
      warn('lockView -> no se pudo leer getCameraPosition:', e);
      return;
    }
    viewLockName = v;
    viewLockStart = Date.now();
    viewLockReasserts = 0;
    var modo = xrSession ? 'VR' : 'desktop';
    log('lockView' + (xrSession ? ' (VR)' : '') + ' -> anclando vista', v, 'en',
        viewLockTarget.x.toFixed(2), viewLockTarget.y.toFixed(2), viewLockTarget.z.toFixed(2),
        '| modo:', modo);
    viewLockTimer = setInterval(lockTick, xrSession ? LOCK_INTERVAL_XR : LOCK_INTERVAL);
  }

  function lockTick() {
    if (!viewer || !viewLockTarget) { clearViewLock(); return; }
    var elapsed = Date.now() - viewLockStart;
    if (elapsed > LOCK_MAX_MS) {
      log('lockView -> finalizado tras', elapsed, 'ms (', viewLockReasserts, 're-teleports)');
      clearViewLock();
      return;
    }
    var p = null;
    try { p = viewer.getCameraPosition(); } catch (e) { return; }
    if (!p) return;
    var umbral = xrSession ? LOCK_UMBRAL_XR : LOCK_UMBRAL;
    var d = posDist(p, viewLockTarget);
    if (d > umbral) {
      viewLockReasserts++;
      log('lockView -> desviado', d.toFixed(3), 'm; re-teleport a', viewLockName);
      try {
        viewer.switchToView(viewLockName, 0);
        var p2 = viewer.getCameraPosition();
        viewLockTarget = { x: p2.x, y: p2.y, z: p2.z }; // re-ancla al nuevo destino
      } catch (e) {
        warn('lockView re-teleport FALLÓ:', e && e.message ? e.message : e);
      }
    }
  }

  function clearViewLock() {
    if (viewLockTimer) { clearInterval(viewLockTimer); viewLockTimer = null; }
    viewLockTarget = null; viewLockName = null;
  }

  // ==========================================================================
  // ETIQUETAS WORLD-SPACE (reemplazo de htmllabels en VR)
  //   VRLABELS.register({id:'mesa1', text:'Mesita\nde sala', position:[x,y,z], width:0.6});
  // ==========================================================================
  var VRLABELS = {
    register: function (cfg) {
      var T3 = getTHREE();
      if (!xrScene || !T3) { warn('VRLABELS sin escena XR aún.'); return null; }
      this.remove(cfg.id);
      var c = document.createElement('canvas'); c.width = 512; c.height = 256;
      var g = c.getContext('2d');
      g.fillStyle = 'rgba(20,22,28,0.88)';
      var r = 24, w = c.width - 16, h = c.height - 16, x = 8, y = 8;
      g.beginPath();
      g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      var lines = String(cfg.text).split('\n');
      var fs = lines.length > 1 ? 44 : 56;
      g.font = 'bold ' + fs + 'px Segoe UI, Arial';
      lines.forEach(function (ln, i) {
        g.fillText(ln, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * (fs + 8));
      });
      var tex = new T3.CanvasTexture(c);
      var ww = cfg.width || 0.6;
      var spr = new T3.Sprite(new T3.SpriteMaterial({ map: tex, transparent: true }));
      spr.scale.set(ww, ww * 0.5, 1);
      spr.position.set(cfg.position[0] + SCENE_OFFSET.x, cfg.position[1] + SCENE_OFFSET.y, cfg.position[2] + SCENE_OFFSET.z);
      xrScene.add(spr);
      labels[cfg.id] = { sprite: spr, canvas: c, texture: tex };
      return cfg.id;
    },
    remove: function (id) { var e = labels[id]; if (!e || !xrScene) return; xrScene.remove(e.sprite); delete labels[id]; },
    clear: function () { Object.keys(labels).forEach(function (k) { VRLABELS.remove(k); }); },
    list: function () { return Object.keys(labels); }
  };

  // ==========================================================================
  // CICLO DE SESIÓN XR
  // ==========================================================================
  function onSessionStart() {
    // v19: usa la sesión capturada por requestSession; getSession es fallback.
    var sess = capturedSession || null;
    if (!sess && navigator.xr.getSession) { try { sess = navigator.xr.getSession() || null; } catch (e) {} }
    if (!sess) {
      log('sessionstart sin sesión capturada aún; pendiente la promesa de requestSession');
      return;
    }
    handleSession(sess);
  }

  // Handler común: recibe la sesión (capturada o del evento sessionstart).
  function handleSession(sess) {
    if (xrSession) return; // ya conectada
    xrSession = sess || null;
    log('SESION VR ACTIVA ✓ (sesión conectada)');
    if (!vr.ready) {
      Promise.resolve()
        .then(function () {
          if (!xrSession) throw new Error('sin sesión');
          return xrSession.requestReferenceSpace('local-floor')
            .catch(function () { return xrSession.requestReferenceSpace('local'); });
        })
        .then(function (rs) {
          refSpace = rs;
          if (!refSpace) throw new Error('sin reference space');
          buildVRSpheres();
        })
        .catch(function (e) { warn('No se pudo inicializar UI VR:', e && e.message); });
    }
    try { xrSession.addEventListener('selectstart', onSelectStart); } catch (e) {}
  }

  function onSessionEnd() {
    log('Sesión WebXR terminada.');
    if (vr.group) vr.group.visible = false;
    if (vr.laser) vr.laser.visible = false;
    // v13: re-entrada limpia — la próxima sesión reconstruye la UI.
    vr.ready = false;
    lastViewName = null;
  }

  function watchXR() {
    if (!navigator.xr) { log('navigator.xr no disponible (desktop normal).'); return; }
    navigator.xr.isSessionSupported('immersive-vr').then(function (ok) { log('Soporte immersive-vr:', ok); }).catch(function () {});
    navigator.xr.addEventListener('sessionstart', onSessionStart);
    navigator.xr.addEventListener('sessionend', onSessionEnd);
  }

  // ==========================================================================
  // ARRANQUE
  // ==========================================================================
  function init() {
    var WALK = window.WALK || {};
    try { viewer = WALK.getViewer(); } catch (e) { viewer = null; }
    if (!viewer) { setTimeout(init, 150); return; }
    probeViewerInternals(); // v20: sonda de internals + hook caso B

    viewer.onSceneReadyToDisplay(function () {
      wireEditorSpheres(); // esferas creadas por ti en el editor (type = vista)
      watchXR();
    });

    // B2 (v13): lastViewName evita reconstruir las esferas VR en cada
    // re-teleport del position-lock (misma vista); solo se reconstruyen
    // cuando la vista realmente CAMBIA.
    try {
      viewer.onViewSwitchDone(function (viewName) {
        activeZone = null;
        ZONES_CONFIG.forEach(function (z) {
          if (z.triggerViews.indexOf(viewName) !== -1) activeZone = z;
        });
        var changed = (viewName !== lastViewName);
        lastViewName = viewName;
        log('Vista activa:', viewName,
            '-> zona:', activeZone ? activeZone.title : 'SIN ZONA (no está en ZONES_CONFIG)',
            '| cambio:', changed);
        if (changed && vr.ready && xrScene) buildVRSpheres(); // reconstruye por zona
      });
    } catch (e) {
      warn('onViewSwitchDone no se pudo registrar:', e && e.message ? e.message : e);
    }
  }

  window.VRCOMPAT = {
    state: function () {
      return { viewer: !!viewer, scene: !!xrScene, session: !!xrSession,
               vrReady: vr.ready, zone: activeZone && activeZone.title,
               clickHandlers: clickHandlers.length };
    },
    // Registra un handler externo de clics 3D (usado por vr-temp.js para
    // sus botones btn_2700..btn_6000). Un solo onNodeTypeClicked compartido.
    onNodeClick: registerNodeClick,
    // v19: acceso a la sesión XR capturada (vr-temp la necesita para sus
    // listeners de mando/gamepad; evita depender de getSession no estándar).
    getSession: function () { return capturedSession || xrSession || null; },
    // v20: escena y materiales capturados por hook de render (fuente del
    // filtro de temperatura cuando getEditableMaterials devuelve 0).
    getSceneCapture: function () { return capturedScene || null; },
    getSceneMaterials: function () {
      if (capturedScene) {
        var fresh = collectMaterials(capturedScene);
        if (fresh.length) capturedMaterials = fresh;
      }
      return capturedMaterials.slice();
    },
    onSceneCapture: function (cb) { if (typeof cb === 'function') captureCallbacks.push(cb); },
    // Reenvío de logs al panel de diagnóstico en pantalla (?diag=1).
    diag: diagPush,
    labels: VRLABELS,
    sceneOffset: SCENE_OFFSET,
    forceBuild: function () { if (xrScene && !vr.ready) buildVRSpheres(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
