(function () {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    throw new Error("활성 컴포지션이 없습니다.");
  }

  function resolvePathPropFromSelection() {
    var sel = comp.selectedProperties;
    if (!sel || sel.length === 0) {
      throw new Error("패스(Path)를 선택해 주세요.");
    }

    var i;
    for (i = 0; i < sel.length; i++) {
      var p = sel[i];
      if (p.matchName === "ADBE Vector Shape") {
        return p;
      }
      if (p.matchName === "ADBE Vector Shape - Group") {
        return p.property("Path");
      }
    }

    throw new Error("선택 항목에서 Path 속성을 찾을 수 없습니다.");
  }

  function clone2(a) {
    return [a[0], a[1]];
  }

  function add(a, b) {
    return [a[0] + b[0], a[1] + b[1]];
  }

  function sub(a, b) {
    return [a[0] - b[0], a[1] - b[1]];
  }

  function scale(a, s) {
    return [a[0] * s, a[1] * s];
  }

  function dist(a, b) {
    var dx = a[0] - b[0];
    var dy = a[1] - b[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  function len2(v) {
    return Math.sqrt(v[0] * v[0] + v[1] * v[1]);
  }

  function normalize(v) {
    var l = len2(v);
    if (l < 0.0001) {
      return [1, 0];
    }
    return [v[0] / l, v[1] / l];
  }

  function isZero(v) {
    return Math.abs(v[0]) < 0.0001 && Math.abs(v[1]) < 0.0001;
  }

  function cubicPoint(p0, p1, p2, p3, t) {
    var u = 1 - t;
    var uu = u * u;
    var tt = t * t;
    var uuu = uu * u;
    var ttt = tt * t;
    return [
      uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0],
      uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1]
    ];
  }

  function segmentLength(v0, out0, in1, v1, samples) {
    var cp0 = clone2(v0);
    var cp1 = add(v0, out0);
    var cp2 = add(v1, in1);
    var cp3 = clone2(v1);
    var total = 0;
    var prev = cp0;
    var s;
    for (s = 1; s <= samples; s++) {
      var pt = cubicPoint(cp0, cp1, cp2, cp3, s / samples);
      total += dist(prev, pt);
      prev = pt;
    }
    return total;
  }

  function computePathLength(verts, inT, outT) {
    var total = 0;
    var i;
    for (i = 0; i < verts.length - 1; i++) {
      total += segmentLength(verts[i], outT[i], inT[i + 1], verts[i + 1], 32);
    }
    return total;
  }

  function getStartDirection(verts, outT, inT) {
    var out = outT[0];
    if (!isZero(out)) {
      return normalize(out);
    }
    if (!isZero(inT[0])) {
      return normalize(scale(inT[0], -1));
    }
    if (verts.length > 1) {
      return normalize(sub(verts[1], verts[0]));
    }
    return [1, 0];
  }

  function getEndDirection(verts, outT, inT) {
    var n = verts.length - 1;
    var inTan = inT[n];
    if (!isZero(inTan)) {
      return normalize(scale(inTan, -1));
    }
    var outTan = outT[n];
    if (!isZero(outTan)) {
      return normalize(outTan);
    }
    if (n > 0) {
      return normalize(sub(verts[n], verts[n - 1]));
    }
    return [1, 0];
  }

  function cloneShape(sh) {
    var s = new Shape();
    var verts = [];
    var ins = [];
    var outs = [];
    var i;
    for (i = 0; i < sh.vertices.length; i++) {
      verts.push(clone2(sh.vertices[i]));
      ins.push(clone2(sh.inTangents[i]));
      outs.push(clone2(sh.outTangents[i]));
    }
    s.vertices = verts;
    s.inTangents = ins;
    s.outTangents = outs;
    s.closed = sh.closed;
    return s;
  }

  function extendOpenPath(shape, extLen) {
    var verts = shape.vertices;
    var inT = shape.inTangents;
    var outT = shape.outTangents;
    var n = verts.length;

    if (n < 2) {
      throw new Error("연장하려면 최소 2개의 정점이 필요합니다.");
    }

    var handleLen = extLen / 3;
    var startDir = getStartDirection(verts, outT, inT);
    var endDir = getEndDirection(verts, outT, inT);
    var backDir = scale(startDir, -1);

    var startExt = add(verts[0], scale(backDir, extLen));
    var endExt = add(verts[n - 1], scale(endDir, extLen));

    var newVerts = [];
    var newIn = [];
    var newOut = [];
    var i;

    newVerts.push(clone2(startExt));
    newIn.push([0, 0]);
    newOut.push(scale(startDir, handleLen));

    for (i = 0; i < n; i++) {
      newVerts.push(clone2(verts[i]));
      newIn.push(clone2(inT[i]));
      newOut.push(clone2(outT[i]));
    }

    newIn[1] = scale(backDir, handleLen);

    var lastIdx = newVerts.length - 1;
    newOut[lastIdx - 1] = scale(endDir, handleLen);

    newVerts.push(clone2(endExt));
    newIn.push(scale(endDir, -handleLen));
    newOut.push([0, 0]);

    var result = new Shape();
    result.vertices = newVerts;
    result.inTangents = newIn;
    result.outTangents = newOut;
    result.closed = false;
    return result;
  }

  var pathProp = resolvePathPropFromSelection();
  var original = pathProp.value;

  if (original.closed) {
    throw new Error("닫힌 패스는 지원하지 않습니다. 열린 패스를 선택해 주세요.");
  }

  var pathLen = computePathLength(original.vertices, original.inTangents, original.outTangents);
  if (pathLen < 0.001) {
    throw new Error("패스 길이가 0에 가깝습니다.");
  }

  var extLen = pathLen / 3;
  var extended = extendOpenPath(original, extLen);

  pathProp.setValue(extended);

  SHAPE_PATH_EXTEND_LAST = {
    ok: true,
    vertsBefore: original.vertices.length,
    vertsAfter: extended.vertices.length,
    pathLen: pathLen,
    extLen: extLen,
    comp: app.project.activeItem.name
  };

  log(
    "extend-selected-path-curve OK | verts " +
      original.vertices.length +
      " -> " +
      extended.vertices.length +
      " | pathLen=" +
      Math.round(pathLen * 10) / 10 +
      " | extLen=" +
      Math.round(extLen * 10) / 10
  );
})();
