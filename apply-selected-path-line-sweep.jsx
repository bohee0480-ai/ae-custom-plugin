/**
 * CEP Path tab — line sweep on selected Path properties only.
 *
 * PARAMS (optional):
 *   ext            — extension length px (default 600)
 *   staggerTotal   — seconds (default 2)
 *   dur            — enter/exit phase seconds (default 0.5)
 *   hold           — hold seconds (default 0.3)
 *   easeInfluence  — default 80
 */
(function () {
  var P = (typeof PARAMS !== "undefined" && PARAMS) ? PARAMS : {};
  var EXT = (P.ext !== undefined && P.ext !== null) ? Number(P.ext) : 600;
  var STAGGER_TOTAL = (P.staggerTotal !== undefined && P.staggerTotal !== null) ? Number(P.staggerTotal) : 2.0;
  var DUR = (P.dur !== undefined && P.dur !== null) ? Number(P.dur) : 0.5;
  var HOLD = (P.hold !== undefined && P.hold !== null) ? Number(P.hold) : 0.3;
  var IN_INF = (P.easeInfluence !== undefined && P.easeInfluence !== null) ? Number(P.easeInfluence) : 80;

  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    throw new Error("활성 컴포지션이 없습니다.");
  }

  function clone2(a) {
    return [a[0], a[1]];
  }

  function len2(v) {
    return Math.sqrt(v[0] * v[0] + v[1] * v[1]);
  }

  function tangentFromHandles(vertices, outTangents, inTangents, atStart) {
    if (atStart) {
      var h = outTangents[0];
      var len = Math.sqrt(h[0] * h[0] + h[1] * h[1]);
      if (len > 0.001) return [h[0] / len, h[1] / len];
    } else {
      var last = vertices.length - 1;
      var h2 = inTangents[last];
      var len2h = Math.sqrt(h2[0] * h2[0] + h2[1] * h2[1]);
      if (len2h > 0.001) return [-h2[0] / len2h, -h2[1] / len2h];
    }
    return null;
  }

  function tangentFromPoints(vertices, atStart) {
    var p0;
    var p1;
    if (atStart) {
      p0 = vertices[0];
      p1 = vertices[1];
    } else {
      var last = vertices.length - 1;
      p0 = vertices[last - 1];
      p1 = vertices[last];
    }
    var dx = p1[0] - p0[0];
    var dy = p1[1] - p0[1];
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.001) return [0, -1];
    return [dx / d, dy / d];
  }

  function getTangent(vertices, outTangents, inTangents, atStart) {
    var t = tangentFromHandles(vertices, outTangents, inTangents, atStart);
    if (t) return t;
    return tangentFromPoints(vertices, atStart);
  }

  function openClosedPath(pathProp) {
    var pv = pathProp.value;
    if (!pv.closed) return pv;

    var v = pv.vertices;
    var iT = pv.inTangents;
    var oT = pv.outTangents;
    var nv = [];
    var ni = [];
    var no_ = [];
    var i;
    for (i = 0; i < v.length; i++) {
      nv.push([v[i][0], v[i][1]]);
      ni.push([iT[i][0], iT[i][1]]);
      no_.push([oT[i][0], oT[i][1]]);
    }
    nv.push([v[0][0], v[0][1]]);
    ni.push([iT[0][0], iT[0][1]]);
    no_.push([0, 0]);

    var s = new Shape();
    s.vertices = nv;
    s.inTangents = ni;
    s.outTangents = no_;
    s.closed = false;
    pathProp.setValue(s);
    return s;
  }

  function addExtensions(shape, ext) {
    var v = shape.vertices;
    var iT = shape.inTangents;
    var oT = shape.outTangents;
    var n = v.length;

    var sDir = getTangent(v, oT, iT, true);
    var eDir = getTangent(v, oT, iT, false);
    var sPerp = [sDir[1], -sDir[0]];
    var ePerp = [-eDir[1], eDir[0]];

    var extS = [
      v[0][0] + sDir[0] * -ext * 0.6 + sPerp[0] * ext * 0.6,
      v[0][1] + sDir[1] * -ext * 0.6 + sPerp[1] * ext * 0.6
    ];
    var extE = [
      v[n - 1][0] + eDir[0] * ext * 0.6 + ePerp[0] * ext * 0.6,
      v[n - 1][1] + eDir[1] * ext * 0.6 + ePerp[1] * ext * 0.6
    ];

    var r = ext * 0.3;
    var nv = [extS];
    var ni = [[0, 0]];
    var no_ = [[sDir[0] * r, sDir[1] * r]];

    nv.push([v[0][0], v[0][1]]);
    ni.push([sDir[0] * -r, sDir[1] * -r]);
    no_.push([oT[0][0], oT[0][1]]);

    var i;
    for (i = 1; i < n - 1; i++) {
      nv.push([v[i][0], v[i][1]]);
      ni.push([iT[i][0], iT[i][1]]);
      no_.push([oT[i][0], oT[i][1]]);
    }

    nv.push([v[n - 1][0], v[n - 1][1]]);
    ni.push([iT[n - 1][0], iT[n - 1][1]]);
    no_.push([eDir[0] * r, eDir[1] * r]);

    nv.push(extE);
    ni.push([eDir[0] * -r, eDir[1] * -r]);
    no_.push([0, 0]);

    var newShape = new Shape();
    newShape.vertices = nv;
    newShape.inTangents = ni;
    newShape.outTangents = no_;
    newShape.closed = false;
    return newShape;
  }

  function bezLen(p0, out0, in1, p1, steps) {
    var len = 0;
    var c0 = [p0[0] + out0[0], p0[1] + out0[1]];
    var c1 = [p1[0] + in1[0], p1[1] + in1[1]];
    var prev = p0;
    var s;
    for (s = 1; s <= steps; s++) {
      var t = s / steps;
      var mt = 1 - t;
      var x = mt * mt * mt * p0[0] + 3 * mt * mt * t * c0[0] + 3 * mt * t * t * c1[0] + t * t * t * p1[0];
      var y = mt * mt * mt * p0[1] + 3 * mt * mt * t * c0[1] + 3 * mt * t * t * c1[1] + t * t * t * p1[1];
      var dx = x - prev[0];
      var dy = y - prev[1];
      len += Math.sqrt(dx * dx + dy * dy);
      prev = [x, y];
    }
    return len;
  }

  function pathLength(vertices, inTangents, outTangents) {
    var total = 0;
    var i;
    for (i = 0; i < vertices.length - 1; i++) {
      total += bezLen(vertices[i], outTangents[i], inTangents[i + 1], vertices[i + 1], 50);
    }
    return total;
  }

  function setEase(prop, keyIndex) {
    var dim = prop.propertyValueType === PropertyValueType.TwoD ? 2 : 1;
    var easeInArr = [];
    var easeOutArr = [];
    var d;
    for (d = 0; d < dim; d++) {
      easeInArr.push(new KeyframeEase(0, IN_INF));
      easeOutArr.push(new KeyframeEase(0, IN_INF));
    }
    prop.setInterpolationTypeAtKey(keyIndex, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
    prop.setTemporalEaseAtKey(keyIndex, easeInArr, easeOutArr);
  }

  function clearKeys(prop) {
    if (!prop || prop.numKeys === 0) return;
    var k;
    for (k = prop.numKeys; k >= 1; k--) {
      prop.removeKey(k);
    }
  }

  function getOrAddTrim(vectorsGroup) {
    var i;
    for (i = 1; i <= vectorsGroup.numProperties; i++) {
      if (vectorsGroup.property(i).matchName === "ADBE Vector Filter - Trim") {
        return vectorsGroup.property(i);
      }
    }
    return vectorsGroup.addProperty("ADBE Vector Filter - Trim");
  }

  function addTrimPaths(vectorsGroup, leaderPct, trailerPct, offset) {
    var trim = getOrAddTrim(vectorsGroup);
    var trimEnd = trim.property("ADBE Vector Trim End");
    var trimStart = trim.property("ADBE Vector Trim Start");
    var trimOffset = trim.property("ADBE Vector Trim Offset");

    clearKeys(trimEnd);
    clearKeys(trimStart);
    try { trimEnd.expression = ""; } catch (e1) {}
    try { trimStart.expression = ""; } catch (e2) {}
    try { trimOffset.expression = ""; } catch (e3) {}
    trimOffset.setValue(0);

    var t0 = offset;
    var t1 = t0 + DUR;
    var t2 = t1 + HOLD;
    var t3 = t2 + DUR;

    trimEnd.setValueAtTime(t0, 0);
    trimEnd.setValueAtTime(t1, trailerPct);
    trimEnd.setValueAtTime(t2, trailerPct);
    trimEnd.setValueAtTime(t3, 100);

    trimStart.setValueAtTime(t0, 0);
    trimStart.setValueAtTime(t1, leaderPct);
    trimStart.setValueAtTime(t2, leaderPct);
    trimStart.setValueAtTime(t3, 100);

    var k;
    for (k = 1; k <= trimEnd.numKeys; k++) setEase(trimEnd, k);
    for (k = 1; k <= trimStart.numKeys; k++) setEase(trimStart, k);
    return trim;
  }

  function collectPathsInGroup(group, layer, out) {
    if (!group || group.numProperties === undefined) return;
    var i;
    for (i = 1; i <= group.numProperties; i++) {
      var p = group.property(i);
      if (p.matchName === "ADBE Vector Shape - Group") {
        var pathProp = p.property("ADBE Vector Shape");
        if (pathProp) {
          out.push({
            pathProp: pathProp,
            vectorsGroup: group,
            layer: layer
          });
        }
      } else if (p.propertyType === PropertyType.INDEXED_GROUP || p.propertyType === PropertyType.NAMED_GROUP) {
        collectPathsInGroup(p, layer, out);
      }
    }
  }

  function collectLayerPaths(layer) {
    var out = [];
    var contents = layer.property("ADBE Root Vectors Group");
    if (!contents) return out;
    collectPathsInGroup(contents, layer, out);
    return out;
  }

  function scanExprErrors(group, path, errors) {
    if (!group || group.numProperties === undefined) return;
    var p;
    for (p = 1; p <= group.numProperties; p++) {
      var prop = group.property(p);
      if (prop.numProperties > 0) {
        scanExprErrors(prop, path + " > " + prop.name, errors);
      } else if (prop.expressionEnabled && prop.expressionError !== "") {
        errors.push(path + " > " + prop.name + ": " + prop.expressionError);
      }
    }
  }

  var paths = $.global.collectSelectedShapePaths(comp);
  if (!paths || paths.length === 0) {
    throw new Error("타임라인에서 Path 속성을 선택하세요.");
  }

  var applied = 0;
  var skipped = 0;
  var staggerDelay = paths.length > 1 ? STAGGER_TOTAL / (paths.length - 1) : 0;
  var i;
  for (i = 0; i < paths.length; i++) {
    var layer = paths[i].layer;
    var pp = paths[i].pathProp;
    var shape = openClosedPath(pp);
    if (!shape) shape = pp.value;
    if (!shape.vertices || shape.vertices.length < 2) {
      log("skip verts<2: " + layer.name);
      skipped++;
      continue;
    }

    var extShape = addExtensions(shape, EXT);
    pp.setValue(extShape);

    var nv = extShape.vertices;
    var ni = extShape.inTangents;
    var no_ = extShape.outTangents;
    var leaderLen = bezLen(nv[0], no_[0], ni[1], nv[1], 50);
    var trailerLen = bezLen(nv[nv.length - 2], no_[nv.length - 2], ni[nv.length - 1], nv[nv.length - 1], 50);
    var totalLen = pathLength(nv, ni, no_);
    if (totalLen < 0.001) {
      log("skip zero length: " + layer.name);
      skipped++;
      continue;
    }

    var leaderPct = Math.round((leaderLen / totalLen) * 100);
    var trailerPct = 100 - Math.round((trailerLen / totalLen) * 100);
    if (leaderPct < 0) leaderPct = 0;
    if (trailerPct > 100) trailerPct = 100;
    if (trailerPct <= leaderPct) trailerPct = leaderPct + 1;

    var offset = i * staggerDelay;
    addTrimPaths(paths[i].vectorsGroup, leaderPct, trailerPct, offset);
    layer.enabled = true;
    applied++;
    log(
      "OK " +
        layer.name +
        " | verts=" +
        nv.length +
        " | leader=" +
        leaderPct +
        "% trailer=" +
        trailerPct +
        "% | t0=" +
        offset
    );
  }

  if (applied === 0) {
    throw new Error("적용 가능한 Shape Path가 없습니다. Ellipse/Rect는 Path로 변환 후 다시 실행하세요.");
  }

  var exprErrs = [];
  var ei;
  var seenLayers = {};
  for (ei = 0; ei < paths.length; ei++) {
    var lyName = paths[ei].layer.name;
    if (seenLayers[lyName]) continue;
    seenLayers[lyName] = true;
    scanExprErrors(paths[ei].layer, lyName, exprErrs);
  }
  if (exprErrs.length > 0) {
    throw new Error("Expression errors: " + exprErrs.join(" | "));
  }

  SHAPE_PATH_SWEEP_LAST = {
    ok: true,
    applied: applied,
    skipped: skipped,
    paths: paths.length,
    comp: comp.name
  };

  log("line-sweep OK applied=" + applied + " skipped=" + skipped);
})();
