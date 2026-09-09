/* Motion Control — After Effects host bridge */

function log(msg) {
    try {
        $.writeln("[Motion Control] " + String(msg));
    } catch (eLog) {}
}

function hostError(stage, message, detail) {
    var payload = {
        ok: false,
        error: String(message || "Unknown error"),
        stage: String(stage || "unknown")
    };
    if (detail) {
        if (typeof detail === "string") {
            payload.detail = detail;
        } else {
            var key;
            for (key in detail) {
                if (detail.hasOwnProperty(key)) payload[key] = detail[key];
            }
        }
    }
    return JSON.stringify(payload);
}

function hostErrorFromException(stage, err, detail) {
    var message = err && err.message ? String(err.message) : String(err);
    var extra = detail || {};
    extra.stage = stage;
    if (err && err.line !== undefined && err.line !== null) extra.line = err.line;
    if (err && err.fileName) extra.file = String(err.fileName);
    return hostError(stage, message, extra);
}

var PANEL_EXT_ROOT = "";
var JSX_DIR = "";
var TENSION_DIR = "";
var EASING_DIR = "";
var GRID_SCRIPT = "";
var LAYOUT_SCRIPT = "";
var PATH_SCRIPT = "";
var LAYOUT_PLACE_PARAMS = null;
var LAYOUT_PLACE_LAST = null;
var PATH_MOTION_PARAMS = null;
var PATH_MOTION_LAST = null;
var STAGGER_SCRIPT = "";
var PALETTE_APPLY_SCRIPT = "";
var SHAPE_PATH_DIR = "";
var SHAPE_PATH_MORPH_LAST = null;
var SHAPE_PATH_SWEEP_LAST = null;
var SHAPE_PATH_FLOW_LAST = null;
var SHAPE_PATH_WF_LAST = null;
var SHAPE_PATH_EXTEND_LAST = null;
var SHAPE_PATH_TRIM_LAST = null;
var STAGGER_TIMING_LAST = null;
var PANEL_PATHS_READY = false;
var EASING_PANEL_PROP = null;
var EASING_USE_ALL_KEYS = false;

function normalizePath(p) {
    return String(p || "").replace(/\\/g, "/").replace(/\/+$/, "");
}

function fileExists(path) {
    try {
        return (new File(path)).exists;
    } catch (e0) {
        return false;
    }
}

function trySetPathsFromBase(baseDir, extRoot) {
    var base = normalizePath(baseDir);
    if (!base) return false;

    var layouts = [
        { jsx: base + "/jsx", easing: base + "/jsx/easing", tension: base + "/jsx/tension", grid: base + "/jsx/grid/apply-ae-grid-layout.jsx", layout: base + "/jsx/layout/apply-layout-place.jsx", path: base + "/jsx/path/apply-path-motion.jsx", stagger: base + "/jsx/timing/apply-stagger-timing.jsx", palette: base + "/jsx/palette/color-palette-apply.jsx", shapePath: base + "/jsx/shape-path" },
        { jsx: base, easing: base + "/easing", tension: base + "/tension", grid: base + "/grid/apply-ae-grid-layout.jsx", layout: base + "/layout/apply-layout-place.jsx", path: base + "/path/apply-path-motion.jsx", stagger: base + "/timing/apply-stagger-timing.jsx", palette: base + "/palette/color-palette-apply.jsx", shapePath: base + "/shape-path" }
    ];

    var i;
    for (i = 0; i < layouts.length; i++) {
        var layout = layouts[i];
        if (fileExists(layout.easing + "/apply-panel-easing.jsx") || fileExists(layout.tension + "/tension-ease-in.jsx")) {
            JSX_DIR = layout.jsx;
            EASING_DIR = layout.easing;
            TENSION_DIR = layout.tension;
            GRID_SCRIPT = layout.grid;
            LAYOUT_SCRIPT = layout.layout;
            PATH_SCRIPT = layout.path;
            STAGGER_SCRIPT = layout.stagger;
            PALETTE_APPLY_SCRIPT = layout.palette;
            SHAPE_PATH_DIR = layout.shapePath;
            if (extRoot) PANEL_EXT_ROOT = normalizePath(extRoot);
            PANEL_PATHS_READY = fileExists(TENSION_DIR + "/tension-ease-in.jsx") ||
                fileExists(EASING_DIR + "/apply-panel-easing.jsx") ||
                fileExists(GRID_SCRIPT);
            return true;
        }
    }
    return false;
}

function initPanelPaths(extRoot) {
    var root = normalizePath(extRoot);
    var hostFile = new File($.fileName);
    var parent = normalizePath(hostFile.parent.fsName);
    var appDataFallback = "";
    try {
        appDataFallback = normalizePath(Folder.userData.fsName + "/Adobe/CEP/extensions/com.muelmu3kism.motion-control");
    } catch (eFb) {}

    var candidates = [];
    if (root) candidates.push(root);
    if (PANEL_EXT_ROOT && PANEL_EXT_ROOT !== root) candidates.push(PANEL_EXT_ROOT);
    if (parent) candidates.push(parent);
    if (parent) candidates.push(parent + "/..");
    if (appDataFallback) candidates.push(appDataFallback);

    var ok = false;
    var used = "";
    var ci;
    for (ci = 0; ci < candidates.length; ci++) {
        if (trySetPathsFromBase(candidates[ci], root || candidates[ci])) {
            ok = true;
            used = candidates[ci];
            break;
        }
    }

    return JSON.stringify({
        ok: ok,
        stage: "initPanelPaths",
        extRoot: PANEL_EXT_ROOT,
        jsxDir: JSX_DIR,
        easingDir: EASING_DIR,
        tensionDir: TENSION_DIR,
        usedBase: used,
        hostFile: String($.fileName || ""),
        message: ok ? ("Panel paths OK: " + JSX_DIR) : ("Scripts not found — tried " + candidates.length + " locations")
    });
}

function resolvePanelPaths(extRoot) {
    if (extRoot && String(extRoot).length > 0) {
        var root = normalizePath(extRoot);
        if (trySetPathsFromBase(root + "/jsx", root)) {
            return { ok: true, jsxDir: JSX_DIR, source: root + "/jsx" };
        }
        if (trySetPathsFromBase(root, root)) {
            return { ok: true, jsxDir: JSX_DIR, source: root };
        }
    }

    if (PANEL_PATHS_READY) {
        return { ok: true, jsxDir: JSX_DIR };
    }

    if (PANEL_EXT_ROOT) {
        try {
            var parsed2 = JSON.parse(initPanelPaths(PANEL_EXT_ROOT));
            if (parsed2.ok) return { ok: true, jsxDir: JSX_DIR };
        } catch (eP2) {}
    }

    return {
        ok: false,
        hostFile: String($.fileName || ""),
        extRoot: PANEL_EXT_ROOT,
        easingDir: EASING_DIR,
        tensionDir: TENSION_DIR,
        gridScript: GRID_SCRIPT
    };
}

function ensurePanelPaths(stage, extRoot) {
    var resolved = resolvePanelPaths(extRoot);
    if (!resolved.ok) {
        return hostError(stage || "ensurePanelPaths", "Panel script paths not resolved", {
            hostFile: resolved.hostFile,
            extRoot: resolved.extRoot,
            easingDir: resolved.easingDir,
            tensionDir: resolved.tensionDir,
            detail: "Pass extension path from CEP or reinstall to AppData"
        });
    }
    return null;
}

