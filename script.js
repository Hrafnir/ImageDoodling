/* Version: #13 */
console.log("[App] Laster script v#13...");

// === GLOBALE VARIABLER ===
const canvas = new fabric.Canvas('c', {
    width: window.innerWidth - 50, // Litt margin
    height: window.innerHeight - 100,
    backgroundColor: null,
    selection: true,
    fireRightClick: true, // Tillat høyreklikk i Fabric
    stopContextMenu: true // Hindre default nettleser meny
});

// Tilstander
let currentMode = 'select'; 
let isDrawing = false;
let isDraggingCanvas = false; // For panorering
let activeShape = null;
let lastMouseX, lastMouseY;

// Polygon variabler (Tegning)
let polyPoints = [];
let polyHelpers = [];

// Polygon variabler (Redigering)
let isEditingPoly = false;
let editPolyTarget = null;     // Polygonet vi redigerer
let editPolyControls = [];     // Sirklene vi drar i
let editPolyLines = [];        // Linjene mellom sirklene

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
        fillColor: document.getElementById('fillColor'),
        useHatch: document.getElementById('useHatch'),
        transparentFill: document.getElementById('transparentFill')
    },
    status: document.getElementById('status-text'),
    contextMenu: document.getElementById('context-menu')
};

// === ZOOM OG PANORERING ===

canvas.on('mouse:wheel', function(opt) {
    const delta = opt.e.deltaY;
    let zoom = canvas.getZoom();
    zoom *= 0.999 ** delta;
    
    // Begrens zoom
    if (zoom > 20) zoom = 20;
    if (zoom < 0.01) zoom = 0.01;
    
    canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
    opt.e.preventDefault();
    opt.e.stopPropagation();
    
    // Oppdater status
    ui.status.innerHTML = `Zoom: ${Math.round(zoom * 100)}%`;
});

ui.btns.resetZoom.onclick = function() {
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    ui.status.innerHTML = "Zoom: 100%";
};

// Panorering med ALT + Drag
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

