/**
 * @skill objects-line-flow
 * Selected Shape Layer path(s) → equal-spaced mixed shapes flowing along path.
 *
 * Per source layer: OLF CTRL XX (Speed / Size / Offset / Count)
 * Shared: OLF Design CTRL
 *   Fill Color, Stroke Color, Stroke Width,
 *   Path Stroke Color, Path Stroke Width,
 *   Roundness, Orient to Path (Checkbox), Fixed Rotation
 *
 * PARAMS (optional, set before $.evalFile):
 *   spacingPx, size, speed, minDotsPerPath, maxDotsPerPath,
 *   fillColor, strokeColor, strokeWidth,
 *   pathStrokeColor, pathStrokeWidth, roundness, orientToPath,
 *   fixedRotation, diversifyShapes, shapeKinds, dotPrefix,
 *   motionCtrlPrefix, designCtrlName
 */
(function () {
  var P = typeof PARAMS !== "undefined" && PARAMS ? PARAMS : {};
  var SPACING_PX = numOr(P.spacingPx, 90);
  var DEFAULT_SIZE = numOr(P.size, 36);
  var DEFAULT_SPEED = numOr(P.speed, 20);
  var MIN_DOTS = numOr(P.minDotsPerPath, 4);
  var MAX_DOTS = numOr(P.maxDotsPerPath, 80);
  var FILL = rgb3(P.fillColor || [0, 0, 0, 1]);
  var STROKE = rgb3(P.strokeColor || [1, 1, 1, 1]);
  var STROKE_W = numOr(P.strokeWidth, 2);
  var PATH_STROKE = rgb3(P.pathStrokeColor || [0, 0, 0, 1]);
  var PATH_STROKE_W = numOr(P.pathStrokeWidth, 13);
  var ROUNDNESS = numOr(P.roundness, 15);
  var ORIENT = P.orientToPath === false || P.orientToPath === 0 ? 0 : 1;
  var FIXED_ROT = numOr(P.fixedRotation, 0);
  var DIVERSIFY = P.diversifyShapes === false || P.diversifyShapes === 0 ? false : true;
  var SHAPE_KINDS = P.shapeKinds && P.shapeKinds.length
    ? P.shapeKinds
    : ["circle", "square", "triangle", "star", "hexagon"];
  var DOT_PREFIX = P.dotPrefix ? String(P.dotPrefix) : "OLF Dot ";
  var MOTION_PREFIX = P.motionCtrlPrefix ? String(P.motionCtrlPrefix) : "OLF CTRL ";
  var DESIGN_NAME = P.designCtrlName ? String(P.designCtrlName) : "OLF Design CTRL";

  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    throw new Error("활성 컴포지션이 없습니다.");
  }

  var targets = collectTargetPaths(comp);
  if (targets.length < 1) {
    throw new Error(
      "대상 패스가 없습니다. Shape Layer를 선택하거나, 레이어 안 Path를 선택하세요."
    );
  }

  cleanupOldFlow(comp, DOT_PREFIX, MOTION_PREFIX, DESIGN_NAME);

  // group paths by source layer (stable order = first appearance)
  var layerGroups = groupTargetsByLayer(targets);
  var g;
  for (g = 0; g < layerGroups.length; g++) {
    var grp = layerGroups[g];
    var pi;
    for (pi = 0; pi < grp.paths.length; pi++) {
      var info = grp.paths[pi];
      var len = approxPathLength(info.pathProp.value, 64);
      var count = Math.floor(len / SPACING_PX);
      if (count < MIN_DOTS) count = MIN_DOTS;
      if (count > MAX_DOTS) count = MAX_DOTS;
      info.pathLen = len;
      info.count = count;
      grp.totalDots += count;
    }
  }

  var design = createDesignCtrl(
    comp,
    DESIGN_NAME,
    FILL,
    STROKE,
    STROKE_W,
    PATH_STROKE,
    PATH_STROKE_W,
    ROUNDNESS,
    ORIENT,
    FIXED_ROT
  );

  var created = 0;
  var pathSummaries = [];
  var shapeIdx = 0;
  var motionCtrls = [];

  for (g = 0; g < layerGroups.length; g++) {
    var layerGrp = layerGroups[g];
    var layerIdx = g + 1;
    var motionName = MOTION_PREFIX + pad2(layerIdx);
    var motion = createMotionCtrl(
      comp,
      motionName,
      DEFAULT_SPEED,
      DEFAULT_SIZE,
      layerGrp.totalDots
    );
    motionCtrls.push(motion);

    for (pi = 0; pi < layerGrp.paths.length; pi++) {
      var info = layerGrp.paths[pi];
      var exprPathRef = buildPathExprRef(info.groupNames);
      var count = info.count;
      var i;
      for (i = 0; i < count; i++) {
        var kind = DIVERSIFY
          ? SHAPE_KINDS[shapeIdx % SHAPE_KINDS.length]
          : "circle";
        shapeIdx++;
        created++;

        var name = DOT_PREFIX + pad2(layerIdx) + "-" + pad2(i + 1);
        var dot = createShapeDot(comp, name, kind, DEFAULT_SIZE);
        bindDotMotion(dot, info.layer.name, exprPathRef, motionName, count, i);
        bindDotSize(dot, kind, motionName);
        bindDotStyle(dot, DESIGN_NAME);
        bindDotOrient(dot, info.layer.name, exprPathRef, motionName, DESIGN_NAME, count, i);
      }

      pathSummaries.push(
        info.layer.name +
          "/" +
          info.groupNames.join("/") +
          " → " +
          motionName +
          " len≈" +
          Math.round(info.pathLen) +
          " n=" +
          count
      );
    }

    bindSourcePathStrokes(layerGrp.layer, DESIGN_NAME);
  }

  // stack: Design, Motion ctrls, dots already at top from creation —
  // move controllers to beginning in order Design, CTRL01, CTRL02...
  var c;
  for (c = motionCtrls.length - 1; c >= 0; c--) {
    motionCtrls[c].moveToBeginning();
  }
  design.moveToBeginning();

  placeSourcesAboveBg(comp, layerGroups);

  log(
    "objects-line-flow: layers=" +
      layerGroups.length +
      " paths=" +
      targets.length +
      " dots=" +
      created +
      " design=" +
      DESIGN_NAME +
      " diversify=" +
      DIVERSIFY +
      " | " +
      pathSummaries.join(" ; ")
  );
})();