function setPanelScriptDirs(jsxDir, extRoot) {
    return trySetPathsFromBase(jsxDir, extRoot);
}

function getActiveCompInfo() {
    if (!app.project) return hostError("getActiveCompInfo", "No project");
    var item = app.project.activeItem;
    if (!item || !(item instanceof CompItem)) {
        return hostError("getActiveCompInfo", "No active composition");
    }
    return JSON.stringify({
        ok: true,
        name: item.name,
        width: item.width,
        height: item.height,
        numLayers: item.numLayers
    });
}

function hexToRgb(hex) {
    var h = String(hex || "").replace("#", "");
    if (h.length === 3) {
        h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    }
    return [
        parseInt(h.substring(0, 2), 16) / 255,
        parseInt(h.substring(2, 4), 16) / 255,
        parseInt(h.substring(4, 6), 16) / 255
    ];
}

function setLayerStrokeColor(layer, rgb) {
    try {
        var contents = layer.property("ADBE Root Vectors Group");
        if (!contents) return false;
        var stroke = contents.property("ADBE Vector Graphic - Stroke");
        if (!stroke) {
            for (var g = 1; g <= contents.numProperties; g++) {
                var prop = contents.property(g);
                if (prop.matchName === "ADBE Vector Graphic - Stroke") {
                    stroke = prop;
                    break;
                }
            }
        }
        if (!stroke) return false;
        stroke.property("ADBE Vector Stroke Color").setValue(rgb);
        return true;
    } catch (e) {
        return false;
    }
}

function applyStrokeColorToSelected(hex) {
    if (!app.project) return JSON.stringify({ ok: false, error: "No project" });
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        return JSON.stringify({ ok: false, error: "No active composition" });
    }
    var layers = comp.selectedLayers;
    if (!layers || layers.length === 0) {
        return JSON.stringify({ ok: false, error: "Select a shape layer" });
    }
    var rgb = hexToRgb(hex);
    var count = 0;
    for (var i = 0; i < layers.length; i++) {
        if (setLayerStrokeColor(layers[i], rgb)) count++;
    }
    if (count === 0) {
        return JSON.stringify({ ok: false, error: "No stroke on selected layer(s)" });
    }
    return JSON.stringify({ ok: true, applied: count, color: hex });
}

function shapeFromPoints(points) {
    var shape = new Shape();
    var verts = [];
    var tangentsIn = [];
    var tangentsOut = [];
    var i;
    for (i = 0; i < points.length; i++) {
        verts.push([points[i][0], points[i][1]]);
        tangentsIn.push([0, 0]);
        tangentsOut.push([0, 0]);
    }
    shape.vertices = verts;
    shape.inTangents = tangentsIn;
    shape.outTangents = tangentsOut;
    shape.closed = false;
    return shape;
}

function createPencilShapeLayer(jsonStr) {
    if (!app.project) return hostError("createPencilShapeLayer", "No project");
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        return hostError("createPencilShapeLayer", "No active composition");
    }

    var data;
    try {
        data = JSON.parse(jsonStr);
    } catch (e) {
        return hostError("createPencilShapeLayer.parse", "Invalid path data", String(e.message || e));
    }

    var strokes = data.strokes;
    if (!strokes || strokes.length === 0) {
        return hostError("createPencilShapeLayer", "Draw something first");
    }

    var canvasW = data.canvasW || 280;
    var canvasH = data.canvasH || 160;
    var strokeColor = hexToRgb(data.strokeColor || "#FFFFFF");
    var strokeWidth = data.strokeWidth || 4;
    var cx = canvasW / 2;
    var cy = canvasH / 2;

    app.beginUndoGroup("Pencil Shape Layer");

    var layer = comp.layers.addShape();
    layer.name = data.layerName || "Pencil Stroke";

    var root = layer.property("ADBE Root Vectors Group");
    var pathCount = 0;
    var s, p, pt, mapped;

    for (s = 0; s < strokes.length; s++) {
        var stroke = strokes[s];
        if (!stroke.points || stroke.points.length < 2) continue;

        mapped = [];
        for (p = 0; p < stroke.points.length; p++) {
            pt = stroke.points[p];
            mapped.push([pt[0] - cx, pt[1] - cy]);
        }

        var pathGroup = root.addProperty("ADBE Vector Shape - Group");
        pathGroup.name = "stroke_" + (pathCount + 1);
        pathGroup.property("ADBE Vector Shape").setValue(shapeFromPoints(mapped));
        pathCount++;
    }

    if (pathCount === 0) {
        layer.remove();
        app.endUndoGroup();
        return hostError("createPencilShapeLayer", "Not enough points");
    }

    var strokeProp = root.addProperty("ADBE Vector Graphic - Stroke");
    strokeProp.property("ADBE Vector Stroke Color").setValue(strokeColor);
    strokeProp.property("ADBE Vector Stroke Width").setValue(strokeWidth);
    strokeProp.property("ADBE Vector Stroke Line Cap").setValue(2);
    strokeProp.property("ADBE Vector Stroke Line Join").setValue(2);

    var fillProp = root.addProperty("ADBE Vector Graphic - Fill");
    fillProp.property("ADBE Vector Fill Opacity").setValue(0);

    var tr = layer.property("ADBE Transform Group");
    tr.property("ADBE Anchor Point").setValue([0, 0]);
    tr.property("ADBE Position").setValue([comp.width / 2, comp.height / 2]);

    layer.moveToBeginning();
    app.endUndoGroup();

    return JSON.stringify({
        ok: true,
        layerName: layer.name,
        paths: pathCount,
        color: data.strokeColor
    });
}

function applyTensionEasing(type, paramsJson, extRoot) {
    return applyPanelEasing(type, paramsJson, extRoot);
}

function easingCountFor(prop) {
    var t = prop.propertyValueType;
    if (t === PropertyValueType.TwoD) return 2;
    if (t === PropertyValueType.ThreeD) return 3;
    return 1;
}

function easingMakeArr(n, inf) {
    if (inf < 0.1) inf = 0.1;
    if (inf > 100) inf = 100;
    var a = [];
    var i;
    for (i = 0; i < n; i++) a.push(new KeyframeEase(0, inf));
    return a;
}

function easingCollectAllKeyedProperties(comp) {
    var out = [];

    function walkProp(prop) {
        if (!prop) return;
        if (prop.propertyType === PropertyType.PROPERTY) {
            if (prop.canVaryOverTime && prop.numKeys >= 1) {
                out.push(prop);
            }
            return;
        }
        if (prop.propertyType === PropertyType.INDEXED_GROUP || prop.propertyType === PropertyType.NAMED_GROUP) {
            var pi;
            for (pi = 1; pi <= prop.numProperties; pi++) {
                walkProp(prop.property(pi));
            }
        }
    }

    var li;
    for (li = 1; li <= comp.numLayers; li++) {
        walkProp(comp.layer(li));
    }
    return out;
}

function easingGetAllKeysRange(prop) {
    if (!prop.numKeys || prop.numKeys < 1) return null;
    return { start: 1, end: prop.numKeys };
}