canvas.on('mouse:up', function(opt) {
    // Sett viewport grenser på sikt? For nå: uendelig canvas.
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
    console.log("[App] Lager skraveringsmønster:", color);
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

    return new fabric.Pattern({
        source: patternCanvas,
        repeat: 'repeat'
    });
}

function getCurrentFill() {
    if (ui.inputs.transparentFill.checked) return 'transparent';
    if (ui.inputs.useHatch.checked) return createHatchPattern(ui.inputs.fillColor.value);
    return ui.inputs.fillColor.value;
}

// === MODUS STYRING ===

function setMode(mode) {
    if (currentMode === mode && mode !== 'polygon') return;
    
    // Hvis vi var i editPoly modus, avslutt den pent først
    if (isEditingPoly) {
        finishPolyEdit();
    }

    currentMode = mode;
    console.log("[App] Bytter til modus:", mode);

    // UI Oppdatering
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    if (ui.btns[mode]) ui.btns[mode].classList.add('active');

    // Fabric settings
    canvas.isDrawingMode = (mode === 'free');
    canvas.selection = (mode === 'select');
    
    if (mode === 'free') {
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.color = ui.inputs.strokeColor.value;
        canvas.freeDrawingBrush.width = parseInt(ui.inputs.strokeWidth.value, 10) || 3;
        setStatus("Modus: Frihånd (Tegn fritt)");
    } else if (mode === 'polygon') {
        setStatus("Modus: Mangekant. Klikk for punkter. Dobbelklikk for å avslutte.");
        polyPoints = [];
        clearPolyHelpers();
    } else {
        setStatus(`Modus: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
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
    // 1. Håndter høyreklikk meny
    if (o.button === 3) {
        if (o.target) {
            canvas.setActiveObject(o.target);
            showContextMenu(o.e, o.target);
        }
        return;
    }
    
    // Skjul meny hvis venstreklikk
    hideContextMenu();

    // 2. Håndter panorering (alt-key) eller redigering
    if (isDraggingCanvas || isEditingPoly) return;

    // 3. Sjekk modus
    if (currentMode === 'select' || currentMode === 'free') return;
    if (currentMode === 'polygon') {
        handlePolyClick(o);
        return;
    }

    // 4. Start tegning av figurer
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
        // Lagre original posisjon for beregninger i move
        activeShape.ox = origX;
        activeShape.oy = origY;
    }
});

canvas.on('mouse:move', function(o) {
    if (!isDrawing || !activeShape) return;
    const pointer = canvas.getPointer(o.e);

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

canvas.on('mouse:up', function(o) {
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

    const group = new fabric.Group([arrowLine, arrowHead], {
        selectable: true
    });
    canvas.add(group);
    canvas.renderAll();
}

// === POLYGON TEGNING ===

function handlePolyClick(o) {
    const pointer = canvas.getPointer(o.e);
    polyPoints.push({ x: pointer.x, y: pointer.y });

    // Tegn hjelpemarkør
    const circle = new fabric.Circle({
        radius: 4, fill: ui.inputs.strokeColor.value,
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
            stroke: ui.inputs.strokeColor.value, strokeWidth: 1, strokeDashArray: [5, 5],
            selectable: false
        });
        polyHelpers.push(line);
        canvas.add(line);
    }
}

function clearPolyHelpers() {
    polyHelpers.forEach(o => canvas.remove(o));
    polyHelpers = [];
}

canvas.on('mouse:dblclick', function(o) {
    if (currentMode === 'polygon') {
        if (polyPoints.length < 3) return;
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
    // Hvis vi er i poly-edit modus, hindre default oppførsel
    else if (isEditingPoly) {
        // Ingenting foreløpig
    }
});

// === AVANSERT POLYGON REDIGERING ===

// Start redigering fra høyreklikk-meny
function startPolyEdit(poly) {
    console.log("[App] Starter polygon redigering.");
    isEditingPoly = true;
    editPolyTarget = poly;
    setStatus("Redigerer mangekant: Dra punkter for å flytte. <strong>Klikk på linjer</strong> for å legge til nye punkter.");

    // Skjul originalen midlertidig
    poly.visible = false;
    poly.evented = false;
    canvas.discardActiveObject();
    
    // Konverter punkter til canvas-koordinater
    const matrix = poly.calcTransformMatrix();
    const points = poly.points.map(p => {
        return fabric.util.transformPoint({ x: p.x, y: p.y }, matrix);
    });

    // Opprett kontroller
    rebuildEditControls(points);
    
    canvas.requestRenderAll();
}

function rebuildEditControls(points) {
    // Fjern gamle
    editPolyControls.forEach(c => canvas.remove(c));
    editPolyLines.forEach(l => canvas.remove(l));
    editPolyControls = [];
    editPolyLines = [];

    // Tegn linjer først (slik at de ligger under sirklene)
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        
        const line = new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
            stroke: '#00aaff',
            strokeWidth: 2,
            selectable: false,
            hoverCursor: 'copy', // Indiker at man kan klikke for å legge til
            dataP1Index: i // Lagre index for innsetting
        });
        
        // Event for å legge til node
        line.on('mousedown', function(opt) {
            if (opt.e.button !== 0) return; // Kun venstreklikk
            console.log("Klikket på linje - legger til punkt!");
            addPolyPointAtLine(this, opt.e);
        });

        editPolyLines.push(line);
        canvas.add(line);
    }

    // Tegn sirkler
    points.forEach((p, index) => {
        const circle = new fabric.Circle({
            left: p.x, top: p.y,
            radius: 6,
            fill: 'rgba(255,0,0,0.8)',
            stroke: 'white', strokeWidth: 1,
            originX: 'center', originY: 'center',
            hasControls: false, hasBorders: false,
            dataIndex: index
        });

        circle.on('moving', function() {
            updateEditLinesFromCircles();
        });

        editPolyControls.push(circle);
        canvas.add(circle);
    });
}

function updateEditLinesFromCircles() {
    const points = editPolyControls.map(c => ({ x: c.left, y: c.top }));
    
    // Oppdater linje posisjoner
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const line = editPolyLines[i];
        line.set({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    }
}

function addPolyPointAtLine(lineObj, evt) {
    // Finn posisjon for klikket
    const pointer = canvas.getPointer(evt);
    const newPoint = { x: pointer.x, y: pointer.y };
    
    // Hent nåværende punkter fra sirklene
    const currentPoints = editPolyControls.map(c => ({ x: c.left, y: c.top }));
    
    // Sett inn nytt punkt etter indeksen lagret på linjen
    const insertIndex = lineObj.dataP1Index + 1;
    currentPoints.splice(insertIndex, 0, newPoint);
    
    // Bygg opp kontrollene på nytt
    rebuildEditControls(currentPoints);
    canvas.requestRenderAll();
}

function finishPolyEdit() {
    if (!isEditingPoly || !editPolyTarget) return;
    console.log("[App] Avslutter redigering. Lagrer endringer.");
    
    // Hent punkter fra sirkler
    const finalPoints = editPolyControls.map(c => ({ x: c.left, y: c.top }));
    
    // Fjern hjelpeobjekter
    editPolyControls.forEach(c => canvas.remove(c));
    editPolyLines.forEach(l => canvas.remove(l));
    editPolyControls = [];
    editPolyLines = [];

    // Opprett NYTT polygon (for å unngå offset-problemer med Fabric)
    const newPoly = new fabric.Polygon(finalPoints, {
        stroke: editPolyTarget.stroke,
        strokeWidth: editPolyTarget.strokeWidth,
        fill: editPolyTarget.fill,
        objectCaching: false
    });

    // Fjern det gamle
    canvas.remove(editPolyTarget);
    
    // Legg til det nye
    canvas.add(newPoly);
    canvas.setActiveObject(newPoly);
    
    isEditingPoly = false;
    editPolyTarget = null;
    setMode('select');
    canvas.requestRenderAll();
}

// === KONTEKST MENY (Høyreklikk) ===

function showContextMenu(e, target) {
    e.preventDefault();
    const menu = ui.contextMenu;
    menu.style.display = 'block';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    // Konfigurer menyvalg basert på type
    const isPoly = target.type === 'polygon';
    document.getElementById('ctx-edit-poly').style.display = isPoly ? 'block' : 'none';
}

function hideContextMenu() {
    ui.contextMenu.style.display = 'none';
}

// Klikk utenfor lukker meny
window.onclick = function(e) {
    if (!e.target.closest('.context-menu')) {
        hideContextMenu();
    }
};

// Meny Handlinger
document.getElementById('ctx-delete').onclick = () => {
    const active = canvas.getActiveObject();
    if (active) canvas.remove(active);
    hideContextMenu();
};

document.getElementById('ctx-toggle-fill').onclick = () => {
    const active = canvas.getActiveObject();
    if (active) {
        const current = active.fill;
        if (current === 'transparent' || current === null) {
            active.set('fill', ui.inputs.fillColor.value);
        } else {
            active.set('fill', 'transparent');
        }
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
    // Sørg for at bakgrunnsbilde (hvis det finnes) forblir bakerst? 
    // Fabric håndterer 'backgroundImage' separat, så sendToBack virker på objektene oppå.
    hideContextMenu();
};

document.getElementById('ctx-bring-front').onclick = () => {
    const active = canvas.getActiveObject();
    if (active) canvas.bringToFront(active);
    hideContextMenu();
};

document.getElementById('ctx-edit-poly').onclick = () => {
    const active = canvas.getActiveObject();
    if (active && active.type === 'polygon') {
        startPolyEdit(active);
    }
    hideContextMenu();
};

// === GENERELLE EVENTER ===

window.addEventListener('keydown', function(e) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isEditingPoly) {
            const active = canvas.getActiveObjects();
            if (active.length) {
                canvas.discardActiveObject();
                active.forEach(o => canvas.remove(o));
            }
        }
    }
    // Escape avbryter tegning/redigering
    if (e.key === 'Escape') {
        if (isEditingPoly) finishPolyEdit();
        setMode('select');
    }
});

// Paste
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
                    // Juster canvas for å matche
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
    // For å lagre hele bildet inkludert det som er utenfor skjermen,
    // må vi nullstille zoom/pan midlertidig.
    const originalVpt = canvas.viewportTransform;
    const originalWidth = canvas.width;
    const originalHeight = canvas.height;

    // Reset visning
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    
    // Hvis bakgrunnsbilde finnes, sett canvas størrelse til bildet
    if (canvas.backgroundImage) {
        canvas.setWidth(canvas.backgroundImage.width);
        canvas.setHeight(canvas.backgroundImage.height);
    }

    const dataURL = canvas.toDataURL({ format: 'png', multiplier: 1 });

    // Last ned
    const link = document.createElement('a');
    link.download = 'tegning_avansert.png';
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Gjenopprett visning
    canvas.setWidth(originalWidth);
    canvas.setHeight(originalHeight);
    canvas.setViewportTransform(originalVpt);
    canvas.requestRenderAll();
};

// Clear
ui.btns.clear.onclick = () => {
    if (confirm("Slett alle tegninger?")) {
        canvas.clear(); // Fjerner alt
        setStatus("Canvas tømt.");
    }
};

// Slett valgt knapp
ui.btns.del.onclick = () => {
    const active = canvas.getActiveObject();
    if(active) canvas.remove(active);
};

// Oppdater verdier live
function updateActiveProps() {
    const active = canvas.getActiveObject();
    if(!active || isEditingPoly) return;
    
    // Enkel håndtering
    if(active.set) {
        active.set('stroke', ui.inputs.strokeColor.value);
        active.set('strokeWidth', parseInt(ui.inputs.strokeWidth.value));
        if(active.type !== 'line' && active.type !== 'group') {
             // Ikke overstyr fyll hvis det er transparent og vi bare endrer strek?
             // Enklest: sett fyll hvis checkboxer sier det.
        }
    }
    canvas.requestRenderAll();
}
ui.inputs.strokeColor.oninput = updateActiveProps;
ui.inputs.strokeWidth.oninput = updateActiveProps;

/* Version: #13 */
