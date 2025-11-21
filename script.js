/* Version: #19 */
console.log("[App] Laster script v#19 - Auto-Edit Polygon...");

// === GLOBALE VARIABLER ===
const canvas = new fabric.Canvas('c', {
    width: window.innerWidth - 50,
    height: window.innerHeight - 100,
    backgroundColor: null,
    selection: true,
    fireRightClick: true,
    stopContextMenu: true,
    preserveObjectStacking: true // Hjelper med å holde kontroller på topp
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
let editPolyTarget = null;     // Polygonet som redigeres
let editControlsGroup = [];    // Array med sirkler og linjer

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
    
    // Oppdater kontrollstørrelse ved zoom slik at de ikke blir enorme/mikroskopiske
    updateControlSizes();
});

ui.btns.resetZoom.onclick = function() {
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    ui.status.innerHTML = "Zoom: 100%";
    updateControlSizes();
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

function updateControlSizes() {
    // Holder sirklene i konstant visuell størrelse uavhengig av zoom
    const zoom = canvas.getZoom();
    const radius = 6 / zoom;
    const strokeWidth = 2 / zoom;
    
    editControlsGroup.forEach(obj => {
        if (obj.type === 'circle') {
            obj.set({ radius: radius, strokeWidth: 1/zoom });
        } else if (obj.type === 'line') {
            obj.set({ strokeWidth: strokeWidth });
        }
    });
    canvas.requestRenderAll();
}

// === MODUS STYRING ===

function setMode(mode) {
    if (currentMode === mode && mode !== 'polygon') return;
    
    // Rydd opp polygon redigering hvis vi forlater select mode
    if (mode !== 'select') {
        clearEditControls();
    }

    // Avbryt tegning
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
    } else if (mode === 'select') {
        setStatus("Velg: Klikk på objekter for å flytte. Klikk på mangekant for å redigere punkter.");
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

// === SELECTION EVENTS (AUTO-EDIT) ===

canvas.on('selection:created', handleSelection);
canvas.on('selection:updated', handleSelection);
canvas.on('selection:cleared', function() {
    clearEditControls();
});

function handleSelection(e) {
    const active = e.selected[0];
    
    // Hvis vi velger noe annet, fjern gamle kontroller
    if (editPolyTarget && active !== editPolyTarget) {
        clearEditControls();
    }

    // Hvis vi er i select mode og velger en polygon -> Vis kontroller
    if (currentMode === 'select' && active && active.type === 'polygon') {
        showEditControls(active);
    }
}

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

    if (isDraggingCanvas) return;

    // 2. Polygon tegning
    if (currentMode === 'polygon') {
        handlePolyClick(o);
        return;
    }

    // Hvis vi klikker på en kontroll (rød sirkel/blå linje), la Fabric håndtere det (det er selectable)
    if (o.target && (o.target.isControlPoint || o.target.isControlLine)) return;

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

    // Polygon elastisk linje
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

// === POLYGON TEGNING ===

function handlePolyClick(o) {
    const pointer = canvas.getPointer(o.e);
    
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
    canvas.setActiveObject(polygon); // Auto-velg den nye figuren
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

// === AUTO-EDIT POLYGON LOGIKK ===

function showEditControls(poly) {
    editPolyTarget = poly;
    // Ikke skjul polygonet, vi tegner oppå det
    
    // Beregn absolutte koordinater for punktene
    const matrix = poly.calcTransformMatrix();
    const points = poly.points.map(p => fabric.util.transformPoint({ x: p.x, y: p.y }, matrix));
    
    rebuildControls(points);

    // Lytt til flytting av selve polygonet for å flytte kontrollene med
    poly.on('moving', function() {
        const newMatrix = poly.calcTransformMatrix();
        const newPoints = poly.points.map(p => fabric.util.transformPoint({ x: p.x, y: p.y }, newMatrix));
        updateControlPositions(newPoints);
    });
}

function clearEditControls() {
    editControlsGroup.forEach(obj => canvas.remove(obj));
    editControlsGroup = [];
    if (editPolyTarget) {
        editPolyTarget.off('moving'); // Stopp å lytte
        editPolyTarget = null;
    }
    canvas.requestRenderAll();
}

function rebuildControls(points) {
    // Fjern gamle
    editControlsGroup.forEach(obj => canvas.remove(obj));
    editControlsGroup = [];

    // Tegn linjer
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        
        const line = new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
            stroke: '#00aaff', strokeWidth: 2,
            selectable: false, hoverCursor: 'copy',
            isControlLine: true,
            dataIndex: i // Indeks for punktet før linjen
        });
        
        line.on('mousedown', function(opt) {
            if(opt.e.button === 0) addPoint(this, opt.e);
        });

        editControlsGroup.push(line);
        canvas.add(line);
    }

    // Tegn noder
    points.forEach((p, index) => {
        const circle = new fabric.Circle({
            left: p.x, top: p.y, radius: 6,
            fill: 'red', stroke: 'white', strokeWidth: 1,
            originX: 'center', originY: 'center',
            hasControls: false, hasBorders: false,
            isControlPoint: true,
            dataIndex: index
        });

        circle.on('moving', function(opt) {
            movePoint(this);
        });

        editControlsGroup.push(circle);
        canvas.add(circle);
    });
    
    updateControlSizes(); // Juster for zoom
}

