(function () {
  var p = typeof LAYOUT_PLACE_PARAMS !== "undefined" && LAYOUT_PLACE_PARAMS
    ? LAYOUT_PLACE_PARAMS
    : {};
  var mode = String(p.mode || "pushOut");
  // 화면 밖으로 밀 때 프레임을 완전히 벗어나도록 추가 여유(px).
  // 예전 hangPx=8은 의도적으로 8px를 남겼고, 살짝 보이는 원인이었다.
  var clearPx = p.clearPx !== undefined ? Number(p.clearPx) : 48;
  if (isNaN(clearPx) || clearPx < 0) clearPx = 48;

  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    throw new Error("활성 컴프가 없습니다.");
  }

  var t = comp.time;
  var W = comp.width;
  var H = comp.height;
  var cx = W / 2;
  var cy = H / 2;
  var EPS = 0.0001;

  function isCameraOrLight(layer) {
    try {
      if (layer instanceof CameraLayer) return true;
    } catch (e1) {}
    try {
      if (layer instanceof LightLayer) return true;
    } catch (e2) {}
    return false;
  }

  function canMoveLayer(layer) {
    if (!layer || layer.locked) return false;
    if (isCameraOrLight(layer)) return false;
    try {
      var pos = layer.property("ADBE Transform Group").property("ADBE Position");
      return !!pos;
    } catch (eCan) {
      return false;
    }
  }

  function setPropAtTime(prop, value, time) {
    if (!prop) return;
    if (prop.numKeys > 0) {
      prop.setValueAtTime(time, value);
    } else {
      prop.setValue(value);
    }
  }

  function posGroup(layer) {
    return layer.property("ADBE Transform Group");
  }

  function getPosProps(layer) {
    var tr = posGroup(layer);
    var pos = tr.property("ADBE Position");
    if (pos.dimensionsSeparated) {
      return {
        separated: true,
        x: tr.property("ADBE Position_0") || layer.transform.property("X Position"),
        y: tr.property("ADBE Position_1") || layer.transform.property("Y Position"),
        pos: pos
      };
    }
    return { separated: false, pos: pos };
  }

  function getPosXY(layer, time) {
    var props = getPosProps(layer);
    if (props.separated) {
      return [
        props.x.valueAtTime(time, false),
        props.y.valueAtTime(time, false)
      ];
    }
    var v = props.pos.valueAtTime(time, false);
    return [v[0], v[1]];
  }

  function getRotationDeg(layer, time) {
    var tr = posGroup(layer);
    var rot = tr.property("ADBE Rotate Z");
    if (rot) return rot.valueAtTime(time, false);
    rot = layer.transform.rotation;
    if (rot) return rot.valueAtTime(time, false);
    return 0;
  }

  function localToParent(layer, lx, ly, time) {
    var tr = posGroup(layer);
    var pos = getPosXY(layer, time);
    var anc = tr.property("ADBE Anchor Point").valueAtTime(time, false);
    var sc = tr.property("ADBE Scale").valueAtTime(time, false);
    var rad = getRotationDeg(layer, time) * Math.PI / 180;
    var dx = (lx - anc[0]) * (sc[0] / 100);
    var dy = (ly - anc[1]) * (sc[1] / 100);
    var cos = Math.cos(rad);
    var sin = Math.sin(rad);
    return [
      pos[0] + dx * cos - dy * sin,
      pos[1] + dx * sin + dy * cos
    ];
  }

  function parentToLocal(layer, px, py, time) {
    var tr = posGroup(layer);
    var pos = getPosXY(layer, time);
    var anc = tr.property("ADBE Anchor Point").valueAtTime(time, false);
    var sc = tr.property("ADBE Scale").valueAtTime(time, false);
    var rad = getRotationDeg(layer, time) * Math.PI / 180;
    var rx = px - pos[0];
    var ry = py - pos[1];
    var cos = Math.cos(rad);
    var sin = Math.sin(rad);
    var ux = rx * cos + ry * sin;
    var uy = -rx * sin + ry * cos;
    var sx = sc[0] / 100;
    var sy = sc[1] / 100;
    if (Math.abs(sx) < 1e-8) sx = 1e-8;
    if (Math.abs(sy) < 1e-8) sy = 1e-8;
    return [ux / sx + anc[0], uy / sy + anc[1]];
  }

  function layerPointToComp(layer, lx, ly, time) {
    if (typeof layer.toComp === "function") {
      try {
        var p = layer.toComp([lx, ly], time);
        return [p[0], p[1]];
      } catch (eTo) {}
    }
    var x = lx;
    var y = ly;
    var cur = layer;
    var converted;
    while (cur) {
      converted = localToParent(cur, x, y, time);
      x = converted[0];
      y = converted[1];
      cur = cur.parent;
    }
    return [x, y];
  }

  function compPointToLayer(layer, wx, wy, time) {
    if (typeof layer.fromComp === "function") {
      try {
        var p = layer.fromComp([wx, wy]);
        return [p[0], p[1]];
      } catch (eFrom) {}
    }
    var chain = [];
    var cur = layer;
    while (cur) {
      chain.push(cur);
      cur = cur.parent;
    }
    var x = wx;
    var y = wy;
    var i;
    var converted;
    for (i = chain.length - 1; i >= 0; i--) {
      converted = parentToLocal(chain[i], x, y, time);
      x = converted[0];
      y = converted[1];
    }
    return [x, y];
  }

  function getAnchorComp(layer, time) {
    var ap = posGroup(layer).property("ADBE Anchor Point").valueAtTime(time, false);
    return layerPointToComp(layer, ap[0], ap[1], time);
  }

  function setAnchorAtComp(layer, newCompXY, time) {
    var parent = layer.parent;
    var newPos;
    if (parent) {
      newPos = compPointToLayer(parent, newCompXY[0], newCompXY[1], time);
    } else {
      newPos = [newCompXY[0], newCompXY[1]];
    }
    var props = getPosProps(layer);
    if (props.separated) {
      setPropAtTime(props.x, newPos[0], time);
      setPropAtTime(props.y, newPos[1], time);
    } else {
      var old = props.pos.valueAtTime(time, false);
      if (old.length > 2) {
        setPropAtTime(props.pos, [newPos[0], newPos[1], old[2]], time);
      } else {
        setPropAtTime(props.pos, [newPos[0], newPos[1]], time);
      }
    }
  }

  function moveByCompDelta(layer, dx, dy, time) {
    var oldA = getAnchorComp(layer, time);
    setAnchorAtComp(layer, [oldA[0] + dx, oldA[1] + dy], time);
  }

  function getCompAABB(layer, time) {
    var rect = null;
    try {
      // includeExtents=true: 스트로크·이펙트 확장까지 포함해 살짝 남는 픽셀을 줄인다.
      rect = layer.sourceRectAtTime(time, true);
    } catch (eRect) {
      try {
        rect = layer.sourceRectAtTime(time, false);
      } catch (eRect2) {}
    }
    if (!rect) {
      rect = { left: 0, top: 0, width: 0, height: 0 };
    }

    var pts = [
      [rect.left, rect.top],
      [rect.left + rect.width, rect.top],
      [rect.left, rect.top + rect.height],
      [rect.left + rect.width, rect.top + rect.height]
    ];
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    var i;
    var c;
    for (i = 0; i < 4; i++) {
      c = layerPointToComp(layer, pts[i][0], pts[i][1], time);
      if (c[0] < minX) minX = c[0];
      if (c[1] < minY) minY = c[1];
      if (c[0] > maxX) maxX = c[0];
      if (c[1] > maxY) maxY = c[1];
    }

    if (minX === Infinity) {
      c = getAnchorComp(layer, time);
      minX = maxX = c[0];
      minY = maxY = c[1];
    }

    return {
      left: minX,
      top: minY,
      right: maxX,
      bottom: maxY,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2
    };
  }

  function unitFromCenter(box, fallbackIndex, total) {
    var dx = box.cx - cx;
    var dy = box.cy - cy;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len >= 1) {
      return [dx / len, dy / len];
    }
    var n = total < 1 ? 1 : total;
    var angle = (fallbackIndex / n) * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(angle), Math.sin(angle)];
  }

  function exitDistance(box, u) {
    var ds = [];
    if (u[0] > EPS) ds.push((W - box.left) / u[0]);
    if (u[0] < -EPS) ds.push((0 - box.right) / u[0]);
    if (u[1] > EPS) ds.push((H - box.top) / u[1]);
    if (u[1] < -EPS) ds.push((0 - box.bottom) / u[1]);
    if (ds.length === 0) return 0;
    var d = ds[0];
    var i;
    for (i = 1; i < ds.length; i++) {
      if (ds[i] < d) d = ds[i];
    }
    // 경계까지 간 뒤 clearPx만큼 더 밀어 프레임 밖으로 완전 이탈
    d = d + clearPx;
    if (d < 0) d = 0;
    return d;
  }

  var selected = comp.selectedLayers;
  if (!selected || selected.length < 1) {
    throw new Error("레이어를 선택하세요.");
  }

  var targets = [];
  var skipped = [];
  var i;
  var layer;
  for (i = 0; i < selected.length; i++) {
    layer = selected[i];
    if (!canMoveLayer(layer)) {
      skipped.push(layer.name + ":skip");
      continue;
    }
    targets.push(layer);
  }

  if (targets.length < 1) {
    throw new Error("이동할 수 있는 레이어가 없습니다.");
  }

  var moved = 0;
  var j;
  for (j = 0; j < targets.length; j++) {
    layer = targets[j];
    var box = getCompAABB(layer, t);
    if (mode === "gatherCenter") {
      moveByCompDelta(layer, cx - box.cx, cy - box.cy, t);
      moved++;
    } else {
      var u = unitFromCenter(box, j, targets.length);
      var d = exitDistance(box, u);
      if (d > 0.5) {
        moveByCompDelta(layer, u[0] * d, u[1] * d, t);
        moved++;
      } else {
        skipped.push(layer.name + ":alreadyOut");
      }
    }
  }

  LAYOUT_PLACE_LAST = {
    ok: true,
    mode: mode,
    moved: moved,
    skipped: skipped.length,
    skippedNames: skipped,
    time: t,
    comp: comp.name
  };
})();
