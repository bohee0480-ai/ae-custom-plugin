(function () {
  var STEPS_PER_SEGMENT = 8;

  function hexToRgb(hex) {
    var text = String(hex || "").replace("#", "");
    return [
      parseInt(text.substr(0, 2), 16) / 255,
      parseInt(text.substr(2, 2), 16) / 255,
      parseInt(text.substr(4, 2), 16) / 255,
      1
    ];
  }

  function colorKey(rgb) {
    function toByte(n) {
      var t = Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16);
      t = t.toUpperCase();
      if (t.length < 2) t = "0" + t;
      return t;
    }
    if (!rgb || rgb.length < 3) return "";
    return "#" + toByte(rgb[0]) + toByte(rgb[1]) + toByte(rgb[2]);
  }

  function polygonArea(verts) {
    var area = 0;
    var j;
    var k;
    if (!verts || verts.length < 3) return 0;
    for (j = 0; j < verts.length; j++) {
      k = (j + 1) % verts.length;
      area += verts[j][0] * verts[k][1] - verts[k][0] * verts[j][1];
    }
    return Math.abs(area) * 0.5;
  }

  function sampleCubic(p0, p1, p2, p3, steps) {
    var pts = [];
    var s;
    var t;
    var u;
    for (s = 0; s <= steps; s++) {
      t = s / steps;
      u = 1 - t;
      pts.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
      ]);
    }
    return pts;
  }

  function samplePathShape(shape, stepsPerSeg) {
    var verts = shape.vertices;
    var inT = shape.inTangents;
    var outT = shape.outTangents;
    var n;
    var out = [];
    var segCount;
    var idx;
    var j;
    var seg;
    var start;
    var v;
    if (!verts || verts.length < 2 || !shape.closed) return out;
    n = verts.length;
    segCount = n;
    for (idx = 0; idx < segCount; idx++) {
      j = (idx + 1) % n;
      seg = sampleCubic(
        verts[idx],
        [verts[idx][0] + outT[idx][0], verts[idx][1] + outT[idx][1]],
        [verts[j][0] + inT[j][0], verts[j][1] + inT[j][1]],
        verts[j],
        stepsPerSeg
      );
      start = out.length === 0 ? 0 : 1;
      for (v = start; v < seg.length; v++) out.push(seg[v]);
    }
    return out;
  }

  function valueAt(prop, time) {
    try {
      if (prop && typeof prop.valueAtTime === "function") return prop.valueAtTime(time, false);
      if (prop) return prop.value;
    } catch (eVal) {}
    return null;
  }

  function pathArea(pathGroup, scaleAbs, time) {
    var shapeProp = pathGroup.property("ADBE Vector Shape");
    var shape = valueAt(shapeProp, time);
    var sampled;
    if (!shape) return 0;
    sampled = samplePathShape(shape, STEPS_PER_SEGMENT);
    return polygonArea(sampled) * scaleAbs;
  }

  function rectArea(rect, scaleAbs, time) {
    var size = valueAt(rect.property("ADBE Vector Rect Size"), time);
    var round = valueAt(rect.property("ADBE Vector Rect Roundness"), time);
    var w;
    var h;
    var r;
    if (!size) return 0;
    w = Math.abs(size[0]);
    h = Math.abs(size[1]);
    r = Math.max(0, Number(round) || 0);
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    return (w * h - (4 - Math.PI) * r * r) * scaleAbs;
  }

  function ellipseArea(ell, scaleAbs, time) {
    var size = valueAt(ell.property("ADBE Vector Ellipse Size"), time);
    if (!size) return 0;
    return Math.PI * Math.abs(size[0] / 2) * Math.abs(size[1] / 2) * scaleAbs;
  }

  function starArea(star, scaleAbs, time) {
    var typeVal = valueAt(star.property("ADBE Vector Star Type"), time);
    var points = valueAt(star.property("ADBE Vector Star Points"), time);
    var outer = valueAt(star.property("ADBE Vector Star Outer Radius"), time);
    var inner = valueAt(star.property("ADBE Vector Star Inner Radius"), time);
    var n = Math.max(3, Math.round(Number(points) || 5));
    var outerR = Math.abs(Number(outer) || 0);
    var innerR = Math.abs(Number(inner) || 0);
    var verts = [];
    var i;
    var ang;
    var r;
    if (outerR <= 0) return 0;
    if (Number(typeVal) === 2) {
      for (i = 0; i < n; i++) {
        ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        verts.push([Math.cos(ang) * outerR, Math.sin(ang) * outerR]);
      }
    } else {
      for (i = 0; i < n * 2; i++) {
        r = i % 2 === 0 ? outerR : innerR;
        ang = -Math.PI / 2 + (i * Math.PI) / n;
        verts.push([Math.cos(ang) * r, Math.sin(ang) * r]);
      }
    }
    return polygonArea(verts) * scaleAbs;
  }

  function walkArea(group, scaleAbs, time) {
    var total = 0;
    var i;
    var item;
    var mn;
    var tr;
    var sc;
    var childScale;
    var contents;
    if (!group || group.numProperties === undefined) return 0;
    for (i = 1; i <= group.numProperties; i++) {
      item = group.property(i);
      mn = item.matchName;
      if (mn === "ADBE Vector Group") {
        tr = item.property("ADBE Vector Transform Group");
        sc = tr ? valueAt(tr.property("ADBE Vector Scale"), time) : [100, 100];
        childScale =
          scaleAbs *
          Math.abs((sc && sc[0] ? sc[0] : 100) / 100) *
          Math.abs((sc && sc[1] ? sc[1] : 100) / 100);
        contents = item.property("ADBE Vectors Group");
        total += walkArea(contents || item, childScale, time);
      } else if (mn === "ADBE Vector Shape - Group") {
        total += pathArea(item, scaleAbs, time);
      } else if (mn === "ADBE Vector Shape - Rect") {
        total += rectArea(item, scaleAbs, time);
      } else if (mn === "ADBE Vector Shape - Ellipse") {
        total += ellipseArea(item, scaleAbs, time);
      } else if (mn === "ADBE Vector Shape - Star") {
        total += starArea(item, scaleAbs, time);
      } else if (item.propertyType !== PropertyType.PROPERTY) {
        total += walkArea(item, scaleAbs, time);
      }
    }
    return total;
  }

  function layerPathArea(layer, time) {
    var scale = valueAt(layer.transform.scale, time) || [100, 100];
    var scaleAbs = Math.abs(scale[0] / 100) * Math.abs(scale[1] / 100);
    return walkArea(layer.property("ADBE Root Vectors Group"), scaleAbs, time);
  }

  function collectFills(group, out) {
    var i;
    var item;
    if (!group || group.numProperties === undefined) return;
    for (i = 1; i <= group.numProperties; i++) {
      item = group.property(i);
      if (item.matchName === "ADBE Vector Graphic - Fill") {
        out.push(item);
      } else if (item.propertyType !== PropertyType.PROPERTY) {
        collectFills(item, out);
      }
    }
  }

  function applyRgbToFills(layer, rgb) {
    var fills = [];
    var i;
    var colorProp;
    var changed = 0;
    collectFills(layer.property("ADBE Root Vectors Group"), fills);
    for (i = 0; i < fills.length; i++) {
      colorProp = fills[i].property("ADBE Vector Fill Color");
      if (!colorProp) continue;
      try {
        colorProp.setValue(rgb);
        changed++;
      } catch (eSet) {}
    }
    return changed;
  }

  function selectedShapeLayers(comp) {
    var seen = {};
    var layers = [];
    var i;
    var layer;

    function add(item) {
      if (!item || !(item instanceof ShapeLayer)) return;
      if (seen[item.index]) return;
      seen[item.index] = true;
      layers.push(item);
    }

    if (comp.selectedLayers) {
      for (i = 0; i < comp.selectedLayers.length; i++) add(comp.selectedLayers[i]);
    }
    if (!layers.length) {
      for (i = 1; i <= comp.numLayers; i++) {
        layer = comp.layer(i);
        if (layer && layer.selected) add(layer);
      }
    }
    layers.sort(function (a, b) {
      return a.index - b.index;
    });
    return layers;
  }

  function colorIndexForRank(rank, layerCount, colorCount) {
    if (colorCount <= 1) return 0;
    if (layerCount <= 1) return 0;
    if (layerCount >= colorCount) {
      return Math.min(colorCount - 1, Math.floor((rank * colorCount) / layerCount));
    }
    return Math.round((rank * (colorCount - 1)) / (layerCount - 1));
  }

  function seededRandom(seedValue) {
    var seed = Math.abs(Math.floor(Number(seedValue) || 1)) % 2147483647;
    if (seed < 1) seed = 1;
    return function () {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  function layersFromOpts(comp, opts) {
    var layers = [];
    var i;
    var item;
    if (opts && opts.layers && opts.layers.length) {
      for (i = 0; i < opts.layers.length; i++) {
        item = opts.layers[i];
        if (item && item instanceof ShapeLayer) layers.push(item);
      }
      return layers;
    }
    return selectedShapeLayers(comp);
  }

  function applyColorPaletteToShapes(opts) {
    opts = opts || {};
    var comp = opts.comp || app.project.activeItem;
    var mode = String(opts.mode || "");
    var colors = opts.colors || [];
    var selectedIndex = -1;
    if (typeof opts.selectedIndex === "number") selectedIndex = opts.selectedIndex;
    else if (typeof opts.selectedColorIndex === "number") selectedIndex = opts.selectedColorIndex;
    var time;
    var shapes;
    var skipped = 0;
    var appliedLayers = 0;
    var fillCount = 0;
    var assignments = [];
    var i;
    var rgb;
    var ranked;
    var area;
    var colorIdx;
    var rand;
    var fillsChanged;

    if (mode === "area") mode = "areaRank";
    if (!comp || !(comp instanceof CompItem)) {
      throw new Error("활성 컴프가 필요합니다.");
    }
    if (!colors.length) {
      throw new Error("팔레트에 색상이 없습니다.");
    }
    time = typeof opts.time === "number" ? opts.time : comp.time;
    shapes = layersFromOpts(comp, opts);
    if (!shapes.length) {
      return {
        ok: false,
        appliedLayers: 0,
        affectedLayers: 0,
        fillCount: 0,
        skipped: 0,
        skippedLayers: 0,
        targetLayers: 0,
        selectedShapes: 0,
        assignments: [],
        message: "선택한 Shape Layer가 없습니다."
      };
    }

    function record(layer, index, layerArea) {
      assignments.push({
        layerName: layer.name,
        layerIndex: layer.index,
        colorIndex: index,
        color: colors[index],
        area: layerArea || 0
      });
    }

    if (mode === "selected") {
      if (selectedIndex < 0 || selectedIndex >= colors.length) {
        throw new Error("팔레트에서 적용할 색상을 먼저 선택하세요.");
      }
      rgb = hexToRgb(colors[selectedIndex]);
      for (i = 0; i < shapes.length; i++) {
        fillsChanged = applyRgbToFills(shapes[i], rgb);
        fillCount += fillsChanged;
        appliedLayers++;
        record(shapes[i], selectedIndex, 0);
      }
    } else if (mode === "random") {
      rand = typeof opts.seed === "number" ? seededRandom(opts.seed) : Math.random;
      for (i = 0; i < shapes.length; i++) {
        colorIdx = Math.floor(rand() * colors.length);
        if (colorIdx < 0) colorIdx = 0;
        if (colorIdx >= colors.length) colorIdx = colors.length - 1;
        fillCount += applyRgbToFills(shapes[i], hexToRgb(colors[colorIdx]));
        appliedLayers++;
        record(shapes[i], colorIdx, 0);
      }
    } else if (mode === "areaRank") {
      ranked = [];
      for (i = 0; i < shapes.length; i++) {
        area = layerPathArea(shapes[i], time);
        if (!(area > 0)) {
          skipped++;
          continue;
        }
        ranked.push({ layer: shapes[i], area: area, index: shapes[i].index });
      }
      ranked.sort(function (a, b) {
        if (b.area !== a.area) return b.area - a.area;
        return a.index - b.index;
      });
      for (i = 0; i < ranked.length; i++) {
        colorIdx = colorIndexForRank(i, ranked.length, colors.length);
        fillCount += applyRgbToFills(ranked[i].layer, hexToRgb(colors[colorIdx]));
        appliedLayers++;
        record(ranked[i].layer, colorIdx, ranked[i].area);
      }
    } else {
      throw new Error("알 수 없는 적용 모드: " + mode);
    }

    var label = "Area Rank";
    if (mode === "selected") label = "Apply Selected " + colors[selectedIndex];
    else if (mode === "random") label = "Random";

    return {
      ok: true,
      appliedLayers: appliedLayers,
      affectedLayers: appliedLayers,
      fillCount: fillCount,
      skipped: skipped,
      skippedLayers: skipped,
      targetLayers: shapes.length,
      selectedShapes: shapes.length,
      assignments: assignments,
      message:
        label +
        " · layers=" +
        appliedLayers +
        " fills=" +
        fillCount +
        (skipped ? " skipped=" + skipped : "")
    };
  }

  function rgbDistance(a, b) {
    var dr = a[0] - b[0];
    var dg = a[1] - b[1];
    var db = a[2] - b[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function rgbToHsv(r, g, b) {
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var d = max - min;
    var h = 0;
    var s = max === 0 ? 0 : d / max;
    var v = max;
    if (d > 0.00001) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = h * 60;
      if (h < 0) h += 360;
    }
    return { h: h, s: s, v: v, chroma: d };
  }

  function isNeutralRgb(rgb) {
    var hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
    if (hsv.chroma < 0.07) return true;
    if (hsv.s < 0.12 && hsv.chroma < 0.14) return true;
    if (hsv.s < 0.2 && hsv.chroma < 0.16 && (hsv.v < 0.12 || hsv.v > 0.92)) return true;
    return false;
  }

  function canMergeChips(aRgb, bRgb) {
    var aNeutral = isNeutralRgb(aRgb);
    var bNeutral = isNeutralRgb(bRgb);
    var ha;
    var hb;
    if (aNeutral !== bNeutral) return false;
    if (aNeutral && bNeutral) {
      ha = rgbToHsv(aRgb[0], aRgb[1], aRgb[2]);
      hb = rgbToHsv(bRgb[0], bRgb[1], bRgb[2]);
      if (Math.abs(ha.v - hb.v) > 0.14) return false;
      return rgbDistance(aRgb, bRgb) < 0.18;
    }
    return rgbDistance(aRgb, bRgb) < 0.045;
  }

  function collectLayerFillRgbs(layer) {
    var fills = [];
    var rgbs = [];
    var i;
    var colorProp;
    var val;
    collectFills(layer.property("ADBE Root Vectors Group"), fills);
    for (i = 0; i < fills.length; i++) {
      colorProp = fills[i].property("ADBE Vector Fill Color");
      if (!colorProp) continue;
      try {
        val = colorProp.value;
        if (val && val.length >= 3) rgbs.push([val[0], val[1], val[2]]);
      } catch (eRead) {}
    }
    return rgbs;
  }

  function collectStrokes(group, out) {
    if (!group || group.numProperties === undefined) return;
    var i;
    var item;
    for (i = 1; i <= group.numProperties; i++) {
      item = group.property(i);
      if (item.matchName === "ADBE Vector Graphic - Stroke") {
        out.push(item);
      } else if (item.propertyType !== PropertyType.PROPERTY) {
        collectStrokes(item, out);
      }
    }
  }

  function collectLayerStrokeRgbs(layer) {
    var strokes = [];
    var rgbs = [];
    var i;
    var colorProp;
    var opacityProp;
    var val;
    var opacity;
    collectStrokes(layer.property("ADBE Root Vectors Group"), strokes);
    for (i = 0; i < strokes.length; i++) {
      colorProp = strokes[i].property("ADBE Vector Stroke Color");
      opacityProp = strokes[i].property("ADBE Vector Stroke Opacity");
      if (!colorProp) continue;
      try {
        opacity = opacityProp ? opacityProp.value : 100;
        if (opacity <= 0) continue;
        val = colorProp.value;
        if (val && val.length >= 3) rgbs.push([val[0], val[1], val[2]]);
      } catch (eRead2) {}
    }
    return rgbs;
  }

  function collectLayerColorRgbs(layer, includeStroke) {
    var rgbs = collectLayerFillRgbs(layer);
    var i;
    var strokeRgbs;
    if (includeStroke) {
      strokeRgbs = collectLayerStrokeRgbs(layer);
      for (i = 0; i < strokeRgbs.length; i++) rgbs.push(strokeRgbs[i]);
    }
    return rgbs;
  }

  function clusterColorChips(samples) {
    var chips = [];
    var i;
    var j;
    var sample;
    var best;
    var bestDist;
    var dist;
    samples.sort(function (a, b) {
      return b.area - a.area;
    });
    for (i = 0; i < samples.length; i++) {
      sample = samples[i];
      best = -1;
      bestDist = 1e9;
      for (j = 0; j < chips.length; j++) {
        if (!canMergeChips(sample.rgb, chips[j].rgb)) continue;
        dist = rgbDistance(sample.rgb, chips[j].rgb);
        if (dist < bestDist) {
          bestDist = dist;
          best = j;
        }
      }
      if (best >= 0) {
        chips[best].area += sample.area;
      } else {
        chips.push({
          rgb: [sample.rgb[0], sample.rgb[1], sample.rgb[2]],
          hex: colorKey(sample.rgb),
          area: sample.area,
          neutral: isNeutralRgb(sample.rgb)
        });
      }
    }
    chips.sort(function (a, b) {
      var ha = rgbToHsv(a.rgb[0], a.rgb[1], a.rgb[2]);
      var hb = rgbToHsv(b.rgb[0], b.rgb[1], b.rgb[2]);
      var aNeutral = isNeutralRgb(a.rgb);
      var bNeutral = isNeutralRgb(b.rgb);
      if (aNeutral !== bNeutral) return aNeutral ? 1 : -1;
      if (aNeutral && bNeutral) return hb.v - ha.v;
      if (Math.abs(ha.h - hb.h) > 0.5) return ha.h - hb.h;
      if (Math.abs(ha.v - hb.v) > 0.001) return hb.v - ha.v;
      return hb.s - ha.s;
    });
    return chips;
  }

  function captureColorsFromSelectedShapes(opts) {
    opts = opts || {};
    var comp = opts.comp || app.project.activeItem;
    var includeStroke = opts.includeStroke !== false;
    var time;
    var shapes;
    var samples = [];
    var i;
    var j;
    var rgbs;
    var area;
    var share;
    var chips;
    var colors = [];
    if (!comp || !(comp instanceof CompItem)) {
      throw new Error("활성 컴프가 필요합니다.");
    }
    time = typeof opts.time === "number" ? opts.time : comp.time;
    shapes = layersFromOpts(comp, opts);
    if (!shapes.length) {
      return {
        ok: false,
        colors: [],
        fillCount: 0,
        layerCount: 0,
        chipCount: 0,
        message: "타임라인에서 Shape Layer를 선택하세요."
      };
    }
    for (i = 0; i < shapes.length; i++) {
      rgbs = collectLayerColorRgbs(shapes[i], includeStroke);
      if (!rgbs.length) continue;
      area = layerPathArea(shapes[i], time);
      if (!(area > 0)) area = 1;
      share = area / rgbs.length;
      for (j = 0; j < rgbs.length; j++) {
        samples.push({ rgb: rgbs[j], area: share });
      }
    }
    if (!samples.length) {
      return {
        ok: false,
        colors: [],
        fillCount: 0,
        layerCount: shapes.length,
        chipCount: 0,
        message: "선택한 Shape Layer에 Fill/Stroke 색이 없습니다."
      };
    }
    chips = clusterColorChips(samples);
    for (i = 0; i < chips.length; i++) colors.push(chips[i].hex);
    return {
      ok: true,
      colors: colors,
      fillCount: samples.length,
      layerCount: shapes.length,
      chipCount: colors.length,
      message: "Captured " + colors.length + " color chips from " + shapes.length + " layers"
    };
  }

  $.global.applyColorPaletteToShapes = applyColorPaletteToShapes;
  $.global.applyColorPaletteToSelectedShapes = applyColorPaletteToShapes;
  $.global.captureColorsFromSelectedShapes = captureColorsFromSelectedShapes;
  $.global.colorPaletteApplyHelpers = {
    hexToRgb: hexToRgb,
    colorKey: colorKey,
    layerPathArea: layerPathArea,
    colorIndexForRank: colorIndexForRank
  };

  if ($.global.colorPaletteApplyRequest) {
    $.global.colorPaletteApplyResult = applyColorPaletteToShapes(
      $.global.colorPaletteApplyRequest
    );
  }
})();
