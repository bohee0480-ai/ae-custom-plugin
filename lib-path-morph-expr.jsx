/**
 * Shared CTRL + ref layers + Expression helpers for path point stagger / overshoot return.
 */
(function () {
  var CTRL_NAME = "CTRL_PathMorph";
  var REF_A = "_PathMorph A";
  var REF_B = "_PathMorph B";
  var REF_GRP = "Ref";

  function findLayerByName(comp, name) {
    var i;
    for (i = 1; i <= comp.numLayers; i++) {
      if (comp.layer(i).name === name) return comp.layer(i);
    }
    return null;
  }

  function setPathOnLayer(layer, shape) {
    var contents = layer.property("ADBE Root Vectors Group");
    var grp;
    var gContents;
    var pathGrp;
    var pathProp;
    if (contents.numProperties >= 1 && contents.property(1).matchName === "ADBE Vector Group") {
      grp = contents.property(1);
    } else {
      grp = contents.addProperty("ADBE Vector Group");
      grp.name = REF_GRP;
    }
    gContents = grp.property("ADBE Vectors Group");
    if (gContents.numProperties >= 1 && gContents.property(1).matchName === "ADBE Vector Shape - Group") {
      pathGrp = gContents.property(1);
    } else {
      pathGrp = gContents.addProperty("ADBE Vector Shape - Group");
      pathGrp.name = "Path 1";
    }
    pathProp = pathGrp.property("ADBE Vector Shape");
    pathProp.setValue(shape);
    pathProp.expression = "";
    pathProp.expressionEnabled = false;
    return pathProp;
  }

  function ensureRefLayer(comp, name, shape, beforeLayer) {
    var layer = findLayerByName(comp, name);
    if (!layer) {
      layer = comp.layers.addShape();
      layer.name = name;
      var contents = layer.property("ADBE Root Vectors Group");
      var grp = contents.addProperty("ADBE Vector Group");
      grp.name = REF_GRP;
      var gContents = grp.property("ADBE Vectors Group");
      var pathGrp = gContents.addProperty("ADBE Vector Shape - Group");
      pathGrp.name = "Path 1";
      var fill = gContents.addProperty("ADBE Vector Graphic - Fill");
      fill.property("ADBE Vector Fill Opacity").setValue(0);
      var stroke = gContents.addProperty("ADBE Vector Graphic - Stroke");
      stroke.property("ADBE Vector Stroke Opacity").setValue(0);
    }
    setPathOnLayer(layer, shape);
    layer.enabled = false;
    layer.guideLayer = true;
    layer.shy = true;
    if (beforeLayer) {
      try {
        layer.moveBefore(beforeLayer);
      } catch (eMove) {}
    }
    return layer;
  }

  function syncPathMorphRefs(comp, pathProp, targetLayer) {
    if (!pathProp || pathProp.numKeys < 2) {
      throw new Error("Path에 키 2개가 필요합니다. 먼저 A→B를 실행하세요.");
    }
    var shapeA = pathProp.keyValue(1);
    var shapeB = pathProp.keyValue(2);
    ensureRefLayer(comp, REF_A, shapeA, targetLayer);
    ensureRefLayer(comp, REF_B, shapeB, targetLayer);
    return { refA: REF_A, refB: REF_B };
  }

  function ensureCtrl(comp, refLayer) {
    var ctrl = findLayerByName(comp, CTRL_NAME);
    var ef;
    if (!ctrl) {
      ctrl = comp.layers.addNull();
      ctrl.name = CTRL_NAME;
      ctrl.transform.opacity.setValue(0);
      ef = ctrl.property("ADBE Effect Parade");
    } else {
      ef = ctrl.property("ADBE Effect Parade");
    }
    if (refLayer) {
      try {
        ctrl.moveBefore(refLayer);
      } catch (eMove2) {}
    }
    return { layer: ctrl, fx: ef };
  }

  function ensureSlider(fx, name, val) {
    var i;
    var p;
    for (i = 1; i <= fx.numProperties; i++) {
      p = fx.property(i);
      if (p.name === name) return p;
    }
    p = fx.addProperty("ADBE Slider Control");
    p.name = name;
    p.property("ADBE Slider Control-0001").setValue(val);
    return p;
  }

  function refPathExpr(layerName) {
    return 'thisComp.layer("' + layerName + '").content("' + REF_GRP + '").content("Path 1").path';
  }

  function buildPointStaggerExpr() {
    var pA = refPathExpr(REF_A);
    var pB = refPathExpr(REF_B);
    var lines = [];
    lines.push('var ctrl = thisComp.layer("' + CTRL_NAME + '");');
    lines.push('var ps = ctrl.effect("Point Stagger")(1) / 100;');
    lines.push('var pA = ' + pA + ';');
    lines.push('var pB = ' + pB + ';');
    lines.push('var k1 = thisProperty.key(1).time;');
    lines.push('var k2 = thisProperty.key(2).time;');
    lines.push('var dur = Math.max(k2 - k1, 0.001);');
    lines.push('var n = pA.points().length;');
    lines.push('var pts=[], itn=[], otn=[];');
    lines.push('for (var k = 0; k < n; k++) {');
    lines.push('  var pN = k / Math.max(n - 1, 1);');
    lines.push('  var delay = pN * ps;');
    lines.push('  var localTime = time - k1 - delay * dur;');
    lines.push('  var prog = localTime / dur;');
    lines.push('  if (prog < 0) prog = 0;');
    lines.push('  if (prog > 1) prog = 1;');
    lines.push('  var a = pA.points()[k], b = pB.points()[k];');
    lines.push('  pts.push([a[0] + (b[0] - a[0]) * prog, a[1] + (b[1] - a[1]) * prog]);');
    lines.push('  var ai = pA.inTangents()[k], bi = pB.inTangents()[k];');
    lines.push('  itn.push([ai[0] + (bi[0] - ai[0]) * prog, ai[1] + (bi[1] - ai[1]) * prog]);');
    lines.push('  var ao = pA.outTangents()[k], bo = pB.outTangents()[k];');
    lines.push('  otn.push([ao[0] + (bo[0] - ao[0]) * prog, ao[1] + (bo[1] - ao[1]) * prog]);');
    lines.push('}');
    lines.push('createPath(pts, itn, otn, pA.isClosed());');
    return lines.join('\n');
  }

  function buildOvershootReturnExpr() {
    var pA = refPathExpr(REF_A);
    var pB = refPathExpr(REF_B);
    var lines = [];
    lines.push('var ctrl = thisComp.layer("' + CTRL_NAME + '");');
    lines.push('var ps = ctrl.effect("Point Stagger")(1) / 100;');
    lines.push('var ovr = ctrl.effect("Overshoot")(1);');
    lines.push('var hold = ctrl.effect("Hold")(1);');
    lines.push('var pA = ' + pA + ';');
    lines.push('var pB = ' + pB + ';');
    lines.push('var k1 = thisProperty.key(1).time;');
    lines.push('var k2 = thisProperty.key(2).time;');
    lines.push('var dur = Math.max(k2 - k1, 0.001);');
    lines.push('var c1 = ovr;');
    lines.push('var c3 = c1 + 1;');
    lines.push('var n = pA.points().length;');
    lines.push('function easeOutBack(p) {');
    lines.push('  if (p >= 1.5) return 1;');
    lines.push('  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);');
    lines.push('}');
    lines.push('var pts=[], itn=[], otn=[];');
    lines.push('for (var k = 0; k < n; k++) {');
    lines.push('  var pN = k / Math.max(n - 1, 1);');
    lines.push('  var delay = pN * ps;');
    lines.push('  var localTime = time - k1 - delay * dur;');
    lines.push('  var t = 0;');
    lines.push('  if (localTime <= 0) { t = 0; }');
    lines.push('  else if (localTime <= dur) {');
    lines.push('    t = easeOutBack(localTime / dur);');
    lines.push('  } else if (localTime <= dur + hold) {');
    lines.push('    t = 1;');
    lines.push('  } else if (localTime <= 2 * dur + hold) {');
    lines.push('    var p = (localTime - dur - hold) / dur;');
    lines.push('    var rt = easeOutBack(p);');
    lines.push('    t = 1 - rt;');
    lines.push('  } else { t = 0; }');
    lines.push('  if (t < 0) t = 0;');
    lines.push('  if (t > 1) t = 1;');
    lines.push('  var a = pA.points()[k], b = pB.points()[k];');
    lines.push('  pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);');
    lines.push('  var ai = pA.inTangents()[k], bi = pB.inTangents()[k];');
    lines.push('  itn.push([ai[0] + (bi[0] - ai[0]) * t, ai[1] + (bi[1] - ai[1]) * t]);');
    lines.push('  var ao = pA.outTangents()[k], bo = pB.outTangents()[k];');
    lines.push('  otn.push([ao[0] + (bo[0] - ao[0]) * t, ao[1] + (bo[1] - ao[1]) * t]);');
    lines.push('}');
    lines.push('createPath(pts, itn, otn, pA.isClosed());');
    return lines.join('\n');
  }

  $.global.pathMorphExprHelpers = {
    CTRL_NAME: CTRL_NAME,
    REF_A: REF_A,
    REF_B: REF_B,
    ensureCtrl: ensureCtrl,
    ensureSlider: ensureSlider,
    syncPathMorphRefs: syncPathMorphRefs,
    buildPointStaggerExpr: buildPointStaggerExpr,
    buildOvershootReturnExpr: buildOvershootReturnExpr
  };
})();
