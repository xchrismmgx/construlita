/**
 * IMPLEMENTACIÓN API SHAPESPARK - VERSIÓN ESTABLE FINAL
 * - Joystick D-PAD (140px) optimizado para móviles.
 * - Fix: No cierra paneles al mover la cámara.
 * - Fix: Previene bloqueo/congelamiento en dispositivos táctiles.
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
            materials: ["Material_Cocina_Encimera", "Material_Cocina_Luz"],
            sliderViews: ["cocina_diez", "cocina_cuarenta", "cocina_sesenta", "cocina_ochenta", "cocina_cien"],
            viewLabels: ["10%", "40%", "60%", "80%", "100%"]
        },
        {
            panelHtmlId: "container-cuarto",
            triggerViews: ["panel_cuarto", "cuarto_diez", "cuarto_cuarenta", "cuarto_sesenta", "cuarto_ochenta", "cuarto_cien"],
            materials: ["Material_Cama", "Material_Lampara_Cuarto"],
            sliderViews: ["cuarto_diez", "cuarto_cuarenta", "cuarto_sesenta", "cuarto_ochenta", "cuarto_cien"],
            viewLabels: ["10%", "40%", "60%", "80%", "100%"]
        }
    ];
    const temperatureSettings = {
        2700: { h: 0.016, s: 0.165, l: 0.48 },
        3000: { h: 0.028, s: 0.11, l: 0.50 },
        4000: { h: 0.04, s: 0.03, l: 0.52 },
        6000: { h: 0.06, s: -0.19, l: 0.52 },
        6500: { h: 0.068, s: -0.265, l: 0.555 },
    }
    const originalMaterialStates = {}
    // =================================================================
    // LÓGICA DE PANELES (Optimizado para no cerrar por Joystick)
    // =================================================================
    const updatePanelVisibility = (currentViewName) => {
        // Si la vista es temporal (sin nombre definido en Shapespark), ignoramos el evento
        if (!currentViewName) return;
        let activeZone = null;
        let anyZoneTriggered = false;
        ZONES_CONFIG.forEach(zone => {
            const normalizedTriggerViews = zone.triggerViews.map(v => v.toLowerCase());
            if (normalizedTriggerViews.includes(currentViewName.toLowerCase())) {
                activeZone = zone;
                anyZoneTriggered = true;
            }
        });
        // IMPORTANTE: Solo cerramos paneles si la vista que terminó de moverse
        // es una vista con nombre oficial de Shapespark que NO pertenece a la zona actual.
        // Esto previene que el movimiento libre del joystick cierre el panel.
        if (anyZoneTriggered) {
            document.querySelectorAll('.control-panel').forEach(panel => {
                panel.style.display = 'none';
            });
            if (activeZone) {
                const panelEl = document.getElementById(activeZone.panelHtmlId);
                if (panelEl) panelEl.style.display = 'block';
            }
        }
    };
    const storeOriginalMaterialStates = () => {
        try {
            const allMaterials = new Set();
            ZONES_CONFIG.forEach(zone => zone.materials.forEach(mat => allMaterials.add(mat)));
            allMaterials.forEach((materialName) => {
                const material = viewer.findMaterial(materialName)
                if (material) {
                    const hsl = material.baseColor.getHSL()
                    originalMaterialStates[materialName] = {
                        h: Number.parseFloat(hsl.h), s: Number.parseFloat(hsl.s), l: Number.parseFloat(hsl.l),
                        texture: material.baseColorTexture || null
                    }
                }
            });
        } catch (e) { console.error("Error original materials:", e); }
    }
    const applyTemperatureToZone = (zoneConfig, temperature) => {
        const tempConfig = temperatureSettings[temperature];
        if (!tempConfig) return;
        const targetL = tempConfig.l !== undefined ? tempConfig.l : 0.5;
        const adjustedSaturation = tempConfig.s * GLOBAL_COLOR_INTENSITY;
        zoneConfig.materials.forEach((materialName) => {
            const material = viewer.findMaterial(materialName);
            if (material) {
                if (material.baseColorTexture) {
                    material.setTextureMapHslAdjustment("baseColorTexture", "h", tempConfig.h);
                    material.setTextureMapHslAdjustment("baseColorTexture", "s", adjustedSaturation);
                    material.setTextureMapHslAdjustment("baseColorTexture", "l", targetL);
                    material.setTextureMapCorrectionTurnedOn("baseColorTexture", true);
                } else {
                    const hsl = material.baseColor.getHSL();
                    hsl.h = tempConfig.h; hsl.s = adjustedSaturation; hsl.l = targetL;
                    material.baseColor.setHSL(hsl);
                }
            }
        });
        viewer.requestFrame();
    };
    const initializePanelComponents = (zoneConfig) => {
        const panel = document.getElementById(zoneConfig.panelHtmlId);
        if (!panel) return;
        panel.querySelector(".close-panel-btn")?.addEventListener("click", () => panel.style.display = "none");
        panel.querySelectorAll(".temp-btn").forEach(btn => {
            btn.onclick = (e) => {
                panel.querySelectorAll(".temp-btn").forEach(b => b.classList.remove("active"));
                e.target.classList.add("active");
                applyTemperatureToZone(zoneConfig, parseInt(e.target.dataset.temp));
            };
        });
        const sliderThumb = panel.querySelector(".vertical-slider-thumb");
        const sliderProg = panel.querySelector(".vertical-slider-progress");
        const percDisp = panel.querySelector(".current-view-percentage");
        const labelsCont = panel.querySelector(".view-labels-container");
        const sliderCont = panel.querySelector(".vertical-slider-container");
        const updateSlider = (idx) => {
            const p = (idx / (zoneConfig.sliderViews.length - 1)) * 100;
            sliderThumb.style.bottom = `calc(${p}% - 9px)`;
            sliderProg.style.height = `${p}%`;
            percDisp.textContent = zoneConfig.viewLabels[idx];
            viewer.switchToView(zoneConfig.sliderViews[idx], 0);
        };
        if (sliderCont) {
            labelsCont.innerHTML = "";
            zoneConfig.viewLabels.forEach((txt, i) => {
                const lbl = document.createElement("div");
                lbl.className = "view-label"; lbl.textContent = txt;
                lbl.style.bottom = `${(i / (zoneConfig.sliderViews.length - 1)) * 100}%`;
                lbl.onclick = () => updateSlider(i);
                labelsCont.appendChild(lbl);
            });
            let dragging = false;
            const handle = (y) => {
                const r = sliderCont.getBoundingClientRect();
                let norm = Math.max(0, Math.min(1, 1 - (y - r.top) / r.height));
                updateSlider(Math.min(zoneConfig.sliderViews.length - 1, Math.floor(norm * zoneConfig.sliderViews.length)));
            };
            sliderCont.addEventListener('mousedown', (e) => { dragging = true; handle(e.clientY); });
            document.addEventListener("mousemove", (e) => dragging && handle(e.clientY));
            document.addEventListener("mouseup", () => dragging = false);
            sliderCont.addEventListener('touchstart', (e) => { dragging = true; handle(e.touches[0].clientY); }, { passive: true });
            document.addEventListener("touchmove", (e) => dragging && handle(e.touches[0].clientY), { passive: true });
        }
    };
    // =================================================================
    // JOYSTICK PAD v3 (Optimizado para evitar congelamientos)
    // =================================================================
    const initJoystick = (viewer) => {
        const cameraSpeed = 2000;
        const drawInterval = 1000 / 30;
        const wCanvas = document.getElementById('walk-canvas');
        if (!wCanvas) return;
        const leftStick = document.createElement('div');
        const rightStick = document.createElement('div');
        const touchable = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        let lsTouchID = -1, rsTouchID = -2;
        let lsStartX, lsStartY, rsStartX, rsStartY;
        let lsTouchX = 0, lsTouchY = 0, rsTouchX = 0, rsTouchY = 0;
        let touches = [];
        let isDragging = false;
        // Variables de cámara persistentes
        let camPos = { x: 0, y: 0, z: 0 };
        let camRot = { yaw: 0, yawDeg: 0, pitchDeg: 0 };
        const updateCamData = () => {
            const p = viewer.getCameraPosition();
            const r = viewer.getCameraRotation();
            if (p && r) {
                camPos = { ...p };
                camRot = { ...r };
            }
        };
        function createStick() {
            const SIZE = 140;
            const commonStyle = (el, id) => {
                el.id = id;
                el.style.position = 'absolute';
                el.style.width = SIZE + 'px';
                el.style.height = SIZE + 'px';
                el.style.zIndex = '1000000'; // Por encima de todo
                el.style.pointerEvents = 'auto';
                el.style.touchAction = 'none';
                el.style.userSelect = 'none';
                el.style.opacity = '0.8.5';
            };
            commonStyle(leftStick, 'left_stick');
            commonStyle(rightStick, 'right_stick');
            const updatePosition = () => {
                if (window.innerWidth > window.innerHeight) {
                    leftStick.style.top = '50%'; leftStick.style.bottom = 'auto';
                    leftStick.style.left = '40px'; leftStick.style.transform = 'translateY(-50%)';
                    rightStick.style.top = '50%'; rightStick.style.bottom = 'auto';
                    rightStick.style.right = '40px'; rightStick.style.transform = 'translateY(-50%)';
                    rightStick.style.display = 'block';
                } else {
                    leftStick.style.bottom = '40px'; leftStick.style.top = 'auto';
                    leftStick.style.left = '50%'; leftStick.style.transform = 'translateX(-50%)';
                    rightStick.style.display = 'none';
                }
            };
            window.addEventListener('resize', updatePosition);
            updatePosition();
            const drawDpad = () => {
                const can = document.createElement('canvas');
                can.width = can.height = SIZE;
                const ctx = can.getContext('2d');
                const c = SIZE / 2;
                const g = ctx.createRadialGradient(c, c, SIZE * 0.2, c, c, SIZE * 0.5);
                g.addColorStop(0, 'rgba(0, 123, 255, 0.2)');
                g.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, SIZE, SIZE);
                ctx.beginPath();
                ctx.arc(c, c, SIZE * 0.4, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(20, 20, 20, 0.7)';
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 2;
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                const s = 10; const d = SIZE * 0.28;
                const drawA = (x, y, r) => {
                    ctx.save(); ctx.translate(x, y); ctx.rotate(r);
                    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s, s * 0.8); ctx.lineTo(-s, s * 0.8); ctx.closePath(); ctx.fill();
                    ctx.restore();
                };
                drawA(c, c - d, 0); drawA(c, c + d, Math.PI); drawA(c - d, c, -Math.PI / 2); drawA(c + d, c, Math.PI / 2);
                ctx.beginPath();
                ctx.arc(c, c, SIZE * 0.15, 0, Math.PI * 2);
                ctx.fillStyle = '#00f2ff';
                ctx.shadowBlur = 10; ctx.shadowColor = 'cyan';
                ctx.fill();
                return can;
            };
            leftStick.appendChild(drawDpad());
            rightStick.appendChild(drawDpad());
            wCanvas.parentNode.appendChild(leftStick);
            wCanvas.parentNode.appendChild(rightStick);
        }
        const onStart = (e, stick, isRight) => {
            updateCamData();
            stick.style.opacity = 1;
            const t = e.changedTouches ? e.changedTouches[0] : e;
            if (isRight) { rsTouchID = t.identifier || -2; rsStartX = t.clientX; rsStartY = t.clientY; }
            else { lsTouchID = t.identifier || -1; lsStartX = t.clientX; lsStartY = t.clientY; }
            isDragging = true;
            touches = e.touches || [];
        };
        const onMove = (e) => {
            if (!isDragging) return;
            if (e.changedTouches) {
                touches = e.touches;
            } else {
                lsTouchX = e.clientX - lsStartX;
                lsTouchY = lsStartY - e.clientY;
            }
        };
        const onEnd = (e) => {
            isDragging = false;
            leftStick.style.opacity = 0.8; rightStick.style.opacity = 0.8;
            lsTouchX = lsTouchY = rsTouchX = rsTouchY = 0;
            lsTouchID = -1; rsTouchID = -2;
            touches = [];
        };
        if (touchable) {
            leftStick.addEventListener("touchstart", (e) => onStart(e, leftStick, false), { passive: true });
            rightStick.addEventListener("touchstart", (e) => onStart(e, rightStick, true), { passive: true });
            document.addEventListener("touchmove", onMove, { passive: true });
            document.addEventListener("touchend", onEnd);
        } else {
            leftStick.addEventListener("mousedown", (e) => onStart(e, leftStick, false));
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onEnd);
        }
        function loop() {
            if (!isDragging) return;
            if (touchable && touches.length > 0) {
                let moved = false;
                for (let i = 0; i < touches.length; i++) {
                    const t = touches[i];
                    if (t.identifier == lsTouchID) { lsTouchX = t.clientX - lsStartX; lsTouchY = lsStartY - t.clientY; moved = true; }
                    else if (t.identifier == rsTouchID) { rsTouchX = t.clientX - rsStartX; rsTouchY = rsStartY - t.clientY; moved = true; }
                }
                if (!moved) return;
            }
            // Cálculo de movimiento basado en orientación (Mismo que original para funcionalidad)
            camPos.x += (((Math.abs(camRot.yaw) - Math.PI / 2) * (-1)) * (lsTouchX / cameraSpeed)) + ((Math.abs(Math.abs(Math.abs(camRot.yaw) - Math.PI / 2) - Math.PI / 2) * (Math.abs(camRot.yaw) / camRot.yaw * (-1))) * (lsTouchY / cameraSpeed));
            camPos.y -= (((Math.abs(Math.abs(camRot.yaw) - Math.PI / 2) - Math.PI / 2) * (Math.abs(camRot.yaw) / camRot.yaw)) * (lsTouchX / cameraSpeed)) - (((Math.abs(camRot.yaw) - Math.PI / 2) * (-1)) * (lsTouchY / cameraSpeed));
            camRot.yawDeg += rsTouchX * 20 / cameraSpeed * (-1);
            camRot.pitchDeg -= rsTouchY * 20 / cameraSpeed * (-1);
            const v = new window.WALK.View();
            v.position.x = camPos.x; v.position.y = camPos.y; v.position.z = camPos.z;
            v.rotation.yaw = camRot.yaw; v.rotation.yawDeg = camRot.yawDeg; v.rotation.pitchDeg = camRot.pitchDeg;
            // USAMOS switchToView SIN NOMBRE para evitar disparar updatePanelVisibility indeseadamente
            viewer.switchToView(v, 0);
        }
        createStick();
        setInterval(loop, drawInterval);
    };
    const init = () => {
        try {
            if (!window.WALK) return setTimeout(init, 100);
            viewer = WALK.getViewer();
            viewer.onSceneReadyToDisplay(() => {
                storeOriginalMaterialStates();
                ZONES_CONFIG.forEach(initializePanelComponents);
                initJoystick(viewer);
            });
            viewer.onViewSwitchDone((viewName) => {
                updatePanelVisibility(viewName);
            });
        } catch (e) { console.error("Init Error:", e); }
    }
    init();
});
