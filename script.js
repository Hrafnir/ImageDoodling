/* Version: #17 */
console.log("[App] Laster script v#17...");

// === GLOBALE VARIABLER ===
const canvas = new fabric.Canvas('c', {
    width: window.innerWidth - 50,
    height: window.innerHeight - 100,
    backgroundColor: null,
    selection: true,
    fireRightClick: true,
    stopContextMenu: true
});

// Tilstander
let currentMode = 'select'; 
let isDrawing = false;
let isDraggingCanvas = false;
let activeShape = null;
let lastMouseX, lastMouseY;

// Polygon variabler (Tegning)
let polyPoints = [];
let polyHelpers = [];
let polyActiveLine = null;

// Polygon variabler (Redigering)
let isEditingPoly = false;
let editPolyTarget = null;
let editPolyControls = [];
let editPolyLines = [];

// Referanser til DOM
const ui = {
    btns: {
        select: document.getElementById('btn-select'),
        free: document.getElementById('btn-free'),
        line: document.getElementById('btn-line'),
        arrow: document.getElementById('btn-arrow'),
        rect: document.getElementById('btn-rect'),
        poly: document.getElementById('btn-poly'),
        del: document.getElementById('btn-delete'),
        clear: document.getElementById('btn-clear'),
        save: document.getElementById('btn-save'),
        resetZoom: document.getElementById('btn-reset-zoom')
    },
    inputs: {
        strokeColor: document.getElementById('strokeColor'),
        strokeWidth: document.getElementById('strokeWidth'),
        fillColor: document.getElementById('fillColor')
    },
    radios: {
        none: document.getElementById('fill-none'),
        solid: document.getElementById('fill-solid'),
        hatch: document.getElementById('fill-hatch')
    },
    status: document.getElementById('status-text'),
    contextMenu: document.getElementById('context-menu')
};

// === ZOOM OG PANORERING ===

canvas.on('mouse:wheel', function(opt) {
    const delta = opt.e.deltaY;
    let zoom = canvas.getZoom();
    zoom *= 0.999 ** delta;
    if (zoom > 20) zoom = 20;
    if (zoom < 0.01) zoom = 0.01;
    
    canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
    opt.e.preventDefault();
    opt.e.stopPropagation();
    ui.status.innerHTML = `Zoom: ${Math.round(zoom * 100)}%`;
});

ui.btns.resetZoom.onclick = function() {
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    ui.status.innerHTML = "Zoom: 100%";
};

canvas.on('mouse:down', function(opt) {
    const evt = opt.e;
    if (evt.altKey === true) {
        isDraggingCanvas = true;
        canvas.selection = false;
        lastMouseX = evt.clientX;
        lastMouseY = evt.clientY;
        canvas.defaultCursor = 'grab';
    }
});

canvas.on('mouse:move', function(opt) {
    if (isDraggingCanvas) {
        const e = opt.e;
        const vpt = canvas.viewportTransform;
        vpt[4] += e.clientX - lastMouseX;
        vpt[5] += e.clientY - lastMouseY;
        canvas.requestRenderAll();
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    }
});

canvas.on('mouse:up', function() {
    if (isDraggingCanvas) {
        isDraggingCanvas = false;
        canvas.selection = true;
        canvas.defaultCursor = 'default';
    }
});

// === HJELPEFUNKSJONER ===

function setStatus(msg) {
    ui.status.innerHTML = msg;
}

function createHatchPattern(color) {
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = 10;
    patternCanvas.height = 10;
    const ctx = patternCanvas.getContext('2d');
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(10, 0);
    ctx.stroke();
    return new fabric.Pattern({ source: patternCanvas, repeat: 'repeat' });
}

function getCurrentFill() {
    if (ui.radios.none.checked) return 'transparent';
    if (ui.radios.solid.checked) return ui.inputs.fillColor.value;
    if (ui.radios.hatch.checked) return createHatchPattern(ui.inputs.fillColor.value);
    return 'transparent';
}

// === MODUS STYRING ===