function easingPickProperty(comp) {
    var props = comp.selectedProperties;
    if (!props || props.length === 0) throw new Error("Select a property (Position, Scale, etc.)");
    var best = null;
    var bestScore = -1;
    var i;
    for (i = 0; i < props.length; i++) {
        var p = props[i];
        if (!p || p.propertyType !== PropertyType.PROPERTY) continue;
        if (!p.canVaryOverTime) continue;
        var sk = (p.selectedKeys && p.selectedKeys.length) ? p.selectedKeys.length : 0;
        var nk = p.numKeys || 0;
        if (sk < 2 && nk < 2) continue;
        var score = sk * 1000 + nk;
        if (score > bestScore) {
            best = p;
            bestScore = score;
        }
    }
    if (!best) throw new Error("Select a property with 2+ keyframes");
    return best;
}

function easingGetRangeKeys(prop) {
    var sk = prop.selectedKeys;
    if (sk && sk.length >= 2) {
        var arr = [];
        var i;
        for (i = 0; i < sk.length; i++) arr.push(sk[i]);
        arr.sort(function (a, b) { return a - b; });
        return { start: arr[0], end: arr[arr.length - 1] };
    }
    return { start: 1, end: prop.numKeys };
}

function easingIsArr(v) {
    return v && v.length !== undefined && typeof v !== "string";
}

function easingLerpVal(a, b, f) {
    if (easingIsArr(a)) {
        var out = [];
        var i;
        for (i = 0; i < a.length; i++) out.push(a[i] + (b[i] - a[i]) * f);
        return out;
    }
    return a + (b - a) * f;
}

function easingRemoveInteriorKeys(prop, tStart, tEnd) {
    var k;
    for (k = prop.numKeys; k >= 1; k--) {
        var t = prop.keyTime(k);
        if (t > tStart + 1e-4 && t < tEnd - 1e-4) prop.removeKey(k);
    }
}

function easingApplyBezierRange(prop, rng, inInf, outInf) {
    var n = easingCountFor(prop);
    var inEase = easingMakeArr(n, inInf);
    var outEase = easingMakeArr(n, outInf);
    var k;
    for (k = rng.start; k <= rng.end; k++) {
        prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        prop.setTemporalEaseAtKey(k, inEase, outEase);
    }
}

function easingApplyInterpRange(prop, rng, inType, outType) {
    var k;
    for (k = rng.start; k <= rng.end; k++) {
        prop.setInterpolationTypeAtKey(k, inType, outType);
    }
}

function applyBasicEasingToProperty(type, params, prop) {
    var rng = easingGetAllKeysRange(prop);
    if (!rng) return false;
    if (type === "antic" && prop.numKeys < 2) return false;

    if (type === "easy") {
        easingApplyBezierRange(prop, rng, 80, 80);
    } else if (type === "out") {
        easingApplyBezierRange(prop, rng, 0.1, 80);
    } else if (type === "hard") {
        easingApplyBezierRange(prop, rng, 16.67, 16.67);
    } else if (type === "snap") {
        easingApplyBezierRange(prop, rng, 100, 100);
    } else if (type === "linear") {
        easingApplyInterpRange(prop, rng, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
    } else if (type === "hold") {
        easingApplyInterpRange(prop, rng, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.HOLD);
    } else if (type === "antic") {
        var tStart = prop.keyTime(rng.start);
        var tEnd = prop.keyTime(rng.end);
        var vStart = prop.keyValue(rng.start);
        var vEnd = prop.keyValue(rng.end);
        var dur = tEnd - tStart;
        if (dur <= 0) return false;
        easingRemoveInteriorKeys(prop, tStart, tEnd);
        var pull = (params && params.intensity !== undefined) ? Number(params.intensity) : 1;
        if (pull < 0.2) pull = 0.2;
        if (pull > 2) pull = 2;
        var anticVal = easingLerpVal(vStart, vEnd, -0.1 * pull);
        prop.setValueAtTime(tStart + dur * 0.14, anticVal);
        rng = easingGetAllKeysRange(prop);
        if (!rng) return false;
        easingApplyBezierRange(prop, rng, 70, 85);
    } else {
        throw new Error("Unknown basic easing: " + type);
    }
    return true;
}

function applyBasicEasingInline(type, params) {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) throw new Error("No active composition");

    var props = easingCollectAllKeyedProperties(comp);
    if (props.length === 0) throw new Error("No keyframes in active comp");

    var applied = 0;
    var i;
    for (i = 0; i < props.length; i++) {
        if (applyBasicEasingToProperty(type, params, props[i])) {
            applied++;
        }
    }
    if (applied === 0) throw new Error("No applicable keyframes in comp");

    return type + " applied to " + applied + " properties (all comp keyframes)";
}

function applyPanelEasing(type, paramsJson, extRoot) {
    var basicMap = {
        "easy": true,
        "out": true,
        "hard": true,
        "snap": true,
        "linear": true,
        "hold": true,
        "antic": true
    };
    var tensionMap = {
        "in": "ease-in",
        "overshoot": "overshoot",
        "bounce": "bounce",
        "spring": "spring",
        "anticSpring": "antic-spring"
    };

    if (!type) {
        return hostError("applyPanelEasing", "Easing type missing");
    }

    var params = {};
    try {
        params = paramsJson ? JSON.parse(paramsJson) : {};
    } catch (e0) {
        params = {};
    }

    if (basicMap[type]) {
        try {
            app.beginUndoGroup("CEP Easing: " + type);
            var basicMsg = applyBasicEasingInline(type, params);
            app.endUndoGroup();
            return JSON.stringify({
                ok: true,
                stage: "applyPanelEasing",
                easeType: type,
                scriptKind: "inline",
                message: basicMsg
            });
        } catch (eBasic) {
            try { app.endUndoGroup(); } catch (eUndoB) {}
            return hostErrorFromException("applyPanelEasing.inline", eBasic, { easeType: type });
        }
    }

    if (!tensionMap[type]) {
        return hostError("applyPanelEasing", "Unknown easing: " + type, {
            easeType: type,
            allowed: "easy,in,out,hard,snap,linear,hold,overshoot,bounce,spring,antic,anticSpring"
        });
    }

    var pathErr = ensurePanelPaths("applyPanelEasing", extRoot);
    if (pathErr) return pathErr;

    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) {
        return hostError("applyPanelEasing", "No active composition");
    }

    var allProps = easingCollectAllKeyedProperties(comp);
    var tensionProps = [];
    var ti;
    for (ti = 0; ti < allProps.length; ti++) {
        if (allProps[ti].numKeys >= 2) {
            tensionProps.push(allProps[ti]);
        }
    }
    if (tensionProps.length === 0) {
        return hostError("applyPanelEasing", "No properties with 2+ keyframes in comp");
    }

    PARAMS = params;
    var scriptFile = new File(TENSION_DIR + "/tension-" + tensionMap[type] + ".jsx");
    if (!scriptFile.exists) {
        return hostError("applyPanelEasing", "Missing tension script", {
            scriptPath: scriptFile.fsName,
            easeType: type,
            tensionDir: TENSION_DIR,
            extRoot: PANEL_EXT_ROOT
        });
    }

    EASING_PANEL_RESULT = "";
    EASING_USE_ALL_KEYS = true;

    var applied = 0;
    var skipped = 0;

    try {
        app.beginUndoGroup("CEP Easing: " + type);
        for (ti = 0; ti < tensionProps.length; ti++) {
            EASING_PANEL_PROP = tensionProps[ti];
            try {
                $.evalFile(scriptFile);
                applied++;
            } catch (eProp) {
                skipped++;
            }
        }
        app.endUndoGroup();
    } catch (e1) {
        try { app.endUndoGroup(); } catch (eUndo) {}
        EASING_PANEL_PROP = null;
        EASING_USE_ALL_KEYS = false;
        return hostErrorFromException("applyPanelEasing.evalFile", e1, {
            scriptPath: scriptFile.fsName,
            easeType: type,
            scriptKind: "tension"
        });
    }

    EASING_PANEL_PROP = null;
    EASING_USE_ALL_KEYS = false;

    if (applied === 0) {
        return hostError("applyPanelEasing", "Failed on all keyed properties", {
            easeType: type,
            skipped: skipped
        });
    }

    var message = type + " applied to " + applied + " properties (all comp keyframes)";
    if (skipped > 0) {
        message += ", skipped " + skipped;
    }

    return JSON.stringify({
        ok: true,
        stage: "applyPanelEasing",
        easeType: type,
        scriptKind: "tension",
        scriptPath: scriptFile.fsName,
        properties: applied,
        skipped: skipped,
        message: message
    });
}

