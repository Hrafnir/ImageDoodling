/* Version: #10 */
// === GLOBALE VARIABLER ===
console.log("[App] Initialiserer script...");

// Initialiser Fabric Canvas
const canvas = new fabric.Canvas('c', {
    width: 800,
    height: 600,
    backgroundColor: null, // Transparent bakgrunn
    selection: true
});

// Tilstands-variabler
let currentMode = 'select'; // 'select', 'free', 'line', 'arrow', 'rect', 'polygon'
let isDrawing = false;
let origX = 0;
let origY = 0;
let activeShape = null; // Holder objektet vi tegner akkurat nå

// Variabler for mangekant (Polygon)
let polyPoints = [];
let polyHelpers = []; // Hjelpe-sirkler og linjer mens vi tegner polygon

// === DOM ELEMENTER ===
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
        save: document.getElementById('btn-save')
    },
    inputs: {
        strokeColor: document.getElementById('strokeColor'),
        strokeWidth: document.getElementById('strokeWidth'),
        fillColor: document.getElementById('fillColor'),
        useHatch: document.getElementById('useHatch'),
        transparentFill: document.getElementById('transparentFill')
    },
    status: document.getElementById('status-text')
};

// === HJELPEFUNKSJONER ===

// Oppdater status-tekst
function setStatus(msg) {
    ui.status.innerHTML = msg;
}

