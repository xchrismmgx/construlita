/**
 * ============================================================================
 *  VR-COMPAT para Shapespark — WebXR (Meta Quest 2/3/Pro)
 * ============================================================================
 *  En VR genera ESFERAS 3D propias (no dependen de extensiones del editor)
 *  que CAMBIAN DE VISTA/INTENSIDAD al clicar:
 *    - Una esfera por cada intensidad de la ZONA ACTIVA (10%,40%,60%,80%,100%)
 *      -> viewer.switchToView(nombreDeVista, 0)  (0 = instantáneo).
 *  La temperatura (tinte/LUT) queda del lado del Material Picker nativo de
 *  Shapespark, cuyas esferas son 3D y también visibles en VR.
 *
 *  Principios:
 *   - NO toca desktop/móvil: solo se activa en sesión XR ('sessionstart').
 *   - API verificada: WALK.getViewer(), viewer.switchToView(name,0),
 *     viewer.onSceneReadyToDisplay(), viewer.onViewSwitchDone().
 *   - La escena Three.js interna se obtiene por feature detection; si no
 *     aparece, se degrada con diagnóstico (sin romper nada).
 *
 *  Integración (body-end.html, DESPUÉS del script principal):
 *    <script src="extra-assets/vr-compat.js?v=5"></script>
 * ============================================================================
 */
(function () {
  'use strict';

  var TAG = '[VR-COMPAT]';

  function log() { console.log.apply(console, [TAG].concat(Array.prototype.slice.call(arguments))); }
  function warn() { console.warn.apply(console, [TAG].concat(Array.prototype.slice.call(arguments))); }

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
  // ==========================================================================
  var SKIP_KEYS = { canvas: 1, domElement: 1, gl: 1, parent: 1, parentNode: 1,
                    parentElement: 1, children: 1, document: 1, window: 1 };

  function deepFind(root, predicate, visited, depth) {
    if (!root || typeof root !== 'object' || depth > 4 || visited.has(root)) return null;
    visited.add(root);
    try { if (predicate(root)) return root; } catch (e) {}
    var keys;
    try { keys = Object.getOwnPropertyNames(root); } catch (e) { return null; }
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (SKIP_KEYS[k]) continue;
      var v;
      try { v = root[k]; } catch (e) { continue; }
      if (v && typeof v === 'object') {
        var f = deepFind(v, predicate, visited, depth + 1);
        if (f) return f;
      }
    }
    return null;
  }

  function probeEngine() {
    if (!viewer) return false;
    try { xrScene = deepFind(viewer, function (o) { return o.isScene === true; }, new Set(), 0); }
    catch (e) { xrScene = null; }
    if (xrScene) { log('Escena interna detectada OK'); return true; }
    warn('No se pudo acceder a la escena Three.js interna. UI VR desactivada en el casco.');
    return false;
  }

  function getTHREE() { return window.THREE || null; }

  // ==========================================================================
  // ESFERAS CREADAS EN EL EDITOR (Camino A).
  // Cada esfera que TÚ creas en Shapespark debe tener el TYPE (tipo de nodo)
  // igual al nombre de su vista destino, p.ej. 'sala_60'. Al clicar, el viewer
  // dispara onNodeTypeClicked y hacemos switchToView(type, 0).
  // Nota B06: .type es la propiedad documentada; .name no está en el README.
  // ==========================================================================
  function wireEditorSpheres() {
    if (!viewer || !viewer.onNodeTypeClicked) {
      warn('onNodeTypeClicked no disponible; esferas del editor no cableadas.');
      return;
    }
    viewer.onNodeTypeClicked(function (node, point, distance) {
      if (!node) return;
      // Busca el nombre de vista en el nodo clicado y en sus ancestros
      // (por si la esfera es hija de un grupo con el nombre de la vista).
      var found = null;
      var cur = node;
      for (var depth = 0; cur && depth < 8; depth++) {
        var id = cur.type || cur.name || null;
        if (id && INTENSITY_VIEWS[id]) { found = id; break; }
        cur = cur.parent || null;
      }
      if (found) {
        log('Esfera pulsada -> vista:', found);
        viewer.switchToView(found, 0);
      }
    });
    log('Esferas del editor cableadas vía onNodeTypeClicked (type/name = nombre de vista).');
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
    if (n === 0) { log('Zona sin vistas de intensidad; no se crean esferas.'); return false; }

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
    if (!pose) return;
    var m = pose.transform.matrix;
    var ox = m[3], oy = m[7], oz = m[11];
    var dx = -m[2], dy = -m[6], dz = -m[10];
    var hit = raycastSpheres(ox, oy, oz, dx, dy, dz);
    if (!hit) return;
    handleSphere(hit.sphere);
  }

  function handleSphere(s) {
    if (!s || !s.view) return;
    log('Esfera -> switchToView:', s.view);
    viewer.switchToView(s.view, 0); // 0 = instantáneo
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
    xrSession = (navigator.xr.getSession && navigator.xr.getSession()) || null;
    log('Sesión WebXR iniciada. session=', !!xrSession);
    if (!xrScene && !probeEngine()) return;
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

    viewer.onSceneReadyToDisplay(function () {
      wireEditorSpheres(); // esferas creadas por ti en el editor (type = vista)
      watchXR();
    });

    try {
      viewer.onViewSwitchDone(function (viewName) {
        activeZone = null;
        ZONES_CONFIG.forEach(function (z) {
          if (z.triggerViews.indexOf(viewName) !== -1) activeZone = z;
        });
        if (vr.ready && xrScene) buildVRSpheres(); // reconstruye por zona
      });
    } catch (e) {}
  }

  window.VRCOMPAT = {
    state: function () {
      return { viewer: !!viewer, scene: !!xrScene, session: !!xrSession,
               vrReady: vr.ready, zone: activeZone && activeZone.title };
    },
    labels: VRLABELS,
    sceneOffset: SCENE_OFFSET,
    forceBuild: function () { if (xrScene && !vr.ready) buildVRSpheres(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