function verifyEasingSetup(extRoot) {
    resolvePanelPaths(extRoot);

    var items = [
        { id: "in", path: TENSION_DIR + "/tension-ease-in.jsx" },
        { id: "overshoot", path: TENSION_DIR + "/tension-overshoot.jsx" },
        { id: "bounce", path: TENSION_DIR + "/tension-bounce.jsx" },
        { id: "spring", path: TENSION_DIR + "/tension-spring.jsx" },
        { id: "anticSpring", path: TENSION_DIR + "/tension-antic-spring.jsx" }
    ];
    var missing = [];
    var i;
    for (i = 0; i < items.length; i++) {
        if (!(new File(items[i].path)).exists) {
            missing.push(items[i].id + ":" + items[i].path);
        }
    }
    return JSON.stringify({
        ok: missing.length === 0,
        stage: "verifyEasingSetup",
        extRoot: PANEL_EXT_ROOT,
        hostFile: String($.fileName || ""),
        tensionDir: TENSION_DIR,
        basicInline: true,
        missing: missing,
        message: missing.length
            ? ("Tension scripts missing: " + missing.length + " (basic easing works inline)")
            : "All easing ready (basic=inline, tension=scripts)"
    });
}

function resolveGridScript(extRoot) {
    resolvePanelPaths(extRoot);
    var script = new File(GRID_SCRIPT);
    if (script.exists) return script;
    if (extRoot) {
        var direct = new File(normalizePath(extRoot) + "/jsx/grid/apply-ae-grid-layout.jsx");
        if (direct.exists) {
            GRID_SCRIPT = direct.fsName;
            return direct;
        }
    }
    return null;
}

function createGridCircles(jsonStr, extRoot) {
    var scriptFile = resolveGridScript(extRoot);
    if (!scriptFile) {
        return hostError("createGridCircles", "Missing grid script", {
            extRoot: extRoot || PANEL_EXT_ROOT,
            gridScript: GRID_SCRIPT,
            jsxDir: JSX_DIR,
            hostFile: String($.fileName || ""),
            detail: "Expected jsx/grid/apply-ae-grid-layout.jsx in extension folder"
        });
    }

    if (!app.project) return hostError("createGridCircles", "No project");
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        return hostError("createGridCircles", "No active composition", "Open a comp timeline first");
    }

    var data;
    try {
        data = JSON.parse(jsonStr);
    } catch (e0) {
        return hostError("createGridCircles.parse", "Invalid grid JSON", String(e0.message || e0));
    }

    var cells = data.cells;
    if (!cells || cells.length === 0) {
        return hostError("createGridCircles", "Select at least one cell", "Pick cells on the grid board");
    }

    var cols = Math.max(1, Math.floor(Number(data.cols) || 5));
    var rows = Math.max(1, Math.floor(Number(data.rows) || 5));
    var cellSize = Math.max(4, Number(data.cellSize) || 80);
    var gap = Math.max(0, Number(data.gap) || 12);
    var fillHex = data.fillColor || data.color || "#000000";
    var strokeHex = data.strokeColor || data.color || "#FFFFFF";
    var fillRgb = hexToRgb(fillHex);
    var strokeRgb = hexToRgb(strokeHex);
    var shapeUi = String(data.shape || "circle");
    var shapeKind = "circle";
    var roundness = 0;
    var randomSeed = Math.floor(Math.random() * 1000000);

    if (shapeUi === "rectangle") {
        shapeKind = "rectangle";
        roundness = 0;
    } else if (shapeUi === "roundRect") {
        shapeKind = "rectangle";
        roundness = Math.min(Math.max(4, cellSize * 0.22), 48);
    } else if (shapeUi === "triangle") {
        shapeKind = "triangle";
    } else if (shapeUi === "star") {
        shapeKind = "star";
    } else if (shapeUi === "random") {
        shapeKind = "random";
    }

    var fillOn = data.fillEnabled !== false;
    var strokeOn = data.strokeEnabled === true;
    var strokeW = Math.max(1, Number(data.strokeWidth) || 4);

    if (!fillOn && !strokeOn) {
        return hostError("createGridCircles", "Enable Fill and/or Stroke");
    }

    GRID_LAYOUT_PARAMS = {
        mode: "create",
        shape: shapeKind,
        layoutMode: "grid",
        cols: cols,
        rows: rows,
        cellWidth: cellSize,
        cellHeight: cellSize,
        gap: gap,
        fitMode: "contain",
        fillEnabled: fillOn,
        fillColor: fillRgb,
        fillOpacity: 100,
        strokeEnabled: strokeOn,
        strokeColor: strokeRgb,
        strokeOpacity: 100,
        strokeWidth: strokeOn ? strokeW : 0,
        roundness: roundness,
        randomSeed: randomSeed,
        activeCells: cells,
        prefix: "cep_grid_"
    };

    GRID_LAYOUT_LAST_COUNT = 0;

    try {
        app.beginUndoGroup("CEP Grid Shapes");
        $.evalFile(scriptFile);
        app.endUndoGroup();

        var created = typeof GRID_LAYOUT_LAST_COUNT === "number" ? GRID_LAYOUT_LAST_COUNT : cells.length;
        if (created < 1) {
            return hostError("createGridCircles.result", "No layers created", {
                scriptPath: scriptFile.fsName,
                cellsRequested: cells.length,
                grid: cols + "x" + rows
            });
        }

        return JSON.stringify({
            ok: true,
            stage: "createGridCircles",
            count: created,
            grid: cols + "x" + rows,
            cellSize: cellSize,
            gap: gap,
            shape: shapeUi,
            fillEnabled: fillOn,
            fillColor: fillHex,
            strokeEnabled: strokeOn,
            strokeColor: strokeHex,
            comp: comp.name,
            message: "Created " + created + " " + shapeUi + " shapes in " + comp.name
        });
    } catch (e1) {
        try { app.endUndoGroup(); } catch (eUndo) {}
        return hostErrorFromException("createGridCircles.evalFile", e1, {
            scriptPath: scriptFile.fsName,
            cellsRequested: cells.length,
            grid: cols + "x" + rows,
            cellSize: cellSize,
            gap: gap,
            comp: comp.name
        });
    }
}

