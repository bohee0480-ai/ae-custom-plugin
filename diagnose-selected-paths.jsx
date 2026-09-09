/**
 * Read-only report for selected Shape Path properties.
 */
(function () {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    throw new Error("활성 컴프가 없습니다.");
  }

  var paths = $.global.collectSelectedShapePaths(comp);
  var items = [];
  var i;
  var j;

  function approxLen(shape) {
    var verts = shape.vertices;
    var ins = shape.inTangents;
    var outs = shape.outTangents;
    var closed = shape.closed;
    var n = verts.length;
    if (n < 2) return 0;
    var segCount = closed ? n : n - 1;
    var total = 0;
    var s;
    for (s = 0; s < segCount; s++) {
      var idx = s;
      var o = (s + 1) % n;
      var p0 = verts[idx];
      var p3 = verts[o];
      var p1 = [p0[0] + outs[idx][0], p0[1] + outs[idx][1]];
      var p2 = [p3[0] + ins[o][0], p3[1] + ins[o][1]];
      var t;
      var prev = p0;
      for (t = 1; t <= 32; t++) {
        var u = t / 32;
        var mt = 1 - u;
        var cur = [
          mt * mt * mt * p0[0] + 3 * mt * mt * u * p1[0] + 3 * mt * u * u * p2[0] + u * u * u * p3[0],
          mt * mt * mt * p0[1] + 3 * mt * mt * u * p1[1] + 3 * mt * u * u * p2[1] + u * u * u * p3[1]
        ];
        var dx = cur[0] - prev[0];
        var dy = cur[1] - prev[1];
        total += Math.sqrt(dx * dx + dy * dy);
        prev = cur;
      }
    }
    return Math.round(total);
  }

  function hasTrim(vg) {
    if (!vg) return false;
    for (j = 1; j <= vg.numProperties; j++) {
      if (vg.property(j).matchName === "ADBE Vector Filter - Trim") return true;
    }
    return false;
  }

  if (!paths.length) {
    SHAPE_PATH_DIAG_LAST = {
      ok: false,
      count: 0,
      paths: [],
      message: "Path 속성을 선택하세요. (Shape Layer › Contents › Path)"
    };
    log("path-diagnose: none selected");
    return;
  }

  for (i = 0; i < paths.length; i++) {
    var info = paths[i];
    var pp = info.pathProp;
    var shape;
    try {
      shape = pp.valueAtTime(comp.time, false);
    } catch (e0) {
      shape = pp.value;
    }
    var typeLabel = shape.closed ? "닫힌 Path" : "열린 Path";
    if (pp.numKeys > 0) typeLabel = typeLabel + " · 키 " + pp.numKeys + "개";
    if (pp.expressionEnabled) typeLabel = typeLabel + " · Expression";

    items.push({
      layer: info.layer.name,
      pathGroup: info.pathGroup.name,
      closed: shape.closed,
      verts: shape.vertices.length,
      keys: pp.numKeys,
      length: approxLen(shape),
      hasTrim: hasTrim(info.vectorsGroup),
      hasExpression: pp.expressionEnabled ? 1 : 0,
      typeLabel: typeLabel
    });
  }

  var lines = [];
  for (i = 0; i < items.length; i++) {
    var it = items[i];
    lines.push(
      it.layer +
        " / " +
        it.pathGroup +
        " · " +
        it.typeLabel +
        " · " +
        it.verts +
        "점 · 길이≈" +
        it.length +
        "px"
    );
  }

  SHAPE_PATH_DIAG_LAST = {
    ok: true,
    count: items.length,
    paths: items,
    message: lines.join(" | "),
    summary: items.length + "개 Path 진단 완료"
  };

  log("path-diagnose OK " + SHAPE_PATH_DIAG_LAST.message);
})();
