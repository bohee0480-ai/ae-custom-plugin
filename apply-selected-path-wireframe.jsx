/**
 * @skill ae-path-wireframe
 * 선택 Shape Layer(복수 가능)의 모든 Path에 WIREFRAME_STYLE 마커 적용.
 * 레이어 rotation/scale/parent + 그룹 transform → toWorld/fromWorld 반영.
 *
 * PARAMS (optional):
 *   anchorFill, handleFill, lineColor — [r,g,b,a]
 *   lineWidth, anchorSize, handleSize — number
 */
(function () {
  var P = (typeof PARAMS !== "undefined" && PARAMS) ? PARAMS : {};
  var ANCHOR_FILL = P.anchorFill || [0, 0, 0, 1];
  var HANDLE_FILL = P.handleFill || [0, 0, 0, 1];
  var LINE_COLOR = P.lineColor || [0, 0, 0, 1];
  var LINE_WIDTH = (P.lineWidth !== undefined && P.lineWidth !== null) ? Number(P.lineWidth) : 1;
  var ANCHOR_SIZE = (P.anchorSize !== undefined && P.anchorSize !== null) ? Number(P.anchorSize) : 5;
  var HANDLE_SIZE = (P.handleSize !== undefined && P.handleSize !== null) ? Number(P.handleSize) : 5;
  var BK = 0.5523;

  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) throw new Error("활성 컴프 없음");

  function isWireframeName(name) {
    return name.length > 11 && name.substring(name.length - 11) === " Wireframe";
  }

  function escName(name) {
    return name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function ensureCtrl() {
    var ctrlLayer = null;
    for (var i = comp.numLayers; i >= 1; i--) {
      if (comp.layer(i).name === "CTRL_Wireframe") {
        ctrlLayer = comp.layer(i);
        break;
      }
    }
    if (!ctrlLayer) {
      ctrlLayer = comp.layers.addNull();
      ctrlLayer.name = "CTRL_Wireframe";
      ctrlLayer.transform.opacity.setValue(0);
      var efNew = ctrlLayer.property("Effects");
      efNew.addProperty("ADBE Color Control").name = "Anchor Fill";
      efNew.addProperty("ADBE Color Control").name = "Handle Fill";
      efNew.addProperty("ADBE Color Control").name = "Line Color";
      efNew.addProperty("ADBE Slider Control").name = "Line Width";
      efNew.addProperty("ADBE Slider Control").name = "Anchor Size";
      efNew.addProperty("ADBE Slider Control").name = "Handle Size";
    }
    var ef = ctrlLayer.property("Effects");
    ef.property("Anchor Fill").property("Color").setValue(ANCHOR_FILL);
    ef.property("Handle Fill").property("Color").setValue(HANDLE_FILL);
    ef.property("Line Color").property("Color").setValue(LINE_COLOR);
    ef.property("Line Width").property("Slider").setValue(LINE_WIDTH);
    ef.property("Anchor Size").property("Slider").setValue(ANCHOR_SIZE);
    ef.property("Handle Size").property("Slider").setValue(HANDLE_SIZE);
    return ctrlLayer;
  }

  function scanPaths(srcLayer) {
    var contents = srcLayer.property("Contents");
    var pathRefs = [];
    var charIdx = 0;
    for (var g = 1; g <= contents.numProperties; g++) {
      var grp = contents.property(g);
      if (grp.matchName !== "ADBE Vector Group") continue;
      var sub = grp.property("Contents");
      for (var s = 1; s <= sub.numProperties; s++) {
        var ch = sub.property(s);
        if (ch.matchName !== "ADBE Vector Shape - Group") continue;
        var pp = ch.property("Path");
        if (!pp) continue;
        var pv;
        try { pv = pp.valueAtTime(comp.time, false); } catch (e1) { pv = pp.value; }
        pathRefs.push({
          groupIdx: g,
          pathIdx: s,
          vertCount: pv.vertices.length,
          groupName: grp.name,
          charIdx: charIdx
        });
      }
      charIdx++;
    }
    return pathRefs;
  }

  function makeRead(safeName, ref, vertK) {
    return 'var srcL = thisComp.layer("' + safeName + '");\n' +
      'var grp = srcL.content(' + ref.groupIdx + ');\n' +
      'var pathProp = grp.content(' + ref.pathIdx + ').path;\n' +
      'var k = ' + vertK + ';\n' +
      'var lp = pathProp.points()[k];\n' +
      'var lIn = pathProp.inTangents()[k];\n' +
      'var lOut = pathProp.outTangents()[k];\n' +
      'function wfGrpToLayer(g, pt) {\n' +
      '  var ap = g.transform.anchorPoint;\n' +
      '  var ps = g.transform.position;\n' +
      '  var sc = g.transform.scale;\n' +
      '  var r = g.transform.rotation * Math.PI / 180;\n' +
      '  var p = [pt[0]-ap[0], pt[1]-ap[1]];\n' +
      '  p = [p[0]*sc[0]/100, p[1]*sc[1]/100];\n' +
      '  var c = Math.cos(r), s = Math.sin(r);\n' +
      '  return [p[0]*c-p[1]*s+ps[0], p[0]*s+p[1]*c+ps[1]];\n' +
      '}\n' +
      'var layerPt = wfGrpToLayer(grp, lp);\n' +
      'var layerIn = wfGrpToLayer(grp, [lp[0]+lIn[0], lp[1]+lIn[1]]);\n' +
      'var layerOut = wfGrpToLayer(grp, [lp[0]+lOut[0], lp[1]+lOut[1]]);\n' +
      'var a = fromWorld(srcL.toWorld(layerPt));\n' +
      'var hi = fromWorld(srcL.toWorld(layerIn));\n' +
      'var ho = fromWorld(srcL.toWorld(layerOut));\n' +
      'var tIn = [hi[0]-a[0], hi[1]-a[1]];\n' +
      'var tOut = [ho[0]-a[0], ho[1]-a[1]];';
  }

  function circleExpr(cv) {
    return 'var r = thisComp.layer("CTRL_Wireframe").effect("Handle Size")(1) / 2, kk = ' + BK + ' * r;\n' +
      'if(Math.abs(' + cv + '[0])<0.01 && Math.abs(' + cv + '[1])<0.01) createPath([a,a,a,a],[],[],true);\n' +
      'else { var cx = a[0]+' + cv + '[0], cy = a[1]+' + cv + '[1];\n' +
      'createPath([[cx,cy-r],[cx+r,cy],[cx,cy+r],[cx-r,cy]],[[-kk,0],[0,-kk],[kk,0],[0,kk]],[[kk,0],[0,kk],[-kk,0],[0,-kk]],true); }';
  }

  function applyToLayer(srcLayer, pathRefs) {
    var SRC_NAME = srcLayer.name;
    var WF_NAME = SRC_NAME + " Wireframe";
    var safeName = escName(SRC_NAME);

    for (var j = comp.numLayers; j >= 1; j--) {
      if (comp.layer(j).name === WF_NAME) comp.layer(j).remove();
    }

    var wf = comp.layers.addShape();
    wf.name = WF_NAME;

    if (srcLayer.parent) {
      wf.parent = srcLayer.parent;
    }

    wf.transform.anchorPoint.setValue(srcLayer.transform.anchorPoint.value);
    wf.transform.position.setValue(srcLayer.transform.position.value);
    wf.transform.scale.setValue(srcLayer.transform.scale.value);
    wf.transform.rotation.setValue(srcLayer.transform.rotation.value);

    var srcExpr = 'thisComp.layer("' + safeName + '")';
    wf.transform.anchorPoint.expression = srcExpr + ".transform.anchorPoint;";
    wf.transform.position.expression = srcExpr + ".transform.position;";
    wf.transform.scale.expression = srcExpr + ".transform.scale;";
    wf.transform.rotation.expression = srcExpr + ".transform.rotation;";

    wf.moveBefore(srcLayer);

    if (!pathRefs || pathRefs.length === 0) {
      wf.remove();
      throw new Error(SRC_NAME + ": Path 없음");
    }

    var gC = wf.property("Contents");
    while (gC.numProperties > 0) gC.property(1).remove();

    var totalA = 0, totalH = 0, totalL = 0;

    for (var r = 0; r < pathRefs.length; r++) {
      var ref = pathRefs[r];
      var label = ref.groupName + "_g" + ref.groupIdx + "_p" + ref.pathIdx;
      var aG = gC.addProperty("ADBE Vector Group");
      aG.name = "Anchors_" + label;
      var ac = aG.property("Contents");
      for (var v = 0; v < ref.vertCount; v++) {
        var ip = makeRead(safeName, ref, v);
        var ap = ac.addProperty("ADBE Vector Shape - Group");
        ap.property("Path").expression = ip + '\n' +
          'var s = thisComp.layer("CTRL_Wireframe").effect("Anchor Size")(1) / 2;\n' +
          'createPath([[a[0]-s,a[1]-s],[a[0]+s,a[1]-s],[a[0]+s,a[1]+s],[a[0]-s,a[1]+s]],[],[],true);';
        totalA++;
      }
      var aF = ac.addProperty("ADBE Vector Graphic - Fill");
      aF.property("Color").expression = 'thisComp.layer("CTRL_Wireframe").effect("Anchor Fill")("Color");';
      var aS = ac.addProperty("ADBE Vector Graphic - Stroke");
      aS.property("Color").expression = 'thisComp.layer("CTRL_Wireframe").effect("Line Color")("Color");';
      aS.property("Stroke Width").expression = 'thisComp.layer("CTRL_Wireframe").effect("Line Width")(1);';
    }

    for (var r2 = 0; r2 < pathRefs.length; r2++) {
      var ref2 = pathRefs[r2];
      var label2 = ref2.groupName + "_g" + ref2.groupIdx + "_p" + ref2.pathIdx;
      var hG = gC.addProperty("ADBE Vector Group");
      hG.name = "Handles_" + label2;
      var hc = hG.property("Contents");
      for (var v2 = 0; v2 < ref2.vertCount; v2++) {
        var ip2 = makeRead(safeName, ref2, v2);
        var hI = hc.addProperty("ADBE Vector Shape - Group");
        hI.property("Path").expression = ip2 + '\n' + circleExpr('tIn');
        var hO = hc.addProperty("ADBE Vector Shape - Group");
        hO.property("Path").expression = ip2 + '\n' + circleExpr('tOut');
        totalH += 2;
      }
      var hF = hc.addProperty("ADBE Vector Graphic - Fill");
      hF.property("Color").expression = 'thisComp.layer("CTRL_Wireframe").effect("Handle Fill")("Color");';
      var hS = hc.addProperty("ADBE Vector Graphic - Stroke");
      hS.property("Color").expression = 'thisComp.layer("CTRL_Wireframe").effect("Line Color")("Color");';
      hS.property("Stroke Width").expression = 'thisComp.layer("CTRL_Wireframe").effect("Line Width")(1);';
    }

    for (var r3 = 0; r3 < pathRefs.length; r3++) {
      var ref3 = pathRefs[r3];
      var label3 = ref3.groupName + "_g" + ref3.groupIdx + "_p" + ref3.pathIdx;
      var lG = gC.addProperty("ADBE Vector Group");
      lG.name = "Lines_" + label3;
      var lc = lG.property("Contents");
      for (var v3 = 0; v3 < ref3.vertCount; v3++) {
        var ip3 = makeRead(safeName, ref3, v3);
        var lin = lc.addProperty("ADBE Vector Shape - Group");
        lin.property("Path").expression = ip3 + '\n' +
          'if(Math.abs(tIn[0])<0.01 && Math.abs(tIn[1])<0.01) createPath([a,a],[],[],false);\n' +
          'else createPath([a,[a[0]+tIn[0],a[1]+tIn[1]]],[],[],false);';
        var lou = lc.addProperty("ADBE Vector Shape - Group");
        lou.property("Path").expression = ip3 + '\n' +
          'if(Math.abs(tOut[0])<0.01 && Math.abs(tOut[1])<0.01) createPath([a,a],[],[],false);\n' +
          'else createPath([a,[a[0]+tOut[0],a[1]+tOut[1]]],[],[],false);';
        totalL += 2;
      }
      var lS = lc.addProperty("ADBE Vector Graphic - Stroke");
      lS.property("Color").expression = 'thisComp.layer("CTRL_Wireframe").effect("Line Color")("Color");';
      lS.property("Stroke Width").expression = 'thisComp.layer("CTRL_Wireframe").effect("Line Width")(1);';
    }

    return {
      name: SRC_NAME,
      wfName: WF_NAME,
      paths: pathRefs.length,
      anchors: totalA,
      handles: totalH,
      lines: totalL,
      rotation: srcLayer.transform.rotation.value
    };
  }

  function pathRefFromProp(pathProp) {
    var pathGroup = pathProp.parentProperty;
    if (!pathGroup || pathGroup.matchName !== "ADBE Vector Shape - Group") return null;
    var vectors = pathGroup.parentProperty;
    var grp = vectors ? vectors.parentProperty : null;
    if (!grp || grp.matchName !== "ADBE Vector Group") return null;
    var layer = pathProp.propertyGroup(pathProp.propertyDepth);
    var pv;
    try { pv = pathProp.valueAtTime(comp.time, false); } catch (e1) { pv = pathProp.value; }
    if (!pv || !pv.vertices) return null;
    return {
      groupIdx: grp.propertyIndex,
      pathIdx: pathGroup.propertyIndex,
      vertCount: pv.vertices.length,
      groupName: grp.name,
      layer: layer
    };
  }

  // Capture selection before ensureCtrl — adding layers clears selectedProperties.
  var selected = $.global.collectSelectedShapePaths(comp);
  if (!selected || selected.length === 0) {
    throw new Error("타임라인에서 Path 속성을 선택하세요.");
  }

  ensureCtrl();

  var groups = [];
  var groupMap = {};
  var si;
  for (si = 0; si < selected.length; si++) {
    var ly = selected[si].layer;
    if (!ly || ly.matchName !== "ADBE Vector Layer") continue;
    if (isWireframeName(ly.name)) continue;
    var ref = pathRefFromProp(selected[si].pathProp);
    if (!ref) continue;
    var gKey = String(ly.index);
    if (!groupMap[gKey]) {
      groupMap[gKey] = { layer: ly, refs: [] };
      groups.push(groupMap[gKey]);
    }
    groupMap[gKey].refs.push(ref);
  }

  if (groups.length === 0) throw new Error("적용할 Shape Path 없음 (Wireframe 레이어 제외)");

  var results = [];
  var errors = [];
  var ti;
  for (ti = 0; ti < groups.length; ti++) {
    try {
      results.push(applyToLayer(groups[ti].layer, groups[ti].refs));
    } catch (err) {
      errors.push(groups[ti].layer.name + ": " + err.message);
    }
  }

  if (results.length === 0) throw new Error(errors.join(" | "));

  var summary = [];
  for (var ri = 0; ri < results.length; ri++) {
    var res = results[ri];
    summary.push(res.wfName + " (" + res.paths + "p, rot=" + res.rotation.toFixed(1) + ")");
  }

  $.global.__PATH_WF_APPLIED__ = results;
  $.global.__PATH_WF_SRC__ = results[0].name;
  $.global.__PATH_WF_RESULT__ = results.length + " layers | " + summary.join("; ");
  if (errors.length > 0) $.global.__PATH_WF_RESULT__ += " | skipped: " + errors.join("; ");

  SHAPE_PATH_WF_LAST = {
    ok: true,
    layers: results.length,
    paths: selected.length,
    summary: summary.join("; "),
    comp: comp.name
  };
})();