function resolveLayoutScript(extRoot) {
    resolvePanelPaths(extRoot);
    var script = new File(LAYOUT_SCRIPT);
    if (script.exists) return script;
    if (extRoot) {
        var direct = new File(normalizePath(extRoot) + "/jsx/layout/apply-layout-place.jsx");
        if (direct.exists) {
            LAYOUT_SCRIPT = direct.fsName;
            return direct;
        }
    }
    return null;
}

function applyLayoutPlace(mode, extRoot) {
    var scriptFile = resolveLayoutScript(extRoot);
    if (!scriptFile) {
        return hostError("applyLayoutPlace", "Missing layout script", {
            extRoot: extRoot || PANEL_EXT_ROOT,
            layoutScript: LAYOUT_SCRIPT,
            jsxDir: JSX_DIR,
            hostFile: String($.fileName || "")
        });
    }

    if (!app.project) return hostError("applyLayoutPlace", "No project");
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        return hostError("applyLayoutPlace", "No active composition", "Open a comp timeline first");
    }
    if (!comp.selectedLayers || comp.selectedLayers.length < 1) {
        return hostError("applyLayoutPlace", "Select at least one layer");
    }

    LAYOUT_PLACE_PARAMS = { mode: String(mode || "pushOut") };
    LAYOUT_PLACE_LAST = null;

    try {
        app.beginUndoGroup(mode === "gatherCenter" ? "Layout: Gather Center" : "Layout: Push Offscreen");
        $.evalFile(scriptFile);
        app.endUndoGroup();
    } catch (e1) {
        try { app.endUndoGroup(); } catch (eUndo) {}
        return hostErrorFromException("applyLayoutPlace.evalFile", e1, {
            scriptPath: scriptFile.fsName,
            mode: String(mode || "pushOut"),
            comp: comp.name
        });
    }

    var last = typeof LAYOUT_PLACE_LAST === "object" && LAYOUT_PLACE_LAST ? LAYOUT_PLACE_LAST : null;
    if (!last || !last.ok) {
        return hostError("applyLayoutPlace.result", "Layout apply failed", {
            scriptPath: scriptFile.fsName,
            mode: String(mode || "pushOut")
        });
    }

    var label = mode === "gatherCenter" ? "중앙으로" : "화면 밖으로";
    return JSON.stringify({
        ok: true,
        stage: "applyLayoutPlace",
        mode: last.mode,
        moved: last.moved,
        skipped: last.skipped,
        comp: last.comp,
        message: label + " " + last.moved + "개 레이어"
    });
}

function applyLayoutPushOut(extRoot) {
    return applyLayoutPlace("pushOut", extRoot);
}

function applyLayoutGatherCenter(extRoot) {
    return applyLayoutPlace("gatherCenter", extRoot);
}

function resolvePathScript(extRoot) {
    resolvePanelPaths(extRoot);
    var script = new File(PATH_SCRIPT);
    if (script.exists) return script;
    if (extRoot) {
        var direct = new File(normalizePath(extRoot) + "/jsx/path/apply-path-motion.jsx");
        if (direct.exists) {
            PATH_SCRIPT = direct.fsName;
            return direct;
        }
    }
    return null;
}

function applyPathMotion(mode, extRoot) {
    var scriptFile = resolvePathScript(extRoot);
    if (!scriptFile) {
        return hostError("applyPathMotion", "Missing path script", {
            extRoot: extRoot || PANEL_EXT_ROOT,
            pathScript: PATH_SCRIPT,
            jsxDir: JSX_DIR,
            hostFile: String($.fileName || "")
        });
    }

    if (!app.project) return hostError("applyPathMotion", "No project");
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        return hostError("applyPathMotion", "No active composition", "Open a comp timeline first");
    }
    if (!comp.selectedLayers || comp.selectedLayers.length < 1) {
        return hostError("applyPathMotion", "Select at least one layer");
    }

    var modeStr = String(mode || "arc");
    var undoLabel = "Path: Arc";
    if (modeStr === "ortho") undoLabel = "Path: Ortho";
    if (modeStr === "sCurve") undoLabel = "Path: S-Curve";

    PATH_MOTION_PARAMS = { mode: modeStr };
    PATH_MOTION_LAST = null;

    try {
        app.beginUndoGroup(undoLabel);
        $.evalFile(scriptFile);
        app.endUndoGroup();
    } catch (e1) {
        try { app.endUndoGroup(); } catch (eUndo) {}
        return hostErrorFromException("applyPathMotion.evalFile", e1, {
            scriptPath: scriptFile.fsName,
            mode: modeStr,
            comp: comp.name
        });
    }

    var last = typeof PATH_MOTION_LAST === "object" && PATH_MOTION_LAST ? PATH_MOTION_LAST : null;
    if (!last || !last.ok) {
        return hostError("applyPathMotion.result", "Path apply failed", {
            scriptPath: scriptFile.fsName,
            mode: modeStr
        });
    }

    var label = "곡선";
    if (modeStr === "ortho") label = "직각";
    if (modeStr === "sCurve") label = "S자";

    return JSON.stringify({
        ok: true,
        stage: "applyPathMotion",
        mode: last.mode,
        applied: last.applied,
        skipped: last.skipped,
        comp: last.comp,
        message: label + " 경로 " + last.applied + "개 레이어"
    });
}

function applyPathArc(extRoot) {
    return applyPathMotion("arc", extRoot);
}

function applyPathOrtho(extRoot) {
    return applyPathMotion("ortho", extRoot);
}

function applyPathSCurve(extRoot) {
    return applyPathMotion("sCurve", extRoot);
}

function resolveStaggerScript(extRoot) {
    resolvePanelPaths(extRoot);
    var script = new File(STAGGER_SCRIPT);
    if (script.exists) return script;
    if (extRoot) {
        var direct = new File(normalizePath(extRoot) + "/jsx/timing/apply-stagger-timing.jsx");
        if (direct.exists) {
            STAGGER_SCRIPT = direct.fsName;
            return direct;
        }
    }
    return null;
}

/**
 * CEP 타이밍 버튼 → 선택 레이어 startTime 스태거.
 * order는 항상 selection (클릭 순서). 왕복 키 규칙은 apply-stagger-timing.jsx / STAGGER.md.
 */
