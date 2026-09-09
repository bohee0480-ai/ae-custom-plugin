(function () {
  var p = typeof GRID_LAYOUT_PARAMS !== "undefined" && GRID_LAYOUT_PARAMS
    ? GRID_LAYOUT_PARAMS
    : {};
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    throw new Error("활성 컴프가 없습니다.");
  }

  function numberOr(value, fallback) {
    return value === null || value === undefined ? fallback : Number(value);
  }

  function color3(value, fallback) {
    var c = value && value.length >= 3 ? value : fallback;
    return [
      Math.max(0, Math.min(1, Number(c[0]))),
      Math.max(0, Math.min(1, Number(c[1]))),
      Math.max(0, Math.min(1, Number(c[2])))
    ];
  }

  function sameColor(a, b) {
    return (
      Math.abs(a[0] - b[0]) < 0.0001 &&
      Math.abs(a[1] - b[1]) < 0.0001 &&
      Math.abs(a[2] - b[2]) < 0.0001
    );
  }

  function colorAllowed(color, palette) {
    if (!palette || palette.length === 0) return true;
    var i;
    for (i = 0; i < palette.length; i++) {
      if (sameColor(color, color3(palette[i], [0, 0, 0]))) return true;
    }
    return false;
  }

  function clearKeys(prop) {
    var k;
    if (!prop || prop.numKeys < 1) return;
    for (k = prop.numKeys; k >= 1; k--) prop.removeKey(k);
  }

  function makeRandom(seed) {
    var state = seed % 2147483647;
    if (state <= 0) state += 2147483646;
    return function () {
      state = (state * 16807) % 2147483647;
      return (state - 1) / 2147483646;
    };
  }

  function shuffleInPlace(arr, seed) {
    var rnd = makeRandom(seed);
    var i;
    for (i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }

  function prepareStaticProperty(prop, label, allowClear) {
    if (!prop) throw new Error(label + " 속성이 없습니다.");
    if (prop.numKeys > 0) {
      if (!allowClear) throw new Error(label + "에 키프레임이 있습니다.");
      clearKeys(prop);
    }
    if (prop.expressionEnabled || prop.expression) {
      if (!allowClear) throw new Error(label + "에 Expression이 있습니다.");
      prop.expression = "";
    }
  }

  function getRect(layer, useExtent) {
    var rect = null;
    var extent = useExtent === true;
    try {
      rect = layer.sourceRectAtTime(comp.time, extent);
    } catch (eRect) {}
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      var width = 0;
      var height = 0;
      try {
        width = Number(layer.width);
        height = Number(layer.height);
      } catch (eSize) {}
      if (width <= 0 || height <= 0) {
        throw new Error(layer.name + "의 바운딩 박스를 계산할 수 없습니다.");
      }
      rect = { left: 0, top: 0, width: width, height: height };
    }
    return rect;
  }

  function getVisualBounds(layer) {
    var tr = layer.property("ADBE Transform Group");
    var pos = tr.property("ADBE Position").value;
    var scale = tr.property("ADBE Scale").value;
    var anchor = tr.property("ADBE Anchor Point").value;
    var rect = getRect(layer, true);
    var sx = scale[0] / 100;
    var sy = scale[1] / 100;
    var left = pos[0] + (rect.left - anchor[0]) * sx;
    var top = pos[1] + (rect.top - anchor[1]) * sy;
    var width = rect.width * Math.abs(sx);
    var height = rect.height * Math.abs(sy);
    return {
      left: left,
      top: top,
      right: left + width,
      bottom: top + height,
      width: width,
      height: height,
      cx: left + width / 2,
      cy: top + height / 2
    };
  }

  function ensureSafe2D(layer, allowClear) {
    if (layer.threeDLayer) {
      throw new Error(layer.name + ": 3D 레이어는 지원하지 않습니다.");
    }
    if (layer.parent !== null) {
      throw new Error(layer.name + ": 부모가 있는 레이어는 지원하지 않습니다.");
    }
    var tr = layer.property("ADBE Transform Group");
    if (!tr) throw new Error(layer.name + ": Transform이 없는 레이어입니다.");
    var pos = tr.property("ADBE Position");
    var scale = tr.property("ADBE Scale");
    var rotation = tr.property("ADBE Rotate Z");
    if (pos && pos.isSeparationLeader && pos.dimensionsSeparated) {
      throw new Error(layer.name + ": Position 차원 분리 레이어는 지원하지 않습니다.");
    }
    if (rotation && Math.abs(rotation.value) > 0.001) {
      throw new Error(layer.name + ": 회전된 레이어는 셀 fit 대상에서 제외됩니다.");
    }
    prepareStaticProperty(pos, layer.name + " Position", allowClear);
    prepareStaticProperty(scale, layer.name + " Scale", allowClear);
  }

  function normalizeAnchorToRectCenter(layer, allowClear) {
    var tr = layer.property("ADBE Transform Group");
    var anchorProp = tr.property("ADBE Anchor Point");
    var posProp = tr.property("ADBE Position");
    var scaleProp = tr.property("ADBE Scale");
    prepareStaticProperty(anchorProp, layer.name + " Anchor Point", allowClear);
    var rect = getRect(layer, false);
    var oldA = anchorProp.value;
    var newA = [
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      oldA.length > 2 ? oldA[2] : 0
    ];
    var pos = posProp.value;
    var sc = scaleProp.value;
    posProp.setValue([
      pos[0] + (newA[0] - oldA[0]) * sc[0] / 100,
      pos[1] + (newA[1] - oldA[1]) * sc[1] / 100,
      pos.length > 2 ? pos[2] : 0
    ]);
    anchorProp.setValue(newA);
  }

  function setLayerIntoCell(layer, cx, cy, cellW, cellH, fitMode, preserveAspect, opacity, allowClear) {
    ensureSafe2D(layer, allowClear);
    var tr = layer.property("ADBE Transform Group");
    var scaleProp = tr.property("ADBE Scale");
    var posProp = tr.property("ADBE Position");

    if (fitMode === "none") {
      normalizeAnchorToRectCenter(layer, allowClear);
      posProp.setValue([cx, cy, posProp.value.length > 2 ? posProp.value[2] : 0]);
      if (opacity !== null && opacity !== undefined) {
        var opacityPropNone = tr.property("ADBE Opacity");
        prepareStaticProperty(opacityPropNone, layer.name + " Opacity", allowClear);
        opacityPropNone.setValue(Math.max(0, Math.min(100, Number(opacity))));
      }
      return;
    }

    // Measure from a neutral 100% scale so existing transform does not skew fit.
    scaleProp.setValue([100, 100]);
    var rect = getRect(layer, false);
    var baseW = rect.width;
    var baseH = rect.height;
    var sx;
    var sy;

    if (!preserveAspect || fitMode === "fill") {
      sx = (cellW / baseW) * 100;
      sy = (cellH / baseH) * 100;
    } else {
      var scaleRatio =
        fitMode === "cover"
          ? Math.max(cellW / baseW, cellH / baseH)
          : Math.min(cellW / baseW, cellH / baseH);
      sx = scaleRatio * 100;
      sy = scaleRatio * 100;
    }

    scaleProp.setValue([sx, sy]);
    normalizeAnchorToRectCenter(layer, allowClear);
    posProp.setValue([cx, cy, posProp.value.length > 2 ? posProp.value[2] : 0]);

    if (opacity !== null && opacity !== undefined) {
      var opacityProp = tr.property("ADBE Opacity");
      prepareStaticProperty(opacityProp, layer.name + " Opacity", allowClear);
      opacityProp.setValue(Math.max(0, Math.min(100, Number(opacity))));
    }
  }

  function normalizedPath(points, width, height) {
    var minX = 1e99;
    var maxX = -1e99;
    var minY = 1e99;
    var maxY = -1e99;
    var i;
    for (i = 0; i < points.length; i++) {
      minX = Math.min(minX, points[i][0]);
      maxX = Math.max(maxX, points[i][0]);
      minY = Math.min(minY, points[i][1]);
      maxY = Math.max(maxY, points[i][1]);
    }
    var vertices = [];
    var inTangents = [];
    var outTangents = [];
    for (i = 0; i < points.length; i++) {
      vertices.push([
        ((points[i][0] - minX) / (maxX - minX) - 0.5) * width,
        ((points[i][1] - minY) / (maxY - minY) - 0.5) * height
      ]);
      inTangents.push([0, 0]);
      outTangents.push([0, 0]);
    }
    var shape = new Shape();
    shape.vertices = vertices;
    shape.inTangents = inTangents;
    shape.outTangents = outTangents;
    shape.closed = true;
    return shape;
  }

  function radialPoints(count, innerRatio) {
    var points = [];
    var total = innerRatio === null ? count : count * 2;
    var i;
    for (i = 0; i < total; i++) {
      var angle = -Math.PI / 2 + (Math.PI * 2 * i) / total;
      var radius = innerRatio !== null && i % 2 === 1 ? innerRatio : 1;
      points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
    return points;
  }

  function createShapeLayer(name, shapeKind, width, height, style, marker) {
    var layer = comp.layers.addShape();
    layer.name = name;
    layer.comment = marker;
    var root = layer.property("ADBE Root Vectors Group");
    var group = root.addProperty("ADBE Vector Group");
    group.name = "Grid Shape";
    var vectors = group.property("ADBE Vectors Group");
    var shapeProp;
    var roundness = Math.max(0, style.roundness || 0);

    if (shapeKind === "circle" || shapeKind === "ellipse") {
      shapeProp = vectors.addProperty("ADBE Vector Shape - Ellipse");
      shapeProp.property("ADBE Vector Ellipse Position").setValue([0, 0]);
      shapeProp.property("ADBE Vector Ellipse Size").setValue([width, height]);
    } else if (shapeKind === "square" || shapeKind === "rectangle") {
      shapeProp = vectors.addProperty("ADBE Vector Shape - Rect");
      shapeProp.property("ADBE Vector Rect Position").setValue([0, 0]);
      shapeProp.property("ADBE Vector Rect Size").setValue([width, height]);
      shapeProp
        .property("ADBE Vector Rect Roundness")
        .setValue(roundness);
    } else {
      var points;
      if (shapeKind === "triangle") points = radialPoints(3, null);
      else if (shapeKind === "star") points = radialPoints(5, 0.45);
      else if (shapeKind === "hexagon") points = radialPoints(6, null);
      else throw new Error("지원하지 않는 shape: " + shapeKind);
      shapeProp = vectors.addProperty("ADBE Vector Shape - Group");
      shapeProp
        .property("ADBE Vector Shape")
        .setValue(normalizedPath(points, width, height));
    }

    if (style.fillEnabled) {
      var fill = vectors.addProperty("ADBE Vector Graphic - Fill");
      fill.property("ADBE Vector Fill Color").setValue(style.fillColor);
      fill.property("ADBE Vector Fill Opacity").setValue(style.fillOpacity);
    }
    if (style.strokeEnabled && style.strokeWidth > 0) {
      var stroke = vectors.addProperty("ADBE Vector Graphic - Stroke");
      stroke.property("ADBE Vector Stroke Color").setValue(style.strokeColor);
      stroke.property("ADBE Vector Stroke Opacity").setValue(style.strokeOpacity);
      stroke.property("ADBE Vector Stroke Width").setValue(style.strokeWidth);
    }
    layer.property("ADBE Transform Group").property("ADBE Opacity").setValue(style.opacity);
    return layer;
  }

  function resolveRandomShape(seed, index, cellSize) {
    var pool = [
      { kind: "circle", roundness: 0 },
      { kind: "rectangle", roundness: 0 },
      { kind: "rectangle", roundness: Math.min(Math.max(4, cellSize * 0.22), 48) },
      { kind: "triangle", roundness: 0 },
      { kind: "star", roundness: 0 },
      { kind: "hexagon", roundness: 0 }
    ];
    var rnd = makeRandom(Math.floor(numberOr(seed, 12345)) + index * 9973);
    return pool[Math.floor(rnd() * pool.length)];
  }

  function targetShapeSize(shapeKind, fitMode, cellW, cellH, sourceW, sourceH) {
    if (fitMode === "fill") return [cellW, cellH];
    var ratio = Math.min(cellW / sourceW, cellH / sourceH);
    return [sourceW * ratio, sourceH * ratio];
  }

  function mergedSlotBounds(row0, col0, rowSpan, colSpan, cols, rows, cellW, cellH, gapX, gapY, centerX, centerY) {
    var left =
      centerX +
      (col0 - (cols - 1) / 2) * (cellW + gapX) -
      cellW / 2;
    var right =
      centerX +
      (col0 + colSpan - 1 - (cols - 1) / 2) * (cellW + gapX) +
      cellW / 2;
    var top =
      centerY +
      (row0 - (rows - 1) / 2) * (cellH + gapY) -
      cellH / 2;
    var bottom =
      centerY +
      (row0 + rowSpan - 1 - (rows - 1) / 2) * (cellH + gapY) +
      cellH / 2;
    return {
      left: left,
      top: top,
      right: right,
      bottom: bottom,
      width: right - left,
      height: bottom - top,
      cx: (left + right) / 2,
      cy: (top + bottom) / 2
    };
  }

  function buildPlacements(cols, rows, spanOverrides) {
    var occupied = [];
    var placements = [];
    var r;
    var c;
    var i;

    for (r = 0; r < rows; r++) {
      occupied[r] = [];
      for (c = 0; c < cols; c++) occupied[r][c] = false;
    }

    function fits(row0, col0, rowSpan, colSpan) {
      if (row0 < 0 || col0 < 0 || row0 + rowSpan > rows || col0 + colSpan > cols) {
        return false;
      }
      var rr;
      var cc;
      for (rr = row0; rr < row0 + rowSpan; rr++) {
        for (cc = col0; cc < col0 + colSpan; cc++) {
          if (occupied[rr][cc]) return false;
        }
      }
      return true;
    }

    function mark(row0, col0, rowSpan, colSpan) {
      var rr;
      var cc;
      for (rr = row0; rr < row0 + rowSpan; rr++) {
        for (cc = col0; cc < col0 + colSpan; cc++) occupied[rr][cc] = true;
      }
      placements.push({
        row: row0,
        col: col0,
        rowSpan: rowSpan,
        colSpan: colSpan
      });
    }

    var overrides = spanOverrides || [];
    for (i = 0; i < overrides.length; i++) {
      var o = overrides[i];
      var row0 = Math.floor(numberOr(o.row, 1)) - 1;
      var col0 = Math.floor(numberOr(o.col, 1)) - 1;
      var rowSpan = Math.max(1, Math.floor(numberOr(o.rowSpan, numberOr(o.rows, 1))));
      var colSpan = Math.max(1, Math.floor(numberOr(o.colSpan, numberOr(o.cols, 1))));
      if (!fits(row0, col0, rowSpan, colSpan)) {
        throw new Error(
          "span 겹침 또는 범위 초과: r" +
            (row0 + 1) +
            "_c" +
            (col0 + 1) +
            " span=" +
            rowSpan +
            "x" +
            colSpan
        );
      }
      mark(row0, col0, rowSpan, colSpan);
    }

    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        if (!occupied[r][c]) mark(r, c, 1, 1);
      }
    }

    return placements;
  }

  function placementName(prefix, placement) {
    var name =
      prefix +
      "r" +
      (placement.row + 1) +
      "_c" +
      (placement.col + 1);
    if (placement.rowSpan > 1 || placement.colSpan > 1) {
      name += "_s" + placement.rowSpan + "x" + placement.colSpan;
    }
    return name;
  }

  function slotFromCenter(cx, cy, cellW, cellH) {
    return {
      left: cx - cellW / 2,
      top: cy - cellH / 2,
      right: cx + cellW / 2,
      bottom: cy + cellH / 2,
      width: cellW,
      height: cellH,
      cx: cx,
      cy: cy
    };
  }

  function measureCellFromSources(sources) {
    var maxW = 0;
    var maxH = 0;
    var i;
    for (i = 0; i < sources.length; i++) {
      var bounds = getVisualBounds(sources[i]);
      maxW = Math.max(maxW, bounds.width);
      maxH = Math.max(maxH, bounds.height);
    }
    return { cellW: maxW, cellH: maxH };
  }

  function resolveRowCounts(p, rows) {
    if (p.rowCounts && p.rowCounts.length) {
      return p.rowCounts;
    }
    var layoutMode = p.layoutMode || "grid";
    if (layoutMode === "honeycomb") layoutMode = "brick";
    if (layoutMode !== "brick") return null;
    var startCols = Math.floor(numberOr(p.brickStartCols, 4));
    var altCols = Math.floor(numberOr(p.brickAlternateCols, 5));
    var n = Math.floor(numberOr(p.rows, rows));
    var counts = [];
    var r;
    for (r = 0; r < n; r++) {
      counts.push(r % 2 === 0 ? startCols : altCols);
    }
    return counts;
  }

  function buildBrickPlacements(rowCounts, cellW, cellH, gapX, gapY, centerX, centerY, offsetRatio) {
    var placements = [];
    var numRows = rowCounts.length;
    var maxCols = 0;
    var r;
    var c;
    for (r = 0; r < numRows; r++) {
      if (rowCounts[r] > maxCols) maxCols = rowCounts[r];
    }
    var stepX = cellW + gapX;
    var stepY = cellH + gapY;
    var offsetX = cellW * numberOr(offsetRatio, 0.5);
    var anchorWidth = maxCols * cellW + (maxCols - 1) * gapX;
    var anchorLeft = centerX - anchorWidth / 2;
    var baseCx = anchorLeft + cellW / 2;

    for (r = 0; r < numRows; r++) {
      var count = rowCounts[r];
      var staggered = count < maxCols;
      var cy = centerY + (r - (numRows - 1) / 2) * stepY;
      for (c = 0; c < count; c++) {
        var cx = baseCx + c * stepX;
        if (staggered) cx += offsetX;
        placements.push({
          row: r,
          col: c,
          rowSpan: 1,
          colSpan: 1,
          cx: cx,
          cy: cy,
          staggered: staggered
        });
      }
    }
    return placements;
  }

  function calibrateCenterFromReferenceBrick(referenceCell, rowCounts, cellW, cellH, gapX, gapY, offsetRatio) {
    var refRow = Math.floor(numberOr(referenceCell.row, 1)) - 1;
    var refCol = Math.floor(numberOr(referenceCell.col, 1)) - 1;
    var trial = buildBrickPlacements(rowCounts, cellW, cellH, gapX, gapY, 0, 0, offsetRatio);
    var i;
    for (i = 0; i < trial.length; i++) {
      if (trial[i].row === refRow && trial[i].col === refCol) {
        return {
          centerX: Number(referenceCell.x) - trial[i].cx,
          centerY: Number(referenceCell.y) - trial[i].cy
        };
      }
    }
    throw new Error("referenceCell row/col이 rowCounts 범위 밖입니다.");
  }

  var mode = p.mode || "create";
  var layoutMode = p.layoutMode || "grid";
  if (layoutMode === "honeycomb") layoutMode = "brick";
  var cols = Math.floor(numberOr(p.cols, 6));
  var rows = Math.floor(numberOr(p.rows, 7));
  var brickOffset = numberOr(p.brickOffset, 0.5);
  var rowCounts = resolveRowCounts(p, rows);
  var gap = numberOr(p.gap, 12);
  var gapX = numberOr(p.gapX, gap);
  var gapY = numberOr(p.gapY, gap);
  var prefix = p.prefix || "ae_grid_";
  var marker = "ae-grid-layout:" + prefix;
  var fitMode = p.fitMode || "contain";
  var preserveAspect = p.preserveAspect !== false;
  var duplicateSelected = p.duplicateSelected !== false;
  var randomizeSelection = p.randomizeSelection === true;
  var randomSeed = Math.floor(numberOr(p.randomSeed, 12345));
  var allowClear = p.clearTransformAnimation === true;
  var selectedSources = [];
  var i;

  if (layoutMode === "brick") {
    if (!rowCounts || rowCounts.length < 1) {
      throw new Error("brick/honeycomb layout에는 rowCounts 또는 rows+brickStartCols가 필요합니다.");
    }
    rows = rowCounts.length;
    cols = 0;
    var rc;
    for (rc = 0; rc < rowCounts.length; rc++) {
      if (rowCounts[rc] < 1) throw new Error("rowCounts[" + rc + "]는 1 이상이어야 합니다.");
      if (rowCounts[rc] > cols) cols = rowCounts[rc];
    }
  } else if (cols < 1 || rows < 1) {
    throw new Error("cols/rows는 1 이상이어야 합니다.");
  }
  if (gapX < 0 || gapY < 0) {
    throw new Error("gapX/gapY는 0 이상이어야 합니다.");
  }
  if (fitMode !== "contain" && fitMode !== "fill" && fitMode !== "cover" && fitMode !== "none") {
    throw new Error("fitMode는 contain, fill, cover, none 중 하나여야 합니다.");
  }

  if (mode === "selected") {
    var selected = comp.selectedLayers;
    for (i = 0; i < selected.length; i++) {
      if (selected[i].comment !== marker) selectedSources.push(selected[i]);
    }
    if (selectedSources.length < 1) {
      throw new Error("selected 모드에서는 원본 레이어를 하나 이상 선택하세요.");
    }
    if (randomizeSelection && selectedSources.length > 1) {
      shuffleInPlace(selectedSources, randomSeed);
    }
  }

  for (i = comp.numLayers; i >= 1; i--) {
    var oldLayer = comp.layer(i);
    if (
      oldLayer &&
      oldLayer.name.indexOf(prefix) === 0 &&
      (oldLayer.comment === marker || !oldLayer.comment)
    ) {
      oldLayer.remove();
    }
  }

  var defaultSize = numberOr(p.size, 135);
  var cellW = numberOr(p.cellWidth, 0);
  var cellH = numberOr(p.cellHeight, 0);
  if (mode === "create") {
    if (cellW <= 0) cellW = numberOr(p.shapeWidth, defaultSize);
    if (cellH <= 0) cellH = numberOr(p.shapeHeight, defaultSize);
  } else if (cellW <= 0 || cellH <= 0) {
    if (p.cellFromSelection !== false && selectedSources.length > 0) {
      var measuredCell = measureCellFromSources(selectedSources);
      if (cellW <= 0) cellW = measuredCell.cellW;
      if (cellH <= 0) cellH = measuredCell.cellH;
    } else {
      var maxW = 0;
      var maxH = 0;
      for (i = 0; i < selectedSources.length; i++) {
        var sourceRect = getRect(selectedSources[i]);
        var sourceScale = selectedSources[i]
          .property("ADBE Transform Group")
          .property("ADBE Scale").value;
        maxW = Math.max(maxW, sourceRect.width * Math.abs(sourceScale[0]) / 100);
        maxH = Math.max(maxH, sourceRect.height * Math.abs(sourceScale[1]) / 100);
      }
      if (cellW <= 0) cellW = maxW;
      if (cellH <= 0) cellH = maxH;
    }
  }
  if (cellW <= 0 || cellH <= 0) {
    throw new Error("cellWidth와 cellHeight는 0보다 커야 합니다.");
  }

  var centerX = numberOr(p.centerX, comp.width / 2);
  var centerY = numberOr(p.centerY, comp.height / 2);
  if (p.referenceCell && p.referenceCell.row && p.referenceCell.col) {
    if (layoutMode === "brick") {
      var brickRef = calibrateCenterFromReferenceBrick(
        p.referenceCell,
        rowCounts,
        cellW,
        cellH,
        gapX,
        gapY,
        brickOffset
      );
      if (p.referenceCell.x !== null && p.referenceCell.x !== undefined) {
        centerX = brickRef.centerX;
      }
      if (p.referenceCell.y !== null && p.referenceCell.y !== undefined) {
        centerY = brickRef.centerY;
      }
    } else {
      var refRow = Math.floor(numberOr(p.referenceCell.row, 1)) - 1;
      var refCol = Math.floor(numberOr(p.referenceCell.col, 1)) - 1;
      if (p.referenceCell.x !== null && p.referenceCell.x !== undefined) {
        centerX =
          Number(p.referenceCell.x) -
          (refCol - (cols - 1) / 2) * (cellW + gapX);
      }
      if (p.referenceCell.y !== null && p.referenceCell.y !== undefined) {
        centerY =
          Number(p.referenceCell.y) -
          (refRow - (rows - 1) / 2) * (cellH + gapY);
      }
    }
  }
  var spanOverrides = layoutMode === "brick" ? null : (p.spanOverrides || null);
  var placements =
    layoutMode === "brick"
      ? buildBrickPlacements(
          rowCounts,
          cellW,
          cellH,
          gapX,
          gapY,
          centerX,
          centerY,
          brickOffset
        )
      : buildPlacements(cols, rows, spanOverrides);

  if (p.activeCells && p.activeCells.length > 0) {
    var allowMap = {};
    var aci;
    for (aci = 0; aci < p.activeCells.length; aci++) {
      var ac = p.activeCells[aci];
      var rk = Math.floor(numberOr(ac.row, 1)) - 1;
      var ck = Math.floor(numberOr(ac.col, 1)) - 1;
      allowMap[rk + ":" + ck] = true;
    }
    var filtered = [];
    for (aci = 0; aci < placements.length; aci++) {
      var pl = placements[aci];
      if (
        pl.rowSpan === 1 &&
        pl.colSpan === 1 &&
        allowMap[pl.row + ":" + pl.col] === true
      ) {
        filtered.push(pl);
      }
    }
    if (filtered.length === 0) {
      throw new Error("activeCells에 해당하는 1×1 셀이 없습니다.");
    }
    placements = filtered;
  }

  var itemCount = placements.length;
  if (mode === "selected" && !duplicateSelected && selectedSources.length !== itemCount) {
    throw new Error(
      "duplicateSelected=false이면 선택 레이어 수가 배치 수와 같아야 합니다. selected=" +
        selectedSources.length +
        " placements=" +
        itemCount
    );
  }

  var palette = p.palette || null;
  var style = {
    fillEnabled: p.fillEnabled !== false,
    fillColor: color3(p.fillColor, [0, 0, 0]),
    fillOpacity: Math.max(0, Math.min(100, numberOr(p.fillOpacity, 100))),
    strokeEnabled: p.strokeEnabled === true || numberOr(p.strokeWidth, 0) > 0,
    strokeColor: color3(p.strokeColor, [0, 0, 0]),
    strokeOpacity: Math.max(0, Math.min(100, numberOr(p.strokeOpacity, 100))),
    strokeWidth: Math.max(0, numberOr(p.strokeWidth, 0)),
    opacity: Math.max(0, Math.min(100, numberOr(p.opacity, 100))),
    roundness: Math.max(0, numberOr(p.roundness, 0))
  };
  if (style.fillEnabled && !colorAllowed(style.fillColor, palette)) {
    throw new Error("fillColor가 지정 팔레트에 없습니다.");
  }
  if (style.strokeEnabled && !colorAllowed(style.strokeColor, palette)) {
    throw new Error("strokeColor가 지정 팔레트에 없습니다.");
  }

  var shapeKind = p.shape || "circle";
  var randomSeed = Math.floor(numberOr(p.randomSeed, 12345));
  var sourceShapeW =
    shapeKind === "rectangle"
      ? numberOr(p.shapeWidth, cellW)
      : numberOr(p.shapeWidth, defaultSize);
  var sourceShapeH =
    shapeKind === "rectangle"
      ? numberOr(p.shapeHeight, cellH)
      : numberOr(p.shapeHeight, defaultSize);

  var created = 0;
  var pi;
  for (pi = 0; pi < placements.length; pi++) {
    var placement = placements[pi];
    var slot =
      placement.cx !== undefined && placement.cy !== undefined
        ? slotFromCenter(placement.cx, placement.cy, cellW, cellH)
        : mergedSlotBounds(
            placement.row,
            placement.col,
            placement.rowSpan,
            placement.colSpan,
            cols,
            rows,
            cellW,
            cellH,
            gapX,
            gapY,
            centerX,
            centerY
          );
    var itemShapeKind = shapeKind;
    var itemStyle = {
      fillEnabled: style.fillEnabled,
      fillColor: style.fillColor,
      fillOpacity: style.fillOpacity,
      strokeEnabled: style.strokeEnabled,
      strokeColor: style.strokeColor,
      strokeOpacity: style.strokeOpacity,
      strokeWidth: style.strokeWidth,
      opacity: style.opacity,
      roundness: style.roundness
    };
    if (shapeKind === "random") {
      var picked = resolveRandomShape(randomSeed, pi, cellW);
      itemShapeKind = picked.kind;
      itemStyle.roundness = picked.roundness;
    }
    var slotShapeSize = targetShapeSize(
      itemShapeKind,
      fitMode,
      slot.width,
      slot.height,
      sourceShapeW,
      sourceShapeH
    );
    var name = placementName(prefix, placement);
    var target;

    if (mode === "create") {
      target = createShapeLayer(
        name,
        itemShapeKind,
        slotShapeSize[0],
        slotShapeSize[1],
        itemStyle,
        marker
      );
        var createPos = target.property("ADBE Transform Group").property("ADBE Position");
        normalizeAnchorToRectCenter(target, false);
        createPos.setValue([slot.cx, slot.cy, createPos.value.length > 2 ? createPos.value[2] : 0]);
    } else {
      var source = selectedSources[created % selectedSources.length];
      target = duplicateSelected ? source.duplicate() : source;
      if (duplicateSelected) {
        target.name = name;
        target.comment = marker;
      }
      setLayerIntoCell(
        target,
        slot.cx,
        slot.cy,
        slot.width,
        slot.height,
        fitMode,
        preserveAspect,
        p.opacity,
        allowClear || duplicateSelected
      );
    }
    created++;
  }

  GRID_LAYOUT_LAST_COUNT = created;

  if (typeof log === "function") {
    log(
      "ae grid applied: mode=" +
        mode +
        " layout=" +
        layoutMode +
        " count=" +
        created +
        " grid=" +
        cols +
        "x" +
        rows +
        " cell=" +
        cellW.toFixed(2) +
        "x" +
        cellH.toFixed(2) +
        " gap=" +
        gapX +
        "x" +
        gapY +
        " center=[" +
        centerX +
        "," +
        centerY +
        "] fit=" +
        fitMode +
        " randomizeSelection=" +
        randomizeSelection +
        " spanOverrides=" +
        (spanOverrides ? spanOverrides.length : 0) +
        (layoutMode === "brick" ? " rowCounts=" + rowCounts.join(",") : "")
    );
  }
})();