/* ---------- helpers ---------- */

function numOr(v, d) {
  if (v === undefined || v === null || isNaN(Number(v))) return d;
  return Number(v);
}

function rgb3(c) {
  if (!c) return [0, 0, 0];
  return [c[0], c[1], c[2]];
}

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

function escapeStr(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function setExpr(prop, expr) {
  prop.expression = expr;
  if (prop.expressionError && prop.expressionError !== "") {
    throw new Error("Expression error: " + prop.expressionError);
  }
}

function cleanupOldFlow(comp, dotPrefix, motionPrefix, designName) {
  var i;
  for (i = comp.numLayers; i >= 1; i--) {
    var n = comp.layer(i).name;
    if (
      n.indexOf(dotPrefix) === 0 ||
      n.indexOf(motionPrefix) === 0 ||
      n === designName ||
      n === "ObjectsLineFlow CTRL" ||
      n === "PathFlow CTRL" ||
      n.indexOf("PathDot ") === 0
    ) {
      comp.layer(i).remove();
    }
  }
}

function groupTargetsByLayer(targets) {
  var groups = [];
  var map = {};
  var t;
  for (t = 0; t < targets.length; t++) {
    var ly = targets[t].layer;
    var key = String(ly.index) + "::" + ly.name;
    if (!map[key]) {
      map[key] = {
        layer: ly,
        paths: [],
        totalDots: 0
      };
      groups.push(map[key]);
    }
    map[key].paths.push(targets[t]);
  }
  // stable CTRL numbering by layer name
  groups.sort(function (a, b) {
    if (a.layer.name < b.layer.name) return -1;
    if (a.layer.name > b.layer.name) return 1;
    return a.layer.index - b.layer.index;
  });
  return groups;
}

function createMotionCtrl(comp, name, speed, size, count) {
  var nullLayer = comp.layers.addNull();
  nullLayer.name = name;
  nullLayer.enabled = false;
  var fx = nullLayer.property("ADBE Effect Parade");

  var speedFx = fx.addProperty("ADBE Slider Control");
  speedFx.name = "Speed";
  speedFx.property("ADBE Slider Control-0001").setValue(speed);

  var sizeFx = fx.addProperty("ADBE Slider Control");
  sizeFx.name = "Size";
  sizeFx.property("ADBE Slider Control-0001").setValue(size);

  var offsetFx = fx.addProperty("ADBE Slider Control");
  offsetFx.name = "Offset";
  offsetFx.property("ADBE Slider Control-0001").setValue(0);

  var countFx = fx.addProperty("ADBE Slider Control");
  countFx.name = "Count (info)";
  countFx.property("ADBE Slider Control-0001").setValue(count);

  return nullLayer;
}

function createDesignCtrl(
  comp,
  name,
  fill,
  stroke,
  strokeW,
  pathStroke,
  pathStrokeW,
  roundness,
  orient,
  fixedRot
) {
  var nullLayer = comp.layers.addNull();
  nullLayer.name = name;
  nullLayer.enabled = false;
  var fx = nullLayer.property("ADBE Effect Parade");

  var fillFx = fx.addProperty("ADBE Color Control");
  fillFx.name = "Fill Color";
  fillFx.property("ADBE Color Control-0001").setValue(fill);

  var strokeFx = fx.addProperty("ADBE Color Control");
  strokeFx.name = "Stroke Color";
  strokeFx.property("ADBE Color Control-0001").setValue(stroke);

  var widthFx = fx.addProperty("ADBE Slider Control");
  widthFx.name = "Stroke Width";
  widthFx.property("ADBE Slider Control-0001").setValue(strokeW);

  var pathStrokeFx = fx.addProperty("ADBE Color Control");
  pathStrokeFx.name = "Path Stroke Color";
  pathStrokeFx.property("ADBE Color Control-0001").setValue(pathStroke);

  var pathWidthFx = fx.addProperty("ADBE Slider Control");
  pathWidthFx.name = "Path Stroke Width";
  pathWidthFx.property("ADBE Slider Control-0001").setValue(pathStrokeW);

  var roundFx = fx.addProperty("ADBE Slider Control");
  roundFx.name = "Roundness";
  roundFx.property("ADBE Slider Control-0001").setValue(roundness);

  var orientFx = fx.addProperty("ADBE Checkbox Control");
  orientFx.name = "Orient to Path";
  orientFx.property("ADBE Checkbox Control-0001").setValue(orient);

  var fixedFx = fx.addProperty("ADBE Slider Control");
  fixedFx.name = "Fixed Rotation";
  fixedFx.property("ADBE Slider Control-0001").setValue(fixedRot);

  return nullLayer;
}

function createShapeDot(comp, name, kind, diameter) {
  var shapeLayer = comp.layers.addShape();
  shapeLayer.name = name;
  shapeLayer.moveToBeginning();

  var contents = shapeLayer.property("ADBE Root Vectors Group");
  var group = contents.addProperty("ADBE Vector Group");
  group.name = "Shape";
  var gc = group.property("ADBE Vectors Group");

  if (kind === "circle") {
    var ell = gc.addProperty("ADBE Vector Shape - Ellipse");
    ell.property("ADBE Vector Ellipse Position").setValue([0, 0]);
    ell.property("ADBE Vector Ellipse Size").setValue([diameter, diameter]);
  } else if (kind === "square") {
    var rect = gc.addProperty("ADBE Vector Shape - Rect");
    rect.property("ADBE Vector Rect Position").setValue([0, 0]);
    rect.property("ADBE Vector Rect Size").setValue([diameter, diameter]);
    rect.property("ADBE Vector Rect Roundness").setValue(0);
  } else if (kind === "triangle") {
    var tri = gc.addProperty("ADBE Vector Shape - Star");
    tri.property("ADBE Vector Star Type").setValue(2);
    tri.property("ADBE Vector Star Points").setValue(3);
    tri.property("ADBE Vector Star Position").setValue([0, 0]);
    tri.property("ADBE Vector Star Outer Radius").setValue(diameter / 2);
  } else if (kind === "star") {
    var star = gc.addProperty("ADBE Vector Shape - Star");
    star.property("ADBE Vector Star Type").setValue(1);
    star.property("ADBE Vector Star Points").setValue(5);
    star.property("ADBE Vector Star Position").setValue([0, 0]);
    star.property("ADBE Vector Star Outer Radius").setValue(diameter / 2);
    star.property("ADBE Vector Star Inner Radius").setValue(diameter / 4);
  } else if (kind === "hexagon") {
    var hex = gc.addProperty("ADBE Vector Shape - Star");
    hex.property("ADBE Vector Star Type").setValue(2);
    hex.property("ADBE Vector Star Points").setValue(6);
    hex.property("ADBE Vector Star Position").setValue([0, 0]);
    hex.property("ADBE Vector Star Outer Radius").setValue(diameter / 2);
  } else {
    throw new Error("unknown shape kind: " + kind);
  }

  var rc = gc.addProperty("ADBE Vector Filter - RC");
  rc.property("ADBE Vector RoundCorner Radius").setValue(0);

  var fill = gc.addProperty("ADBE Vector Graphic - Fill");
  fill.property("ADBE Vector Fill Opacity").setValue(100);

  var stroke = gc.addProperty("ADBE Vector Graphic - Stroke");
  stroke.property("ADBE Vector Stroke Opacity").setValue(100);
  stroke.property("ADBE Vector Stroke Width").setValue(0);

  shapeLayer.transform.position.setValue([comp.width / 2, comp.height / 2]);
  return shapeLayer;
}

function bindDotMotion(layer, srcName, exprPathRef, motionName, count, idx) {
  var posExpr =
    "var L = thisComp.layer(\"" +
    escapeStr(srcName) +
    "\");\n" +
    "var path = " +
    exprPathRef +
    ";\n" +
    "var ctrl = thisComp.layer(\"" +
    escapeStr(motionName) +
    "\");\n" +
    "var speed = ctrl.effect(\"Speed\")(\"Slider\");\n" +
    "var offset = ctrl.effect(\"Offset\")(\"Slider\");\n" +
    "var n = " +
    count +
    ";\n" +
    "var idx = " +
    idx +
    ";\n" +
    "var u = (time * speed / 100 + offset / 100 + idx / n) % 1;\n" +
    "if (u < 0) u += 1;\n" +
    "L.toComp(path.pointOnPath(u));";
  setExpr(layer.transform.position, posExpr);
}

function bindDotOrient(layer, srcName, exprPathRef, motionName, designName, count, idx) {
  var rotExpr =
    "var design = thisComp.layer(\"" +
    escapeStr(designName) +
    "\");\n" +
    "var orient = design.effect(\"Orient to Path\")(\"Checkbox\");\n" +
    "var fixedR = design.effect(\"Fixed Rotation\")(\"Slider\");\n" +
    "if (orient < 0.5) {\n" +
    "  fixedR;\n" +
    "} else {\n" +
    "  var L = thisComp.layer(\"" +
    escapeStr(srcName) +
    "\");\n" +
    "  var path = " +
    exprPathRef +
    ";\n" +
    "  var ctrl = thisComp.layer(\"" +
    escapeStr(motionName) +
    "\");\n" +
    "  var speed = ctrl.effect(\"Speed\")(\"Slider\");\n" +
    "  var offset = ctrl.effect(\"Offset\")(\"Slider\");\n" +
    "  var n = " +
    count +
    ";\n" +
    "  var idx = " +
    idx +
    ";\n" +
    "  var u = (time * speed / 100 + offset / 100 + idx / n) % 1;\n" +
    "  if (u < 0) u += 1;\n" +
    "  var p0 = path.pointOnPath(u);\n" +
    "  var tan = path.tangentOnPath(u);\n" +
    "  var c0 = L.toComp(p0);\n" +
    "  var c1 = L.toComp([p0[0] + tan[0], p0[1] + tan[1]]);\n" +
    "  radiansToDegrees(Math.atan2(c1[1] - c0[1], c1[0] - c0[0]));\n" +
    "}";
  setExpr(layer.transform.rotation, rotExpr);
}

function bindDotSize(layer, kind, motionName) {
  var sizeExpr =
    "var s = thisComp.layer(\"" +
    escapeStr(motionName) +
    "\").effect(\"Size\")(\"Slider\");\n";
  var contents = layer
    .property("ADBE Root Vectors Group")
    .property(1)
    .property("ADBE Vectors Group");

  if (kind === "circle") {
    setExpr(
      contents
        .property("ADBE Vector Shape - Ellipse")
        .property("ADBE Vector Ellipse Size"),
      sizeExpr + "[s, s]"
    );
  } else if (kind === "square") {
    setExpr(
      contents
        .property("ADBE Vector Shape - Rect")
        .property("ADBE Vector Rect Size"),
      sizeExpr + "[s, s]"
    );
  } else if (kind === "star") {
    setExpr(
      contents
        .property("ADBE Vector Shape - Star")
        .property("ADBE Vector Star Outer Radius"),
      sizeExpr + "s / 2"
    );
    setExpr(
      contents
        .property("ADBE Vector Shape - Star")
        .property("ADBE Vector Star Inner Radius"),
      sizeExpr + "s / 4"
    );
  } else {
    // triangle / hexagon
    setExpr(
      contents
        .property("ADBE Vector Shape - Star")
        .property("ADBE Vector Star Outer Radius"),
      sizeExpr + "s / 2"
    );
  }
}

function bindDotStyle(layer, designName) {
  var contents = layer
    .property("ADBE Root Vectors Group")
    .property(1)
    .property("ADBE Vectors Group");

  var fill = findByMatch(contents, "ADBE Vector Graphic - Fill");
  var stroke = findByMatch(contents, "ADBE Vector Graphic - Stroke");
  var rc = findByMatch(contents, "ADBE Vector Filter - RC");
  var rect = findByMatch(contents, "ADBE Vector Shape - Rect");

  if (!fill || !stroke || !rc) {
    throw new Error("Fill/Stroke/RC 누락: " + layer.name);
  }

  setExpr(
    fill.property("ADBE Vector Fill Color"),
    "thisComp.layer(\"" +
      escapeStr(designName) +
      "\").effect(\"Fill Color\")(\"Color\")"
  );
  setExpr(
    stroke.property("ADBE Vector Stroke Color"),
    "thisComp.layer(\"" +
      escapeStr(designName) +
      "\").effect(\"Stroke Color\")(\"Color\")"
  );
  setExpr(
    stroke.property("ADBE Vector Stroke Width"),
    "thisComp.layer(\"" +
      escapeStr(designName) +
      "\").effect(\"Stroke Width\")(\"Slider\")"
  );

  var roundExpr =
    "thisComp.layer(\"" +
    escapeStr(designName) +
    "\").effect(\"Roundness\")(\"Slider\")";
  setExpr(rc.property("ADBE Vector RoundCorner Radius"), roundExpr);
  if (rect) {
    setExpr(rect.property("ADBE Vector Rect Roundness"), roundExpr);
  }
}

function bindSourcePathStrokes(layer, designName) {
  var strokes = [];
  collectStrokes(layer.property("ADBE Root Vectors Group"), strokes);
  var i;
  for (i = 0; i < strokes.length; i++) {
    setExpr(
      strokes[i].property("ADBE Vector Stroke Color"),
      "thisComp.layer(\"" +
        escapeStr(designName) +
        "\").effect(\"Path Stroke Color\")(\"Color\")"
    );
    setExpr(
      strokes[i].property("ADBE Vector Stroke Width"),
      "thisComp.layer(\"" +
        escapeStr(designName) +
        "\").effect(\"Path Stroke Width\")(\"Slider\")"
    );
  }
}

function collectStrokes(group, acc) {
  if (!group) return;
  var i;
  for (i = 1; i <= group.numProperties; i++) {
    var p = group.property(i);
    var mn = p.matchName;
    if (mn === "ADBE Vector Group") {
      collectStrokes(p.property("ADBE Vectors Group"), acc);
    } else if (mn === "ADBE Vectors Group" || mn === "ADBE Root Vectors Group") {
      collectStrokes(p, acc);
    } else if (mn === "ADBE Vector Graphic - Stroke") {
      acc.push(p);
    }
  }
}

function placeSourcesAboveBg(comp, layerGroups) {
  var bg = null;
  var i;
  for (i = 1; i <= comp.numLayers; i++) {
    if (comp.layer(i).name === "bg") {
      bg = comp.layer(i);
      break;
    }
  }
  for (i = layerGroups.length - 1; i >= 0; i--) {
    var ly = layerGroups[i].layer;
    ly.enabled = true;
    ly.shy = false;
    if (bg) ly.moveBefore(bg);
    else ly.moveToEnd();
  }
}

function findByMatch(group, matchName) {
  var i;
  for (i = 1; i <= group.numProperties; i++) {
    if (group.property(i).matchName === matchName) return group.property(i);
  }
  return null;
}

function buildPathExprRef(groupNames) {
  var s = "L.content(\"" + escapeStr(groupNames[0]) + "\")";
  var i;
  for (i = 1; i < groupNames.length; i++) {
    s += ".content(\"" + escapeStr(groupNames[i]) + "\")";
  }
  s += ".path";
  return s;
}

function collectTargetPaths(comp) {
  var results = [];
  var seen = {};

  function addPath(layer, pathProp, groupNames) {
    if (!(layer instanceof ShapeLayer)) return;
    if (!pathProp || pathProp.propertyValueType !== PropertyValueType.SHAPE) return;
    // skip generated OLF dots
    if (layer.name.indexOf("OLF Dot ") === 0) return;
    var key = layer.index + "::" + groupNames.join("/");
    if (seen[key]) return;
    seen[key] = true;
    results.push({
      layer: layer,
      pathProp: pathProp,
      groupNames: groupNames
    });
  }

  var selProps = comp.selectedProperties;
  var pi;
  for (pi = 0; pi < selProps.length; pi++) {
    var prop = selProps[pi];
    var pathProp = null;
    var pathGroup = null;

    if (prop.matchName === "ADBE Vector Shape") {
      pathProp = prop;
      pathGroup = prop.parentProperty;
    } else if (prop.matchName === "ADBE Vector Shape - Group") {
      pathGroup = prop;
      pathProp = prop.property("ADBE Vector Shape");
    }

    if (pathProp && pathGroup) {
      var layer = pathProp.propertyGroup(pathProp.propertyDepth);
      var names = buildGroupNamesFromPathGroup(pathGroup);
      if (names && names.length > 0) {
        addPath(layer, pathProp, names);
      }
    }
  }

  if (results.length > 0) return results;

  var layers = [];
  if (comp.selectedLayers && comp.selectedLayers.length > 0) {
    var li;
    for (li = 0; li < comp.selectedLayers.length; li++) {
      layers.push(comp.selectedLayers[li]);
    }
  }

  if (layers.length < 1) {
    throw new Error("Shape Layer 또는 Path를 선택하세요.");
  }

  for (li = 0; li < layers.length; li++) {
    var ly = layers[li];
    if (!(ly instanceof ShapeLayer)) continue;
    if (ly.name.indexOf("OLF Dot ") === 0) continue;
    var found = findAllPaths(ly);
    var fi;
    for (fi = 0; fi < found.length; fi++) {
      addPath(ly, found[fi].pathProp, found[fi].groupNames);
    }
  }

  return results;
}

function buildGroupNamesFromPathGroup(pathGroup) {
  var names = [];
  var p = pathGroup;
  while (p) {
    if (p.matchName === "ADBE Vector Shape - Group" || p.matchName === "ADBE Vector Group") {
      names.unshift(p.name);
    }
    if (p.matchName === "ADBE Root Vectors Group") break;
    p = p.parentProperty;
  }
  return names;
}

function findAllPaths(layer) {
  var root = layer.property("ADBE Root Vectors Group");
  if (!root) return [];
  var out = [];
  collectPathsWalk(root, [], out);
  return out;
}

function collectPathsWalk(group, nameStack, out) {
  var i;
  for (i = 1; i <= group.numProperties; i++) {
    var p = group.property(i);
    if (p.matchName === "ADBE Vector Group") {
      collectPathsWalk(
        p.property("ADBE Vectors Group"),
        nameStack.concat([p.name]),
        out
      );
    } else if (p.matchName === "ADBE Vector Shape - Group") {
      var pathProp = p.property("ADBE Vector Shape");
      if (pathProp && pathProp.propertyValueType === PropertyValueType.SHAPE) {
        out.push({
          pathProp: pathProp,
          groupNames: nameStack.concat([p.name])
        });
      }
    } else if (p.matchName === "ADBE Vectors Group") {
      collectPathsWalk(p, nameStack, out);
    }
  }
}

function approxPathLength(shape, samples) {
  var verts = shape.vertices;
  var ins = shape.inTangents;
  var outs = shape.outTangents;
  var closed = shape.closed;
  var n = verts.length;
  if (n < 2) return 0;

  var segCount = closed ? n : n - 1;
  var total = 0;
  var s, i, t, prev, cur, p0, p1, p2, p3, u, o;

  for (s = 0; s < segCount; s++) {
    i = s;
    o = (s + 1) % n;
    p0 = verts[i];
    p3 = verts[o];
    p1 = [p0[0] + outs[i][0], p0[1] + outs[i][1]];
    p2 = [p3[0] + ins[o][0], p3[1] + ins[o][1]];
    prev = p0;
    for (t = 1; t <= samples; t++) {
      u = t / samples;
      cur = cubic(p0, p1, p2, p3, u);
      total += dist(prev, cur);
      prev = cur;
    }
  }
  return total;
}

function cubic(p0, p1, p2, p3, t) {
  var mt = 1 - t;
  var a = mt * mt * mt;
  var b = 3 * mt * mt * t;
  var c = 3 * mt * t * t;
  var d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]
  ];
}

function dist(a, b) {
  var dx = a[0] - b[0];
  var dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}