function applyStaggerTiming(windowEndSec, extRoot) {
    var scriptFile = resolveStaggerScript(extRoot);
    if (!scriptFile) {
        return hostError("applyStaggerTiming", "Missing stagger script", {
            extRoot: extRoot || PANEL_EXT_ROOT,
            staggerScript: STAGGER_SCRIPT,
            jsxDir: JSX_DIR,
            hostFile: String($.fileName || "")
        });
    }

    if (!app.project) return hostError("applyStaggerTiming", "No project");
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        return hostError("applyStaggerTiming", "No active composition", "Open a comp timeline first");
    }

    var endSec = Number(windowEndSec);
    if (isNaN(endSec) || endSec < 0) {
        return hostError("applyStaggerTiming", "Invalid windowEnd", String(windowEndSec));
    }

    PARAMS = {
        mode: "sequential",
        order: "selection",
        windowStart: 0,
        windowEnd: endSec,
        moveDuration: null,
        compName: "",
        layerPrefix: "",
        propertyHint: "",
        reapplyEase: true,
        easeInfluence: 80,
        seed: null,
        keepLayerDuration: true
    };
    STAGGER_TIMING_LAST = null;

    var label = endSec + "s";
    try {
        app.beginUndoGroup("Stagger " + label);
        $.evalFile(scriptFile);
        app.endUndoGroup();
    } catch (e1) {
        try { app.endUndoGroup(); } catch (eUndo) {}
        return hostErrorFromException("applyStaggerTiming.evalFile", e1, {
            scriptPath: scriptFile.fsName,
            windowEnd: endSec,
            comp: comp.name
        });
    }

    var last = typeof STAGGER_TIMING_LAST === "object" && STAGGER_TIMING_LAST ? STAGGER_TIMING_LAST : null;
    if (!last || !last.ok) {
        return hostError("applyStaggerTiming.result", "Stagger apply failed", {
            scriptPath: scriptFile.fsName,
            windowEnd: endSec
        });
    }

    return JSON.stringify({
        ok: true,
        stage: "applyStaggerTiming",
        windowEnd: last.windowEnd,
        count: last.count,
        earliestIn: last.earliestIn,
        comp: last.comp,
        message: "0~" + endSec + "초 스태거 " + last.count + "개 레이어"
    });
}

function paletteDataFile() {
    var folder = new Folder(Folder.userData.fsName + "/Motion Control Palettes");
    if (!folder.exists) folder.create();
    return new File(folder.fsName + "/palettes.txt");
}

