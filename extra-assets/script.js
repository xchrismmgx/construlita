document.addEventListener("DOMContentLoaded", () => {
  let viewer = null;
  const GLOBAL_COLOR_INTENSITY = 0.5;

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

  const kelvinToRGB = (kelvin) => {
    let temp = kelvin / 100;
    let r, g, b;
    if (temp <= 66) {
      r = 255;
      g = 99.4708025861 * Math.log(temp) - 161.1195681661;
      b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
    } else {
      r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
      g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
      b = 255;
    }
    const clamp = (v) => Math.min(255, Math.max(0, v)) / 255;
    return { r: clamp(r), g: clamp(g), b: clamp(b) };
  };

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

  const applyTemperatureToZone = (zone, kelvin) => {
    const rgb = kelvinToRGB(kelvin);
    zone.materials.forEach(matName => {
      const mat = viewer.findMaterial(matName);
      if (mat) {
        mat.baseColor.setRGB(rgb.r * GLOBAL_COLOR_INTENSITY, rgb.g * GLOBAL_COLOR_INTENSITY, rgb.b * GLOBAL_COLOR_INTENSITY);
        viewer.requestFrame();
      }
    });
  };

  const updatePanelVisibility = (viewName) => {
    ZONES_CONFIG.forEach(zone => {
      const panel = document.getElementById(zone.panelHtmlId);
      if (panel) panel.style.display = zone.triggerViews.includes(viewName) ? "block" : "none";
    });
  };

  const initializePanelComponents = (zone) => {
    const panel = document.getElementById(zone.panelHtmlId);
    if (!panel) return;

    panel.querySelectorAll(".temp-btn").forEach(btn => {
      btn.onclick = () => {
        const temp = btn.dataset.temp;
        applyOverlay(temp);
        applyTemperatureToZone(zone, parseInt(temp));
      };
    });

    panel.querySelector(".close-panel-btn").onclick = () => panel.style.display = "none";

    panel.querySelector(".reset-btn").onclick = () => {
      overlay.style.opacity = 0;
      zone.materials.forEach(matName => {
        const mat = viewer.findMaterial(matName);
        const orig = originalMaterials[matName];
        if (mat && orig) {
          mat.baseColor.copy(orig.baseColor);
          viewer.requestFrame();
        }
      });
    };

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
      viewer.switchToView(zone.sliderViews[Math.round((p / 100) * (zone.sliderViews.length - 1))]);
    };
  };

  const overlay = document.createElement('div');
  overlay.id = 'temp-overlay';
  Object.assign(overlay.style, {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: 9999, mixBlendMode: 'color',
    transition: 'background-color 0.5s ease, opacity 0.5s ease', opacity: 0
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

  const WALK = window.WALK || {};
  const init = () => {
    viewer = WALK.getViewer();
    if (!viewer) { setTimeout(init, 100); return; }
    viewer.setAllMaterialsEditable();
    viewer.onSceneReadyToDisplay(() => {
      storeOriginalMaterialStates();
      ZONES_CONFIG.forEach(z => initializePanelComponents(z));
    });
    viewer.onViewSwitchDone(updatePanelVisibility);
  };
  init();
});
