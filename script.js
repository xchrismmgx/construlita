document.addEventListener("DOMContentLoaded", () => {
  let viewer = null

  // =================================================================
  // FACTOR GLOBAL DE INTENSIDAD DE COLOR (COLOR MANAGEMENT)
  // =================================================================
  const GLOBAL_COLOR_INTENSITY = 0.5; 

  // =================================================================
  // CONFIGURACIÓN DE ZONAS
  // =================================================================
  const ZONES_CONFIG = [
    {
      // --- ZONA SALA ---
      panelHtmlId: "container-sala",
      triggerViews: ["panel_sala", "sala_10", "sala_40", "sala_60", "sala_80", "sala_100"],
      materials: [
        "*40", "*50", "*60", "*70", "*80",
        "Aluminio", "mesita sala", "*30", "arte cuadro 2", "Concrete Bare Cast Murral"
      ],
      sliderViews: ["sala_10", "sala_40", "sala_60", "sala_80", "sala_100"],
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      // --- ZONA COCINA ---
      panelHtmlId: "container-cocina",
      triggerViews: ["panel_cocina", "cocina_diez", "cocina_cuarenta", "cocina_sesenta", "cocina_ochenta", "cocina_cien"],
      materials: ["Material_Cocina_Encimera", "Material_Cocina_Luz"], 
      sliderViews: ["cocina_diez", "cocina_cuarenta", "cocina_sesenta", "cocina_ochenta", "cocina_cien"], 
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    },
    {
      // --- ZONA CUARTO ---
      panelHtmlId: "container-cuarto",
      triggerViews: ["panel_cuarto", "cuarto_diez", "cuarto_cuarenta", "cuarto_sesenta", "cuarto_ochenta", "cuarto_cien"],
      materials: ["Material_Cama", "Material_Lampara_Cuarto"],
      sliderViews: ["cuarto_diez", "cuarto_cuarenta", "cuarto_sesenta", "cuarto_ochenta", "cuarto_cien"], 
      viewLabels: ["10%", "40%", "60%", "80%", "100%"]
    }
  ];

  // Configuración de Temperaturas (AHORA CON CANAL L - Luminosidad)
  // 0.5 es el valor neutro. >0.5 es más brillante, <0.5 es más oscuro.
  const temperatureSettings = {
    2700: { h: 0.016, s: 0.165, l: 0.48 }, // Un toque sutilmente más tenue para calidez
    3000: { h: 0.028, s: 0.11,  l: 0.50 }, // Neutro
    4000: { h: 0.04,  s: 0.03,  l: 0.52 }, // Ligeramente más brillante
    6000: { h: 0.06,  s: -0.19, l: 0.52 }, // Brillo incrementado para luz día
    6500: { h: 0.068, s: -0.265, l: 0.555 }, // Brillo máximo para luz fría intensa
  }

  const originalMaterialStates = {}

  // =================================================================
  // DIAGNÓSTICO
  // =================================================================
  const logAllAvailableMaterials = () => {
    console.group("📋 LISTA DE MATERIALES CONFIGURADOS VS ENCONTRADOS");
    ZONES_CONFIG.forEach(zone => {
        console.log(`--- Zona: ${zone.panelHtmlId} ---`);
        zone.materials.forEach(matName => {
            const mat = viewer.findMaterial(matName);
            if (mat) console.log(`✅ ENCONTRADO: "${matName}"`);
            else console.log(`❌ NO ENCONTRADO: "${matName}"`);
        });
    });
    console.groupEnd();
  };

  // =================================================================
  // LÓGICA DE PANELES Y UI
  // =================================================================
  const updatePanelVisibility = (currentViewName) => {
    let activeZone = null;
    ZONES_CONFIG.forEach(zone => {
      const normalizedTriggerViews = zone.triggerViews.map(v => v.toLowerCase());
      if (normalizedTriggerViews.includes(currentViewName.toLowerCase())) {
        activeZone = zone;
      }
    });

    document.querySelectorAll('.control-panel').forEach(panel => {
      panel.style.display = 'none';
    });

    if (activeZone) {
      const panelEl = document.getElementById(activeZone.panelHtmlId);
      if (panelEl) {
        panelEl.style.display = 'block';
      }
    }
  };

  // =================================================================
  // LÓGICA DE MATERIALES
  // =================================================================
  const storeOriginalMaterialStates = () => {
    try {
      const allMaterials = new Set();
      ZONES_CONFIG.forEach(zone => {
        zone.materials.forEach(mat => allMaterials.add(mat));
      });

      allMaterials.forEach((materialName) => {
        const material = viewer.findMaterial(materialName)
        if (material) {
          const hsl = material.baseColor.getHSL()
          let texture = null
          if (material.baseColorTexture) {
            texture = material.baseColorTexture
          }
          originalMaterialStates[materialName] = {
            h: Number.parseFloat(hsl.h),
            s: Number.parseFloat(hsl.s),
            l: Number.parseFloat(hsl.l),
            texture: texture,
          }
        }
      })
      console.log("Estados originales guardados.");
    } catch (error) {
      console.error("Error al guardar estados originales:", error)
    }
  }

  const applyTemperatureToZone = (zoneConfig, temperature) => {
    try {
      const tempConfig = temperatureSettings[temperature];
      if (!tempConfig) return;
      
      // AHORA USAMOS LA LUMINOSIDAD ESPECÍFICA O 0.5 POR DEFECTO
      const targetL = tempConfig.l !== undefined ? tempConfig.l : 0.5;
      
      const adjustedSaturation = tempConfig.s * GLOBAL_COLOR_INTENSITY;

      zoneConfig.materials.forEach((materialName) => {
        const material = viewer.findMaterial(materialName);
        if (material) {
          if (material.baseColorTexture) {
            material.setTextureMapHslAdjustment("baseColorTexture", "h", tempConfig.h);
            material.setTextureMapHslAdjustment("baseColorTexture", "s", adjustedSaturation);
            // Usamos el canal L dinámico
            material.setTextureMapHslAdjustment("baseColorTexture", "l", targetL);
            material.setTextureMapCorrectionTurnedOn("baseColorTexture", true);
          } else {
            const hsl = material.baseColor.getHSL();
            hsl.h = tempConfig.h;
            hsl.s = adjustedSaturation;
            // Usamos el canal L dinámico
            hsl.l = targetL; 
            material.baseColor.setHSL(hsl);
          }
        }
      });
      viewer.requestFrame();
    } catch (error) {
      console.error("Error aplicando temperatura:", error);
    }
  };

  const resetZoneMaterials = (zoneConfig) => {
    try {
      zoneConfig.materials.forEach((materialName) => {
        const material = viewer.findMaterial(materialName);
        const originalState = originalMaterialStates[materialName];

        if (material && originalState) {
          material.baseColorTexture = originalState.texture || null;
          const hsl = material.baseColor.getHSL();
          hsl.h = originalState.h;
          hsl.s = originalState.s;
          hsl.l = originalState.l;
          material.baseColor.setHSL(hsl);
          if (material.baseColorTexture) {
             material.setTextureMapCorrectionTurnedOn("baseColorTexture", false);
          }
        }
      });
      viewer.requestFrame();
    } catch (error) {
      console.error("Error al resetear materiales:", error);
    }
  };

  const initializePanelComponents = (zoneConfig) => {
    const panelElement = document.getElementById(zoneConfig.panelHtmlId);
    if (!panelElement) return;

    // A. Botón Cerrar
    const closeBtn = panelElement.querySelector(".close-panel-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        panelElement.style.display = "none";
      });
    }

    // B. Botones Temp
    const tempButtons = panelElement.querySelectorAll(".temp-btn");
    tempButtons.forEach((btn) => {
      btn.classList.remove("active"); 
      btn.addEventListener("click", (e) => {
        tempButtons.forEach(b => b.classList.remove("active"));
        e.target.classList.add("active");
        const temp = Number.parseInt(e.target.getAttribute("data-temp"));
        applyTemperatureToZone(zoneConfig, temp);
      });
    });

    // C. Slider
    const sliderContainer = panelElement.querySelector(".vertical-slider-container");
    const sliderThumb = panelElement.querySelector(".vertical-slider-thumb");
    const sliderProgress = panelElement.querySelector(".vertical-slider-progress");
    const percentageDisplay = panelElement.querySelector(".current-view-percentage");
    const labelsContainer = panelElement.querySelector(".view-labels-container");

    const setSliderToIndex = (viewIndex) => {
        if (viewIndex < 0 || viewIndex >= zoneConfig.sliderViews.length) return;
        const thumbPos = (viewIndex / (zoneConfig.sliderViews.length - 1)) * 100;
        
        // CORRECCIÓN DE POSICIÓN: Centramos el thumb restando 9px (mitad de su altura)
        sliderThumb.style.bottom = `calc(${thumbPos}% - 9px)`;
        sliderProgress.style.height = `${thumbPos}%`;
        
        percentageDisplay.textContent = zoneConfig.viewLabels[viewIndex];
        const labels = labelsContainer.querySelectorAll(".view-label");
        labels.forEach(l => l.classList.remove("active"));
        if(labels[viewIndex]) labels[viewIndex].classList.add("active");
        const targetView = zoneConfig.sliderViews[viewIndex];
        viewer.switchToView(targetView, 0); 
    };

    const handleSliderInteraction = (clientY) => {
        const rect = sliderContainer.getBoundingClientRect();
        let relativeY = clientY - rect.top;
        let normalized = 1 - (relativeY / rect.height);
        normalized = Math.max(0, Math.min(1, normalized));
        let viewIndex = Math.floor(normalized * zoneConfig.sliderViews.length);
        viewIndex = Math.min(viewIndex, zoneConfig.sliderViews.length - 1);
        setSliderToIndex(viewIndex);
    };

    // D. Botón Reset
    const resetBtn = panelElement.querySelector(".reset-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        resetZoneMaterials(zoneConfig);
        tempButtons.forEach(b => b.classList.remove("active"));
        setSliderToIndex(0);
      });
    }
    
    if (sliderContainer && zoneConfig.sliderViews.length > 0) {
      setSliderToIndex(0);
      labelsContainer.innerHTML = "";
      zoneConfig.viewLabels.forEach((labelText, index) => {
        const label = document.createElement("div");
        label.className = "view-label";
        label.textContent = labelText;
        label.setAttribute("data-view-index", index);
        const position = (index / (zoneConfig.sliderViews.length - 1)) * 100;
        label.style.bottom = `${position}%`;
        label.addEventListener("click", () => setSliderToIndex(index));
        labelsContainer.appendChild(label);
      });

      let isDragging = false;
      sliderContainer.addEventListener("mousedown", (e) => { isDragging = true; handleSliderInteraction(e.clientY); });
      document.addEventListener("mousemove", (e) => { if (isDragging) handleSliderInteraction(e.clientY); });
      document.addEventListener("mouseup", () => isDragging = false);
      sliderContainer.addEventListener("touchstart", (e) => { handleSliderInteraction(e.touches[0].clientY); e.preventDefault(); });
      sliderContainer.addEventListener("touchmove", (e) => { handleSliderInteraction(e.touches[0].clientY); e.preventDefault(); });
    }
  };

  // =================================================================
  // IMPLEMENTACIÓN DE JOYSTICK (Módulo Integrado)
  // =================================================================
  const initJoystick = (viewer) => {
    console.log("🎮 Iniciando Joystick Controller...");
    
    // --- Configuración ---
    const cameraSpeed = 2000;
    const drawInterval = 1000/30;
    const _joystick = true; // Forzamos el uso de joystick visual
    const _sab = '0px'; // Safe Area Bottom
    const _flipMouse = -1; // Invertir controles si es necesario
    
    // Elementos del Joystick
    const wCanvas = document.getElementById('walk-canvas');
    if (!wCanvas) {
        console.warn("⚠️ No se encontró 'walk-canvas'. El joystick no se puede inicializar.");
        return;
    }

    const leftStick = document.createElement('div');
    const rightStick = document.createElement('div');
    const touchable = 'ontouchstart' in window || 'createTouch' in document || navigator.msPointerEnabled;

    // Variables de Estado
    let ls_canvas, rs_canvas, ls_c2d, rs_c2d;
    let lsTouchID = -1, rsTouchID = -2;
    let lsStartX, lsStartY, rsStartX, rsStartY;
    let lsTouchX = 0, lsTouchY = 0, rsTouchX = 0, rsTouchY = 0;
    let touches = [];
    let isDrawing = false;
    let cameraX, cameraY, cameraZ, cameraYaw, cameraYD, cameraPD;

    // --- Clases ---
    class Camera {
      constructor(camera_X, camera_Y, camera_Z, camera_Yaw, camera_YD, camera_PD) {
        this.x = camera_X;
        this.y = camera_Y;
        this.z = camera_Z;
        this.yaw = camera_Yaw;
        this.yawDeg = camera_YD;
        this.pitchDeg = camera_PD;
      }
      getCam() {
        cameraX = this.x;
        cameraY = this.y;
        cameraZ = this.z;
        cameraYaw = this.yaw;
        cameraYD = this.yawDeg;
        cameraPD = this.pitchDeg;
      }
      setCam() {
        // Usamos la API global WALK que ya está disponible
        let view = new window.WALK.View();
        view.position.x = this.x;
        view.position.y = this.y;
        view.position.z = this.z;
        view.rotation.yaw = this.yaw;
        view.rotation.yawDeg = this.yawDeg;
        view.rotation.pitchDeg = this.pitchDeg;
        viewer.switchToView(view, 0); // 0ms = movimiento instantáneo
      }
    }

    // --- Funciones de Utilidad ---
    function _preventDefault(e) { e.preventDefault(); }
    
    function createStick() {
      // Estilos Left Stick
      leftStick.id = 'left_stick';
      leftStick.style.position = 'absolute';
      leftStick.style.bottom = 'calc(20px + ' + _sab + ')'; // Un poco más arriba
      leftStick.style.left = '50%';
      leftStick.style.transform = 'translateX(-50%) translateY(0)';
      leftStick.style.width = '40px';
      leftStick.style.height = '40px';
      leftStick.style.opacity = 0.6;
      leftStick.style.transition = 'opacity 0.5s';
      leftStick.style.cursor = 'pointer';
      leftStick.style.zIndex = '500'; 

      // Estilos Right Stick
      rightStick.id = 'right_stick';
      rightStick.style.position = 'absolute';
      rightStick.style.bottom = '-100px';
      rightStick.style.right = '-100px';
      rightStick.style.width = '40px';
      rightStick.style.height = '40px';
      rightStick.style.opacity = 0.6;
      rightStick.style.transition = 'opacity 0.5s';
      rightStick.style.display = 'none';
      rightStick.style.zIndex = '500';

      const mediaQuery = window.matchMedia('(orientation:landscape)');
      mediaQuery.addListener(mediaQueryChange);
      mediaQueryChange(mediaQuery);

      function mediaQueryChange(e) {
        if (e.matches) {
          leftStick.style.top = '50%';
          leftStick.style.bottom = 'auto';
          leftStick.style.left = '60px';
          leftStick.style.transform = 'translateY(-50%)';
          
          rightStick.style.top = '50%';
          rightStick.style.bottom = 'auto';
          rightStick.style.right = '60px';
          rightStick.style.transform = 'translateY(-50%)';
          rightStick.style.display = 'block';

        } else {
          leftStick.style.top = 'auto';
          leftStick.style.bottom = 'calc(40px + ' + _sab + ')';
          leftStick.style.left = '50%';
          leftStick.style.transform = 'translateX(-50%) translateY(0)';
          
          rightStick.style.top = 'auto';
          rightStick.style.bottom = '-100px';
          rightStick.style.right = '-100px';
          rightStick.style.transform = 'inherit';
          rightStick.style.display = 'none';
        }
      }
      
      const drawStickGraphic = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 40; canvas.height = 40;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0,0,40,40);
          ctx.beginPath();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.arc(20, 20, 10,0,Math.PI*2,true);
          ctx.stroke();
          ctx.beginPath();
          ctx.strokeStyle = '#fff'; 
          ctx.lineWidth = 1;
          ctx.arc(20, 20, 15,0,Math.PI*2,true);
          ctx.stroke();
          return canvas;
      };

      ls_canvas = drawStickGraphic();
      rs_canvas = drawStickGraphic();

      wCanvas.parentNode.insertBefore(leftStick, wCanvas);
      wCanvas.parentNode.insertBefore(rightStick, wCanvas);
      leftStick.appendChild(ls_canvas);
      rightStick.appendChild(rs_canvas);
    }

    if (touchable) {
      document.addEventListener('dblclick', _preventDefault, false); 
      document.addEventListener('touchend', function() {
        rightStick.dispatchEvent(new TouchEvent('touchend', { bubbles:false, cancelable:true }));
      }, false );
      leftStick.addEventListener('touchstart', onLsStart, false);
      leftStick.addEventListener('touchmove', onTouchMove, false);
      leftStick.addEventListener('touchend', onLsEnd, false);
      rightStick.addEventListener('touchstart', onRsStart, false);
      rightStick.addEventListener('touchmove', onTouchMove, false);
      rightStick.addEventListener('touchend', onRsEnd, false);
    } else {
      leftStick.addEventListener('mousedown', onMouseDown, false);
      document.addEventListener('mousemove', onMouseMove, false);
      document.addEventListener('mouseup', onMouseUp, false);
      document.addEventListener('mouseleave', onMouseUp, false);
    }

    function onLsStart(e) {
      const cameraPos = viewer.getCameraPosition();
      const cameraRot = viewer.getCameraRotation();
      new Camera(cameraPos.x, cameraPos.y, cameraPos.z, cameraRot.yaw, cameraRot.yawDeg, cameraRot.pitchDeg).getCam();
      leftStick.style.opacity = 1;
      for (let i=0; i<e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        lsTouchID = touch.identifier;
        lsStartX = touch.clientX;
        lsStartY = touch.clientY;
      }
      touches = e.touches;
    }

    function onRsStart(e) {
      const cameraPos = viewer.getCameraPosition();
      const cameraRot = viewer.getCameraRotation();
      new Camera(cameraPos.x, cameraPos.y, cameraPos.z, cameraRot.yaw, cameraRot.yawDeg, cameraRot.pitchDeg).getCam();
      rightStick.style.opacity = 1;
      for (let i = 0; i<e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        rsTouchID = touch.identifier;
        rsStartX = touch.clientX;
        rsStartY = touch.clientY;
      }
      touches = e.touches; 
    }

    function onTouchMove(e) {
      _preventDefault(e);
      touches = e.touches;
    }

    function onLsEnd(e) {
      if (e.changedTouches.length != 0) {
        leftStick.style.opacity = 0.6;
        for (let i = 0; i<e.changedTouches.length; i++){
          const touch =e.changedTouches[i];
          if (lsTouchID == touch.identifier) {
            lsTouchX = lsTouchY = 0;
            lsTouchID = -1;
            break;
          }
        }
      }
      touches = e.touches;
    }

    function onRsEnd(e) {
      if (e.changedTouches.length != 0) {
        rightStick.style.opacity = 0.6;
        for (let i = 0; i<e.changedTouches.length; i++){
          const touch =e.changedTouches[i];
          if (rsTouchID == touch.identifier) {
            rsTouchX = rsTouchY = 0;
            rsTouchID = -2;
            break;
          }
        }
      }
      touches = e.touches;
    }

    function onMouseDown(e) {
      const cameraPos = viewer.getCameraPosition();
      const cameraRot = viewer.getCameraRotation();
      new Camera(cameraPos.x, cameraPos.y, cameraPos.z, cameraRot.yaw, cameraRot.yawDeg, cameraRot.pitchDeg).getCam();
      lsTouchX = lsTouchY = 0;
      lsStartX = e.clientX;
      lsStartY = e.clientY;
      isDrawing = true;
      leftStick.style.opacity = 0.6;
      wCanvas.style.pointerEvents = 'none';
    }

    function onMouseMove(e) {
      if (isDrawing) {
        lsTouchX = e.clientX - lsStartX;
        lsTouchY = lsStartY - e.clientY;
      }
    }

    function onMouseUp() {
      if (isDrawing) {
        isDrawing = false;
        leftStick.style.opacity = 0.6;
        wCanvas.style.pointerEvents = 'auto';
      }
    }

    function calcStickMove() {
      cameraX += ( ((Math.abs(cameraYaw) - Math.PI/2) * (-1)) * (lsTouchX/cameraSpeed) ) + ( (Math.abs(Math.abs(Math.abs(cameraYaw) - Math.PI/2) - Math.PI/2) * (Math.abs(cameraYaw)/cameraYaw * (-1))) * (lsTouchY/cameraSpeed) );
      cameraY -= ( ((Math.abs(Math.abs(cameraYaw) - Math.PI/2) - Math.PI/2) * ( Math.abs(cameraYaw)/cameraYaw )) * (lsTouchX/cameraSpeed) ) - ( ((Math.abs(cameraYaw) - Math.PI/2) * (-1)) * (lsTouchY/cameraSpeed) );
    }

    function calcStickAngle() {
      cameraYD += rsTouchX*20/cameraSpeed*_flipMouse;
      cameraPD -= rsTouchY*20/cameraSpeed*_flipMouse;
    }

    function draw() {
      if (touchable) {
        for (let i=0; i<touches.length; i++) {
          const touch = touches[i];
          if (touch.identifier == lsTouchID) {
            lsTouchX = touch.clientX - lsStartX;
            lsTouchY = lsStartY - touch.clientY;
            calcStickMove();
          } else if (touch.identifier == rsTouchID) {
            rsTouchX = touch.clientX - rsStartX;
            rsTouchY = rsStartY - touch.clientY;
            calcStickAngle();
          }
          new Camera(cameraX, cameraY, cameraZ, cameraYaw, cameraYD, cameraPD).setCam();
        }
      } else {
        if (isDrawing) {
          calcStickMove();
          calcStickAngle();
          new Camera(cameraX, cameraY, cameraZ, cameraYaw, cameraYD, cameraPD).setCam();
        }
      }
    }

    createStick();
    setInterval(draw, drawInterval);
  };

  // =================================================================
  // INICIALIZACIÓN PRINCIPAL
  // =================================================================
  const WALK = window.WALK || {}

  const initializeViewer = () => {
    try {
      if (!window.WALK) throw new Error("API no disponible");
      viewer = WALK.getViewer();
      viewer.setAllMaterialsEditable();

      viewer.onSceneReadyToDisplay(() => {
        console.log("Escena lista. Iniciando sistemas...");
        logAllAvailableMaterials(); 
        storeOriginalMaterialStates();
        ZONES_CONFIG.forEach(zone => initializePanelComponents(zone));
        initJoystick(viewer);
      });

      viewer.onViewSwitchDone((viewName) => {
         updatePanelVisibility(viewName);
      });

    } catch (error) {
      console.error("Init Error:", error);
    }
  }

  initializeViewer();
});