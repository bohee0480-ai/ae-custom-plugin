/**
 * Resample Shape paths to equal vertex counts without squashing beziers.
 * Arc-length sampling preserves circles/curves when morphing to higher point counts.
 */
(function () {
  function add2(a, b) {
    return [a[0] + b[0], a[1] + b[1]];
  }

  function sub2(a, b) {
    return [a[0] - b[0], a[1] - b[1]];
  }

  function scale2(a, s) {
    return [a[0] * s, a[1] * s];
  }

  function len2(a) {
    return Math.sqrt(a[0] * a[0] + a[1] * a[1]);
  }

  function evalCubic(p0, p1, p2, p3, t) {
    var u = 1 - t;
    var a = u * u * u;
    var b = 3 * u * u * t;
    var c = 3 * u * t * t;
    var d = t * t * t;
    return [
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]
    ];
  }

  function evalCubicDeriv(p0, p1, p2, p3, t) {
    var u = 1 - t;
    return [
      3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]),
      3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1])
    ];
  }

  function cloneShape(shape) {
    var verts = [];
    var ins = [];
    var outs = [];
    var out = new Shape();
    var i;
    for (i = 0; i < shape.vertices.length; i++) {
      verts.push([shape.vertices[i][0], shape.vertices[i][1]]);
      ins.push([shape.inTangents[i][0], shape.inTangents[i][1]]);
      outs.push([shape.outTangents[i][0], shape.outTangents[i][1]]);
    }
    out.vertices = verts;
    out.inTangents = ins;
    out.outTangents = outs;
    out.closed = shape.closed;
    return out;
  }

  function buildArcTable(shape, samplesPerEdge) {
    var verts = shape.vertices;
    var ins = shape.inTangents;
    var outs = shape.outTangents;
    var closed = shape.closed;
    var n = verts.length;
    var edgeCount = closed ? n : Math.max(n - 1, 0);
    var pts = [];
    var cum = [0];
    var tangents = [];
    var total = 0;
    var i;
    var s;
    var steps = Math.max(Number(samplesPerEdge) || 12, 4);

    if (n < 1) {
      return { pts: pts, cum: cum, tangents: tangents, total: 0, closed: closed };
    }

    for (i = 0; i < edgeCount; i++) {
      var j = (i + 1) % n;
      var p0 = verts[i];
      var p1 = add2(p0, outs[i]);
      var p2 = add2(verts[j], ins[j]);
      var p3 = verts[j];
      for (s = 0; s < steps; s++) {
        var t = s / steps;
        var pt = evalCubic(p0, p1, p2, p3, t);
        var tan = evalCubicDeriv(p0, p1, p2, p3, t);
        if (s > 0 || pts.length === 0) {
          var last = pts[pts.length - 1];
          if (last) {
            var dx = pt[0] - last[0];
            var dy = pt[1] - last[1];
            total += Math.sqrt(dx * dx + dy * dy);
          }
          pts.push([pt[0], pt[1]]);
          tangents.push(tan);
          cum.push(total);
        }
      }
    }

    if (!closed && n > 0) {
      var end = verts[n - 1];
      var lastPt = pts[pts.length - 1];
      if (!lastPt || lastPt[0] !== end[0] || lastPt[1] !== end[1]) {
        var dx2 = end[0] - (lastPt ? lastPt[0] : 0);
        var dy2 = end[1] - (lastPt ? lastPt[1] : 0);
        total += Math.sqrt(dx2 * dx2 + dy2 * dy2);
        pts.push([end[0], end[1]]);
        tangents.push([dx2, dy2]);
        cum.push(total);
      }
    }

    return { pts: pts, cum: cum, tangents: tangents, total: total, closed: closed };
  }

  function sampleAtDistance(table, dist) {
    var pts = table.pts;
    var cum = table.cum;
    var tangents = table.tangents;
    var i;
    if (!pts.length) return null;
    if (dist <= 0) {
      return { pt: [pts[0][0], pts[0][1]], tan: [tangents[0][0], tangents[0][1]] };
    }
    if (dist >= table.total) {
      i = pts.length - 1;
      return { pt: [pts[i][0], pts[i][1]], tan: [tangents[i][0], tangents[i][1]] };
    }
    for (i = 1; i < cum.length; i++) {
      if (cum[i] >= dist) {
        var d0 = cum[i - 1];
        var d1 = cum[i];
        var t = d1 > d0 ? (dist - d0) / (d1 - d0) : 0;
        var a = pts[i - 1];
        var b = pts[i];
        var ta = tangents[i - 1];
        var tb = tangents[i];
        return {
          pt: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
          tan: [ta[0] + (tb[0] - ta[0]) * t, ta[1] + (tb[1] - ta[1]) * t]
        };
      }
    }
    i = pts.length - 1;
    return { pt: [pts[i][0], pts[i][1]], tan: [tangents[i][0], tangents[i][1]] };
  }

  function tangentToHandles(tan, closedPath, targetCount) {
    var mag = len2(tan);
    if (mag < 0.0001) return { inT: [0, 0], outT: [0, 0] };
    var segLen = closedPath ? Math.max(mag, 1) : Math.max(mag, 1);
    var handle = segLen * (1 / 6);
    var ux = tan[0] / mag;
    var uy = tan[1] / mag;
    return {
      inT: [-ux * handle, -uy * handle],
      outT: [ux * handle, uy * handle]
    };
  }

  function resampleShape(shape, targetCount) {
    var count = Math.max(2, Math.floor(Number(targetCount) || 2));
    var table;
    var out;
    var verts = [];
    var ins = [];
    var outs = [];
    var total;
    var i;
    var k;
    var sample;
    var handles;

    if (!shape || !shape.vertices || shape.vertices.length < 1) {
      throw new Error("빈 패스입니다.");
    }

    if (shape.vertices.length === count) {
      return cloneShape(shape);
    }

    table = buildArcTable(shape, 16);
    total = table.total;
    if (total < 0.001) {
      return cloneShape(shape);
    }

    out = new Shape();
    for (k = 0; k < count; k++) {
      if (shape.closed) {
        sample = sampleAtDistance(table, (k / count) * total);
      } else {
        sample = sampleAtDistance(table, (k / Math.max(count - 1, 1)) * total);
      }
      if (!sample) continue;
      handles = tangentToHandles(sample.tan, shape.closed, count);
      verts.push([sample.pt[0], sample.pt[1]]);
      ins.push([handles.inT[0], handles.inT[1]]);
      outs.push([handles.outT[0], handles.outT[1]]);
    }

    out.vertices = verts;
    out.inTangents = ins;
    out.outTangents = outs;
    out.closed = shape.closed;
    return out;
  }

  function matchVertexCount(shape, targetCount) {
    return resampleShape(shape, targetCount);
  }

  function roundnessScore(shape) {
    var verts = shape.vertices;
    var n = verts.length;
    var cx = 0;
    var cy = 0;
    var i;
    var rs = [];
    var minR = 0;
    var maxR = 0;
    var sum = 0;
    if (n < 1) return { ratio: 0, verts: 0 };
    for (i = 0; i < n; i++) {
      cx += verts[i][0];
      cy += verts[i][1];
    }
    cx /= n;
    cy /= n;
    for (i = 0; i < n; i++) {
      var dx = verts[i][0] - cx;
      var dy = verts[i][1] - cy;
      var r = Math.sqrt(dx * dx + dy * dy);
      rs.push(r);
      sum += r;
    }
    minR = rs[0];
    maxR = rs[0];
    for (i = 1; i < rs.length; i++) {
      if (rs[i] < minR) minR = rs[i];
      if (rs[i] > maxR) maxR = rs[i];
    }
    return {
      verts: n,
      minR: minR,
      maxR: maxR,
      avgR: sum / n,
      ratio: maxR > 0 ? minR / maxR : 0
    };
  }

  $.global.pathMorphMatchHelpers = {
    cloneShape: cloneShape,
    resampleShape: resampleShape,
    matchVertexCount: matchVertexCount,
    roundnessScore: roundnessScore
  };
})();