function normalizePaletteHex(value) {
    var text = String(value || "").replace(/^\s+|\s+$/g, "").replace(/^#/, "");
    if (text.length === 3) {
        text = text.charAt(0) + text.charAt(0) + text.charAt(1) + text.charAt(1) + text.charAt(2) + text.charAt(2);
    }
    if (!/^[0-9a-fA-F]{6}$/.test(text)) return null;
    return "#" + text.toUpperCase();
}

function ensureDefaultPaletteList(palettes) {
    var i;
    for (i = 0; i < palettes.length; i++) {
        if (String(palettes[i].name || "").toLowerCase() === "my palette") return palettes;
    }
    palettes.unshift({ name: "my palette", colors: [] });
    return palettes;
}

function loadColorPalettes() {
    var palettes = [];
    var file = paletteDataFile();
    if (!file.exists) {
        palettes = ensureDefaultPaletteList(palettes);
        return JSON.stringify({
            ok: true,
            palettes: palettes,
            dataPath: file.fsName,
            message: "No palette file yet"
        });
    }
    try {
        file.encoding = "UTF-8";
        if (!file.open("r")) return hostError("loadColorPalettes", "Cannot read palettes.txt");
        var lines = file.read().split(/\r?\n/);
        file.close();
        var i;
        var j;
        for (i = 0; i < lines.length; i++) {
            if (lines[i].indexOf("PALETTE\t") !== 0) continue;
            var parts = lines[i].split("\t");
            if (parts.length < 2) continue;
            var rawColors = parts.length > 2 ? String(parts[2]).split(",") : [];
            var colors = [];
            for (j = 0; j < rawColors.length; j++) {
                var hex = normalizePaletteHex(rawColors[j]);
                if (hex) colors.push(hex);
            }
            var name = String(parts[1] || "").replace(/^\s+|\s+$/g, "").replace(/[\t\r\n]+/g, " ");
            if (name) palettes.push({ name: name, colors: colors });
        }
    } catch (eLoad) {
        try { file.close(); } catch (eClose) {}
        return hostErrorFromException("loadColorPalettes", eLoad);
    }
    palettes = ensureDefaultPaletteList(palettes);
    return JSON.stringify({
        ok: true,
        palettes: palettes,
        dataPath: file.fsName,
        message: palettes.length + " palettes"
    });
}

function saveColorPalettes(jsonStr) {
    var palettes;
    try {
        palettes = JSON.parse(jsonStr);
    } catch (e0) {
        return hostError("saveColorPalettes.parse", "Invalid palette JSON", String(e0.message || e0));
    }
    if (!palettes || !(palettes instanceof Array)) {
        return hostError("saveColorPalettes", "Expected palette array");
    }
    palettes = ensureDefaultPaletteList(palettes);
    var file = paletteDataFile();
    try {
        file.encoding = "UTF-8";
        if (!file.open("w")) return hostError("saveColorPalettes", "Cannot write palettes.txt");
        file.writeln("AE_COLOR_PALETTES_V1");
        var i;
        var j;
        var colors;
        var hex;
        for (i = 0; i < palettes.length; i++) {
            colors = [];
            if (palettes[i].colors) {
                for (j = 0; j < palettes[i].colors.length; j++) {
                    hex = normalizePaletteHex(palettes[i].colors[j]);
                    if (hex) colors.push(hex);
                }
            }
            file.writeln("PALETTE\t" + String(palettes[i].name || "palette") + "\t" + colors.join(","));
        }
        file.close();
    } catch (eSave) {
        try { file.close(); } catch (eClose2) {}
        return hostErrorFromException("saveColorPalettes", eSave);
    }
    return JSON.stringify({
        ok: true,
        count: palettes.length,
        dataPath: file.fsName,
        message: "Saved " + palettes.length + " palettes"
    });
}

function resolvePaletteApplyScript(extRoot) {
    resolvePanelPaths(extRoot);
    var candidates = [];
    if (PALETTE_APPLY_SCRIPT) candidates.push(new File(PALETTE_APPLY_SCRIPT));
    if (extRoot) {
        candidates.push(new File(normalizePath(extRoot) + "/jsx/palette/color-palette-apply.jsx"));
    }
    var i;
    for (i = 0; i < candidates.length; i++) {
        if (candidates[i] && candidates[i].exists) return candidates[i];
    }
    return null;
}

function loadPaletteApplyHelper(extRoot) {
    if (
        typeof $.global.applyColorPaletteToSelectedShapes === "function" &&
        typeof $.global.captureColorsFromSelectedShapes === "function"
    ) {
        return true;
    }
    var scriptFile = resolvePaletteApplyScript(extRoot);
    if (!scriptFile) return false;
    $.evalFile(scriptFile);
    return typeof $.global.applyColorPaletteToSelectedShapes === "function";
}

function applyPanelColorPalette(jsonStr, extRoot) {
    var data;
    try {
        data = JSON.parse(jsonStr);
    } catch (e0) {
        return hostError("applyPanelColorPalette.parse", "Invalid apply JSON", String(e0.message || e0));
    }
    if (!loadPaletteApplyHelper(extRoot)) {
        return hostError("applyPanelColorPalette", "Missing color-palette-apply.jsx");
    }
    try {
        var result = $.global.applyColorPaletteToSelectedShapes({
            mode: data.mode,
            colors: data.colors || [],
            selectedIndex: typeof data.selectedIndex === "number" ? data.selectedIndex : -1
        });
        if (!result) return hostError("applyPanelColorPalette", "No apply result");
        result.ok = result.ok !== false;
        result.stage = "applyPanelColorPalette";
        return JSON.stringify(result);
    } catch (e1) {
        return hostErrorFromException("applyPanelColorPalette", e1);
    }
}

function capturePanelColorPalette(extRoot) {
    if (!loadPaletteApplyHelper(extRoot)) {
        return hostError("capturePanelColorPalette", "Missing color-palette-apply.jsx");
    }
    try {
        var result = $.global.captureColorsFromSelectedShapes({
            includeStroke: true
        });
        if (!result) return hostError("capturePanelColorPalette", "No capture result");
        result.ok = result.ok !== false;
        result.stage = "capturePanelColorPalette";
        return JSON.stringify(result);
    } catch (e1) {
        return hostErrorFromException("capturePanelColorPalette", e1);
    }
}

function resolveShapePathFile(fileName, extRoot) {
    if (!fileName || String(fileName).replace(/^\s+|\s+$/g, "").length < 1) return null;
    resolvePanelPaths(extRoot);
    var candidates = [];
    if (SHAPE_PATH_DIR) candidates.push(new File(SHAPE_PATH_DIR + "/" + fileName));
    if (extRoot) candidates.push(new File(normalizePath(extRoot) + "/jsx/shape-path/" + fileName));
    var i;
    for (i = 0; i < candidates.length; i++) {
        if (candidates[i] && candidates[i].exists) return candidates[i];
    }
    return null;
}

function loadShapePathLib(extRoot) {
    var lib = resolveShapePathFile("lib-selected-paths.jsx", extRoot);
    if (!lib) return false;
    $.evalFile(lib);
    if (typeof collectSelectedShapePaths === "function") {
        $.global.collectSelectedShapePaths = collectSelectedShapePaths;
    }
    return typeof $.global.collectSelectedShapePaths === "function";
}

function applyShapePathTool(tool, extRoot) {
    var toolName = String(tool || "");
    var applyName = "";
    var verifyName = "";
    var undoLabel = "Path Tool";
    var message = "";

    if (!app.project) return hostError("applyShapePathTool", "No project");
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        return hostError("applyShapePathTool", "No active composition", "Open a comp timeline first");
    }

    if (!loadShapePathLib(extRoot)) {
        return hostError("applyShapePathTool", "Missing lib-selected-paths.jsx", {
            extRoot: extRoot || PANEL_EXT_ROOT,
            shapePathDir: SHAPE_PATH_DIR
        });
    }

    PARAMS = {};
    if (toolName === "morph") {
        applyName = "apply-selected-path-morph.jsx";
        verifyName = "verify-selected-path-morph.jsx";
        undoLabel = "Path Morph";
        PARAMS = { mode: "replace", interval: 1 };
        SHAPE_PATH_MORPH_LAST = null;
    } else if (toolName === "morphAppend") {
        applyName = "apply-selected-path-morph.jsx";
        verifyName = "verify-selected-path-morph.jsx";
        undoLabel = "Path Morph Append";
        PARAMS = { mode: "append", interval: 1 };
        SHAPE_PATH_MORPH_LAST = null;
    } else if (toolName === "lineSweep") {
        applyName = "apply-selected-path-line-sweep.jsx";
        verifyName = "verify-selected-path-line-sweep.jsx";
        undoLabel = "Path Line Sweep";
        SHAPE_PATH_SWEEP_LAST = null;
    } else if (toolName === "lineFlow") {
        applyName = "apply-selected-path-line-flow.jsx";
        verifyName = "verify-objects-line-flow.jsx";
        undoLabel = "Path Line Flow";
        SHAPE_PATH_FLOW_LAST = null;
    } else if (toolName === "wireframe") {
        applyName = "apply-selected-path-wireframe.jsx";
        verifyName = "verify-path-wireframe.jsx";
        undoLabel = "Path Wireframe";
        SHAPE_PATH_WF_LAST = null;
    } else if (toolName === "extend") {
        applyName = "apply-selected-path-extend.jsx";
        verifyName = "verify-selected-path-extend.jsx";
        undoLabel = "Path Extend";
        SHAPE_PATH_EXTEND_LAST = null;
    } else if (toolName === "trimPaths") {
        applyName = "apply-selected-path-trim.jsx";
        verifyName = "verify-selected-path-trim.jsx";
        undoLabel = "Path Trim";
        PARAMS = { duration: 0.7, hold: 0.3, startTime: 0, easeInfluence: 80 };
        SHAPE_PATH_TRIM_LAST = null;
    } else if (toolName === "trimDraw") {
        applyName = "apply-selected-path-trim-draw.jsx";
        verifyName = "";
        undoLabel = "Path Trim Draw";
        PARAMS = { duration: 0.8, startTime: 0, easeInfluence: 80 };
        SHAPE_PATH_TRIM_DRAW_LAST = null;
    } else if (toolName === "abKeys") {
        applyName = "apply-selected-path-ab.jsx";
        verifyName = "";
        undoLabel = "Path A to B";
        PARAMS = { interval: 1 };
        SHAPE_PATH_AB_LAST = null;
    } else if (toolName === "pointStagger") {
        applyName = "apply-selected-path-point-stagger.jsx";
        verifyName = "";
        undoLabel = "Path Point Stagger";
        PARAMS = { pointStagger: 20 };
        SHAPE_PATH_STAGGER_LAST = null;
    } else if (toolName === "overshootReturn") {
        applyName = "apply-selected-path-overshoot-return.jsx";
        verifyName = "";
        undoLabel = "Path Overshoot Return";
        PARAMS = { overshoot: 1.70158, hold: 2, pointStagger: 20 };
        SHAPE_PATH_OVERSHOOT_LAST = null;
    } else {
        return hostError("applyShapePathTool", "Unknown tool", toolName);
    }

    var applyFile = resolveShapePathFile(applyName, extRoot);
    if (!applyFile) {
        return hostError("applyShapePathTool", "Missing apply script", {
            tool: toolName,
            applyName: applyName,
            shapePathDir: SHAPE_PATH_DIR
        });
    }
    var verifyFile = resolveShapePathFile(verifyName, extRoot);

    try {
        app.beginUndoGroup(undoLabel);
        $.evalFile(applyFile);
        if (verifyFile && verifyFile.exists && !verifyFile.isFolder) $.evalFile(verifyFile);
        app.endUndoGroup();
    } catch (e1) {
        try { app.endUndoGroup(); } catch (eUndo) {}
        return hostErrorFromException("applyShapePathTool.evalFile", e1, {
            tool: toolName,
            scriptPath: applyFile.fsName,
            verifyPath: verifyFile ? verifyFile.fsName : "",
            comp: comp.name
        });
    }

    if (toolName === "morph" || toolName === "morphAppend") {
        if (!SHAPE_PATH_MORPH_LAST || !SHAPE_PATH_MORPH_LAST.ok) {
            return hostError("applyShapePathTool.result", "Path morph failed", { tool: toolName });
        }
        message = (toolName === "morphAppend" ? "모프 이어붙이기 " : "패스 모프 ") +
            SHAPE_PATH_MORPH_LAST.keys + "키 · " + SHAPE_PATH_MORPH_LAST.sources + " Path";
        return JSON.stringify({
            ok: true,
            stage: "applyShapePathTool",
            tool: toolName,
            message: message,
            keys: SHAPE_PATH_MORPH_LAST.keys,
            sources: SHAPE_PATH_MORPH_LAST.sources,
            verts: SHAPE_PATH_MORPH_LAST.verts
        });
    }
    if (toolName === "lineSweep") {
        if (!SHAPE_PATH_SWEEP_LAST || !SHAPE_PATH_SWEEP_LAST.ok) {
            return hostError("applyShapePathTool.result", "Line sweep failed");
        }
        message = "라인 스윕 " + SHAPE_PATH_SWEEP_LAST.applied + "개 Path";
        return JSON.stringify({
            ok: true,
            stage: "applyShapePathTool",
            tool: toolName,
            message: message,
            applied: SHAPE_PATH_SWEEP_LAST.applied
        });
    }
    if (toolName === "lineFlow") {
        if (!SHAPE_PATH_FLOW_LAST || !SHAPE_PATH_FLOW_LAST.ok) {
            return hostError("applyShapePathTool.result", "Line flow failed");
        }
        message = "패스 플로우 " + SHAPE_PATH_FLOW_LAST.paths + "개 Path";
        return JSON.stringify({
            ok: true,
            stage: "applyShapePathTool",
            tool: toolName,
            message: message,
            paths: SHAPE_PATH_FLOW_LAST.paths
        });
    }
    if (toolName === "wireframe") {
        if (!SHAPE_PATH_WF_LAST || !SHAPE_PATH_WF_LAST.ok) {
            return hostError("applyShapePathTool.result", "Wireframe failed");
        }
        message = "와이어프레임 " + SHAPE_PATH_WF_LAST.paths + "개 Path";
        return JSON.stringify({
            ok: true,
            stage: "applyShapePathTool",
            tool: toolName,
            message: message,
            paths: SHAPE_PATH_WF_LAST.paths,
            layers: SHAPE_PATH_WF_LAST.layers
        });
    }
    if (toolName === "extend") {
        if (!SHAPE_PATH_EXTEND_LAST || !SHAPE_PATH_EXTEND_LAST.ok) {
            return hostError("applyShapePathTool.result", "Path extend failed");
        }
        message = "패스 연장 " + SHAPE_PATH_EXTEND_LAST.vertsBefore + "→" + SHAPE_PATH_EXTEND_LAST.vertsAfter + "점";
        return JSON.stringify({
            ok: true,
            stage: "applyShapePathTool",
            tool: toolName,
            message: message,
            vertsBefore: SHAPE_PATH_EXTEND_LAST.vertsBefore,
            vertsAfter: SHAPE_PATH_EXTEND_LAST.vertsAfter
        });
    }
    if (toolName === "trimPaths") {
        if (!SHAPE_PATH_TRIM_LAST || !SHAPE_PATH_TRIM_LAST.ok) {
            return hostError("applyShapePathTool.result", "Trim paths failed");
        }
        message = "트림패스 " + SHAPE_PATH_TRIM_LAST.applied + "개 Path";
        return JSON.stringify({
            ok: true,
            stage: "applyShapePathTool",
            tool: toolName,
            message: message,
            applied: SHAPE_PATH_TRIM_LAST.applied
        });
    }
    if (toolName === "trimDraw") {
        if (!SHAPE_PATH_TRIM_DRAW_LAST || !SHAPE_PATH_TRIM_DRAW_LAST.ok) {
            return hostError("applyShapePathTool.result", "Trim draw failed");
        }
        message = SHAPE_PATH_TRIM_DRAW_LAST.message;
        return JSON.stringify({
            ok: true,
            stage: "applyShapePathTool",
            tool: toolName,
            message: message,
            applied: SHAPE_PATH_TRIM_DRAW_LAST.applied
        });
    }
    if (toolName === "abKeys") {
        if (!SHAPE_PATH_AB_LAST || !SHAPE_PATH_AB_LAST.ok) {
            return hostError("applyShapePathTool.result", "A→B keys failed");
        }
        message = SHAPE_PATH_AB_LAST.message;
        return JSON.stringify({
            ok: true,
            stage: "applyShapePathTool",
            tool: toolName,
            message: message,
            keys: SHAPE_PATH_AB_LAST.keys
        });
    }
    if (toolName === "pointStagger") {
        if (!SHAPE_PATH_STAGGER_LAST || !SHAPE_PATH_STAGGER_LAST.ok) {
            return hostError("applyShapePathTool.result", "Point stagger failed");
        }
        message = SHAPE_PATH_STAGGER_LAST.message;
        return JSON.stringify({
            ok: true,
            stage: "applyShapePathTool",
            tool: toolName,
            message: message,
            applied: SHAPE_PATH_STAGGER_LAST.applied
        });
    }
    if (toolName === "overshootReturn") {
        if (!SHAPE_PATH_OVERSHOOT_LAST || !SHAPE_PATH_OVERSHOOT_LAST.ok) {
            return hostError("applyShapePathTool.result", "Overshoot return failed");
        }
        message = SHAPE_PATH_OVERSHOOT_LAST.message;
        return JSON.stringify({
            ok: true,
            stage: "applyShapePathTool",
            tool: toolName,
            message: message,
            applied: SHAPE_PATH_OVERSHOOT_LAST.applied
        });
    }

    return hostError("applyShapePathTool", "Unhandled tool", toolName);
}

