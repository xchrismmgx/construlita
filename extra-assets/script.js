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
        // Mantener la funcionalidad actual de materiales si se desea, 
        // o comentarla si el LUT será el único método de color.
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
        '2700': { color: '#ff8a00', intensity: 0.10 },
        '3000': { color: '#ffb400', intensity: 0.20 },
        '4000': { color: '#ffffff', intensity: 0.50 },
        '6000': { color: '#0070ff', intensity: 0.95 }
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
  init();
});
