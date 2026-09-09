/**
 * @skill stagger-timing
 * 키 시각을 다시 찍어 스태거하지 않는다.
 * startTime만 슬롯에 맞추고, inPoint는 min(startTime)으로 전원 통일.
 *
 * 모션 판정: 이웃 키 i vs i+1. 첫키=끝키인 왕복(등장→홀드→퇴장)은 허용.
 * 금지: keyValue(1) vs keyValue(numKeys) 만으로 throw.
 * CEP 패널 문서: cep/demo-ui-panel/jsx/timing/STAGGER.md
 *
 * PARAMS: mode, order (selection|top-to-bottom|bottom-to-top|layer-index),
 *         windowStart, windowEnd, moveDuration, layerPrefix,
 *         propertyHint, reapplyEase, easeInfluence, seed, keepLayerDuration,
 *         compName
 */
(function () {
  var P = (typeof PARAMS !== "undefined" && PARAMS) ? PARAMS : {};
  var mode = P.mode || "sequential";
  var order = P.order || "top-to-bottom";
  var windowStart = (P.windowStart !== undefined && P.windowStart !== null) ? Number(P.windowStart) : 0;
  var windowEnd = (P.windowEnd !== undefined && P.windowEnd !== null) ? Number(P.windowEnd) : 1;
  var moveDurationOverride = (P.moveDuration !== undefined && P.moveDuration !== null) ? Number(P.moveDuration) : null;
  var layerPrefix = P.layerPrefix || "";
  var propertyHint = P.propertyHint || "";
  var reapplyEase = (P.reapplyEase === false) ? false : true;
  var easeInf = (P.easeInfluence !== undefined && P.easeInfluence !== null) ? Number(P.easeInfluence) : 80;
  var seed = (P.seed !== undefined && P.seed !== null) ? Number(P.seed) : Math.floor(Math.random() * 100000);
  var keepLayerDuration = (P.keepLayerDuration === false) ? false : true;
  var compName = P.compName || "";

  if (windowEnd < windowStart) {
    throw new Error("windowEnd는 windowStart 이상이어야 합니다.");
  }

  function findComp() {
    if (compName) {
      var i;
      for (i = 1; i <= app.project.numItems; i++) {
        var it = app.project.item(i);
        if (it instanceof CompItem && it.name === compName) {
          return it;
        }
      }
      throw new Error("컴포지션을 찾지 못함: " + compName);
    }
    var a = app.project.activeItem;
    if (!a || !(a instanceof CompItem)) {
      throw new Error("활성 컴포지션이 없습니다. PARAMS.compName을 지정하세요.");
    }
    return a;
  }

  var comp = findComp();

  function valuesDiffer(a, b) {
    // Shape / Mask Path
    if (a && b && a.vertices && b.vertices) {
      if (a.vertices.length !== b.vertices.length) {
        return true;
      }
      var vi;
      for (vi = 0; vi < a.vertices.length; vi++) {
        if (Math.abs(Number(a.vertices[vi][0]) - Number(b.vertices[vi][0])) > 0.01) {
          return true;
        }
        if (Math.abs(Number(a.vertices[vi][1]) - Number(b.vertices[vi][1])) > 0.01) {
          return true;
        }
      }
      return false;
    }
    if (a instanceof Array) {
      var i;
      for (i = 0; i < a.length; i++) {
        if (Math.abs(Number(a[i]) - Number(b[i])) > 0.01) {
          return true;
        }
      }
      return false;
    }
    return Math.abs(Number(a) - Number(b)) > 0.01;
  }

  function keysHaveMotion(prop) {
    if (!prop || prop.numKeys < 2) {
      return false;
    }
    var i;
    for (i = 1; i < prop.numKeys; i++) {
      if (valuesDiffer(prop.keyValue(i), prop.keyValue(i + 1))) {
        return true;
      }
    }
    return false;
  }

  function storedHasMotion(stored) {
    var i;
    for (i = 0; i < stored.length - 1; i++) {
      if (valuesDiffer(stored[i].v, stored[i + 1].v)) {
        return true;
      }
    }
    return false;
  }

  function clearKeys(prop) {
    if (!prop || prop.numKeys === 0) {
      return;
    }
    var k;
    for (k = prop.numKeys; k >= 1; k--) {
      prop.removeKey(k);
    }
  }

  function easeCountFor(prop) {
    var t = prop.propertyValueType;
    if (t === PropertyValueType.TwoD_SPATIAL || t === PropertyValueType.ThreeD_SPATIAL) {
      return 1;
    }
    if (t === PropertyValueType.TwoD) {
      return 2;
    }
    if (t === PropertyValueType.ThreeD) {
      return 3;
    }
    return 1;
  }

  function makeEaseArr(n, inf) {
    var a = [];
    var i;
    for (i = 0; i < n; i++) {
      a.push(new KeyframeEase(0, inf));
    }
    return a;
  }

  function applyEase(prop) {
    if (!reapplyEase || prop.numKeys < 1) {
      return;
    }
    var n = easeCountFor(prop);
    var k;
    for (k = 1; k <= prop.numKeys; k++) {
      prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
      try {
        prop.setTemporalEaseAtKey(k, makeEaseArr(n, easeInf), makeEaseArr(n, easeInf));
      } catch (eEase) {}
    }
  }

  function getY(layer) {
    var pos = layer.transform.position;
    if (pos.dimensionsSeparated) {
      return layer.transform.property("Y Position").value;
    }
    return pos.value[1];
  }

  function nameIndex(name) {
    var m = name.match(/(\d+)\s*$/);
    return m ? Number(m[1]) : 0;
  }

  function considerProp(list, p) {
    if (!p || p.propertyType !== PropertyType.PROPERTY) {
      return;
    }
    if (!p.canVaryOverTime || p.numKeys < 2) {
      return;
    }
    // 왕복(첫키=끝키)도 이웃 키만 다르면 통과. 첫 vs 마지막만 비교하지 말 것.
    if (!keysHaveMotion(p)) {
      return;
    }
    list.push(p);
  }

  function collectTrimProps(group, found) {
    if (!group || group.numProperties === undefined) {
      return;
    }
    var i;
    for (i = 1; i <= group.numProperties; i++) {
      var item = group.property(i);
      if (item.matchName === "ADBE Vector Filter - Trim") {
        considerProp(found, item.property("ADBE Vector Trim End"));
        considerProp(found, item.property("ADBE Vector Trim Start"));
        considerProp(found, item.property("ADBE Vector Trim Offset"));
      } else if (
        item.propertyType === PropertyType.INDEXED_GROUP ||
        item.propertyType === PropertyType.NAMED_GROUP
      ) {
        collectTrimProps(item, found);
      }
    }
  }

  function collectShapePathProps(group, found) {
    if (!group || group.numProperties === undefined) {
      return;
    }
    var i;
    for (i = 1; i <= group.numProperties; i++) {
      var item = group.property(i);
      if (item.matchName === "ADBE Vector Shape - Group") {
        considerProp(found, item.property("Path"));
      } else if (
        item.propertyType === PropertyType.INDEXED_GROUP ||
        item.propertyType === PropertyType.NAMED_GROUP
      ) {
        collectShapePathProps(item, found);
        try {
          var contents = item.property("Contents");
          if (contents) {
            collectShapePathProps(contents, found);
          }
        } catch (eContents) {}
      }
    }
  }

  /**
   * 모션 있는 키 ≥2 속성을 고른다.
   * 왕복(첫키=끝키)은 keysHaveMotion(이웃 비교)으로 허용.
   * dimensionsSeparated를 절대 강제하지 않는다 (키 유실 원인).
   */
  function findAnimProp(layer) {
    var t = layer.transform;
    var pos = t.position;
    var found = [];

    if (pos.dimensionsSeparated) {
      considerProp(found, t.property("X Position"));
      considerProp(found, t.property("Y Position"));
    }
    considerProp(found, pos);
    considerProp(found, t.scale);
    considerProp(found, t.opacity);
    considerProp(found, t.rotation);
    // 3D Orientation / X·Y·Z Rotation (카드 플립 등)
    try {
      considerProp(found, t.orientation);
    } catch (eOri) {}
    try {
      considerProp(found, t.xRotation);
    } catch (eXR) {}
    try {
      considerProp(found, t.yRotation);
    } catch (eYR) {}
    try {
      considerProp(found, t.zRotation);
    } catch (eZR) {}
    try {
      considerProp(found, t.property("X Rotation"));
    } catch (eXR2) {}
    try {
      considerProp(found, t.property("Y Rotation"));
    } catch (eYR2) {}
    try {
      considerProp(found, t.property("Z Rotation"));
    } catch (eZR2) {}

    // Mask Path (L->R reveal 등)
    try {
      var masks = layer.property("ADBE Mask Parade");
      if (masks) {
        var mi;
        for (mi = 1; mi <= masks.numProperties; mi++) {
          considerProp(found, masks.property(mi).property("ADBE Mask Shape"));
        }
      }
    } catch (eMask) {}

    // Trim Paths (Contents 루트 또는 Shape 그룹 안)
    try {
      collectTrimProps(layer.property("ADBE Root Vectors Group"), found);
    } catch (eTrim) {}

    // Shape Path (comp-space morph 등 Path 키 + Expression)
    try {
      collectShapePathProps(layer.property("ADBE Root Vectors Group"), found);
    } catch (eShapePath) {}

    if (found.length === 0) {
      return null;
    }

    if (propertyHint) {
      var h;
      for (h = 0; h < found.length; h++) {
        if (found[h].name === propertyHint) {
          return found[h];
        }
      }
    }

    var pathCandidates = [];
    var otherCandidates = [];
    var fc;
    for (fc = 0; fc < found.length; fc++) {
      if (found[fc].name === "Path") {
        pathCandidates.push(found[fc]);
      } else {
        otherCandidates.push(found[fc]);
      }
    }

    if (pathCandidates.length > 0) {
      var twoKeyPath = null;
      for (fc = 0; fc < pathCandidates.length; fc++) {
        if (pathCandidates[fc].numKeys === 2) {
          twoKeyPath = pathCandidates[fc];
          break;
        }
      }
      if (twoKeyPath) {
        return twoKeyPath;
      }
      var fewest = pathCandidates[0];
      for (fc = 1; fc < pathCandidates.length; fc++) {
        if (pathCandidates[fc].numKeys < fewest.numKeys) {
          fewest = pathCandidates[fc];
        }
      }
      return fewest;
    }

    var best = otherCandidates.length > 0 ? otherCandidates[0] : found[0];
    var bestSpan = 0;
    var pool = otherCandidates.length > 0 ? otherCandidates : found;
    var f;
    for (f = 0; f < pool.length; f++) {
      var p = pool[f];
      var span = Math.abs(p.keyTime(p.numKeys) - p.keyTime(1));
      if (span > bestSpan) {
        bestSpan = span;
        best = p;
      }
    }
    return best;
  }

  function collectLayers() {
    var list = [];
    var i;
    if (layerPrefix) {
      for (i = 1; i <= comp.numLayers; i++) {
        var L = comp.layer(i);
        if (L.name.indexOf(layerPrefix) === 0) {
          list.push(L);
        }
      }
      if (list.length === 0) {
        throw new Error("layerPrefix '" + layerPrefix + "'에 맞는 레이어 없음 (comp=" + comp.name + ")");
      }
      return list;
    }
    if (comp.selectedLayers && comp.selectedLayers.length > 0) {
      for (i = 0; i < comp.selectedLayers.length; i++) {
        list.push(comp.selectedLayers[i]);
      }
      return list;
    }
    for (i = 1; i <= comp.numLayers; i++) {
      var L2 = comp.layer(i);
      if (L2.name.indexOf("Line") >= 0) {
        continue;
      }
      if (L2.name.indexOf("Solid") >= 0) {
        continue;
      }
      if (findAnimProp(L2)) {
        list.push(L2);
      }
    }
    if (list.length < 2) {
      throw new Error("대상 레이어를 선택하거나 PARAMS.layerPrefix를 지정하세요. (comp=" + comp.name + ")");
    }
    return list;
  }

  function cloneShape(sh) {
    var s = new Shape();
    var verts = [];
    var ins = [];
    var outs = [];
    var i;
    for (i = 0; i < sh.vertices.length; i++) {
      verts.push([sh.vertices[i][0], sh.vertices[i][1]]);
      ins.push([sh.inTangents[i][0], sh.inTangents[i][1]]);
      outs.push([sh.outTangents[i][0], sh.outTangents[i][1]]);
    }
    s.vertices = verts;
    s.inTangents = ins;
    s.outTangents = outs;
    s.closed = sh.closed;
    return s;
  }

  function snapshotKeys(prop) {
    var stored = [];
    var k;
    for (k = 1; k <= prop.numKeys; k++) {
      var v = prop.keyValue(k);
      if (v && v.vertices) {
        v = cloneShape(v);
      }
      stored.push({
        t: prop.keyTime(k),
        v: v
      });
    }
    return stored;
  }

  /**
   * 키 값은 유지. 레이어 로컬 0~moveDur로만 정규화한 뒤 startTime 이동.
   * 값이 같은 가짜 키(79→79)를 만들지 않는다.
   */
  function applyLayerStartStagger(layer, prop, tStart, moveDur, layerDur) {
    var stored = snapshotKeys(prop);
    if (stored.length < 2 || !storedHasMotion(stored)) {
      throw new Error(layer.name + ": 연속 키 사이에 값 변화가 없습니다. 왕복(첫키=끝키)은 허용되며, 모든 키가 동일할 때만 거부합니다. (comp=" + comp.name + ")");
    }

    var oldFirst = stored[0].t;
    var oldLast = stored[stored.length - 1].t;
    var oldDur = oldLast - oldFirst;
    if (oldDur <= 0) {
      oldDur = moveDur;
    }

    layer.startTime = 0;
    try {
      layer.inPoint = 0;
    } catch (eIn0) {}
    if (keepLayerDuration) {
      try {
        layer.outPoint = layerDur;
      } catch (eOut0) {}
    }

    var savedExpr = "";
    try {
      savedExpr = prop.expression || "";
    } catch (eGetExpr) {}

    clearKeys(prop);
    try {
      prop.expression = "";
    } catch (eExpr) {}

    var k;
    for (k = 0; k < stored.length; k++) {
      var rel = (stored[k].t - oldFirst) / oldDur;
      prop.setValueAtTime(rel * moveDur, stored[k].v);
    }
    applyEase(prop);

    if (savedExpr) {
      try {
        prop.expression = savedExpr;
      } catch (eSetExpr) {}
    }

    layer.startTime = tStart;
    if (keepLayerDuration) {
      try {
        layer.outPoint = tStart + layerDur;
      } catch (eOut1) {}
    }

    return {
      keyT0: prop.keyTime(1),
      keyT1: prop.keyTime(prop.numKeys),
      v0: prop.keyValue(1),
      v1: prop.keyValue(prop.numKeys),
      start: layer.startTime,
      inP: layer.inPoint,
      outP: layer.outPoint
    };
  }

  var layers = collectLayers();
  if (layers.length === 0) {
    throw new Error("대상 레이어가 없습니다.");
  }

  if (mode === "sequential" && order !== "selection") {
    layers.sort(function (a, b) {
      if (order === "bottom-to-top") {
        var ya = getY(a);
        var yb = getY(b);
        if (ya !== yb) {
          return yb - ya;
        }
        return nameIndex(b.name) - nameIndex(a.name);
      }
      if (order === "layer-index") {
        return a.index - b.index;
      }
      var ya2 = getY(a);
      var yb2 = getY(b);
      if (ya2 !== yb2) {
        return ya2 - yb2;
      }
      return nameIndex(a.name) - nameIndex(b.name);
    });
  }

  var n = layers.length;
  var span = windowEnd - windowStart;
  var slots = [];
  var s;
  for (s = 0; s < n; s++) {
    slots.push(n === 1 ? windowStart : windowStart + (s / (n - 1)) * span);
  }

  if (mode === "random") {
    var rngState = seed;
    function rand() {
      rngState = (rngState * 1664525 + 1013904223) % 4294967296;
      if (rngState < 0) {
        rngState += 4294967296;
      }
      return rngState / 4294967296;
    }
    var r;
    for (r = slots.length - 1; r > 0; r--) {
      var j = Math.floor(rand() * (r + 1));
      var tmp = slots[r];
      slots[r] = slots[j];
      slots[j] = tmp;
    }
  }

  var updated = [];
  var i;
  for (i = 0; i < n; i++) {
    var layer = layers[i];
    var prop = findAnimProp(layer);
    if (!prop) {
      throw new Error(layer.name + ": 연속 키 사이에 값 변화가 있는 속성이 없습니다. 왕복(등장→유지→퇴장)은 허용됩니다. (comp=" + comp.name + ")");
    }

    var oldFirst = prop.keyTime(1);
    var oldLast = prop.keyTime(prop.numKeys);
    var oldDur = oldLast - oldFirst;
    var moveDur = (moveDurationOverride !== null) ? moveDurationOverride : oldDur;
    if (moveDur <= 0) {
      moveDur = 1;
    }

    var layerDur = layer.outPoint - layer.inPoint;
    if (layerDur <= 0) {
      layerDur = comp.duration;
    }

    var tStart = slots[i];
    var result = applyLayerStartStagger(layer, prop, tStart, moveDur, layerDur);

    updated.push({
      name: layer.name,
      layer: layer,
      prop: prop.name,
      tStart: tStart,
      moveDur: moveDur,
      layerDur: layerDur,
      start: result.start,
      inP: result.inP,
      outP: result.outP,
      keyT0: result.keyT0,
      keyT1: result.keyT1,
      v0: result.v0,
      v1: result.v1
    });
  }

  var earliest = updated[0].start;
  for (i = 1; i < updated.length; i++) {
    if (updated[i].start < earliest) {
      earliest = updated[i].start;
    }
  }
  for (i = 0; i < updated.length; i++) {
    var rowL = updated[i].layer;
    try {
      rowL.inPoint = earliest;
    } catch (eSyncIn) {}
    if (keepLayerDuration) {
      try {
        rowL.outPoint = earliest + updated[i].layerDur;
      } catch (eSyncOut) {}
    }
    updated[i].inP = rowL.inPoint;
    updated[i].outP = rowL.outPoint;
    updated[i].start = rowL.startTime;
  }

  log("stagger comp=" + comp.name + " mode=" + mode + " order=" + order + " window=[" + windowStart + "," + windowEnd + "] earliestIn=" + earliest.toFixed(4) + " n=" + n + (mode === "random" ? (" seed=" + seed) : ""));
  var u;
  for (u = 0; u < updated.length; u++) {
    var row = updated[u];
    log(row.name + " / " + row.prop + " startTime=" + row.start.toFixed(4) + " in=" + row.inP.toFixed(4) + " keys=" + row.keyT0.toFixed(4) + "→" + row.keyT1.toFixed(4));
  }

  STAGGER_TIMING_LAST = {
    ok: true,
    comp: comp.name,
    mode: mode,
    order: order,
    windowStart: windowStart,
    windowEnd: windowEnd,
    count: n,
    earliestIn: earliest
  };
})();
