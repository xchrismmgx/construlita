/**
 * IMPLEMENTACIÓN API SHAPESPARK - VERSIÓN 5.0 (PREMIUM STABLE)
 * - Joystick D-PAD (140px) con Flechas y efectos visuales.
 * - FIX: Independencia total de sticks (Multitouch corregido).
 * - FIX: Los controles ya no se quedan "pegados" al soltar.
 * - FIX: Movimiento ultra-suave y amortiguado.
 * Verificación: Busca "--- VERSIÓN 5.0 CARGADA ---" en la consola.
 */
document.addEventListener("DOMContentLoaded", () => {
    console.log("🚀 --- VERSIÓN 5.0 CARGADA ---");
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
    // --- JOYSTICK D-PAD v5 ---
    const initJoystick = (viewer) => {
        const cameraSpeed = 1800;
        const drawInterval = 1000 / 60; // 60fps para suavidad máxima
        const SIZE = 140;
        const wCanvas = document.getElementById('walk-canvas');
        if (!wCanvas) return;
        const leftStick = document.createElement('div');
        const rightStick = document.createElement('div');
        // Estados de control refinados
        let joystickState = {
            left: { active: false, id: -1, startX: 0, startY: 0, dx: 0, dy: 0 },
            right: { active: false, id: -1, startX: 0, startY: 0, dx: 0, dy: 0 }
        };
        const applyStyle = (el, id) => {
            el.id = id;
            el.style.position = 'absolute'; el.style.width = SIZE + 'px'; el.style.height = SIZE + 'px';
            el.style.zIndex = '1000000'; el.style.touchAction = 'none'; el.style.pointerEvents = 'auto';
            el.style.userSelect = 'none'; el.style.opacity = '0.9'; el.style.cursor = 'pointer';
        };
        applyStyle(leftStick, 'left_stick_v5'); applyStyle(rightStick, 'right_stick_v5');
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
        const drawDpad = (colorCenter) => {
            const can = document.createElement('canvas'); can.width = can.height = SIZE;
            const ctx = can.getContext('2d'); const c = SIZE / 2;
            // Sombra externa
            ctx.shadowBlur = 15; ctx.shadowColor = 'rgba(0,0,0,0.5)';
            // Base
            ctx.beginPath(); ctx.arc(c, c, SIZE * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(25, 25, 25, 0.9)'; ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 4;
            ctx.fill(); ctx.stroke();
            ctx.shadowBlur = 0; // Quitar sombra para el resto
            // Flechas
            ctx.fillStyle = 'white';
            const s = 10; const d = SIZE * 0.28;
            const drawA = (x, y, r) => {
                ctx.save(); ctx.translate(x, y); ctx.rotate(r); ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s, s * 0.8); ctx.lineTo(-s, s * 0.8); ctx.closePath(); ctx.fill(); ctx.restore();
            };
            drawA(c, c - d, 0); drawA(c, c + d, Math.PI); drawA(c - d, c, -Math.PI / 2); drawA(c + d, c, Math.PI / 2);
            // Botón central con brillo
            ctx.beginPath(); ctx.arc(c, c, SIZE * 0.14, 0, Math.PI * 2);
            ctx.fillStyle = colorCenter; ctx.fill();
            return can;
        };
        leftStick.appendChild(drawDpad('#00f2ff'));
        rightStick.appendChild(drawDpad('#00ff88'));
        wCanvas.parentNode.appendChild(leftStick);
        wCanvas.parentNode.appendChild(rightStick);
        // MANEJO DE EVENTOS (Estricto por Stick)
        const handleStart = (e, stickSide) => {
            const touch = e.changedTouches ? e.changedTouches[0] : e;
            const state = joystickState[stickSide];
            state.active = true;
            state.id = touch.identifier === undefined ? 'mouse' : touch.identifier;
            state.startX = touch.clientX;
            state.startY = touch.clientY;
            state.dx = 0; state.dy = 0;
        };
        const handleMove = (e) => {
            const touches = e.changedTouches || [e];
            for (let i = 0; i < touches.length; i++) {
                const t = touches[i];
                const id = t.identifier === undefined ? 'mouse' : t.identifier;
                if (joystickState.left.active && id === joystickState.left.id) {
                    joystickState.left.dx = t.clientX - joystickState.left.startX;
                    joystickState.left.dy = joystickState.left.startY - t.clientY;
                }
                if (joystickState.right.active && id === joystickState.right.id) {
                    joystickState.right.dx = t.clientX - joystickState.right.startX;
                    joystickState.right.dy = joystickState.right.startY - t.clientY;
                }
            }
        };
        const handleEnd = (e) => {
            const touches = e.changedTouches || [e];
            for (let i = 0; i < touches.length; i++) {
                const id = touches[i].identifier === undefined ? 'mouse' : touches[i].identifier;
                if (id === joystickState.left.id) {
                    joystickState.left.active = false; joystickState.left.id = -1;
                    joystickState.left.dx = 0; joystickState.left.dy = 0;
                }
                if (id === joystickState.right.id) {
                    joystickState.right.active = false; joystickState.right.id = -1;
                    joystickState.right.dx = 0; joystickState.right.dy = 0;
                }
            }
            if (!e.changedTouches) { // Mouse fallback
                joystickState.left.active = false; joystickState.right.active = false;
                joystickState.left.dx = 0; joystickState.left.dy = 0;
                joystickState.right.dx = 0; joystickState.right.dy = 0;
            }
        };
        leftStick.addEventListener('touchstart', (e) => handleStart(e, 'left'), { passive: true });
        rightStick.addEventListener('touchstart', (e) => handleStart(e, 'right'), { passive: true });
        document.addEventListener('touchmove', handleMove, { passive: true });
        document.addEventListener('touchend', handleEnd);
        document.addEventListener('touchcancel', handleEnd);
        leftStick.addEventListener('mousedown', (e) => handleStart(e, 'left'));
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);
        // LOOP DE ACTUALIZACIÓN (Cálculo trigonométrico Ultra-Silencioso)
        setInterval(() => {
            if (!joystickState.left.active && !joystickState.right.active) return;
            const pos = viewer.getCameraPosition();
            const rot = viewer.getCameraRotation();
            if (!pos || !rot) return;
            const scale = 15 / cameraSpeed;
            const cosY = Math.cos(rot.yaw);
            const sinY = Math.sin(rot.yaw);
            // LEFT STICK: Traslación (Frente/Atrás + Laterales)
            let moveX = 0, moveY = 0;
            if (joystickState.left.active) {
                moveX = (sinY * joystickState.left.dy + cosY * joystickState.left.dx) * scale;
                moveY = (-cosY * joystickState.left.dy + sinY * joystickState.left.dx) * scale;
            }
            // RIGHT STICK: Rotación (Giro + Cabeceo)
            let rotYaw = 0, rotPitch = 0;
            if (joystickState.right.active) {
                rotYaw = joystickState.right.dx * 30 / cameraSpeed;
                rotPitch = joystickState.right.dy * 30 / cameraSpeed;
            }
            const v = new window.WALK.View();
            v.position.x = pos.x + moveX;
            v.position.y = pos.y + moveY;
            v.position.z = pos.z;
            v.rotation.yawDeg = rot.yawDeg - rotYaw;
            v.rotation.pitchDeg = rot.pitchDeg + rotPitch;
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