function setMode(mode) {
    if (currentMode === mode && mode !== 'polygon') return;
    
    // Avslutt redigering hvis vi bytter verktøy
    if (isEditingPoly) finishPolyEdit();

    // Avbryt påbegynt tegning
    if (currentMode === 'polygon' && mode !== 'polygon') {
        abortPolygonDrawing();
    }

    currentMode = mode;
    
    // UI
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    if (ui.btns[mode]) ui.btns[mode].classList.add('active');

    canvas.isDrawingMode = (mode === 'free');
    canvas.selection = (mode === 'select');
    canvas.defaultCursor = (mode === 'select') ? 'default' : 'crosshair';
    
    if (mode === 'free') {
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.color = ui.inputs.strokeColor.value;
        canvas.freeDrawingBrush.width = parseInt(ui.inputs.strokeWidth.value, 10) || 5;
        setStatus("Frihånd: Tegn fritt.");
    } else if (mode === 'polygon') {
        setStatus("Mangekant: Klikk for punkter. Klikk på startpunktet for å lukke.");
        polyPoints = [];
        clearPolyHelpers();
    } else {
        setStatus(`Verktøy: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
    }
}

// Knytt knapper
ui.btns.select.onclick = () => setMode('select');
ui.btns.free.onclick = () => setMode('free');
ui.btns.line.onclick = () => setMode('line');
ui.btns.arrow.onclick = () => setMode('arrow');
ui.btns.rect.onclick = () => setMode('rect');
ui.btns.poly.onclick = () => setMode('polygon');

// === TEGNING (Mouse Events) ===

canvas.on('mouse:down', function(o) {
    // 1. Høyreklikk
    if (o.button === 3) {
        if (o.target) {
            canvas.setActiveObject(o.target);
            showContextMenu(o.e, o.target);
        }
        return;
    }
    hideContextMenu();

    if (isDraggingCanvas || isEditingPoly) return;

    // 2. Polygon tegning
    if (currentMode === 'polygon') {
        handlePolyClick(o);
        return;
    }

    if (currentMode === 'select' || currentMode === 'free') return;

    // 3. Start tegning av former
    isDrawing = true;
    const pointer = canvas.getPointer(o.e);
    const origX = pointer.x;
    const origY = pointer.y;

    const commonProps = {
        left: origX, top: origY,
        stroke: ui.inputs.strokeColor.value,
        strokeWidth: parseInt(ui.inputs.strokeWidth.value, 10),
        fill: getCurrentFill(),
        originX: 'left', originY: 'top',
        selectable: false, evented: false
    };

    if (currentMode === 'rect') {
        activeShape = new fabric.Rect({ ...commonProps, width: 0, height: 0 });
    } else if (currentMode === 'line' || currentMode === 'arrow') {
        activeShape = new fabric.Line([origX, origY, origX, origY], {
            ...commonProps,
            fill: ui.inputs.strokeColor.value
        });
    }

    if (activeShape) {
        canvas.add(activeShape);
        activeShape.ox = origX;
        activeShape.oy = origY;
    }
});

canvas.on('mouse:move', function(o) {
    const pointer = canvas.getPointer(o.e);

    // Oppdater elastisk linje for polygon
    if (currentMode === 'polygon' && polyActiveLine) {
        if (polyPoints.length > 2) {
            const start = polyPoints[0];
            const dist = Math.hypot(pointer.x - start.x, pointer.y - start.y);
            if (dist < 15) {
                polyActiveLine.set({ x2: start.x, y2: start.y, stroke: '#00ff00' });
            } else {
                polyActiveLine.set({ x2: pointer.x, y2: pointer.y, stroke: ui.inputs.strokeColor.value });
            }
        } else {
            polyActiveLine.set({ x2: pointer.x, y2: pointer.y });
        }
        canvas.renderAll();
        return;
    }

    if (!isDrawing || !activeShape) return;

    if (currentMode === 'rect') {
        if (activeShape.ox > pointer.x) activeShape.set({ left: Math.abs(pointer.x) });
        if (activeShape.oy > pointer.y) activeShape.set({ top: Math.abs(pointer.y) });
        activeShape.set({ width: Math.abs(activeShape.ox - pointer.x) });
        activeShape.set({ height: Math.abs(activeShape.oy - pointer.y) });
    } 
    else if (currentMode === 'line' || currentMode === 'arrow') {
        activeShape.set({ x2: pointer.x, y2: pointer.y });
    }
    canvas.renderAll();
});

canvas.on('mouse:up', function() {
    if (!isDrawing) return;
    isDrawing = false;

    if (currentMode === 'arrow' && activeShape) {
        createArrow(activeShape);
    } else if (activeShape) {
        activeShape.setCoords();
        activeShape.set({ selectable: true, evented: true });
    }
    activeShape = null;
});

// Dobbeltklikk håndtering (Både for å lukke polygon under tegning, og redigere eksisterende)
canvas.on('mouse:dblclick', function(o) {
    // Hvis vi tegner polygon: Avslutt tegning (hvis nok punkter)
    if (currentMode === 'polygon') {
        // Denne håndteres primært av "klikk på startpunkt", men vi kan ha den her også
        return; 
    }
    
    // Hvis vi er i select mode og dobbeltklikker på en polygon: Start redigering
    if (currentMode === 'select' && o.target && o.target.type === 'polygon') {
        startPolyEdit(o.target);
    }
});

function createArrow(lineObj) {
    const width = lineObj.strokeWidth;
    const color = lineObj.stroke;
    const headSize = width * 3;
    const dx = lineObj.x2 - lineObj.x1;
    const dy = lineObj.y2 - lineObj.y1;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    canvas.remove(lineObj);

    const arrowLine = new fabric.Line([lineObj.x1, lineObj.y1, lineObj.x2, lineObj.y2], {
        stroke: color, strokeWidth: width,
        originX: 'center', originY: 'center'
    });

    const arrowHead = new fabric.Triangle({
        left: lineObj.x2, top: lineObj.y2,
        angle: angle + 90,
        width: headSize, height: headSize,
        fill: color,
        originX: 'center', originY: 'center'
    });

    const group = new fabric.Group([arrowLine, arrowHead], { selectable: true });
    canvas.add(group);
    canvas.renderAll();
}

// === POLYGON TEGNING LOGIKK ===

function handlePolyClick(o) {
    const pointer = canvas.getPointer(o.e);
    
    // Sjekk om vi lukker polygonet
    if (polyPoints.length > 2) {
        const start = polyPoints[0];
        const dist = Math.hypot(pointer.x - start.x, pointer.y - start.y);
        if (dist < 15) {
            finishPolygon();
            return;
        }
    }

    polyPoints.push({ x: pointer.x, y: pointer.y });

    const circle = new fabric.Circle({
        radius: 5, fill: ui.inputs.strokeColor.value,
        left: pointer.x, top: pointer.y,
        originX: 'center', originY: 'center',
        selectable: false, evented: false
    });
    polyHelpers.push(circle);
    canvas.add(circle);

    if (polyPoints.length > 1) {
        const p1 = polyPoints[polyPoints.length - 2];
        const p2 = polyPoints[polyPoints.length - 1];
        const line = new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
            stroke: ui.inputs.strokeColor.value,
            strokeWidth: parseInt(ui.inputs.strokeWidth.value, 10),
            selectable: false, evented: false
        });
        polyHelpers.push(line);
        canvas.add(line);
    }

    if (polyActiveLine) canvas.remove(polyActiveLine);
    polyActiveLine = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        stroke: ui.inputs.strokeColor.value,
        strokeWidth: 1, strokeDashArray: [5, 5],
        selectable: false, evented: false, opacity: 0.6
    });
    canvas.add(polyActiveLine);
}

function finishPolygon() {
    clearPolyHelpers();
    const polygon = new fabric.Polygon(polyPoints, {
        stroke: ui.inputs.strokeColor.value,
        strokeWidth: parseInt(ui.inputs.strokeWidth.value, 10),
        fill: getCurrentFill(),
        objectCaching: false
    });
    canvas.add(polygon);
    canvas.renderAll();
    polyPoints = [];
    setMode('select');
}

function abortPolygonDrawing() {
    clearPolyHelpers();
    polyPoints = [];
}

function clearPolyHelpers() {
    polyHelpers.forEach(o => canvas.remove(o));
    polyHelpers = [];
    if (polyActiveLine) {
        canvas.remove(polyActiveLine);
        polyActiveLine = null;
    }
}

// === POLYGON REDIGERING (AVANSERT) ===

function startPolyEdit(poly) {
    if (isEditingPoly) return; // Allerede i edit mode
    
    isEditingPoly = true;
    editPolyTarget = poly;
    setStatus("Redigering: Dra røde punkter. <strong>Klikk på blå linjer</strong> for å legge til nye punkter. Trykk 'Velg' for å lagre.");

    // Skjul originalen
    poly.visible = false;
    poly.evented = false;
    canvas.discardActiveObject();
    
    // Beregn absolutte koordinater
    const matrix = poly.calcTransformMatrix();
    const points = poly.points.map(p => fabric.util.transformPoint({ x: p.x, y: p.y }, matrix));
    
    rebuildEditControls(points);
    canvas.requestRenderAll();
}

function rebuildEditControls(points) {
    // Rydd opp gamle kontroller
    editPolyControls.forEach(c => canvas.remove(c));
    editPolyLines.forEach(l => canvas.remove(l));
    editPolyControls = [];
    editPolyLines = [];

    // 1. Tegn linjer mellom punktene (Blå, tykke for å være lette å klikke på)
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        
        const line = new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
            stroke: '#00aaff',
            strokeWidth: 4, // Tykkere for å være lettere å treffe
            selectable: false,
            hoverCursor: 'copy', // Viser at man kan legge til noe
            dataP1Index: i // Husker hvilken indeks dette er
        });
        
        // Klikk på linje legger til punkt
        line.on('mousedown', function(opt) {
            if (opt.e.button !== 0) return; // Kun venstreklikk
            addPolyPointAtLine(this, opt.e);
        });

        editPolyLines.push(line);
        canvas.add(line);
    }

    // 2. Tegn punkter (Røde sirkler)
    points.forEach((p, index) => {
        const circle = new fabric.Circle({
            left: p.x, top: p.y,
            radius: 6,
            fill: 'rgba(255,0,0,0.9)',
            stroke: 'white', strokeWidth: 1,
            originX: 'center', originY: 'center',
            hasControls: false, hasBorders: false,
            dataIndex: index
        });

        // Når punkt flyttes -> oppdater linjene
        circle.on('moving', updateEditLinesFromCircles);

        editPolyControls.push(circle);
        canvas.add(circle);
    });
}

function updateEditLinesFromCircles() {
    const points = editPolyControls.map(c => ({ x: c.left, y: c.top }));
    
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const line = editPolyLines[i];
        line.set({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    }
}

function addPolyPointAtLine(lineObj, evt) {
    const pointer = canvas.getPointer(evt);
    const newPoint = { x: pointer.x, y: pointer.y };
    
    // Hent eksisterende punkter
    const currentPoints = editPolyControls.map(c => ({ x: c.left, y: c.top }));
    
    // Sett inn nytt punkt
    const insertIndex = lineObj.dataP1Index + 1;
    currentPoints.splice(insertIndex, 0, newPoint);
    
    // Tegn opp på nytt
    rebuildEditControls(currentPoints);
    canvas.requestRenderAll();
}

function finishPolyEdit() {
    if (!isEditingPoly || !editPolyTarget) return;
    
    // Hent endelige punkter
    const finalPoints = editPolyControls.map(c => ({ x: c.left, y: c.top }));
    
    // Rydd opp
    editPolyControls.forEach(c => canvas.remove(c));
    editPolyLines.forEach(l => canvas.remove(l));
    editPolyControls = [];
    editPolyLines = [];

    // Lag ny polygon
    const newPoly = new fabric.Polygon(finalPoints, {
        stroke: editPolyTarget.stroke,
        strokeWidth: editPolyTarget.strokeWidth,
        fill: editPolyTarget.fill,
        objectCaching: false
    });

    // Erstatt gammel med ny
    canvas.remove(editPolyTarget);
    canvas.add(newPoly);
    canvas.setActiveObject(newPoly);
    
    isEditingPoly = false;
    editPolyTarget = null;
    
    // Gå til select mode
    setMode('select');
    canvas.requestRenderAll();
}

// === KONTEKST MENY ===

function showContextMenu(e, target) {
    e.preventDefault();
    const menu = ui.contextMenu;
    menu.style.display = 'block';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    document.getElementById('ctx-edit-poly').style.display = (target.type === 'polygon') ? 'block' : 'none';
}

function hideContextMenu() {
    ui.contextMenu.style.display = 'none';
}

window.onclick = (e) => {
    if (!e.target.closest('.context-menu')) hideContextMenu();
};

document.getElementById('ctx-delete').onclick = () => {
    const active = canvas.getActiveObject();
    if (active) canvas.remove(active);
    hideContextMenu();
};

document.getElementById('ctx-toggle-fill').onclick = () => {
    const active = canvas.getActiveObject();
    if (active) {
        const cur = active.fill;
        active.set('fill', (cur === 'transparent' || !cur) ? ui.inputs.fillColor.value : 'transparent');
        canvas.requestRenderAll();
    }
    hideContextMenu();
};

document.getElementById('ctx-toggle-hatch').onclick = () => {
    const active = canvas.getActiveObject();
    if (active) {
        active.set('fill', createHatchPattern(ui.inputs.fillColor.value));
        canvas.requestRenderAll();
    }
    hideContextMenu();
};

document.getElementById('ctx-send-back').onclick = () => {
    const active = canvas.getActiveObject();
    if (active) canvas.sendToBack(active);
    hideContextMenu();
};

document.getElementById('ctx-bring-front').onclick = () => {
    const active = canvas.getActiveObject();
    if (active) canvas.bringToFront(active);
    hideContextMenu();
};

document.getElementById('ctx-edit-poly').onclick = () => {
    const active = canvas.getActiveObject();
    if (active && active.type === 'polygon') startPolyEdit(active);
    hideContextMenu();
};

// === DIVERSE ===

window.addEventListener('keydown', function(e) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditingPoly) {
        const active = canvas.getActiveObjects();
        if (active.length) {
            canvas.discardActiveObject();
            active.forEach(o => canvas.remove(o));
        }
    }
    if (e.key === 'Escape') {
        if (isEditingPoly) finishPolyEdit();
        else if (currentMode === 'polygon') abortPolygonDrawing();
        setMode('select');
    }
});

window.addEventListener('paste', function(e) {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let item of items) {
        if (item.kind === 'file' && item.type.indexOf('image/') !== -1) {
            const blob = item.getAsFile();
            const reader = new FileReader();
            reader.onload = function(event) {
                const imgObj = new Image();
                imgObj.src = event.target.result;
                imgObj.onload = function() {
                    const imgInstance = new fabric.Image(imgObj);
                    canvas.setWidth(imgInstance.width);
                    canvas.setHeight(imgInstance.height);
                    canvas.setBackgroundImage(imgInstance, canvas.renderAll.bind(canvas));
                    setStatus("Bilde limt inn.");
                }
            };
            reader.readAsDataURL(blob);
        }
    }
});

ui.btns.save.onclick = function() {
    const originalVpt = canvas.viewportTransform;
    const originalWidth = canvas.width;
    const originalHeight = canvas.height;
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    if (canvas.backgroundImage) {
        canvas.setWidth(canvas.backgroundImage.width);
        canvas.setHeight(canvas.backgroundImage.height);
    }
    const dataURL = canvas.toDataURL({ format: 'png', multiplier: 1 });
    const link = document.createElement('a');
    link.download = 'tegning_pro.png';
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    canvas.setWidth(originalWidth);
    canvas.setHeight(originalHeight);
    canvas.setViewportTransform(originalVpt);
    canvas.requestRenderAll();
};

ui.btns.clear.onclick = () => {
    if (confirm("Slett alt?")) {
        canvas.clear();
        setStatus("Tømt.");
    }
};

ui.btns.del.onclick = () => {
    const active = canvas.getActiveObject();
    if(active) canvas.remove(active);
};

// Live oppdatering
function updateProps() {
    const active = canvas.getActiveObject();
    if (!active || isEditingPoly) return;
    active.set('stroke', ui.inputs.strokeColor.value);
    active.set('strokeWidth', parseInt(ui.inputs.strokeWidth.value));
    if (active.type !== 'line' && active.type !== 'group') {
        active.set('fill', getCurrentFill());
    }
    canvas.requestRenderAll();
}

ui.inputs.strokeColor.oninput = updateProps;
ui.inputs.strokeWidth.oninput = updateProps;
ui.inputs.fillColor.oninput = updateProps;
Object.values(ui.radios).forEach(r => r.onchange = updateProps);
/* Version: #17 */
