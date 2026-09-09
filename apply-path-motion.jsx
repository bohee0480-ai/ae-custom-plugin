(function () {
  var p = typeof PATH_MOTION_PARAMS !== "undefined" && PATH_MOTION_PARAMS
    ? PATH_MOTION_PARAMS
    : {};
  var mode = String(p.mode || "arc");
  var EPS = 0.5;

  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    throw new Error("활성 컴프가 없습니다.");
  }

  function copyVec(from, x, y) {
    if (from.length > 2) return [x, y, from[2]];
    return [x, y];
  }

  function segLen2(a, b) {
    var dx = b[0] - a[0];
    var dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  function norm2(v) {
    var l = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
    if (l < 1e-6) return [0, 0];
    return [v[0] / l, v[1] / l];
  }

  function perp2(v) {
    return [-v[1], v[0]];
  }

  function zeroTan(is3D) {
    return is3D ? [0, 0, 0] : [0, 0];
  }

  function toTan2(vec2, is3D) {
    if (is3D) return [vec2[0], vec2[1], 0];
    return [vec2[0], vec2[1]];
  }

  function clearKeys(prop) {
    var k;
    for (k = prop.numKeys; k >= 1; k--) prop.removeKey(k);
  }

  function collectKeys(prop) {
    var list = [];
    var k;
    for (k = 1; k <= prop.numKeys; k++) {
      list.push({ t: prop.keyTime(k), v: prop.keyValue(k) });
    }
    return list;
  }

  function writeKeys(prop, keys) {
    var i;
    clearKeys(prop);
    for (i = 0; i < keys.length; i++) {
      prop.setValueAtTime(keys[i].t, keys[i].v);
    }
  }

  function setCornerSpatial(prop) {
    var is3D = prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL;
    var zero = zeroTan(is3D);
    var k;
    for (k = 1; k <= prop.numKeys; k++) {
      prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
      try { prop.setSpatialAutoBezierAtKey(k, false); } catch (e1) {}
      try { prop.setSpatialContinuousAtKey(k, false); } catch (e2) {}
      try {
        prop.setSpatialTangentsAtKey(k, zero, zero);
      } catch (e3) {
        try { prop.setSpatialTangentsAtKey(k, [0, 0], [0, 0]); } catch (e4) {}
      }
    }
  }

  function arcTangentsForSegment(p0, p1, is3D) {
    var dx = p1[0] - p0[0];
    var dy = p1[1] - p0[1];
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < EPS) return { outTan: zeroTan(is3D), inTan: zeroTan(is3D) };
    var dir = norm2([dx, dy]);
    var perp = perp2(dir);
    var chord = dist / 3;
    var bulge = dist * 0.24;
    return {
      outTan: toTan2([dir[0] * chord + perp[0] * bulge, dir[1] * chord + perp[1] * bulge], is3D),
      inTan: toTan2([-dir[0] * chord + perp[0] * bulge, -dir[1] * chord + perp[1] * bulge], is3D)
    };
  }

  function sTangentsForSegment(p0, p1, is3D) {
    var dx = p1[0] - p0[0];
    var dy = p1[1] - p0[1];
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < EPS) return { outTan: zeroTan(is3D), inTan: zeroTan(is3D) };
    var dir = norm2([dx, dy]);
    var perp = perp2(dir);
    var chord = dist / 3;
    var bend = dist * 0.3;
    return {
      outTan: toTan2([dir[0] * chord + perp[0] * bend, dir[1] * chord + perp[1] * bend], is3D),
      inTan: toTan2([-dir[0] * chord + perp[0] * bend, -dir[1] * chord + perp[1] * bend], is3D)
    };
  }

  function applyBezierTangents(prop, tangentFn) {
    var n = prop.numKeys;
    if (n < 2) return 0;
    var is3D = prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL;
    var zero = zeroTan(is3D);
    var ins = [];
    var outs = [];
    var i;
    var k;
    for (k = 1; k <= n; k++) {
      ins[k] = zero.slice ? zero.slice() : [zero[0], zero[1], zero[2] || 0];
      outs[k] = zero.slice ? zero.slice() : [zero[0], zero[1], zero[2] || 0];
    }
    for (i = 1; i < n; i++) {
      var tang = tangentFn(prop.keyValue(i), prop.keyValue(i + 1), is3D);
      outs[i] = tang.outTan;
      ins[i + 1] = tang.inTan;
    }
    for (k = 1; k <= n; k++) {
      prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
      try { prop.setSpatialAutoBezierAtKey(k, false); } catch (eA) {}
      try { prop.setSpatialContinuousAtKey(k, false); } catch (eC) {}
      prop.setSpatialTangentsAtKey(k, ins[k], outs[k]);
    }
    return n;
  }

  function buildOrthoKeys(keys) {
    if (keys.length < 2) return keys;
    var result = [{ t: keys[0].t, v: keys[0].v }];
    var i;
    for (i = 0; i < keys.length - 1; i++) {
      var v0 = keys[i].v;
      var v1 = keys[i + 1].v;
      var t0 = keys[i].t;
      var t1 = keys[i + 1].t;
      var dx = v1[0] - v0[0];
      var dy = v1[1] - v0[1];
      var absDx = Math.abs(dx);
      var absDy = Math.abs(dy);

      if (absDx > EPS && absDy > EPS) {
        var hFirst = absDx >= absDy;
        var corner = hFirst ? copyVec(v0, v1[0], v0[1]) : copyVec(v0, v0[0], v1[1]);
        var total = absDx + absDy;
        var firstDist = hFirst ? absDx : absDy;
        var tMid = t0 + (t1 - t0) * (firstDist / total);
        var minGap = 1 / comp.frameRate;
        if (tMid <= t0 + minGap) tMid = t0 + minGap;
        if (tMid >= t1 - minGap) tMid = t1 - minGap;
        result.push({ t: tMid, v: corner });
      }
      result.push({ t: t1, v: v1 });
    }
    return result;
  }

  function getPositionProp(layer) {
    var tr = layer.property("ADBE Transform Group");
    if (!tr) return null;
    return tr.property("ADBE Position");
  }

  function isCameraOrLight(layer) {
    try { if (layer instanceof CameraLayer) return true; } catch (e1) {}
    try { if (layer instanceof LightLayer) return true; } catch (e2) {}
    return false;
  }

  function processLayer(layer) {
    if (!layer || layer.locked || isCameraOrLight(layer)) {
      return { ok: false, reason: "skip" };
    }
    var prop = getPositionProp(layer);
    if (!prop || prop.numKeys < 2) {
      return { ok: false, reason: "noKeys" };
    }
    if (prop.dimensionsSeparated) {
      return { ok: false, reason: "separated" };
    }
    var pvt = prop.propertyValueType;
    if (pvt !== PropertyValueType.TwoD_SPATIAL && pvt !== PropertyValueType.ThreeD_SPATIAL) {
      return { ok: false, reason: "notSpatial" };
    }

    if (mode === "ortho") {
      var keys = collectKeys(prop);
      var next = buildOrthoKeys(keys);
      writeKeys(prop, next);
      setCornerSpatial(prop);
      return { ok: true, keys: next.length };
    }

    if (mode === "arc") {
      applyBezierTangents(prop, arcTangentsForSegment);
      return { ok: true, keys: prop.numKeys };
    }

    if (mode === "sCurve") {
      applyBezierTangents(prop, sTangentsForSegment);
      return { ok: true, keys: prop.numKeys };
    }

    return { ok: false, reason: "badMode" };
  }

  var selected = comp.selectedLayers;
  if (!selected || selected.length < 1) {
    throw new Error("레이어를 선택하세요.");
  }

  var applied = 0;
  var skipped = 0;
  var skipReasons = [];
  var i;
  for (i = 0; i < selected.length; i++) {
    var res = processLayer(selected[i]);
    if (res.ok) {
      applied++;
    } else {
      skipped++;
      skipReasons.push(selected[i].name + ":" + (res.reason || "skip"));
    }
  }

  if (applied < 1) {
    throw new Error("적용할 Position 키프레임 경로가 없습니다.");
  }

  PATH_MOTION_LAST = {
    ok: true,
    mode: mode,
    applied: applied,
    skipped: skipped,
    skipReasons: skipReasons,
    comp: comp.name
  };
})();
