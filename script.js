/**
 * IMPLEMENTACIÓN API SHAPESPARK - VERSIÓN 8.0 (B&W MINIMALIST)
 * - Joystick D-PAD: Tamaño 95px (-15% de v7), Z-Index 500.
 * - ESTÉTICA: Blanco y Negro (Sin colores cian/verde).
 * - SENTIDO INVERTIDO: Eje Y del joystick izquierdo.
 * - VELOCIDAD: Ultra-lenta (cameraSpeed 8500).
 * Verificación: Busca "--- VERSIÓN 8.0 CARGADA ---" en la consola.
 */
document.addEventListener("DOMContentLoaded", () => {
    console.log("🚀 --- VERSIÓN 8.0 CARGADA ---");
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
    // --- LÓGICA DE PANELES ---
    const updatePanelVisibility = (viewName) => {
        if (!viewName) return;
        let activeZone = null;
        let isThisAControlView = false;
        ZONES_CONFIG.forEach(z => {
            if (z.triggerViews.map(v => v.toLowerCase()).includes(viewName.toLowerCase())) {
                activeZone = z;
                isThisAControlView = true;
            }
        });
        if (isThisAControlView) {
            document.querySelectorAll('.control-panel').forEach(p => p.style.display = 'none');
            if (activeZone) {
                const el = document.getElementById(activeZone.panelHtmlId);
                if (el) el.style.display = 'block';
            }
        }
    };
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
            if (idx < 0 || idx >= zoneConfig.sliderViews.length) return;
            const p = (idx / (zoneConfig.sliderViews.length - 1)) * 100;
            if (sliderThumb) sliderThumb.style.bottom = `calc(${p}% - 9px)`;
            if (sliderProg) sliderProg.style.height = `${p}%`;
            if (percDisp) percDisp.textContent = zoneConfig.viewLabels[idx];
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
                const idx = Math.min(zoneConfig.sliderViews.length - 1, Math.floor(norm * zoneConfig.sliderViews.length));
                updateSlider(idx);
            };
            sliderCont.addEventListener('mousedown', (e) => { dragging = true; handle(e.clientY); });
            document.addEventListener("mousemove", (e) => dragging && handle(e.clientY));
            document.addEventListener("mouseup", () => dragging = false);
            sliderCont.addEventListener('touchstart', (e) => { dragging = true; handle(e.touches[0].clientY); }, { passive: false });
            document.addEventListener("touchmove", (e) => { if (dragging) { handle(e.touches[0].clientY); e.preventDefault(); } }, { passive: false });
            document.addEventListener("touchend", () => dragging = false);
        }
    };
    // --- JOYSTICK D-PAD v8 (B&W) ---
    const initJoystick = (viewer) => {
        const cameraSpeed = 8500;
        const drawInterval = 1000 / 60;
        const SIZE = 95; // REDUCIDO 15% adicionales de la v7
        const wCanvas = document.getElementById('walk-canvas');
        if (!wCanvas) return;
        const leftStick = document.createElement('div');
        const rightStick = document.createElement('div');
        let joystickState = {
            left: { active: false, id: -1, startX: 0, startY: 0, dx: 0, dy: 0 },
            right: { active: false, id: -1, startX: 0, startY: 0, dx: 0, dy: 0 }
        };
        const applyStyle = (el, id) => {
            el.id = id; el.style.position = 'absolute'; el.style.width = SIZE + 'px'; el.style.height = SIZE + 'px';
            el.style.zIndex = '500'; el.style.touchAction = 'none'; el.style.pointerEvents = 'auto';
            el.style.userSelect = 'none'; el.style.opacity = '0.7'; el.style.cursor = 'pointer';
        };
        applyStyle(leftStick, 'ls_v8'); applyStyle(rightStick, 'rs_v8');
        const updateUI = () => {
            if (window.innerWidth > window.innerHeight) {
                leftStick.style.top = '50%'; leftStick.style.left = '40px'; leftStick.style.transform = 'translateY(-50%)';
                rightStick.style.top = '50%'; rightStick.style.right = '40px'; rightStick.style.transform = 'translateY(-50%)';
                rightStick.style.display = 'block';
            } else {
                leftStick.style.bottom = '30px'; leftStick.style.left = '50%'; leftStick.style.transform = 'translateX(-50%)';
                leftStick.style.top = 'auto'; rightStick.style.display = 'none';
            }
        };
        window.addEventListener('resize', updateUI); updateUI();
        const drawDpad = () => {
            const can = document.createElement('canvas'); can.width = can.height = SIZE;
            const ctx = can.getContext('2d'); const c = SIZE / 2;
            // Base B&W
            ctx.beginPath(); ctx.arc(c, c, SIZE * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(15, 15, 15, 0.9)'; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 3;
            ctx.fill(); ctx.stroke();
            // Flechas Blancas
            ctx.fillStyle = 'white';
            const s = 7; const d = SIZE * 0.28;
            const drawA = (x, y, r) => {
                ctx.save(); ctx.translate(x, y); ctx.rotate(r); ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s, s * 0.8); ctx.lineTo(-s, s * 0.8); ctx.closePath(); ctx.fill(); ctx.restore();
            };
            drawA(c, c - d, 0); drawA(c, c + d, Math.PI); drawA(c - d, c, -Math.PI / 2); drawA(c + d, c, Math.PI / 2);
            // Botón central Blanco (Estilo B&W)
            ctx.beginPath(); ctx.arc(c, c, SIZE * 0.14, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; ctx.fill();
            return can;
        };
        leftStick.appendChild(drawDpad()); rightStick.appendChild(drawDpad());
        wCanvas.parentNode.appendChild(leftStick); wCanvas.parentNode.appendChild(rightStick);
        const handleStart = (e, side) => {
            const t = e.changedTouches ? e.changedTouches[0] : e;
            const st = joystickState[side];
            st.active = true; st.id = t.identifier === undefined ? 'mouse' : t.identifier;
            st.startX = t.clientX; st.startY = t.clientY; st.dx = 0; st.dy = 0;
        };
        const handleMove = (e) => {
            const ts = e.changedTouches || [e];
            for (let i = 0; i < ts.length; i++) {
                const t = ts[i]; const id = t.identifier === undefined ? 'mouse' : t.identifier;
                if (joystickState.left.active && id === joystickState.left.id) {
                    joystickState.left.dx = t.clientX - joystickState.left.startX;
                    joystickState.left.dy = t.clientY - joystickState.left.startY; // Invertido
                }
                if (joystickState.right.active && id === joystickState.right.id) {
                    joystickState.right.dx = t.clientX - joystickState.right.startX;
                    joystickState.right.dy = joystickState.right.startY - t.clientY;
                }
            }
        };
        const handleEnd = (e) => {
            const ts = e.changedTouches || [e];
            for (let i = 0; i < ts.length; i++) {
                const id = ts[i].identifier === undefined ? 'mouse' : ts[i].identifier;
                if (id === joystickState.left.id) { joystickState.left.active = false; joystickState.left.id = -1; joystickState.left.dx = 0; joystickState.left.dy = 0; }
                if (id === joystickState.right.id) { joystickState.right.active = false; joystickState.right.id = -1; joystickState.right.dx = 0; joystickState.right.dy = 0; }
            }
            if (!e.changedTouches) { joystickState.left.active = false; joystickState.right.active = false; }
        };
        leftStick.addEventListener('touchstart', (e) => handleStart(e, 'left'), { passive: true });
        rightStick.addEventListener('touchstart', (e) => handleStart(e, 'right'), { passive: true });
        document.addEventListener('touchmove', handleMove, { passive: true });
        document.addEventListener('touchend', handleEnd); document.addEventListener('touchcancel', handleEnd);
        leftStick.addEventListener('mousedown', (e) => handleStart(e, 'left'));
        document.addEventListener('mousemove', handleMove); document.addEventListener('mouseup', handleEnd);
        setInterval(() => {
            if (!joystickState.left.active && !joystickState.right.active) return;
            const p = viewer.getCameraPosition(); const r = viewer.getCameraRotation();
            if (!p || !r) return;
            const s = 15 / cameraSpeed; const cY = Math.cos(r.yaw); const sY = Math.sin(r.yaw);
            let mx = 0, my = 0;
            if (joystickState.left.active) {
                mx = (sY * joystickState.left.dy + cY * joystickState.left.dx) * s;
                my = (-cY * joystickState.left.dy + sY * joystickState.left.dx) * s;
            }
            let ry = 0, rp = 0;
            if (joystickState.right.active) {
                ry = joystickState.right.dx * 30 / cameraSpeed;
                rp = joystickState.right.dy * 30 / cameraSpeed;
            }
            const v = new window.WALK.View();
            v.position.x = p.x + mx; v.position.y = p.y + my; v.position.z = p.z;
            v.rotation.yawDeg = r.yawDeg - ry; v.rotation.pitchDeg = r.pitchDeg + rp;
            viewer.switchToView(v, 0);
        }, drawInterval);
    };
    const init = () => {
        if (!window.WALK) return setTimeout(init, 100);
        viewer = WALK.getViewer(); viewer.setAllMaterialsEditable();
        viewer.onSceneReadyToDisplay(() => {
            ZONES_CONFIG.forEach(z => initializePanelComponents(z));
            initJoystick(viewer);
        });
        viewer.onViewSwitchDone(updatePanelVisibility);
    };
    init();
});