// Lag skraveringsmønster (Hatch)
function createHatchPattern(color) {
    console.log("[App] Genererer skraveringsmønster for farge:", color);
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

// Hent gjeldende fyll (Farge, Transparent, eller Mønster)
function getCurrentFill() {
    if (ui.inputs.transparentFill.checked) {
        return 'transparent';
    }
    if (ui.inputs.useHatch.checked) {
        return createHatchPattern(ui.inputs.fillColor.value);
    }
    return ui.inputs.fillColor.value;
}

// === MODUS HÅNDTERING ===

function setMode(mode) {
    if (currentMode === mode) return;
    console.log(`[App] Endrer modus fra ${currentMode} til ${mode}`);
    
    currentMode = mode;

    // Oppdater UI knapper
    Object.values(ui.btns).forEach(btn => btn.classList.remove('active'));
    if (ui.btns[mode]) ui.btns[mode].classList.add('active');

    // Fabric innstillinger
    canvas.isDrawingMode = (mode === 'free');
    canvas.selection = (mode === 'select');
    
    // Tilbakestill markør
    canvas.defaultCursor = (mode === 'select') ? 'default' : 'crosshair';

    // Oppdater frihånds-børste hvis nødvendig
    if (mode === 'free') {
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.color = ui.inputs.strokeColor.value;
        canvas.freeDrawingBrush.width = parseInt(ui.inputs.strokeWidth.value, 10) || 3;
        setStatus("Tegner: Frihånd");
    } else if (mode === 'polygon') {
        setStatus("Tegner Mangekant: Klikk for punkter, <strong>dobbelklikk</strong> for å avslutte.");
        // Nullstill polygon data hvis vi bytter til modus på nytt
        polyPoints = [];
        clearPolyHelpers();
    } else if (mode === 'select') {
        setStatus("Velg objekter for å flytte eller endre dem.");
    } else {
        setStatus(`Tegner: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
    }

    // Avslutt eventuelle påbegynte handlinger
    canvas.discardActiveObject();
    canvas.requestRenderAll();
}

// Knytt knapper til modus
ui.btns.select.onclick = () => setMode('select');
ui.btns.free.onclick = () => setMode('free');
ui.btns.line.onclick = () => setMode('line');
ui.btns.arrow.onclick = () => setMode('arrow');
ui.btns.rect.onclick = () => setMode('rect');
ui.btns.poly.onclick = () => setMode('polygon');

// === TEGNE LOGIKK (Mouse Events) ===

canvas.on('mouse:down', function(o) {
    // Ignorer hvis vi er i select, free (håndteres av fabric), eller polygon (egen logikk)
    if (currentMode === 'select' || currentMode === 'free' || currentMode === 'polygon') {
        if (currentMode === 'polygon') handlePolyClick(o);
        return;
    }

    isDrawing = true;
    const pointer = canvas.getPointer(o.e);
    origX = pointer.x;
    origY = pointer.y;
    
    console.log(`[App] Start tegning (${currentMode}) ved:`, Math.round(origX), Math.round(origY));

    const commonProps = {
        left: origX,
        top: origY,
        stroke: ui.inputs.strokeColor.value,
        strokeWidth: parseInt(ui.inputs.strokeWidth.value, 10),
        fill: getCurrentFill(),
        originX: 'left',
        originY: 'top',
        selectable: false, // Ikke velgbar mens vi tegner
        evented: false     // Tar ikke imot events mens vi tegner
    };

    if (currentMode === 'rect') {
        activeShape = new fabric.Rect({
            ...commonProps,
            width: 0,
            height: 0
        });
    } else if (currentMode === 'line' || currentMode === 'arrow') {
        activeShape = new fabric.Line([origX, origY, origX, origY], {
            ...commonProps,
            fill: ui.inputs.strokeColor.value // Linjer bruker stroke-farge som "fyll" visuelt
        });
    }

    if (activeShape) {
        canvas.add(activeShape);
    }
});

canvas.on('mouse:move', function(o) {
    if (!isDrawing || !activeShape) return;
    
    const pointer = canvas.getPointer(o.e);

    if (currentMode === 'rect') {
        // Håndter tegning i alle retninger (også opp og til venstre)
        if (origX > pointer.x) {
            activeShape.set({ left: Math.abs(pointer.x) });
        }
        if (origY > pointer.y) {
            activeShape.set({ top: Math.abs(pointer.y) });
        }
        activeShape.set({ width: Math.abs(origX - pointer.x) });
        activeShape.set({ height: Math.abs(origY - pointer.y) });
    } else if (currentMode === 'line' || currentMode === 'arrow') {
        activeShape.set({ x2: pointer.x, y2: pointer.y });
    }

    canvas.renderAll();
});

canvas.on('mouse:up', function(o) {
    if (!isDrawing) return;
    console.log("[App] Avslutt tegning.");
    isDrawing = false;

    // Håndter Pil-spesifikk logikk (erstatt linje med Gruppe av Linje + Trekant)
    if (currentMode === 'arrow' && activeShape) {
        finalizeArrow(activeShape);
    } else if (activeShape) {
        activeShape.setCoords();
        activeShape.set({ selectable: true, evented: true });
    }

    activeShape = null;
    // Gå tilbake til select eller behold verktøy? 
    // Vanligvis beholder man verktøy i tegneprogrammer.
});

function finalizeArrow(lineObj) {
    console.log("[App] Konverterer linje til pil...");
    const width = parseInt(ui.inputs.strokeWidth.value, 10);
    const color = ui.inputs.strokeColor.value;
    const headSize = width * 4;

    const x1 = lineObj.x1;
    const y1 = lineObj.y1;
    const x2 = lineObj.x2;
    const y2 = lineObj.y2;

    // Beregn vinkel
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

    // Fjern den midlertidige linjen
    canvas.remove(lineObj);

    // Opprett ny linje
    const arrowLine = new fabric.Line([x1, y1, x2, y2], {
        stroke: color,
        strokeWidth: width,
        originX: 'center',
        originY: 'center'
    });

    // Opprett pilhode (trekant)
    const arrowHead = new fabric.Triangle({
        left: x2,
        top: y2,
        angle: angle + 90, // Juster for Fabric rotasjon
        width: headSize,
        height: headSize,
        fill: color,
        originX: 'center',
        originY: 'center'
    });

    // Grupper dem
    const group = new fabric.Group([arrowLine, arrowHead], {
        selectable: true
    });

    canvas.add(group);
    canvas.renderAll();
}

// === MANGEKANT (POLYGON) LOGIKK ===

function handlePolyClick(o) {
    const pointer = canvas.getPointer(o.e);
    polyPoints.push({ x: pointer.x, y: pointer.y });
    console.log("[App] Polygon punkt lagt til:", pointer);

    // Tegn visuell markør (sirkel)
    const circle = new fabric.Circle({
        radius: 4,
        fill: ui.inputs.strokeColor.value,
        left: pointer.x,
        top: pointer.y,
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: false
    });
    polyHelpers.push(circle);
    canvas.add(circle);

    // Tegn linje fra forrige punkt
    if (polyPoints.length > 1) {
        const p1 = polyPoints[polyPoints.length - 2];
        const p2 = polyPoints[polyPoints.length - 1];
        const line = new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
            stroke: ui.inputs.strokeColor.value,
            strokeWidth: 1,
            strokeDashArray: [5, 5],
            selectable: false,
            evented: false
        });
        polyHelpers.push(line);
        canvas.add(line);
    }
}

function clearPolyHelpers() {
    polyHelpers.forEach(obj => canvas.remove(obj));
    polyHelpers = [];
}

// Dobbelklikk for å fullføre polygon
canvas.on('mouse:dblclick', function() {
    if (currentMode !== 'polygon' || polyPoints.length < 3) return;
    console.log("[App] Fullfører polygon.");

    clearPolyHelpers();

    // Lag selve polygonet
    const polygon = new fabric.Polygon(polyPoints, {
        stroke: ui.inputs.strokeColor.value,
        strokeWidth: parseInt(ui.inputs.strokeWidth.value, 10),
        fill: getCurrentFill(),
        objectCaching: false
    });

    canvas.add(polygon);
    canvas.renderAll();
    
    // Nullstill punkter for neste polygon
    polyPoints = [];
    
    // Gå til select mode
    setMode('select');
});

// === LIME INN BILDE (Paste) ===
window.addEventListener('paste', function(e) {
    console.log("[App] Paste event oppdaget.");
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;

    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.indexOf('image/') !== -1) {
            const blob = item.getAsFile();
            const reader = new FileReader();
            
            reader.onload = function(event) {
                const imgObj = new Image();
                imgObj.src = event.target.result;
                
                imgObj.onload = function() {
                    console.log(`[App] Bilde lastet: ${imgObj.width}x${imgObj.height}`);
                    const imgInstance = new fabric.Image(imgObj);
                    
                    // Juster canvas størrelse
                    canvas.setWidth(imgInstance.width);
                    canvas.setHeight(imgInstance.height);
                    
                    // Sett som bakgrunn (låst)
                    canvas.setBackgroundImage(imgInstance, canvas.renderAll.bind(canvas));
                    
                    setStatus("Bilde limt inn. Tegn i vei!");
                };
            };
            reader.readAsDataURL(blob);
        }
    }
});

// === SLETT OG NULLSTILL ===

function deleteActive() {
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length) {
        console.log(`[App] Sletter ${activeObjects.length} objekt(er).`);
        canvas.discardActiveObject();
        activeObjects.forEach(function(obj) {
            canvas.remove(obj);
        });
    }
}

ui.btns.del.onclick = deleteActive;

window.addEventListener('keydown', function(e) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
        // Sjekk at vi ikke redigerer tekst (hvis vi legger til det senere)
        deleteActive();
    }
});

ui.btns.clear.onclick = function() {
    if(confirm("Er du sikker på at du vil slette alt tegnet innhold?")) {
        console.log("[App] Nullstiller canvas (beholder bakgrunn hvis mulig, ellers clear)");
        // Vi vil beholde bakgrunnsbildet, men fjerne objektene
        canvas.clear();
        // clear() fjerner også bakgrunnsbilde i Fabric, så vi må passe på.
        // En bedre måte er å fjerne objektene manuelt hvis vi vil beholde bakgrunn.
        // Men "Nullstill" betyr ofte "Start helt på nytt", så vi kjører canvas.clear() 
        // og brukeren må lime inn på nytt hvis de vil.
        setStatus("Canvas tømt.");
    }
};

// === LAGRE ===

ui.btns.save.onclick = function() {
    console.log("[App] Lagrer bilde...");
    // Hvis canvas er tomt eller transparent, sett hvit bakgrunn midlertidig for lagring?
    // Brukerkravet var PNG, så transparent er greit. Men hvis ingen bakgrunn er satt,
    // blir det bare tegningene på transparent.
    
    const dataURL = canvas.toDataURL({
        format: 'png',
        quality: 1,
        multiplier: 1
    });

    const link = document.createElement('a');
    link.download = 'min-tegning.png';
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.log("[App] Lagringsdialog åpnet.");
};

// === LIVE OPPDATERING AV VALGT OBJEKT ===
// Hvis brukeren endrer farge mens et objekt er valgt, oppdater objektet.

function updateActiveObjectProps() {
    const active = canvas.getActiveObject();
    if (!active) return;

    const stroke = ui.inputs.strokeColor.value;
    const width = parseInt(ui.inputs.strokeWidth.value, 10);
    const fill = getCurrentFill();

    // Linjer og piler (gruppe) håndteres litt annerledes
    if (active.type === 'line' || active.type === 'path') {
        active.set({ stroke: stroke, strokeWidth: width });
    } 
    else if (active.type === 'group') {
        // Anta at det er en pil
        active.getObjects().forEach(obj => {
            if (obj.type === 'line') obj.set({ stroke: stroke, strokeWidth: width });
            if (obj.type === 'triangle') obj.set({ fill: stroke }); // Pilhode følger stroke farge
        });
    }
    else {
        // Vanlige former (Rect, Polygon, Circle)
        active.set({
            stroke: stroke,
            strokeWidth: width,
            fill: fill
        });
    }
    canvas.requestRenderAll();
}

// Lytt til endringer i input-feltene
ui.inputs.strokeColor.oninput = updateActiveObjectProps;
ui.inputs.strokeWidth.oninput = updateActiveObjectProps;
ui.inputs.fillColor.oninput = updateActiveObjectProps;
ui.inputs.useHatch.onchange = updateActiveObjectProps;
ui.inputs.transparentFill.onchange = updateActiveObjectProps;

// Initial oppdatering
setMode('select');
/* Version: #10 */
