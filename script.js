/**
 * IMPLEMENTACIÓN API SHAPESPARK - VERSIÓN ULTRA-ESTABLE
 * - Joystick D-PAD (140px) con Flechas.
 * - Fix: Pantalla negra (Error matemático en Yaw=0).
 * - Fix: Multitouch en móviles (Uso independiente de sticks).
 * - Fix: Los paneles ya no se cierran al caminar.
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
    // --- LÓGICA DE PANELES ---
    const updatePanelVisibility = (viewName) => {
        if (!viewName) return;
        let activeZone = null;
        let isTriggerView = false;
        ZONES_CONFIG.forEach(z => {
            if (z.triggerViews.map(v => v.toLowerCase()).includes(viewName.toLowerCase())) {
                activeZone = z;
                isTriggerView = true;
            }
        });
        if (isTriggerView) {
            document.querySelectorAll('.control-panel').forEach(p => p.style.display = 'none');
            if (activeZone) {
                const el = document.getElementById(activeZone.panelHtmlId);
                if (el) el.style.display = 'block';
            }
        }
    };
    // --- JOYSTICK D-PAD v3 ---
    const initJoystick = (viewer) => {
        const cameraSpeed = 2000;
        const drawInterval = 1000 / 30;
        const SIZE = 140;
        const wCanvas = document.getElementById('walk-canvas');
        if (!wCanvas) return;
        const leftStick = document.createElement('div');
        const rightStick = document.createElement('div');
        leftStick.id = 'ls_pad'; rightStick.id = 'rs_pad';
        // Estados de toque
        let lsTouchID = -1, rsTouchID = -1;
        let lsStart = { x: 0, y: 0 }, rsStart = { x: 0, y: 0 };
        let lsDelta = { x: 0, y: 0 }, rsDelta = { x: 0, y: 0 };
        const applyStyle = (el) => {
            el.style.position = 'absolute'; el.style.width = SIZE + 'px'; el.style.height = SIZE + 'px';
            el.style.zIndex = '2000000'; el.style.touchAction = 'none'; el.style.pointerEvents = 'auto';
            el.style.userSelect = 'none'; el.style.opacity = '0.8'; el.style.cursor = 'pointer';
        };
        applyStyle(leftStick); applyStyle(rightStick);
        const updateUI = () => {
            if (window.innerWidth > window.innerHeight) {
                leftStick.style.top = '50%'; leftStick.style.left = '40px'; leftStick.style.transform = 'translateY(-50%)';
                rightStick.style.top = '50%'; rightStick.style.right = '40px'; rightStick.style.transform = 'translateY(-50%)';
                rightStick.style.display = 'block';
            } else {
                leftStick.style.bottom = '40px'; leftStick.style.left = '50%'; leftStick.style.transform = 'translateX(-50%)';
                leftStick.style.top = 'auto'; rightStick.style.display = 'none';
            }
        };
        window.addEventListener('resize', updateUI); updateUI();
        const drawDpad = () => {
            const can = document.createElement('canvas'); can.width = can.height = SIZE;
            const ctx = can.getContext('2d'); const c = SIZE / 2;
            ctx.beginPath(); ctx.arc(c, c, SIZE * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(25, 25, 25, 0.8)'; ctx.strokeStyle = 'white'; ctx.lineWidth = 2;
            ctx.fill(); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            const s = 10; const d = SIZE * 0.28;
            const drawA = (x, y, r) => {
                ctx.save(); ctx.translate(x, y); ctx.rotate(r); ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s, s); ctx.lineTo(-s, s); ctx.closePath(); ctx.fill(); ctx.restore();
            };
            drawA(c, c - d, 0); drawA(c, c + d, Math.PI); drawA(c - d, c, -Math.PI / 2); drawA(c + d, c, Math.PI / 2);
            ctx.beginPath(); ctx.arc(c, c, SIZE * 0.15, 0, Math.PI * 2); ctx.fillStyle = '#00e5ff'; ctx.fill();
            return can;
        };
        leftStick.appendChild(drawDpad()); rightStick.appendChild(drawDpad());
        wCanvas.parentNode.appendChild(leftStick); wCanvas.parentNode.appendChild(rightStick);
        // EVENTOS
        const handleStart = (e, isRight) => {
            const t = e.changedTouches ? e.changedTouches[0] : e;
            if (isRight) { rsTouchID = t.identifier || 99; rsStart = { x: t.clientX, y: t.clientY }; rsDelta = { x: 0, y: 0 }; }
            else { lsTouchID = t.identifier || 88; lsStart = { x: t.clientX, y: t.clientY }; lsDelta = { x: 0, y: 0 }; }
        };
        const handleMove = (e) => {
            const touches = e.changedTouches || [e];
            for (let i = 0; i < touches.length; i++) {
                const t = touches[i];
                const id = t.identifier || (t.clientX === lsStart.x ? 88 : 99); // Fallback basico
                if (id === lsTouchID) { lsDelta.x = t.clientX - lsStart.x; lsDelta.y = lsStart.y - t.clientY; }
                else if (id === rsTouchID) { rsDelta.x = t.clientX - rsStart.x; rsDelta.y = rsStart.y - t.clientY; }
            }
        };
        const handleEnd = (e) => {
            const touches = e.changedTouches || [e];
            for (let i = 0; i < touches.length; i++) {
                const id = touches[i].identifier || -1;
                if (id === lsTouchID || !e.changedTouches) { lsTouchID = -1; lsDelta = { x: 0, y: 0 }; }
                if (id === rsTouchID) { rsTouchID = -1; rsDelta = { x: 0, y: 0 }; }
            }
        };
        leftStick.addEventListener('touchstart', (e) => handleStart(e, false), { passive: true });
        rightStick.addEventListener('touchstart', (e) => handleStart(e, true), { passive: true });
        document.addEventListener('touchmove', handleMove, { passive: true });
        document.addEventListener('touchend', handleEnd);
        leftStick.addEventListener('mousedown', (e) => handleStart(e, false));
        document.addEventListener('mousemove', (e) => (lsTouchID !== -1 || rsTouchID !== -1) && handleMove(e));
        document.addEventListener('mouseup', handleEnd);
        // LOOP DE ANIMACIÓN
        setInterval(() => {
            if (lsTouchID === -1 && rsTouchID === -1) return;
            const pos = viewer.getCameraPosition();
            const rot = viewer.getCameraRotation();
            if (!pos || !rot) return;
            let yaw = rot.yaw;
            // FIX: Evitar division por cero/NaN
            let safeYaw = yaw === 0 ? 0.0001 : yaw;
            // Movimiento (LS)
            const moveX = (((Math.abs(safeYaw) - Math.PI / 2) * (-1)) * (lsDelta.x / cameraSpeed)) + ((Math.abs(Math.abs(Math.abs(safeYaw) - Math.PI / 2) - Math.PI / 2) * (Math.abs(safeYaw) / safeYaw * (-1))) * (lsDelta.y / cameraSpeed));
            const moveY = - (((Math.abs(Math.abs(safeYaw) - Math.PI / 2) - Math.PI / 2) * (Math.abs(safeYaw) / safeYaw)) * (lsDelta.x / cameraSpeed)) + (((Math.abs(safeYaw) - Math.PI / 2) * (-1)) * (lsDelta.y / cameraSpeed));
            // Rotación (RS)
            let newYawDeg = rot.yawDeg + (rsDelta.x * 20 / cameraSpeed * -1);
            let newPitchDeg = rot.pitchDeg - (rsDelta.y * 20 / cameraSpeed * -1);
            const v = new window.WALK.View();
            v.position.x = pos.x + moveX; v.position.y = pos.y + moveY; v.position.z = pos.z;
            v.rotation.yawDeg = newYawDeg; v.rotation.pitchDeg = newPitchDeg;
            viewer.switchToView(v, 0);
        }, drawInterval);
    };
    const init = () => {
        if (!window.WALK) return setTimeout(init, 100);
        viewer = WALK.getViewer();
        viewer.setAllMaterialsEditable();
        viewer.onSceneReadyToDisplay(() => {
            ZONES_CONFIG.forEach(z => {
                const panel = document.getElementById(z.panelHtmlId);
                if (panel) {
                    panel.querySelector('.close-panel-btn')?.addEventListener('click', () => panel.style.display = 'none');
                    panel.querySelectorAll('.temp-btn').forEach(b => b.onclick = (e) => {
                        panel.querySelectorAll('.temp-btn').forEach(btn => btn.classList.remove('active'));
                        e.target.classList.add('active');
                        const temp = temperatureSettings[parseInt(e.target.dataset.temp)];
                        z.materials.forEach(mName => {
                            const m = viewer.findMaterial(mName);
                            if (m) {
                                if (m.baseColorTexture) {
                                    m.setTextureMapHslAdjustment("baseColorTexture", "h", temp.h);
                                    m.setTextureMapHslAdjustment("baseColorTexture", "s", temp.s * GLOBAL_COLOR_INTENSITY);
                                    m.setTextureMapHslAdjustment("baseColorTexture", "l", temp.l);
                                    m.setTextureMapCorrectionTurnedOn("baseColorTexture", true);
                                } else {
                                    const h = m.baseColor.getHSL(); h.h = temp.h; h.s = temp.s * GLOBAL_COLOR_INTENSITY; h.l = temp.l;
                                    m.baseColor.setHSL(h);
                                }
                            }
                        });
                        viewer.requestFrame();
                    });
                }
            });
            initJoystick(viewer);
        });
        viewer.onViewSwitchDone(updatePanelVisibility);
    };
    init();
});
