/**
 * IMPLEMENTACIÓN API SHAPESPARK + TINTADO CSS + JOYSTICKS (REFACTORIZADO)
 * Este script gestiona materiales, aplica un filtro de color global y navegación por joystick.
 * Refactorizado usando enfoque de eventos de teclado para mayor compatibilidad.
 */
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

  const overlay = document.createElement('div');
  overlay.id = 'global-temp-overlay';
  Object.assign(overlay.style, {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: 9999, mixBlendMode: 'color',
    transition: 'background-color 0.8s ease, opacity 0.8s ease', opacity: 0
  });
  document.body.appendChild(overlay);

  const TEMP_CONFIG = {
    '2700': { color: '#fea32c', intensity: 0.40 },
    '3000': { color: '#ffde65', intensity: 0.20 },
    '4000': { color: '#ffffff', intensity: 0.50 },
    '6000': { color: '#90dffe', intensity: 0.50 }
  };

  const applyColorEffect = (temp) => {
    const cfg = TEMP_CONFIG[temp];
    if (cfg) {
      overlay.style.backgroundColor = cfg.color;
      overlay.style.opacity = cfg.intensity;
    }
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
      btn.onclick = () => applyColorEffect(btn.dataset.temp);
    });
    panel.querySelector(".close-panel-btn").onclick = () => panel.style.display = "none";
    panel.querySelector(".reset-btn").onclick = () => {
      overlay.style.opacity = 0;
      zone.materials.forEach(matName => {
        const mat = viewer.findMaterial(matName);
        const orig = originalMaterials[matName];
        if (mat && orig) { mat.baseColor.copy(orig.baseColor); viewer.requestFrame(); }
      });
    };
    const track = panel.querySelector(".vertical-slider-track");
    const thumb = panel.querySelector(".vertical-slider-thumb");
    const progress = panel.querySelector(".vertical-slider-progress");
    const labelDisplay = panel.querySelector(".current-view-percentage");
    const updateSliderUI = (percent) => {
      const p = Math.max(0, Math.min(100, percent));
      thumb.style.bottom = `${p}%`; progress.style.height = `${p}%`;
      labelDisplay.innerText = zone.viewLabels[Math.round((p / 100) * (zone.viewLabels.length - 1))];
    };
    track.onclick = (e) => {
      const rect = track.getBoundingClientRect();
      const p = ((rect.bottom - e.clientY) / rect.height) * 100;
      updateSliderUI(p);
      viewer.switchToView(zone.sliderViews[Math.round((p / 100) * (zone.sliderViews.length - 1))]);
    };
  };

  // --- SISTEMA DE JOYSTICKS REFACTORIZADO ---

  class VirtualKey {
    constructor(keyCode) {
      this.keyCode = keyCode;
      this.canvas = document.getElementById('walk-canvas');
    }
    down() {
      if (this.canvas) {
        this.canvas.dispatchEvent(new KeyboardEvent('keydown', {
          keyCode: this.keyCode, bubbles: true, cancelable: true
        }));
      }
    }
    up() {
      if (this.canvas) {
        this.canvas.dispatchEvent(new KeyboardEvent('keyup', {
          keyCode: this.keyCode, bubbles: true, cancelable: true
        }));
      }
    }
  }

  const keys = {
    forward: new VirtualKey(87), backward: new VirtualKey(83),
    left: new VirtualKey(65), right: new VirtualKey(68),
    lookLeft: new VirtualKey(37), lookRight: new VirtualKey(39),
    lookUp: new VirtualKey(38), lookDown: new VirtualKey(40)
  };

  const joystickStates = {
    left: { active: false, x: 0, y: 0 },
    right: { active: false, x: 0, y: 0 }
  };

  const setupJoystick = (id, stateKey) => {
    const knob = document.getElementById(`knob-${id}`);
    const container = document.getElementById(`joystick-${id}`);
    if (!knob || !container) return;
    const handleStart = (e) => { joystickStates[stateKey].active = true; e.preventDefault(); };
    const handleMove = (e) => {
      if (!joystickStates[stateKey].active) return;
      const rect = container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
      const clientY = (e.touches ? e.touches[0].clientY : e.clientY);
      let dx = clientX - centerX; let dy = clientY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy); const maxDist = 50;
      if (dist > maxDist) { dx *= maxDist / dist; dy *= maxDist / dist; }
      joystickStates[stateKey].x = dx / maxDist;
      joystickStates[stateKey].y = dy / maxDist;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const handleEnd = () => {
      joystickStates[stateKey].active = false; joystickStates[stateKey].x = 0; joystickStates[stateKey].y = 0;
      knob.style.transform = 'translate(0, 0)';
      if (stateKey === 'left') {
        keys.forward.up(); keys.backward.up(); keys.left.up(); keys.right.up();
      } else {
        keys.lookLeft.up(); keys.lookRight.up(); keys.lookUp.up(); keys.lookDown.up();
      }
    };
    knob.addEventListener('mousedown', handleStart); window.addEventListener('mousemove', handleMove); window.addEventListener('mouseup', handleEnd);
    knob.addEventListener('touchstart', handleStart); window.addEventListener('touchmove', handleMove, { passive: false }); window.addEventListener('touchend', handleEnd);
  };

  const deadzone = 0.1;
  const joystickUpdateLoop = () => {
    if (joystickStates.left.active) {
      const x = joystickStates.left.x; const y = joystickStates.left.y;
      if (y < -deadzone) { keys.forward.down(); keys.backward.up(); }
      else if (y > deadzone) { keys.backward.down(); keys.forward.up(); }
      else { keys.forward.up(); keys.backward.up(); }
      if (x < -deadzone) { keys.left.down(); keys.right.up(); }
      else if (x > deadzone) { keys.right.down(); keys.left.up(); }
      else { keys.left.up(); keys.right.up(); }
    } else {
      keys.forward.up(); keys.backward.up(); keys.left.up(); keys.right.up();
    }
    if (joystickStates.right.active) {
      const x = joystickStates.right.x; const y = joystickStates.right.y;
      if (y < -deadzone) { keys.lookUp.down(); keys.lookDown.up(); }
      else if (y > deadzone) { keys.lookDown.down(); keys.lookUp.up(); }
      else { keys.lookUp.up(); keys.lookDown.up(); }
      if (x < -deadzone) { keys.lookLeft.down(); keys.lookRight.up(); }
      else if (x > deadzone) { keys.lookRight.down(); keys.lookLeft.up(); }
      else { keys.lookLeft.up(); keys.lookRight.up(); }
    } else {
      keys.lookLeft.up(); keys.lookRight.up(); keys.lookUp.up(); keys.lookDown.up();
    }
    requestAnimationFrame(joystickUpdateLoop);
  };

  const WALK = window.WALK || {};
  const init = () => {
    try {
      viewer = WALK.getViewer();
      if (!viewer) { setTimeout(init, 100); return; }
      viewer.setAllMaterialsEditable();
      WALK.CAMERA_FULL_ACCELERATION_TIME = 0.75;
      WALK.CAMERA_ARROWS_TURN_SPEED = 0.2618;
      setupJoystick('left', 'left'); setupJoystick('right', 'right');
      joystickUpdateLoop();
   
