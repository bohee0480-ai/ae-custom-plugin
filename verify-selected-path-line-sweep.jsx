/**
 * @skill line-sweep — verify extensions + Trim 4 keys + 80/80 ease
 */
(function () {
  var IN_INF = 80;
  var DUR = 0.5;
  var HOLD = 0.3;

  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    throw new Error("활성 컴포지션이 없습니다.");
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

  function findTrim(vectorsGroup) {
    var i;
    for (i = 1; i <= vectorsGroup.numProperties; i++) {
      if (vectorsGroup.property(i).matchName === "ADBE Vector Filter - Trim") {
        return vectorsGroup.property(i);
      }
    }
    return null;
  }

  function near(a, b, tol) {
    return Math.abs(Number(a) - Number(b)) <= tol;
  }

  function checkEase(prop, keyIndex) {
    var infIn = prop.keyInTemporalEase(keyIndex)[0].influence;
    var infOut = prop.keyOutTemporalEase(keyIndex)[0].influence;
    if (Math.abs(infIn - IN_INF) > 0.5 || Math.abs(infOut - IN_INF) > 0.5) {
      throw new Error("ease not 80/80 at key " + keyIndex + " (" + infIn + "/" + infOut + ")");
    }
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

  var ok = 0;
  var i;
  for (i = 0; i < paths.length; i++) {
    var layer = paths[i].layer;
      var shape = paths[i].pathProp.value;
      if (shape.closed) {
        throw new Error(layer.name + ": 패스가 아직 closed");
      }
      if (shape.vertices.length < 4) {
        throw new Error(layer.name + ": 연장 정점 부족 " + shape.vertices.length);
      }

      var trim = findTrim(paths[i].vectorsGroup);
      if (!trim) {
        throw new Error(layer.name + ": Trim Paths 없음");
      }
      var startP = trim.property("ADBE Vector Trim Start");
      var endP = trim.property("ADBE Vector Trim End");
      if (startP.numKeys !== 4 || endP.numKeys !== 4) {
        throw new Error(layer.name + ": trim keys start=" + startP.numKeys + " end=" + endP.numKeys);
      }

      if (!near(startP.keyValue(1), 0, 0.01) || !near(endP.keyValue(1), 0, 0.01)) {
        throw new Error(layer.name + ": t0 not hidden");
      }
      if (!near(startP.keyValue(4), 100, 0.01) || !near(endP.keyValue(4), 100, 0.01)) {
        throw new Error(layer.name + ": t3 not fully trimmed");
      }
      if (!near(startP.keyValue(2), startP.keyValue(3), 0.01) || !near(endP.keyValue(2), endP.keyValue(3), 0.01)) {
        throw new Error(layer.name + ": hold values mismatch");
      }
      if (endP.keyValue(2) <= startP.keyValue(2)) {
        throw new Error(layer.name + ": trailerPct <= leaderPct");
      }

      var dt01 = startP.keyTime(2) - startP.keyTime(1);
      var dt12 = startP.keyTime(3) - startP.keyTime(2);
      var dt23 = startP.keyTime(4) - startP.keyTime(3);
      if (Math.abs(dt01 - DUR) > 0.001) throw new Error(layer.name + ": enter dur != " + DUR);
      if (Math.abs(dt12 - HOLD) > 0.001) throw new Error(layer.name + ": hold != " + HOLD);
      if (Math.abs(dt23 - DUR) > 0.001) throw new Error(layer.name + ": exit dur != " + DUR);

      var k;
      for (k = 1; k <= 4; k++) {
        checkEase(startP, k);
        checkEase(endP, k);
      }

      log(
        "OK " +
          layer.name +
          " | verts=" +
          shape.vertices.length +
          " | start " +
          startP.keyValue(2) +
          " end " +
          endP.keyValue(2) +
          " | t=" +
          startP.keyTime(1) +
          "," +
          startP.keyTime(2) +
          "," +
          startP.keyTime(3) +
          "," +
          startP.keyTime(4)
      );
      ok++;
  }

  var exprErrs = [];
  var seenLayers = {};
  var li;
  for (li = 0; li < paths.length; li++) {
    if (seenLayers[paths[li].layer.index]) continue;
    seenLayers[paths[li].layer.index] = true;
    scanExprErrors(paths[li].layer, paths[li].layer.name, exprErrs);
  }
  if (exprErrs.length > 0) {
    throw new Error("Expression errors: " + exprErrs.join(" | "));
  }

  if (ok === 0) {
    throw new Error("검증할 Path가 없습니다.");
  }
  log("verify-line-sweep OK applied=" + ok);
})();
