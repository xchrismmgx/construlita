/**
 * IMPLEMENTACIÓN API SHAPESPARK + TINTADO CSS
 * Este script gestiona materiales y aplica un filtro de color global.
 */
document.addEventListener("DOMContentLoaded", () => {
  let viewer = null;
  const GLOBAL_COLOR_INTENSITY = 0.5;

  // Configuración de Zonas
  const ZONES_CONFIG = [
    {
      panelHtmlId: "container-sala",
      triggerViews: ["sala_de_descanso", "sala de descanso", "sala_10", "sala_40", "sala_60", "sala_80", "sala_100"],
      materials: ["*40", "*50", "*60", "*70", "*80", "Aluminio", "mesita sala", "*30", "arte cuadro 2", "Concrete Bare Cast Murral"],
      sliderViews: ["sala_10", "sala_40", "sala_60", "sala_80", "sala_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      panelHtmlId: "container-cocina",
      triggerViews: ["panel_cocina", "cocina_diez", "cocina_cuarenta", "cocina_sesenta", "cocina_ochenta", "cocina_cien"],
      materials: ["*11", "*12", "*13", "*14", "piso cocina", "mueble cocina"],
      sliderViews: ["cocina_diez", "cocina_cuarenta", "cocina_sesenta", "cocina_ochenta", "cocina_cien"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      panelHtmlId: "container-cuarto",
      triggerViews: ["panel_cuarto", "cuarto_10", "cuarto_40", "cuarto_80"],
      materials: ["*21", "*22", "cama", "pared cuarto"],
      sliderViews: ["cuarto_10", "cuarto_40", "cuarto_80"],
      viewLabels: ["10%", "40%", "80%"]
    },
    {
      panelHtmlId: "container-decorativas",
      triggerViews: ["coworking_marketing", "deco_10", "deco_40", "deco_60", "deco_80", "deco_100"],
      materials: [], // No controla materiales - el LUT es global
      sliderViews: ["deco_10", "deco_40", "deco_60", "deco_80", "deco_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      panelHtmlId: "container-trabajo",
      triggerViews: ["coworking_diseño", "trab_10", "trab_40", "trab_60", "trab_80", "trab_100"],
      materials: [],
      sliderViews: ["trab_10", "trab_40", "trab_60", "trab_80", "trab_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      panelHtmlId: "container-ambiental",
      triggerViews: ["sala_de_juntas", "sala de juntas", "amb_10", "amb_40", "amb_60", "amb_80", "amb_100"],
      materials: [],
      sliderViews: ["amb_10", "amb_40", "amb_60", "amb_80", "amb_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      panelHtmlId: "container-lineal",
      triggerViews: ["oficina_contabilidad", "lineal_10", "lineal_40", "lineal_60", "lineal_80", "lineal_100"],
      materials: [],
      sliderViews: ["lineal_10", "lineal_40", "lineal_60", "lineal_80", "lineal_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      panelHtmlId: "container-texturas",
      triggerViews: ["privado_2", "text_10", "text_40", "text_60", "text_80", "text_100"],
      materials: [],
      sliderViews: ["text_10", "text_40", "text_60", "text_80", "text_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      panelHtmlId: "container-grazer",
      triggerViews: ["circulacion_vertical", "graz_10", "graz_40", "graz_60", "graz_80", "graz_100"],
      materials: [],
      sliderViews: ["graz_10", "graz_40", "graz_60", "graz_80", "graz_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      panelHtmlId: "container-integracion",
      triggerViews: ["privado_1", "int_10", "int_40", "int_60", "int_80", "int_100"],
      materials: [],
      sliderViews: ["int_10", "int_40", "int_60", "int_80", "int_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      panelHtmlId: "container-acento",
      triggerViews: ["sala_espera", "ace_10", "ace_40", "ace_60", "ace_80", "ace_100"],
      materials: [],
      sliderViews: ["ace_10", "ace_40", "ace_60", "ace_80", "ace_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      panelHtmlId: "container-decorativas-general",
      triggerViews: ["coworking_administrativo", "deco_g_10", "deco_g_40", "deco_g_60", "deco_g_80", "deco_g_100"],
      materials: [],
      sliderViews: ["deco_g_10", "deco_g_40", "deco_g_60", "deco_g_80", "deco_g_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      panelHtmlId: "container-resaltar-objetos",
      triggerViews: ["acentos_verticales", "res_10", "res_40", "res_60", "res_80", "res_100"],
      materials: [],
      sliderViews: ["res_10", "res_40", "res_60", "res_80", "res_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    }
  ];

  const originalMaterials = {};

  // --- Sistema de Overlay (Tinte de Color) ---
  const overlay = document.createElement('div');
  overlay.id = 'global-temp-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: 9999,
    mixBlendMode: 'color',
    transition: 'background-color 0.8s ease, opacity 0.8s ease',
    opacity: 0
  });
  document.body.appendChild(overlay);

  const TEMP_CONFIG = {
    '2700': { color: '#fed360', intensity: 0.40 },
    '3000': { color: '#ffe174ff', intensity: 0.25 },
    '4000': { color: '#ffffff', intensity: 0.50 },
    '6000': { color: '#c1e7f8ff', intensity: 0.30 }
  };

  const applyColorEffect = (temp) => {
    const cfg = TEMP_CONFIG[temp];
    if (cfg) {
      overlay.style.backgroundColor = cfg.color;
      overlay.style.opacity = cfg.intensity;
    }
  };

  // --- Gestión de Materiales ---
  const storeOriginalMaterialStates = () => {
    ZONES_CONFIG.forEach(zone => {
      zone.materials.forEach(matName => {
        const mat = viewer.findMaterial(matName);
        if (mat && !originalMaterials[matName]) {
          originalMaterials[matName] = { baseColor: mat.baseColor.clone() };
        }
      });
    });
  };

  const updatePanelVisibility = (viewName) => {
    console.log("Vista activa:", viewName); // Debug para nombres exactos
    ZONES_CONFIG.forEach(zone => {
      const panel = document.getElementById(zone.panelHtmlId);
      if (panel) {
        panel.style.display = zone.triggerViews.includes(viewName) ? "block" : "none";
      }
    });
  };

  const initializePanelComponents = (zone) => {
    const panel = document.getElementById(zone.panelHtmlId);
    if (!panel) return;

    panel.querySelectorAll(".temp-btn").forEach(btn => {
      btn.onclick = () => {
        const temp = btn.dataset.temp;
        applyColorEffect(temp); // Aplicar tinte global
      };
    });

    panel.querySelector(".close-panel-btn").onclick = () => panel.style.display = "none";

    panel.querySelector(".reset-btn").onclick = () => {
      overlay.style.opacity = 0; // Quitar tinte
      zone.materials.forEach(matName => {
        const mat = viewer.findMaterial(matName);
        const orig = originalMaterials[matName];
        if (mat && orig) {
          mat.baseColor.copy(orig.baseColor);
          viewer.requestFrame();
        }
      });
    };

    // GENERAR ETIQUETAS DE PORCENTAJE (LABELS)
    const labelsContainer = panel.querySelector(".view-labels-container");
    if (labelsContainer) {
      labelsContainer.innerHTML = ""; // Limpiar
      zone.viewLabels.forEach((label, index) => {
        const span = document.createElement("div");
        span.className = "view-label";
        span.innerText = label;
        // Calcular posición: 0% abajo, 100% arriba
        const pct = (index / (zone.viewLabels.length - 1)) * 100;
        span.style.bottom = `${pct}%`;
        labelsContainer.appendChild(span);
      });
    }

    // Sliders
    const track = panel.querySelector(".vertical-slider-track");
    const thumb = panel.querySelector(".vertical-slider-thumb");
    const progress = panel.querySelector(".vertical-slider-progress");
    const labelDisplay = panel.querySelector(".current-view-percentage");

    const updateSliderUI = (percent) => {
      const p = Math.max(0, Math.min(100, percent));
      thumb.style.bottom = `${p}%`;
      progress.style.height = `${p}%`;
      const index = Math.round((p / 100) * (zone.viewLabels.length - 1));
      labelDisplay.innerText = zone.viewLabels[index];
    };

    track.onclick = (e) => {
      const rect = track.getBoundingClientRect();
      const p = ((rect.bottom - e.clientY) / rect.height) * 100;

      const count = zone.sliderViews.length;
      const idx = Math.round((p / 100) * (count - 1));
      const safeIdx = Math.max(0, Math.min(count - 1, idx));

      // Calcular posición ajustada al paso (snap)
      const snappedP = (safeIdx / (count - 1)) * 100;

      updateSliderUI(snappedP);
      viewer.switchToView(zone.sliderViews[safeIdx]);
    };

    // Inicializar slider en 100% por defecto
    updateSliderUI(100);
  };

  // --- Inicialización ---
  const WALK = window.WALK || {};
  const init = () => {
    try {
      viewer = WALK.getViewer();
      if (!viewer) {
        setTimeout(init, 100);
        return;
      }
      viewer.setAllMaterialsEditable();
      viewer.onSceneReadyToDisplay(() => {
        storeOriginalMaterialStates();
        ZONES_CONFIG.forEach(initializePanelComponents);
      });
      viewer.onViewSwitchDone(updatePanelVisibility);

      // ACTIVAR PROTECCIONES SOLO DESPUÉS DE QUE SHAPESPARK CARGUE
      viewer.onSceneReadyToDisplay(() => {
        activateProtections();
      });
    } catch (e) {
      console.error("Error en script Shapespark:", e);
    }
  };

  // --- Protecciones contra Inspector ---
  const activateProtections = () => {
    console.log("🔒 Protecciones activadas");

    // Desactivar click derecho
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      return false;
    }, false);

    // Desactivar teclas de desarrollador
    document.addEventListener('keydown', (e) => {
      // F12 - Inspector
      if (e.key === 'F12') {
        e.preventDefault();
        return false;
      }

      // Ctrl+Shift+I - Inspector
      if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        return false;
      }

      // Ctrl+Shift+J - Consola
      if (e.ctrlKey && e.shiftKey && e.key === 'J') {
        e.preventDefault();
        return false;
      }

      // Ctrl+U - Ver código fuente
      if (e.ctrlKey && e.key === 'u') {
        e.preventDefault();
        return false;
      }

      // Ctrl+Shift+C - Selector de elementos
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        return false;
      }

      // F11 - Pantalla completa (opcional, descomenta si lo necesitas)
      // if (e.key === 'F11') {
      //   e.preventDefault();
      //   return false;
      // }
    }, false);

    // Detectar si las DevTools están abiertas
    const detectDevTools = () => {
      const threshold = 160;
      const widthThreshold = window.outerWidth - window.innerWidth > threshold;
      const heightThreshold = window.outerHeight - window.innerHeight > threshold;

      if (widthThreshold || heightThreshold) {
        console.log("⚠️ DevTools detectadas");
        // Opcional: puedes agregar acciones adicionales aquí
        // Por ejemplo: document.body.innerHTML = "";
      }
    };

    // Verificar periódicamente
    setInterval(detectDevTools, 1000);

    // Desactivar selección de texto (opcional)
    document.addEventListener('selectstart', (e) => {
      e.preventDefault();
      return false;
    }, false);

    // Desactivar arrastrar y soltar (opcional)
    document.addEventListener('dragstart', (e) => {
      e.preventDefault();
      return false;
    }, false);
  };

  init();
});
