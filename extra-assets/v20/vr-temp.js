/**
 * ============================================================================
 *  VR-TEMP para Shapespark — FILTRO DE COLOR GENERAL (WebXR) — v19
 * ============================================================================
 *  v9 (filtro "lentes de color", SIN tinte de materiales):
 *   - Se ELIMINÓ la Capa A (tinte de baseColor de materiales): NO cambia el
 *     color de ninguna textura/producto (catálogo de luminarias con perfiles
 *     IES necesita el look realista).
 *   - Capa B = filtro multiplicativo per-eye (resultado = colorEscena ×
 *     colorFiltro), como un gel/lente real: se ve sobre TODA la imagen
 *     (haces de luz rebotando incluidos), en ambos ojos, sin post-proceso.
 *   - Paleta CALIBRADA del body-end de ejemplo (botones .temp-btn):
 *     2700 #fed360 · 3000 #fce084 · 4000 #fef6c8 (≈ neutro, filtro blanco) ·
 *     6000 #b1e3fa · 6500 #98d9f5.
 *   - Interruptores: ?vrtemp=off (A/B), ?temp=2700… (aislamiento sin consola,
 *     aplicación al cargar), ?diag=1 (panel en pantalla vía VRCOMPAT.diag).
 *   - Botones 3D del editor: type/name con el número (btn_2700, temp 3000K,
 *     "2700"…), node + ancestros; regex escalonada v8. Respaldo: 5 esferas VR
 *     auto-generadas en el casco (2700→3000→4000→6000→6500).
 *
 *  Debug: window.VRTEMP.state() / VRTEMP.apply('2700') / VRTEMP.reset()
 *  Integración (body-end.html VR-only, DESPUÉS de vr-compat.js): versión
 *  dinámica ?v=NN en la URL de la escena (NO hardcodear ?v=19 aquí).
 * ============================================================================
 */