function applyPathMorph(extRoot) {
    return applyShapePathTool("morph", extRoot);
}

function applyPathMorphAppend(extRoot) {
    return applyShapePathTool("morphAppend", extRoot);
}

function applyPathLineSweep(extRoot) {
    return applyShapePathTool("lineSweep", extRoot);
}

function applyPathLineFlow(extRoot) {
    return applyShapePathTool("lineFlow", extRoot);
}

function applyPathWireframe(extRoot) {
    return applyShapePathTool("wireframe", extRoot);
}

function applyPathExtend(extRoot) {
    return applyShapePathTool("extend", extRoot);
}

function applyPathTrim(extRoot) {
    return applyShapePathTool("trimPaths", extRoot);
}

function applyPathTrimDraw(extRoot) {
    return applyShapePathTool("trimDraw", extRoot);
}

function applyPathAB(extRoot) {
    return applyShapePathTool("abKeys", extRoot);
}

function applyPathPointStagger(extRoot) {
    return applyShapePathTool("pointStagger", extRoot);
}

function applyPathOvershootReturn(extRoot) {
    return applyShapePathTool("overshootReturn", extRoot);
}

function diagnoseSelectedPaths(extRoot) {
    if (!app.project) return hostError("diagnoseSelectedPaths", "No project");
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        return hostError("diagnoseSelectedPaths", "No active composition", "Open a comp timeline first");
    }
    if (!loadShapePathLib(extRoot)) {
        return hostError("diagnoseSelectedPaths", "Missing lib-selected-paths.jsx");
    }
    var diagFile = resolveShapePathFile("diagnose-selected-paths.jsx", extRoot);
    if (!diagFile) {
        return hostError("diagnoseSelectedPaths", "Missing diagnose script");
    }
    SHAPE_PATH_DIAG_LAST = null;
    try {
        $.evalFile(diagFile);
    } catch (e1) {
        return hostErrorFromException("diagnoseSelectedPaths.evalFile", e1);
    }
    if (!SHAPE_PATH_DIAG_LAST) {
        return hostError("diagnoseSelectedPaths", "No diagnostic result");
    }
    return JSON.stringify({
        ok: SHAPE_PATH_DIAG_LAST.ok,
        stage: "diagnoseSelectedPaths",
        message: SHAPE_PATH_DIAG_LAST.message || SHAPE_PATH_DIAG_LAST.summary || "",
        count: SHAPE_PATH_DIAG_LAST.count || 0,
        paths: SHAPE_PATH_DIAG_LAST.paths || []
    });
}
