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
    '2700': { color: '#ffb400', intensity: 0.55 },
    '3000': { color: '#ffde65', intensity: 0.25 },
    '4000': { color: '#ffffff', intensity: 0.50 },
    '6000': { color: '#b1e3fa', intensity: 0.50 }
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

    // Sliders - Enhanced with percentage labels and drag support
    const track = panel.querySelector(".vertical-slider-track");
    const thumb = panel.querySelector(".vertical-slider-thumb");
    const progress = panel.querySelector(".vertical-slider-progress");
    const labelDisplay = panel.querySelector(".current-view-percentage");
    const labelsContainer = panel.querySelector(".view-labels-container");

    // Generate percentage labels from 0% to 100%
    labelsContainer.innerHTML = '';
    for (let i = 0; i <= 10; i++) {
      const percent = i * 10;
      const label = document.createElement('div');
      label.className = 'view-label';
      label.textContent = `${percent}%`;
      label.style.bottom = `${percent}%`;
      label.style.transform = 'translateY(50%)';
      labelsContainer.appendChild(label);
    }

    let currentPercent = 0; // Start at 0%

    const updateSliderUI = (percent) => {
      const p = Math.max(0, Math.min(100, percent));
      currentPercent = p;
      thumb.style.bottom = `${p}%`;
      progress.style.height = `${p}%`;

      // Update active label
      const allLabels = labelsContainer.querySelectorAll('.view-label');
      allLabels.forEach(lbl => lbl.classList.remove('active'));
      const nearestLabelIndex = Math.round(p / 10);
      if (allLabels[nearestLabelIndex]) {
        allLabels[nearestLabelIndex].classList.add('active');
      }

      // Map to nearest view index
      const index = Math.round((p / 100) * (zone.viewLabels.length - 1));
      labelDisplay.innerText = zone.viewLabels[index] || '0%';
    };

    const switchToNearestView = (percent) => {
      const idx = Math.round((percent / 100) * (zone.sliderViews.length - 1));
      if (zone.sliderViews[idx]) {
        viewer.switchToView(zone.sliderViews[idx]);
   