(function () {
  'use strict';

  // INTERRUPTOR DE DIAGNÓSTICO: ?vrtemp=off desactiva TODO el módulo.
  if (/[?&]vrtemp=off/.test(window.location.search)) {
    console.log('[VRTEMP] DESACTIVADO por ?vrtemp=off (diagnóstico A/B)');
    return;
  }

  var TAG = '[VRTEMP]';

  function log() {
    var args = Array.prototype.slice.call(arguments);
    console.log.apply(console, [TAG].concat(args));
    if (window.VRCOMPAT && window.VRCOMPAT.diag) window.VRCOMPAT.diag(args.join(' '));
  }
  function warn() {
    var args = Array.prototype.slice.call(arguments);
    console.warn.apply(console, [TAG].concat(args));
    if (window.VRCOMPAT && window.VRCOMPAT.diag) window.VRCOMPAT.diag('⚠ ' + args.join(' '));
  }

  // Sello de versión: PRIMERA línea de log (verifica caché al instante).
  log('versión 24 (v24) — quad al llegar la escena + sonda de materiales (¿qué son los 176?)');

  // ==========================================================================
  // PRESETS — PALETA CALIBRADA del body-end de ejemplo (.temp-btn):
  // 2700 #fed360 · 3000 #fce084 · 4000 #fef6c8 · 6000 #b1e3fa · 6500 #98d9f5
  // k = intensidad multiplicativa (1:1 de las opacidades PC script (2).js).
  // '4000' es el NEUTRO: el filtro usa blanco puro (sin cambiar la imagen),
  // aunque su esfera indicadora se pinta #fef6c8 (el color del patrón).
  // ==========================================================================
  var PRESETS = {
    '2700': { hexNum: 0xFED360, css: '#fed360', k: 0.40, label: '2700K' },
    '3000': { hexNum: 0xFCE084, css: '#fce084', k: 0.25, label: '3000K' },
    '4000': { hexNum: 0xFEF6C8, css: '#fef6c8', filterHex: 0xFFFFFF, k: 0.50, label: '4000K' },
    '6000': { hexNum: 0xB1E3FA, css: '#b1e3fa', k: 0.25, label: '6000K' },
    '6500': { hexNum: 0x98D9F5, css: '#98d9f5', k: 0.20, label: '6500K' }
  };
  var ORDER = ['2700', '3000', '4000', '6000', '6500'];
  var QUAD_SIZE = 3.6;        // m a 0.62 m de la cabeza cubre ~142° por ojo (margen sobre FOV Quest ~110°)
  var QUAD_DIST = 0.62;
  var STORAGE_KEY = 'vrtemp';
  // Botones del editor: acepta btn_2700 / boton-2700 / Btn 2700 / Luz 2700K / "2700"
  // en type O en name (v8: match tolerante para detectar cualquier botón 3D
  // que el usuario haya nombrado de forma distinta).
  // v13 (B4): SIEMPRE con límites no numéricos alrededor del número — evita
  // falsos positivos tipo "12700" o "270000". La escalera es:
  //   1) ANCHORED (btn_2700, temp 2700K...)  2) LOOSE (cualquier " 2700 " suelto)
  //   3) ANY (mismo LOOSE; último recurso ya cubierto por LOOSE)
  var BTN_ANCHORED = /^(?:btn|boton|botón|temperatura|temp|luz|cal)[-_ ]?(2700|3000|4000|6000|6500)(?:K)?$/i;
  var BTN_LOOSE = /(?:^|[^0-9])(2700|3000|4000|6000|6500)(?:[^0-9]|$)/; // fallback: ocurrencia delimitada
  var BTN_ANY = /(?:^|[^0-9])(2700|3000|4000|6000|6500)(?:[^0-9]|$)/;  // v13: idem LOOSE (sin substring puro)
  var STORE_LIMIT = 8; // máx. ancestros a revisar buscando el type del botón

  // Parámetro de aislamiento: ?temp=2700 (prueba SIN consola: si al cargar
  // con ?temp=2700 el filtro se ve, el problema es SOLO la detección de clics;
  // si no se ve ni así, es la construcción/aplicación del filtro).
  var URL_TEMP = (window.location.search.match(/[?&]temp=(\d{3,4})/) || [])[1] || null;

  // ==========================================================================
  // ESTADO
  // ==========================================================================
  var viewer = null;
  var T3 = null;                       // window.THREE (el mismo que carga el viewer)
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

  // (hexToRgb01 y lerpWhiteTo viven en la sección CAPA B, junto al filtro)

  // Búsqueda profunda del objeto escena por feature detection (misma técnica
  // que vr-compat.js; NO importa el THREE del viewer, solo busca).
  // v6: guarda de ciclos (visited) + tope de nodos. La versión anterior
  // (sin visited) recorría el grafo completo del viewer de forma explosiva y
  // bloqueaba el hilo principal durante la carga (bucle de carga en Quest).
  // v14: 1) candidatos por nombre, 2) BFS filtrado — typed arrays (buffers de
  // 22 MB de vértices) descartados: eran los que agotaban el tope; funciones
  // y DOM también; profundidad 10, tope 200k.
  var DEEP_FIND_LIMIT = 200000;
  var SCENE_SCANNED = false; // log único de "no accesible"

  function isFindable(v) {
    if (!v || typeof v !== 'object') return false;
    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(v)) return false; // typed arrays
    if (v.nodeType) return false; // DOM
    return true;
  }

  function deepFind(root, maxDepth) {
    var visited = new Set();
    var visits = 0;
    var stack = [{ obj: root, depth: 0 }];
    while (stack.length && visits < DEEP_FIND_LIMIT) {
      var item = stack.pop();
      visits++;
      var node = item.obj;
      if (!isFindable(node)) continue;
      if (item.depth > (maxDepth == null ? 10 : maxDepth)) continue;
      if (visited.has(node)) continue;
      visited.add(node);
      try { if (node.isScene === true || node.isScene === 1) return node; } catch (e) { /* sin getter */ }
      var keys;
      try { keys = Object.keys(node); } catch (e) { continue; }
      for (var i = 0; i < keys.length; i++) {
        var v;
        try { v = node[keys[i]]; } catch (e) { continue; }
        if (isFindable(v)) stack.push({ obj: v, depth: item.depth + 1 });
      }
    }
    if (visits >= DEEP_FIND_LIMIT && !SCENE_SCANNED) {
      SCENE_SCANNED = true;
      log('deepFind: tope alcanzado — escena interna no accesible (no crítico: filtro shader y botones del editor siguen funcionando)');
    }
    return null;
  }

  // v14 Paso 1: candidatos por nombre en el viewer (casi gratis) antes del BFS.
  function findSceneByCandidates() {
    if (!viewer) return null;
    // v22: la sonda de vr-compat reveló que el viewer expone _scene/_renderer
    // (con guion bajo) — incluirlos como candidatos.
    var CAND = ['scene', '_scene', 'threeScene', 'xrScene', 'renderer', '_renderer', 'camera', '_camera'];
    for (var i = 0; i < CAND.length; i++) {
      try {
        var c = viewer[CAND[i]];
        if (!c) continue;
        if (c.isScene === true || c.isScene === 1) return c;
        if (c.scene && (c.scene.isScene === true || c.scene.isScene === 1)) return c.scene;
      } catch (e) { /* candidato inexistente */ }
    }
    return null;
  }

  // ==========================================================================
  // CAPA B — FILTRO MULTIPLICATIVO PER-EYE (única capa en v9)
  // Equivalent E XR del overlay CSS 'mix-blend-mode: color' del body-end PC.
  // Sin tinte de materiales: resultado = colorEscena × colorFiltro (lente real).
  // ==========================================================================
  function hexToRgb01(hexNum) {
    return {
      r: ((hexNum >> 16) & 255) / 255,
      g: ((hexNum >> 8) & 255) / 255,
      b: (hexNum & 255) / 255
    };
  }

  // Color del filtro = lerp(blanco → hexPreset, k); con k=0 => blanco => sin cambio.
  function lerpWhiteTo(hexNum, k) {
    var c = hexToRgb01(hexNum);
    return {
      r: 1 + (c.r - 1) * k,
      g: 1 + (c.g - 1) * k,
      b: 1 + (c.b - 1) * k
    };
  }

  // ==========================================================================
  // FILTRO POR SHADER-INJECTION (v11 — mecanismo PRINCIPAL del filtro).
  // No requiere la escena interna (que en tu publicación no se encontró):
  // parchea onBeforeCompile de los materiales editables (API verificada
  // getEditableMaterials) e inyecta al final del fragment shader:
  //   gl_FragColor.rgb *= uVRTEMP_FilterColor
  // => multiplica el color FINAL de cada píxel (ledo/lente real):
  //   - tiñe TODA la imagen (incl. haces de luz rebotando),
  //   - NO cambia texturas ni baseColor (catálogo IES realista),
  //   - funciona en ambos ojos, sin postproceso ni escena interna.
  // Basado en la técnica LUTVR de tu export de chat (msj 7).
  // ==========================================================================
  var FILTER_UNIFORMS = [];      // {mat, uniforms} activos
  var FILTER_PATCHED = false;
  var FILTER_PATCH_COUNT = 0;
  var CURRENT_FILTER = { r: 1, g: 1, b: 1 }; // color activo (blanco = sin filtro)
  var FILTER_RETRY_TIMER = null;
  var FILTER_RETRY_ATTEMPTS = 0;
  var LAST_EDITABLE_COUNT = -1; // v21: log de getEditableMaterials solo al cambiar
  var MATERIAL_PROBE_DONE = false; // v24: sonda de materiales (1 sola vez)

  // ==========================================================================
  // v20: FUENTES DE MATERIALES. El build publicado devuelve 0 en la API
  // editable (tus logs v19: 'shader: 0 mat'), por eso se añade la captura
  // de escena de vr-compat (hook de render — la escena REAL del primer
  // render(), recorrida sin API editable):
  //   1) getEditableMaterials() — API documentada (PC: 149 materiales).
  //   2) VRCOMPAT.getSceneMaterials() — captura vía render.
  // ==========================================================================
  function getEditableMats() {
    if (!viewer || typeof viewer.getEditableMaterials !== 'function') return null;
    try { if (typeof viewer.setAllMaterialsEditable === 'function') viewer.setAllMaterialsEditable(); } catch (e) {}
    var mats = null;
    try { mats = viewer.getEditableMaterials() || null; } catch (e) { return null; }
    // Tolerar que devuelva un mapa/objeto en lugar de array (defensivo).
    if (mats && typeof mats === 'object' && !Array.isArray(mats) && !mats.length) {
      var arr = [];
      for (var k in mats) { var v = mats[k]; if (v && typeof v === 'object') arr.push(v); }
      mats = arr;
    }
    if (mats && mats.length && mats.length !== LAST_EDITABLE_COUNT) {
      LAST_EDITABLE_COUNT = mats.length;
      log('getEditableMaterials ->', mats.length, 'materiales');
    }
    return mats && mats.length ? mats : null;
  }

  function getCapturedMats() {
    if (!window.VRCOMPAT || typeof window.VRCOMPAT.getSceneMaterials !== 'function') return [];
    try { return window.VRCOMPAT.getSceneMaterials() || []; } catch (e) { return []; }
  }

  // Inyección GLSL en un shader concreto (compartida por el wrapper por
  // instancia y por el hook del prototipo Material de vr-compat).
  // Defensivo: el uniform se publica con {r,g,b} + {x,y,z} + índices para
  // que cualquier rama de setValueV3f del three del viewer lo lea bien.
  function filterUniformValue(c) {
    var v = { r: c.r, g: c.g, b: c.b, x: c.r, y: c.g, z: c.b };
    v[0] = c.r; v[1] = c.g; v[2] = c.b;
    return v;
  }

  function injectFilterIntoShader(self, shader) {
    if (!shader || !shader.fragmentShader) return;
    if (shader.fragmentShader.indexOf('gl_FragColor') === -1) {
      // B3: si el viewer compila en GLSL3 (pc_fragColor), NO inyectar.
      warn('filtro shader: shader sin gl_FragColor (posible GLSL3); omitido');
      return;
    }
    if (!shader.uniforms.uVRTEMP_FilterColor) {
      shader.uniforms.uVRTEMP_FilterColor = { value: filterUniformValue(CURRENT_FILTER) };
      // Declaración del uniform al inicio del fragment shader.
      var header = 'uniform vec3 uVRTEMP_FilterColor;\n';
      shader.fragmentShader = header + shader.fragmentShader;
      // Multiplicación al final del pipeline de color (patrón LUTVR).
      var body = 'gl_FragColor.rgb *= uVRTEMP_FilterColor;\n';
      if (shader.fragmentShader.indexOf('#include <dithering_fragment>') !== -1) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          '#include <dithering_fragment>\n' + body);
      } else if (shader.fragmentShader.indexOf('#include <opaque_fragment>') !== -1) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          '#include <opaque_fragment>\n' + body);
      } else {
        var li = shader.fragmentShader.lastIndexOf('}');
        if (li !== -1) {
          shader.fragmentShader = shader.fragmentShader.slice(0, li) + body + '\n' + shader.fragmentShader.slice(li);
        }
      }
    }
    // Dedupe: onBeforeCompile puede ejecutarse varias veces por material.
    var already = false;
    for (var ui = 0; ui < FILTER_UNIFORMS.length; ui++) {
      if (FILTER_UNIFORMS[ui].uniforms === shader.uniforms) { already = true; break; }
    }
    if (!already) FILTER_UNIFORMS.push({ mat: self, uniforms: shader.uniforms });
  }

  // v20: handoff para vr-compat — si vr-compat envolvió el prototipo de
  // THREE.Material (onBeforeCompile), TODA asignación del viewer en cualquier
  // material (aunque no esté en nuestras listas) pasa por esta función.
  window.__VRTEMP_INJECT__ = function (self, shader, renderer) {
    try { injectFilterIntoShader(self, shader); } catch (e) { /* nunca romper compilación */ }
  };

  function patchMaterialList(mats, src) {
    var patchedNow = 0;
    var rejected = 0;
    for (var i = 0; i < mats.length; i++) {
      var m = mats[i];
      // v21: se acepta cualquier material three (aunque onBeforeCompile sea
      // null). v24: se acepta CUALQUIER objeto — patchear un objeto no-three
      // es inofensivo (nadie lo compila) y maximiza la probabilidad de
      // alcanzar los materiales reales del viewer. La SONDA (abajo) revela
      // qué son los objetos rechazados por otras vías.
      if (!m || typeof m !== 'object') { rejected++; continue; }
      if (m.__vrtempPatched && m.onBeforeCompile === m.__vrtempWrapper) continue;
      m.__vrtempPatched = true;

      // v21: si el viewer reemplazó nuestro wrapper (p.ej. recompile por
      // cambio de vista/streaming), re-envolver la función actual.
      var prevOnBeforeCompile = (typeof m.onBeforeCompile === 'function')
        ? m.onBeforeCompile : null;
      var wrapper = function (shader, renderer) {
        if (typeof prevOnBeforeCompile === 'function') {
          try { prevOnBeforeCompile.call(this, shader, renderer); } catch (e) {}
        }
        injectFilterIntoShader(this, shader);
      };
      m.__vrtempWrapper = wrapper;
      m.onBeforeCompile = wrapper;

      // B5: forzar programa único por material parcheado (patrón LUTVR).
      // v21: key nueva (|VRTEMP21) — fuerza programas frescos.
      var prevCacheKey = m.customProgramCacheKey;
      m.customProgramCacheKey = function () {
        var base = '';
        try { if (typeof prevCacheKey === 'function') base = prevCacheKey.call(this); } catch (e) {}
        return base + '|VRTEMP21';
      };

      try { m.needsUpdate = true; } catch (e) {}
      FILTER_PATCH_COUNT++;
      patchedNow++;
    }
    if (rejected > 0) {
      warn('materiales omitidos (no materiales three):', rejected, 'de', mats.length);
    }
    if (patchedNow) {
      FILTER_PATCHED = true;
      log('filtro shader-injection preparado en', FILTER_PATCH_COUNT, 'materiales (fuente: ' + src + ')');
      // v23: el quad NO se oculta: es la vía PRIMARIA (malla propia); su
      // color activo lo controla updateQuad y el shader se pone neutro vía
      // syncFilterColor (evita doble multiplicación).
    } else if (mats.length > 0) {
      log('filtro shader: ' + mats.length + ' materiales recibidos pero NINGUNO parcheable (isMaterial=false?)');
      // v24: SONDA — ¿qué son estos objetos? (una sola vez, primeros 3)
      if (!MATERIAL_PROBE_DONE) {
        MATERIAL_PROBE_DONE = true;
        for (var p = 0; p < Math.min(3, mats.length); p++) {
          var pm = mats[p];
          var det = '?';
          try {
            det = 'ctor=' + (pm.constructor && pm.constructor.name) +
                  ' | isMaterial=' + pm.isMaterial +
                  ' | oBC=' + typeof pm.onBeforeCompile +
                  ' | type=' + pm.type +
                  ' | keys=' + Object.keys(pm).slice(0, 14).join(',');
          } catch (e) { det = '(sin keys legibles)'; }
          log('SONDA material[' + p + ']: ' + det);
        }
      }
    }
    return patchedNow;
  }

  function scheduleFilterRetry() {
    if (FILTER_RETRY_TIMER) return;
    if (FILTER_RETRY_ATTEMPTS >= 30) return; // máx ~60s de reintentos (cada 2s)
    FILTER_RETRY_TIMER = setTimeout(function () {
      FILTER_RETRY_TIMER = null;
      FILTER_RETRY_ATTEMPTS++;
      patchMaterialsFilter();
    }, 2000);
  }

  function patchMaterialsFilter() {
    var mats = getEditableMats() || [];
    var src = 'editable';
    if (!mats.length) {
      mats = getCapturedMats();
      src = 'captura render';
    }
    if (!mats.length) {
      if (FILTER_RETRY_ATTEMPTS === 0) {
        log('filtro shader: 0 materiales (editable + captura) — la captura llega con el primer render; reintentando cada 2s');
      }
      scheduleFilterRetry();
      return;
    }
    patchMaterialList(mats, src);
    // Si la captura encuentra MÁS materiales en un rescan posterior, parchear
    // también los nuevos (guard __vrtempPatched evita duplicados).
    var extra = getCapturedMats();
    if (extra.length > mats.length) patchMaterialList(extra, 'captura render (rescan)');
  }

  function updateFilterUniforms(c) {
    // v20: publicar color en TODAS las representaciones ({r,g,b},{x,y,z},
    // índices) para que cualquier rama de setValueV3f del three del viewer
    // lea el valor correcto.
    for (var i = 0; i < FILTER_UNIFORMS.length; i++) {
      try {
        var u = FILTER_UNIFORMS[i].uniforms.uVRTEMP_FilterColor;
        if (u && u.value) {
          u.value.r = c.r; u.value.g = c.g; u.value.b = c.b;
          u.value.x = c.r; u.value.y = c.g; u.value.z = c.b;
          if (u.value[0] !== undefined) { u.value[0] = c.r; u.value[1] = c.g; u.value[2] = c.b; }
        }
      } catch (e) { /* material liberado */ }
    }
  }

  // v23: sincroniza el color activo — si el QUAD multiplicativo está visible,
  // el shader se queda NEUTRO (blanco) para no multiplicar dos veces; el
  // efecto completo lo produce el quad (vía determinista, malla propia).
  function syncFilterColor() {
    if (quad && quad.visible) updateFilterUniforms({ r: 1, g: 1, b: 1 });
    else updateFilterUniforms(CURRENT_FILTER);
  }

  function applyTemp(key) {
    key = String(key);
    var p = PRESETS[key];
    if (!p) { warn('preset desconocido:', key); return; }
    activeTemp = key;

    var fh = p.filterHex || p.hexNum;   // 4000K: blanco = neutro
    var c = lerpWhiteTo(fh, p.k);
    CURRENT_FILTER.r = c.r; CURRENT_FILTER.g = c.g; CURRENT_FILTER.b = c.b;

    // v23: QUAD per-eye = vía PRIMARIA (es NUESTRA malla: si la escena se
    // renderiza, nuestra malla también — no depende de materiales/shaders
    // del viewer). El shader-injection queda como refuerzo gratuito.
    patchMaterialsFilter();
    ensureFilterReady();
    if (quad) updateQuad(p);
    syncFilterColor();
    // Los materiales se recompilan el próximo frame; re-sync 100/500/800ms.
    setTimeout(syncFilterColor, 100);
    setTimeout(syncFilterColor, 500);
    setTimeout(function () { patchMaterialsFilter(); syncFilterColor(); }, 800);

    log('FILTRO -> aplicando', key, '(' + p.label + ') k=', p.k,
        '| shader:', FILTER_PATCH_COUNT, 'mat | quad:', !!quad,
        '| color:', c.r.toFixed(3), c.g.toFixed(3), c.b.toFixed(3));
    try { viewer.requestFrame(); } catch (e) { /* no crítico */ }
    updateDomActive(key);
    persist(key);
    vrFeedback();
  }

  // v10/v11: garantiza el quad del filtro como REFUERZO (solo si la escena
  // interna existe). El mecanismo principal es el shader, que no la necesita.
  function ensureFilterReady() {
    if (quad) return;
    // v23: el quad se construye SIEMPRE que haya sesión XR + escena
    // (vía determinista de malla propia). El shader ya no lo bloquea.
    if (!xrSession) {
      log('filtro: sin sesión XR activa -> el quad per-eye se construye DENTRO del casco');
      return;
    }
    if (ensureScene()) {
      buildQuad();
      if (quad && activeTemp && PRESETS[activeTemp]) updateQuad(PRESETS[activeTemp]);
    } else {
      log('filtro: escena interna no disponible; usando SOLO shader-injection');
    }
  }

  function resetTemp() { applyTemp('4000'); } // 4000K = neutro (filtro blanco) = originales

  function persist(key) {
    try { localStorage.setItem(STORAGE_KEY, key); } catch (e) { /* privado */ }
  }

  // ==========================================================================
  // VÍA 1 — BOTONES 3D DEL EDITOR (btn_2700 .. btn_6000)
  // v8: matchea type O name (los nombres del modelo a veces viajan en .name);
  // regex escalonada: anclada -> contenida con límites -> substring puro.
  // ==========================================================================
  function keyFromString(s) {
    if (!s || typeof s !== 'string') return null;
    var m = s.match(BTN_ANCHORED);
    if (m) return m[1];
    m = s.match(BTN_LOOSE);
    if (m) return m[1];
    m = s.match(BTN_ANY);
    return m ? m[1] : null;
  }

  function findBtnKey(node) {
    var cur = node, hops = 0;
    var chainT = [], chainN = [];
    while (cur && hops < STORE_LIMIT) {
      chainT.push(cur.type || '∅');
      chainN.push(cur.name || '∅');
      var key = keyFromString(cur.type) || keyFromString(cur.name);
      if (key) return key;
      if (cur.parent) cur = cur.parent;  // propiedad documentada: node.parent
      else break;
      hops++;
    }
    // DIAGNÓSTICO: si el clic NO fue un botón de temperatura, la cadena type/name
    // muestra exactamente qué nombra el modelo (para saber cómo renombrar).
    log('findBtnKey -> sin key | types:', chainT.join(' | '), '| names:', chainN.join(' | '));
    return null;
  }

  // COMPATIBILIDAD (fix doble-clic): los clics 3D se registran en el DISPATCHER
  // ÚNICO de vr-compat.js (VRCOMPAT.onNodeClick) para que esferas de intensidad
  // y botones de temperatura convivan sin pisarse ni duplicarse. Solo si
  // vr-compat no está presente se cae a un onNodeTypeClicked propio.
  function wireEditorButtons() {
    var handler = function (node) {
      if (!node) return;
      var key = findBtnKey(node);
      if (key) {
        log('botón de temperatura 3D detectado ->', key, '| (aplicando filtro)');
        applyTemp(key);
        return true; // click de temperatura: no toca intensidades
      }
    };

    if (window.VRCOMPAT && typeof window.VRCOMPAT.onNodeClick === 'function') {
      window.VRCOMPAT.onNodeClick(handler);
      log('clicks 3D registrados en dispatcher compartido (VRCOMPAT.onNodeClick)');
      return;
    }
    if (typeof viewer.onNodeTypeClicked !== 'function') {
      warn('onNodeTypeClicked no disponible; usarás fallback de esferas VR');
      return;
    }
    try {
      viewer.onNodeTypeClicked(handler);
      log('oyente de clicks 3D propio (fallback, solo temperatura btn_*)');
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
    if (btns.length === 0) {
      // Build VR-only: sin interfaz 2D no existen .temp-btn; es lo esperado.
      log('wireDomButtons -> 0 botones .temp-btn (build VR-only, sin interfaz 2D)');
    }
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        // Reemplaza onclick (overlay CSS anterior) por el sistema global.
        // Solo afecta a .temp-btn; los sliders quedan intactos.
        btn.onclick = function () {
          var t = btn.getAttribute('data-temp') || btn.dataset && btn.dataset.temp;
          if (t) { log('botón DOM .temp-btn clicado ->', t); applyTemp(t); }
          else warn('botón .temp-btn sin data-temp (revisar HTML):', btn);
        };
      })(btns[i]);
    }
    log('botones DOM .temp-btn cableados:', btns.length);

    var resets = document.querySelectorAll('.reset-btn');
    for (var j = 0; j < resets.length; j++) {
      // ADITIVO: conserva el reset de materiales por zona del script principal.
      resets[j].addEventListener('click', function () { log('reset-btn clicado'); resetTemp(); });
    }
    log('botones .reset-btn cableados:', resets.length);
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
  // CAPA B — FILTRO MULTIPLICATIVO PER-EYE (única capa en v9)
  // Equivalente XR del overlay CSS 'mix-blend-mode: color' del body-end PC
  // (script (2).js:107-135). NO tintes materiales; es un lente/gel real:
  // resultado = colorEscena × colorFiltro, con blend custom dst*src.
  // El quad se dibuja delante de la cámara en AMBOS OJOS con
  // depthTest/depthWrite desactivados. Blending multiplicativo:
  //   THREE.CustomBlending + AddEquation + ZeroFactor + SrcColorFactor.
  // NOTA HONESTA (B06): aproxima el blend 'color' exacto de CSS (que exige
  // postproceso) con multiplicación de color — físicamente un lente real.
  // Se construye automáticamente al iniciar sesión XR (onSessionStart).
  // ==========================================================================
  function buildQuad() {
    if (quad || !getTHREE() || !xrScene) return;
    try {
      var T = getTHREE();
      var geo = new T.PlaneGeometry(QUAD_SIZE, QUAD_SIZE);
      var mat = new T.MeshBasicMaterial({
        color: 0xFFFFFF,          // k=0 => blanco => sin cambio
        transparent: true,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
        side: T.DoubleSide,
        toneMapped: false,
        blending: T.CustomBlending,
        blendEquation: T.AddEquation,
        blendSrc: T.ZeroFactor,
        blendDst: T.SrcColorFactor // dst * src: multiplicativo (lente)
      });
      quad = new T.Mesh(geo, mat);
      quad.renderOrder = 999;
      quad.frustumCulled = false; // siempre visible aunque la cámara mire otro lado
      quad.visible = false;
      xrScene.add(quad);
      log('quad de temperatura (filtro multiplicativo VR) creado');
      // Si ya hay temp activa (p.ej. ?temp= en URL), aplicar al quadro creado.
      if (activeTemp && PRESETS[activeTemp]) updateQuad(PRESETS[activeTemp]);
    } catch (e) { quad = null; warn('quad no creado:', e); }
  }

  function updateQuad(p) {
    if (!quad) return;
    try {
      var fh = p.filterHex || p.hexNum;   // 4000K usa blanco (neutro) en el filtro
      var c = lerpWhiteTo(fh, p.k);
      quad.material.color.setRGB(c.r, c.g, c.b);
      quad.visible = p.k > 0;
      log('filtro quad -> color', c.r.toFixed(3), c.g.toFixed(3), c.b.toFixed(3),
          '| visible:', quad.visible);
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

  // v17/v18: POLLING DE BOTONES en cada frame XR (mando X/Y + joystick clicks).
  //   X (buttons[4]) -> siguiente | Y (buttons[5]) -> anterior.
  //   Joystick click (buttons[2]): DERECHA -> siguiente | IZQUIERDA -> anterior.
  // Detecta flancos de subida (press nuevo) y registra el índice real de cada
  // botón pulsado (primeras 12 veces) para validar el mapeo en tu hardware.
  var prevButtons = {};   // handedness -> {indice: pressed}
  var btnLogCount = 0;
  var X_BTN = 4, Y_BTN = 5;   // índices X/Y (estándar WebXR)
  var STICK_BTN = 2;          // índice joystick click (estándar WebXR)

  function pollGamepadButtons() {
    var sources = xrSession.inputSources || [];
    for (var i = 0; i < sources.length; i++) {
      var src = sources[i];
      if (!src || !src.gamepad) continue;
      var hand = src.handedness || 'unknown';
      var btns = src.gamepad.buttons || [];
      var prev = prevButtons[hand] || {};
      for (var bi = 0; bi < btns.length; bi++) {
        var pressed = !!(btns[bi] && btns[bi].pressed);
        if (pressed && !prev[bi]) {
          if (btnLogCount < 12) {
            btnLogCount++;
            log('BOTON detectado -> mano:', hand, '| índice:', bi);
          }
          if (hand === 'left') {
            if (bi === X_BTN) { cycleTemp(1); }
            else if (bi === Y_BTN) { cycleTemp(-1); }
            else if (bi === STICK_BTN) { cycleTemp(-1); } // joystick izquierdo: anterior
          } else if (hand === 'right') {
            if (bi === STICK_BTN) { cycleTemp(1); }       // joystick derecho: siguiente
          }
        }
      }
      var next = {};
      for (var b2 = 0; b2 < btns.length; b2++) next[b2] = !!(btns[b2] && btns[b2].pressed);
      prevButtons[hand] = next;
    }
  }

  function xrTick(time, frame) {
    if (!xrSession) return;
    try {
      // v17: BOTONES X/Y del mando IZQUIERDO -> ciclo de temperatura.
      // X = buttons[4] -> siguiente | Y = buttons[5] -> anterior.
      // (Mapeo estándar WebXR; si en tu mando fueran otros índices, el log
      //  'BOTON detectado -> índice: N' lo revela y ajustamos las constantes.)
      pollGamepadButtons();

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
  // v19: acepta la sesión capturada por vr-compat (VRCOMPAT.getSession) —
  // getSession() de navigator.xr es API NO estándar y falla en el Quest.
  // ==========================================================================
  function onSessionStart() {
    if (xrSession) return; // blindaje: evitar doble registro de oyentes/rAF
    var sess = null;
    if (window.VRCOMPAT && typeof window.VRCOMPAT.getSession === 'function') {
      sess = window.VRCOMPAT.getSession();
    }
    if (!sess && navigator.xr && typeof navigator.xr.getSession === 'function') {
      try { sess = navigator.xr.getSession() || null; } catch (e) {}
    }
    if (!sess) {
      log('sesión XR aún no disponible (sin captura); reintentando en 250ms');
      setTimeout(onSessionStart, 250); // espera la promesa de requestSession
      return;
    }
    activateSession(sess);
  }

  function activateSession(sess) {
    if (xrSession) return;
    xrSession = sess;
    vrReady = false;
    log('SESION VR ACTIVA ✓ (sesión conectada)');
    xrSession.requestReferenceSpace('local').then(function (ref) {
      xrRefSpace = ref;
      log('refSpace XR lista');
    }).catch(function () {
      warn('local no disponible; intentando viewer');
      xrSession.requestReferenceSpace('viewer').then(function (ref) { xrRefSpace = ref; })
        .catch(function (e) { warn('sin refSpace:', e); });
    });

    xrSession.addEventListener('selectstart', onSelectStart);
    xrSession.addEventListener('squeezestart', onSqueezeStart); // v15: grip Quest
    xrSession.addEventListener('squeeze', onSqueezeStart);      // v16: variante de evento
    xrSession.requestAnimationFrame(xrTick);

    // v16: confirmación de entrada a VR + mandos detectados.
    var srcs = (xrSession.inputSources || []);
    log('mandos detectados:', srcs.length,
        srcs.map(function (s) { return s.handedness || '?'; }).join('+'));

    // v7: construir la UI VR de temperatura AL ENTRAR al casco:
    //  - Capa B: quad de filtro general (equivale al overlay CSS en VR)
    //  - VÍA 3: esferas de temperatura VR (respaldo garantizado a btn_*)
    // v8: si la escena interna aún no está lista, reintentar hasta 5 veces
    // (el viewer puede exponerla un poco después de entrar a la sesión).
    var tries = 0;
    function tryBuild() {
      if (!xrSession) return;
      if (ensureScene()) {
        buildQuad();
        buildTempSpheres();
        log('UI de temperatura VR construida');
      } else if (tries++ < 5) {
        setTimeout(tryBuild, 500);
      } else {
        warn('UI VR de temperatura NO construida (escena interna no encontrada)');
      }
    }
    tryBuild();
    log('sesión XR detectada; construyendo UI de temperatura VR');
  }

  function ensureScene() {
    if (xrScene) return true;
    if (!viewer) return false;
    // v20: primero la escena CAPTURADA por vr-compat (hook de render) — la
    // escena real, sin necesidad de deepFind.
    var cap = null;
    if (window.VRCOMPAT && typeof window.VRCOMPAT.getSceneCapture === 'function') {
      try { cap = window.VRCOMPAT.getSceneCapture(); } catch (e) {}
    }
    // v14: candidatos por nombre primero, luego BFS filtrado (profundidad 10).
    xrScene = cap || findSceneByCandidates() || deepFind(viewer, 10);
    if (!xrScene) {
      if (!SCENE_SCANNED) {
        SCENE_SCANNED = true;
        log('escena interna no accesible (no crítico): filtro shader y botones del editor siguen funcionando');
      }
      return false;
    }
    log('ensureScene -> escena interna encontrada');
    return true;
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

  // v15: CICLO DE TEMPERATURA POR GRIP DEL QUEST (gatillo lateral).
  //   grip DERECHO -> siguiente temperatura (2700→3000→4000→6000→6500→2700…)
  //   grip IZQUIERDO -> anterior.
  // Ya no depende de botones 3D en el editor.
  var lastSqueezeTs = 0;

  function onSqueezeStart(ev) {
    if (!xrSession) return;
    // v16: debounce — squeezestart y squeeze pueden dispararse ambos por
    // una sola presión del grip; ignoramos el segundo si llega < 350 ms.
    var now = Date.now();
    if (now - lastSqueezeTs < 350) return;
    lastSqueezeTs = now;
    var hand = ev && ev.inputSource && ev.inputSource.handedness;
    log('SQUEEZE (grip) recibido -> mano:', hand || 'desconocida');
    var dir = (hand === 'left') ? -1 : 1; // default: siguiente
    cycleTemp(dir);
  }

  function cycleTemp(dir) {
    var idx = activeTemp ? ORDER.indexOf(String(activeTemp)) : -1;
    if (idx === -1) idx = (dir > 0) ? -1 : 0; // arranque: siguiente → 2700; anterior → 6500
    idx = (idx + dir + ORDER.length) % ORDER.length;
    log('GRIP -> ciclando temperatura a', ORDER[idx], '(mano:', (dir > 0 ? 'derecha' : 'izquierda') + ')');
    applyTemp(ORDER[idx]);
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
  // TRABAJO LIGERO DIFERIDO (fix de carga en Quest, conservado de v6).
  // ensureScene (deepFind acotado) NO se ejecuta durante onSceneReadyToDisplay:
  // se programa para cuando el navegador esté libre (requestIdleCallback /
  // setTimeout 0) o en onSceneLoadComplete. v9: ya NO existe storeOriginals
  // (se eliminó la Capa A); solo se busca la escena para el quad/esferas VR.
  // ==========================================================================
  var heavyScheduled = false;

  function ensureReady() {
    if (heavyScheduled) return;
    heavyScheduled = true;
    log('ensureScene programada (diferido, para filtro/esferas VR)');
    if (typeof window.requestIdleCallback === 'function') {
      requestIdleCallback(function () { try { ensureScene(); } catch (e) { warn('ensureScene error:', e); } },
                          { timeout: 2000 });
    } else {
      setTimeout(function () { try { ensureScene(); } catch (e) { warn('ensureScene error:', e); } }, 0);
    }
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

    // v15: AGRESIVO — llamar setAllMaterialsEditable LO ANTES POSIBLE (aquí,
    // en scene-ready, en load-complete y antes de cada getEditableMaterials).
    // Si se llama tarde, getEditableMaterials devuelve 0 (tus logs de Quest).
    try { viewer.setAllMaterialsEditable(); } catch (e) { warn('setAllMaterialsEditable:', e); }

    try {
      viewer.onSceneReadyToDisplay(function () {
        try { viewer.setAllMaterialsEditable(); } catch (e) {}
        // v6+: SOLO trabajo ligero aquí (registro de oyentes).
        wireDomButtons();
        wireEditorButtons();
      });
    } catch (e) { warn('onSceneReadyToDisplay:', e); }

    try {
      viewer.onSceneLoadComplete(function () {
        log('onSceneLoadComplete -> programando ensureScene diferida');
        try { viewer.setAllMaterialsEditable(); } catch (e) {}
        ensureReady();
      });
    } catch (e) { warn('onSceneLoadComplete:', e); }

    // Fallback si ni onSceneReadyToDisplay ni onSceneLoadComplete disparan:
    // se programa igualmente la búsqueda de escena (arranque tardío).
    setTimeout(function () {
      if (!xrScene) {
        log('fallback 8s: programando ensureScene');
        ensureReady();
      }
    }, 8000);

    // PRUEBA DE AISLAMIENTO (v8): si la URL lleva ?temp=2700|3000|4000|6000|6500,
    // se aplica el filtro al cargar (sin tocar nada). Sirve para confirmar si
    // el PROBLEMA es la DETECCIÓN DE CLIC (filtro se ve) o el FILTRO mismo
    // (nada se ve, ni así).
    if (URL_TEMP && PRESETS[URL_TEMP]) {
      log('?temp=' + URL_TEMP + ' detectado -> aplicando filtro de aislamiento');
      applyTemp(URL_TEMP);
    }

    // v18: TECLADO DESKTOP (fallback para probar sin casco):
    //   X = siguiente temperatura | Y = anterior | T = reset (4000K neutro).
    // Solo actúa si el foco no está en un input (evita interferir con textos).
    try {
      document.addEventListener('keydown', function (e) {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        if (e.repeat) return;
        var k = (e.key || '').toLowerCase();
        if (k === 'x') { log('TECLADO: X -> siguiente'); cycleTemp(1); }
        else if (k === 'y') { log('TECLADO: Y -> anterior'); cycleTemp(-1); }
        else if (k === 't') { log('TECLADO: T -> reset neutral'); resetTemp(); }
      });
      log('teclado X/Y/T cableado (prueba desktop)');
    } catch (e) { warn('keydown no registrado:', e); }

    watchXR();

    // v20: VIGILANTE DE SESIÓN — si vr-compat ya capturó la sesión
    // (requestSession interceptada) pero el evento sessionstart no llegó a
    // este script, conectarse igual (si no, mandos/quad/esferas no arrancan).
    var sessTries = 0;
    var sessWatch = setInterval(function () {
      if (xrSession) { clearInterval(sessWatch); return; }
      var s = null;
      if (window.VRCOMPAT && typeof window.VRCOMPAT.getSession === 'function') {
        try { s = window.VRCOMPAT.getSession(); } catch (e) {}
      }
      if (s) { clearInterval(sessWatch); activateSession(s); }
      else if (++sessTries > 60) clearInterval(sessWatch);
    }, 1000);

    // v20/v24: cuando vr-compat capture la escena — re-sincronizar el filtro
    // Y construir el QUAD (vía primaria) si ya hay temperatura activa.
    if (window.VRCOMPAT && typeof window.VRCOMPAT.onSceneCapture === 'function') {
      window.VRCOMPAT.onSceneCapture(function () {
        log('aviso captura de escena (vr-compat) -> re-sincronizando filtro');
        patchMaterialsFilter();
        if (activeTemp && PRESETS[activeTemp]) {
          ensureFilterReady();
          if (quad) updateQuad(PRESETS[activeTemp]);
          setTimeout(function () { syncFilterColor(); }, 60);
        }
      });
    }
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
