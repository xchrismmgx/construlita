/**
 * IMPLEMENTACIÓN API SHAPESPARK - VERSIÓN DEBUG D-PAD
 * Verificación de carga: Abre la consola (F12) y busca "JOYSTICK v2"
 */
document.addEventListener("DOMContentLoaded", () => {
    console.log("🚀 Script principal cargado.");
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
            btn.addEventListener("click", (e) => {
                panel.querySelectorAll(".temp-btn").forEach(b => b.classList.remove("active"));
                e.target.classList.add("active");
                applyTemperatureToZone(zoneConfig, parseInt(e.target.dataset.temp));
            });
        });
        const sliderCont = panel.querySelector(".vertical-slider-container");
        const sliderThumb = panel.querySelector(".vertical-slider-thumb");
        const sliderProg = panel.querySelector(".vertical-slider-progress");
        const percDisp = panel.querySelector(".current-view-percentage");
        const labelsCont = panel.querySelector(".view-labels-container");
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
            sliderCont.onmousedown = (e) => { dragging = true; handle(e.clientY); };
            document.onmousemove = (e) => dragging && handle(e.clientY);
            document.onmouseup = () => dragging = false;
        }
    };
    // =================================================================
    // JOYSTICK PAD v2
    // =================================================================
    const initJoystick = (viewer) => {
        console.log("🎮 --- JOYSTICK v2: DESIGN PAD LOADED ---");
        const cameraSpeed = 2000;
        const drawInterval = 1000 / 30;
        const _sab = '15px';
        const wCanvas = document.getElementById('walk-canvas');
        if (!wCanvas) {
            console.error("❌ ERROR: No se encontró 'walk-canvas'. Verifica la ID del canvas de Shapespark.");
            return;
        }
        console.log("✅ Canvas de Shapespark encontrado:", wCanvas);
        const leftStick = document.createElement('div');
        const rightStick = document.createElement('div');
        const touchable = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        let lsTouchID = -1, rsTouchID = -2;
        let lsStartX, lsStartY, rsStartX, rsStartY;
        let lsTouchX = 0, lsTouchY = 0, rsTouchX = 0, rsTouchY = 0;
        let touches = [];
        let isDrawing = false;
        let cameraX, cameraY, cameraZ, cameraYaw, cameraYD, cameraPD;
        class Camera {
            constructor(p, r) { this.p = p; this.r = r; }
            getCam() {
                cameraX = this.p.x; cameraY = this.p.y; cameraZ = this.p.z;
                cameraYaw = this.r.yaw; cameraYD = this.r.yawDeg; cameraPD = this.r.pitchDeg;
            }
            setCam() {
                let v = new window.WALK.View();
                v.position.x = cameraX; v.position.y = cameraY; v.position.z = cameraZ;
                v.rotation.yaw = cameraYaw; v.rotation.yawDeg = cameraYD; v.rotation.pitchDeg = cameraPD;
                viewer.switchToView(v, 0);
            }
        }
        function createStick() {
            const SIZE = 140; // Un poco más grande para ser impresionante
            console.log("🛠️ Creando elementos del Joystick (Size: " + SIZE + "px)");
            const commonStyle = (el, id) => {
                el.id = id;
                el.style.position = 'absolute';
                el.style.width = SIZE + 'px';
                el.style.height = SIZE + 'px';
                el.style.zIndex = '999999'; // MÁXIMA PRIORIDAD VISUAL
                el.style.pointerEvents = 'auto'; // Asegurar que reciba clicks
                el.style.touchAction = 'none';
                el.style.userSelect = 'none';
            };
            commonStyle(leftStick, 'left_stick');
            commonStyle(rightStick, 'right_stick');
            const updatePosition = () => {
                if (window.innerWidth > window.innerHeight) { // Landscape
                    leftStick.style.top = '50%'; leftStick.style.bottom = 'auto';
                    leftStick.style.left = '40px'; leftStick.style.transform = 'translateY(-50%)';
                    rightStick.style.top = '50%'; rightStick.style.bottom = 'auto';
                    rightStick.style.right = '40px'; rightStick.style.transform = 'translateY(-50%)';
                    rightStick.style.display = 'block';
                } else { // Portrait
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
                // 1. Efecto GLOW circular
                const g = ctx.createRadialGradient(c, c, SIZE * 0.2, c, c, SIZE * 0.5);
                g.addColorStop(0, 'rgba(0, 123, 255, 0.2)');
                g.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, SIZE, SIZE);
                // 2. Base D-PAD (Estilo Consola)
                ctx.beginPath();
                ctx.arc(c, c, SIZE * 0.4, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(30, 30, 30, 0.8)';
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.lineWidth = 3;
                ctx.fill();
                ctx.stroke();
                // 3. Flechas
                ctx.fillStyle = 'white';
                const s = 12; const d = SIZE * 0.28;
                const drawA = (x, y, r) => {
                    ctx.save(); ctx.translate(x, y); ctx.rotate(r);
                    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s, s * 0.8); ctx.lineTo(-s, s * 0.8); ctx.closePath(); ctx.fill();
                    ctx.restore();
                };
                drawA(c, c - d, 0); drawA(c, c + d, Math.PI); drawA(c - d, c, -Math.PI / 2); drawA(c + d, c, Math.PI / 2);
                // 4. Thumb Stick central (Punto de control)
                ctx.beginPath();
                ctx.arc(c, c, SIZE * 0.15, 0, Math.PI * 2);
                ctx.shadowBlur = 10; ctx.shadowColor = 'cyan';
                ctx.fillStyle = '#00f2ff';
                ctx.fill();
                return can;
            };
            leftStick.appendChild(drawDpad());
            rightStick.appendChild(drawDpad());
            wCanvas.parentNode.appendChild(leftStick);
            wCanvas.parentNode.appendChild(rightStick);
            console.log("✅ Elementos insertados en el DOM.");
        }
        const start = (e, stick, isRight) => {
            const cp = viewer.getCameraPosition(); const cr = viewer.getCameraRotation();
            new Camera(cp, cr).getCam();
            stick.style.opacity = 1;
            const t = e.changedTouches ? e.changedTouches[0] : e;
            if (isRight) { rsTouchID = t.identifier || -2; rsStartX = t.clientX; rsStartY = t.clientY; }
            else { lsTouchID = t.identifier || -1; lsStartX = t.clientX; lsStartY = t.clientY; }
            if (!e.changedTouches) isDrawing = true;
            touches = e.touches || [];
        };
        const move = (e) => {
            if (e.changedTouches) { touches = e.touches; e.preventDefault(); }
            else if (isDrawing) { lsTouchX = e.clientX - lsStartX; lsTouchY = lsStartY - e.clientY; }
        };
        const end = (e) => {
            isDrawing = false;
            leftStick.style.opacity = 0.8; rightStick.style.opacity = 0.8;
            lsTouchX = lsTouchY = rsTouchX = rsTouchY = 0;
            lsTouchID = -1; rsTouchID = -2;
        };
        if (touchable) {
            leftStick.ontouchstart = (e) => start(e, leftStick, false);
            rightStick.ontouchstart = (e) => start(e, rightStick, true);
            document.ontouchmove = move;
            document.ontouchend = end;
        } else {
            leftStick.onmousedown = (e) => start(e, leftStick, false);
            document.onmousemove = move;
            document.onmouseup = end;
        }
        function loop() {
            if (touchable && touches.length > 0) {
                for (let i = 0; i < touches.length; i++) {
                    const t = touches[i];
                    if (t.identifier == lsTouchID) { lsTouchX = t.clientX - lsStartX; lsTouchY = lsStartY - t.clientY; }
                    else if (t.identifier == rsTouchID) { rsTouchX = t.clientX - rsStartX; rsTouchY = rsStartY - t.clientY; }
                }
                cameraX += (((Math.abs(cameraYaw) - Math.PI / 2) * (-1)) * (lsTouchX / cameraSpeed)) + ((Math.abs(Math.abs(Math.abs(cameraYaw) - Math.PI / 2) - Math.PI / 2) * (Math.abs(cameraYaw) / cameraYaw * (-1))) * (lsTouchY / cameraSpeed));
                cameraY -= (((Math.abs(Math.abs(cameraYaw) - Math.PI / 2) - Math.PI / 2) * (Math.abs(cameraYaw) / cameraYaw)) * (lsTouchX / cameraSpeed)) - (((Math.abs(cameraYaw) - Math.PI / 2) * (-1)) * (lsTouchY / cameraSpeed));
                cameraYD += rsTouchX * 20 / cameraSpeed * (-1);
                cameraPD -= rsTouchY * 20 / cameraSpeed * (-1);
                new Camera().setCam();
            } else if (isDrawing) {
                cameraX += (((Math.abs(cameraYaw) - Math.PI / 2) * (-1)) * (lsTouchX / cameraSpeed)) + ((Math.abs(Math.abs(Math.abs(cameraYaw) - Math.PI / 2) - Math.PI / 2) * (Math.abs(cameraYaw) / cameraYaw * (-1))) * (lsTouchY / cameraSpeed));
                cameraY -= (((Math.abs(cameraYaw) - Math.PI / 2) - Math.PI / 2) * (Math.abs(cameraYaw) / cameraYaw) * (lsTouchX / cameraSpeed)) - (((Math.abs(cameraYaw) - Math.PI / 2) * (-1)) * (lsTouchY / cameraSpeed));
                new Camera().setCam();
            }
        }
        createStick();
        setInterval(loop, drawInterval);
    };
    const init = () => {
        try {
            if (!window.WALK) return setTimeout(init, 100);
            viewer = WALK.getViewer();
            viewer.setAllMaterialsEditable();
            viewer.onSceneReadyToDisplay(() => {
                storeOriginalMaterialStates();
                ZONES_CONFIG.forEach(initializePanelComponents);
                initJoystick(viewer);
            });
        } catch (e) { console.error("Init Error:", e); }
    }
    init();
});
