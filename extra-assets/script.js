/**
 * IMPLEMENTACIÓN API SHAPESPARK + TINTADO CSS
 * Lógica consolidada para temperatura y sliders de intensidad.
 */
document.addEventListener("DOMContentLoaded", () => {
  let viewer = null;
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
      materials: [],
      sliderViews: ["deco_10", "deco_40", "deco_60", "deco_80", "deco_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    }
  ];

  const originalMaterials = {};
  const TEMP_CONFIG = {
    '2700': { color: '#ffb400', intensity: 0.55 },
    '3000': { color: '#ffde65', intensity: 0.25 },
    '4000': { color: '#ffffff', intensity: 0.50 },
    '6000': { color: '#b1e3fa', intensity: 0.50 }
  };

  // --- Sistema de Overlay (Tinte de Color) ---
  const overlay = document.createElement('div');
  overlay.id = 'global-temp-overlay';
  Object.assign(overlay.style, {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: 9999, mixBlendMode: 'color',
    transition: 'background-color 0.8s ease, opacity 0.8s ease', opacity: 0
  });
  document.body.appendChild(overlay);

  const applyColorEffect = (temp) => {
    const cfg = TEMP_CONFIG[temp];
    if (cfg) {
      overlay.style.backgroundColor = cfg.color;
      overlay.style.opacity = cfg.intensity;
    }
  };

  const updatePanelVisibility = (v) => {
    ZONES_CONFIG.forEach(z => {
      const p = document.getElementById(z.panelHtmlId);
      if (p) p.style.display = z.triggerViews.includes(v) ? "block" : "none";
    });
  };

  // --- Draggable Slider Logic (Centralized) ---
  let activeDrag = null;

  const initializePanelComponents = (zone) => {
    const panel = document.getElementById(zone.panelHtmlId);
    if (!panel) return;

    panel.querySelectorAll(".temp-btn").forEach(b => {
      b.onclick = () => applyColorEffect(b.dataset.temp);
    });

    panel.querySelector(".close-panel-btn").onclick = () => panel.style.display = "none";
    panel.querySelector(".reset-btn").onclick = () => {
      overlay.style.opacity = 0;
      updateSlider(zone, 0); // Reset slider position to 0%
    };

    const track = panel.querySelector(".vertical-slider-track");
    const thumb = panel.querySelector(".vertical-slider-thumb");
    const progress = panel.querySelector(".vertical-slider-progress");
    const labelDisplay = panel.querySelector(".current-view-percentage");
    const labelsContainer = panel.querySelector(".view-labels-container");

    // Generate labels
    labelsContainer.innerHTML = '';
    for (let i = 0; i <= 10; i++) {
      const p = i * 10;
      const l = document.createElement('div');
      l.className = 'view-label'; l.textContent = `${p}%`;
      l.style.bottom = `${p}%`; l.style.transform = 'translateY(50%)';
      labelsContainer.appendChild(l);
    }

    const updateSlider = (z, p) => {
      p = Math.max(0, Math.min(100, p));
      thumb.style.bottom = `${p}%`;
      progress.style.height = `${p}%`;

      const allL = labelsContainer.querySelectorAll('.view-label');
      allL.forEach(lbl => lbl.classList.remove('active'));
      const nearest = Math.round(p / 10);
      if (allL[nearest]) allL[nearest].classList.add('active');

      const idx = Math.round((p / 100) * (z.viewLabels.length - 1));
      labelDisplay.innerText = z.viewLabels[idx] || '0%';
      return p;
    };

    const switchToNearest = (z, p) => {
      const idx = Math.round((p / 100) * (z.sliderViews.length - 1));
      if (z.sliderViews[idx]) WALK.getViewer().switchToView(z.sliderViews[idx]);
    };

    track.onclick = (e) => {
      const r = track.getBoundingClientRect();
      const p = updateSlider(zone, ((r.bottom - e.clientY) / r.height) * 100);
      switchToNearest(zone, p);
    };

    thumb.onmousedown = (e) => {
      activeDrag = { zone, track, updateSlider, switchToNearest, currentP: 0 };
      e.preventDefault();
    };

    updateSlider(zone, 0); // Init at 0%
  };

  // Global Drag Events
  document.addEventListener('mousemove', (e) => {
    if (!activeDrag) return;
    const r = activeDrag.track.getBoundingClientRect();
    activeDrag.currentP = activeDrag.updateSlider(activeDrag.zone, ((r.bottom - e.clientY) / r.height) * 100);
  });

  document.addEventListener('mouseup', () => {
    if (!activeDrag) return;
    activeDrag.switchToNearest(activeDrag.zone, activeDrag.currentP);
    activeDrag = null;
  });

  // Message listener for external control
  window.addEventListener('message', (e) => {
    if (e.data.type === 'TEMP_CLICKED') applyColorEffect(e.data.temp);
    if (e.data.type === 'RESET_TEMP') overlay.style.opacity = 0;
  });

  const WALK = window.WALK || {};
  const init = () => {
    const v = (typeof WALK.getViewer === 'function') ? WALK.getViewer() : null;
    if (!v) { setTimeout(init, 100); return; }
    v.setAllMaterialsEditable();
    v.onSceneReadyToDisplay(() => ZONES_CONFIG.forEach(initializePanelComponents));
    v.onViewSwitchDone(updatePanelVisibility);
  };
  i
