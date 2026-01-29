/**
 * IMPLEMENTACIÓN API SHAPESPARK - ACTUALIZADO PARA EXTRA-ASSETS
 * Este script gestiona la edición de materiales y la UI personalizada.
 */
document.addEventListener("DOMContentLoaded", () => {
  let viewer = null;

  // Factor de intensidad para el cálculo de Kelvin a RGB
  const GLOBAL_COLOR_INTENSITY = 0.5;

  // Configuración de Zonas (Misma lógica anterior para no romper funcionalidad)
  const ZONES_CONFIG = [
    {
      panelHtmlId: "container-sala",
      triggerViews: ["panel_sala", "sala_10", "sala_40", "sala_60", "sala_80", "sala_100"],
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
      triggerViews: ["panel_decorativas", "deco_10", "deco_40", "deco_60", "deco_80", "deco_100"],
      materials: [], // No controla materiales - el LUT es global
      sliderViews: ["deco_10", "deco_40", "deco_60", "deco_80", "deco_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      panelHtmlId: "container-trabajo",
      triggerViews: ["panel_luz_trabajo", "trab_10", "trab_40", "trab_60", "trab_80", "trab_100"],
      materials: [],
      sliderViews: ["trab_10", "trab_40", "trab_60", "trab_80", "trab_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      panelHtmlId: "container-ambiental",
      triggerViews: ["panel_luz_ambiental", "amb_10", "amb_40", "amb_60", "amb_80", "amb_100"],
      materials: [],
      sliderViews: ["amb_10", "amb_40", "amb_60", "amb_80", "amb_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      panelHtmlId: "container-lineal",
      triggerViews: ["panel_iluminacíon_lineal", "lineal_10", "lineal_40", "lineal_60", "lineal_80", "lineal_100"],
      materials: [],
      sliderViews: ["lineal_10", "lineal_40", "lineal_60", "lineal_80", "lineal_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      panelHtmlId: "container-texturas",
      triggerViews: ["panel_texturas", "text_10"],
      materials: [],
      sliderViews: ["text_10"],
      viewLabels: ["10%"]
    },
    {
      panelHtmlId: "container-grazer",
      triggerViews: ["panel_grazer", "graz_10", "graz_40", "graz_60", "graz_80", "graz_100"],
      materials: [],
      sliderViews: ["graz_10", "graz_40", "graz_60", "graz_80", "graz_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      panelHtmlId: "container-integracion",
      triggerViews: ["panel_integracion", "int_10", "int_40", "int_60", "int_80", "int_100"],
      materials: [],
      sliderViews: ["int_10", "int_40", "int_60", "int_80", "int_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      panelHtmlId: "container-acento",
      triggerViews: ["panel_acento", "ace_10", "ace_40", "ace_60", "ace_80", "ace_100"],
      materials: [],
      sliderViews: ["ace_10", "ace_40", "ace_60", "ace_80", "ace_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      panelHtmlId: "container-decorativas-general",
      triggerViews: ["panel_decorativas_general", "deco_g_10", "deco_g_40", "deco_g_60", "deco_g_80", "deco_g_100"],
      materials: [],
      sliderViews: ["deco_g_10", "deco_g_40", "deco_g_60", "deco_g_80", "deco_g_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      panelHtmlId: "container-resaltar-objetos",
      triggerViews: ["panel_resaltar_objetos", "res_10", "res_40", "res_60", "res_80", "res_100"],
      materials: [],
      sliderViews: ["res_10", "res_40", "res_60", "res_80", "res_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    }
  ];

  const originalMaterials = {};

  // --- Utilidades de Color ---
  const kelvinToRGB = (kelvin) => {
    let temp = kelvin / 100;
    let r, g, b;

    if (temp <= 66) {
      r = 255;
      g = temp;
      g = 99.4708025861 * Math.log(g) - 161.1195681661;
      if (temp <= 19) {
        b = 0;
      } else {
        b = temp - 10;
        b = 138.5177312231 * Math.log(b) - 305.0447927307;
      }
    } else {
      r = temp - 60;
      r = 329.698727446 * Math.pow(r, -0.1332047592);
      g = temp - 60;
      g = 288.1221695283 * Math.pow(g, -0.0755148492);
      b = 255;
    }

    const clamp = (v) => Math.min(255, Math.max(0, v)) / 255;
    return { r: clamp(r), g: clamp(g), b: clamp(b) };
  };

  // --- Gestión de Materiales ---
  const storeOriginalMaterialStates = () => {
    ZONES_CONFIG.forEach(zone => {
      zone.materials.forEach(matName => {
        const mat = viewer.findMaterial(matName);
        if (mat && !originalMaterials[matName]) {
          originalMaterials[matName] = {
            baseColor: mat.baseColor.clone(),
            baseColorTexture: mat.baseColorTexture
          };
        }
      });
    });
  };

  const applyTemperatureToZone = (zone, kelvin) => {
    const rgb = kelvinToRGB(kelvin);
    zone.materials.forEach(matName => {
      const mat = viewer.findMaterial(matName);
      if (mat) {
        mat.baseColor.setRGB(
          rgb.r * GLOBAL_COLOR_INTENSITY,
          rgb.g * GLOBAL_COLOR_INTENSITY,
          rgb.b * GLOBAL_COLOR_INTENSITY
        );
        viewer.requestFrame();
      }
    });
  };

  // --- UI & Eventos ---
  const updatePanelVisibility = (viewName) => {
    ZONES_CONFIG.forEach(zone => {
      const panel = document.getElementById(zone.panelHtmlId);
      if (zone.triggerViews.includes(viewName)) {
        panel.style.display = "block";
      } else {
        panel.style.display = "none";
      }
    });
  };

  const initializePanelComponents = (zone) => {
    const panel = document.getElementById(zone.panelHtmlId);
    if (!panel) return;

    // Botones de Temperatura
    panel.querySelectorAll(".temp-btn").forEach(btn => {
      btn.onclick = () => {
        const temp = btn.dataset.temp;
        // Notificar al padre (Webflow) para que gestione el LUT
        if (window.parent !== window) {
          window.parent.postMessage({ type: 'TEMP_CLICKED', temp: temp }, '*');
        }
        // Mantener la funcionalidad actual de materiales si se desea
        applyTemperatureToZone(zone, parseInt(temp));
      };
    });

    // Botón Cerrar
    panel.querySelector(".close-panel-btn").onclick = () => {
      panel.style.display = "none";
    };

    // Botón Reset
    panel.querySelector(".reset-btn").onclick = () => {
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'RESET_TEMP' }, '*');
      }
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
        span.dataset.viewIndex = index; // Para CSS específico
        // Calcular posición: 0% abajo, 100% arriba
        const pct = (index / (zone.viewLabels.length - 1)) * 100;
        span.style.bottom = `${pct}%`;
        labelsContainer.appendChild(span);
      });
    }

    // Lógica de Sliders (Cámaras/Vistas)
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
      updateSliderUI(p);
      const viewIndex = Math.round((p / 100) * (zone.sliderViews.length - 1));
      viewer.switchToView(zone.sliderViews[viewIndex]);
    };
  };

  // --- Inicialización Principal ---
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
        ZONES_CONFIG.forEach(zone => initializePanelComponents(zone));
      });

      viewer.onViewSwitchDone((viewName) => {
        updatePanelVisibility(viewName);
      });

      // --- Sistema de Overlay para Temperatura (Alternativa a LUT) ---
      const overlay = document.createElement('div');
      overlay.id = 'temp-overlay';
      Object.assign(overlay.style, {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999,
        mixBlendMode: 'color', // 'color' o 'soft-light' para un efecto natural
        transition: 'background-color 0.5s ease, opacity 0.5s ease',
        opacity: 0
      });
      document.body.appendChild(overlay);

      const TEMP_COLORS = {
        '2700': { color: '#ffb400', intensity: 0.55 },
        '3000': { color: '#ffde65', intensity: 0.25 },
        '4000': { color: '#ffffff', intensity: 0.50 },
        '6000': { color: '#b1e3fa', intensity: 0.50 }
      };

      const applyOverlay = (temp) => {
        const config = TEMP_COLORS[temp];
        if (config) {
          overlay.style.backgroundColor = config.color;
          overlay.style.opacity = config.intensity;
        }
      };

      // --- Manejo de mensajes del Padre (Webflow) ---
      window.addEventListener('message', (event) => {
        if (event.data.type === 'TEMP_CLICKED') {
          applyOverlay(event.data.temp);
        } else if (event.data.type === 'RESET_TEMP') {
          overlay.style.opacity = 0;
        }
      });

    } catch (e) {
      console.error("Error inicializando API Shapespark:", e);
    }
  };

  i