function updateControlPositions(points) {
    // Oppdaterer bare posisjonen til kontrollene (når polygon flyttes)
    // Vi antar at rekkefølgen i editControlsGroup er: linjer først, så sirkler
    const numPoints = points.length;
    
    // Oppdater linjer
    for (let i = 0; i < numPoints; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % numPoints];
        const line = editControlsGroup[i]; // De første N objektene er linjer
        line.set({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    }

    // Oppdater sirkler
    for (let i = 0; i < numPoints; i++) {
        const p = points[i];
        const circle = editControlsGroup[numPoints + i]; // De neste N er sirkler
        circle.set({ left: p.x, top: p.y });
        circle.setCoords();
    }
}

function movePoint(circle) {
    if (!editPolyTarget) return;
    
    const index = circle.dataIndex;
    const p = { x: circle.left, y: circle.top };
    
    // Konverter tilbake til polygonets lokale koordinater
    // Dette er litt tricky i Fabric. Enklere løsning:
    // Vi oppdaterer polygonets points array direkte, men vi må ta hensyn til polygonets transformasjon.
    // ELLER: Vi rekonstruerer polygonet fra de absolutte punktene (enklest og mest robust).
    
    // 1. Hent alle absolutte punkter fra sirklene
    const numPoints = editPolyTarget.points.length;
    const circles = editControlsGroup.slice(numPoints); // Hent sirklene
    const absolutePoints = circles.map(c => ({ x: c.left, y: c.top }));
    
    // 2. Oppdater polygonet
    // Vi må lage et nytt polygon for å unngå offset-rot
    const props = {
        stroke: editPolyTarget.stroke,
        strokeWidth: editPolyTarget.strokeWidth,
        fill: editPolyTarget.fill,
        objectCaching: false
    };
    
    const newPoly = new fabric.Polygon(absolutePoints, props);
    
    // Bytt ut
    canvas.remove(editPolyTarget);
    editPolyTarget = newPoly;
    canvas.add(newPoly);
    canvas.setActiveObject(newPoly);
    
    // Oppdater linjene mellom punktene
    updateControlPositions(absolutePoints);
    
    // Gjenopprett lytter for flytting av hele figuren
    newPoly.on('moving', function() {
        const newMatrix = newPoly.calcTransformMatrix();
        const newPoints = newPoly.points.map(pt => fabric.util.transformPoint({ x: pt.x, y: pt.y }, newMatrix));
        updateControlPositions(newPoints);
    });
}

function addPoint(lineObj, evt) {
    const pointer = canvas.getPointer(evt);
    const index = lineObj.dataIndex; // Indeks til punktet FØR linjen
    
    // Hent nåværende punkter
    const numPoints = editPolyTarget.points.length;
    const circles = editControlsGroup.slice(numPoints);
    const currentPoints = circles.map(c => ({ x: c.left, y: c.top }));
    
    // Sett inn nytt punkt
    currentPoints.splice(index + 1, 0, { x: pointer.x, y: pointer.y });
    
    // Lag nytt polygon
    const props = {
        stroke: editPolyTarget.stroke,
        strokeWidth: editPolyTarget.strokeWidth,
        fill: editPolyTarget.fill,
        objectCaching: false
    };
    
    const newPoly = new fabric.Polygon(currentPoints, props);
    
    canvas.remove(editPolyTarget);
    editPolyTarget = newPoly;
    canvas.add(newPoly);
    canvas.setActiveObject(newPoly);
    
    // Bygg kontroller på nytt (siden vi har fler punkter nå)
    rebuildControls(currentPoints);
    
    // Lytter
    newPoly.on('moving', function() {
        const newMatrix = newPoly.calcTransformMatrix();
        const newPoints = newPoly.points.map(pt => fabric.util.transformPoint({ x: pt.x, y: pt.y }, newMatrix));
        updateControlPositions(newPoints);
    });
}

// === KONTEKST MENY ===

function showContextMenu(e, target) {
    e.preventDefault();
    const menu = ui.contextMenu;
    menu.style.display = 'block';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
}

function hideContextMenu() {
    ui.contextMenu.style.display = 'none';
}

window.onclick = (e) => {
    if (!e.target.closest('.context-menu')) hideContextMenu();
};

document.getElementById('ctx-delete').onclick = () => {
    const active = canvas.getActiveObject();
    if (active) {
        canvas.remove(active);
        clearEditControls();
    }
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

// === DIVERSE ===

window.addEventListener('keydown', function(e) {
    if ((e.key === 'Delete' || e.key === 'Backspace')) {
        const active = canvas.getActiveObjects();
        if (active.length) {
            canvas.discardActiveObject();
            active.forEach(o => canvas.remove(o));
            clearEditControls();
        }
    }
    if (e.key === 'Escape') {
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
    clearEditControls(); // Skjul kontroller før lagring
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
        clearEditControls();
        setStatus("Tømt.");
    }
};

ui.btns.del.onclick = () => {
    const active = canvas.getActiveObject();
    if(active) {
        canvas.remove(active);
        clearEditControls();
    }
};

// Live oppdatering
function updateProps() {
    const active = canvas.getActiveObject();
    if (!active) return;
    
    // Hvis vi redigerer en polygon, oppdater både den og den midlertidige editTarget
    if (active === editPolyTarget) {
        active.set('stroke', ui.inputs.strokeColor.value);
        active.set('strokeWidth', parseInt(ui.inputs.strokeWidth.value));
        active.set('fill', getCurrentFill());
    } else {
        active.set('stroke', ui.inputs.strokeColor.value);
        active.set('strokeWidth', parseInt(ui.inputs.strokeWidth.value));
        if (active.type !== 'line' && active.type !== 'group') {
            active.set('fill', getCurrentFill());
        }
    }
    canvas.requestRenderAll();
}

ui.inputs.strokeColor.oninput = updateProps;
ui.inputs.strokeWidth.oninput = updateProps;
ui.inputs.fillColor.oninput = updateProps;
Object.values(ui.radios).forEach(r => r.onchange = updateProps);
/* Version: #19 */
