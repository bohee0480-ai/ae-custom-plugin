/**
 * Morph selected Shape Path properties onto the first selected Path.
 * PARAMS.mode: "replace" | "append"
 * PARAMS.interval: seconds between keys (default 1)
 */
(function () {
  var P = typeof PARAMS !== "undefined" && PARAMS ? PARAMS : {};
  var MODE = String(P.mode || "replace");
  var INTERVAL = Number(P.interval);
  if (isNaN(INTERVAL) || INTERVAL <= 0) INTERVAL = 1;

  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    throw new Error("활성 컴포지션이 없습니다.");
  }

  var targets = $.global.collectSelectedShapePaths(comp);
  if (targets.length < 2) {
    throw new Error("Path 속성을 2개 이상 선택하세요. 첫 번째가 모프 대상입니다.");
  }

  var matchLib = new File($.fileName).parent.fsName + "/lib-path-morph-match.jsx";
  $.evalFile(new File(matchLib));
  var M = $.global.pathMorphMatchHelpers;
  if (!M || !M.matchVertexCount) {
    throw new Error("lib-path-morph-match missing");
  }

  function matchVertexCount(shape, targetCount) {
    return M.matchVertexCount(shape, targetCount);
  }

  function clearKeys(prop) {
    if (!prop || prop.numKeys === 0) return;
    var k;
    for (k = prop.numKeys; k >= 1; k--) {
      prop.removeKey(k);
    }
  }

  function readShape(pathProp) {
    try {
      return pathProp.valueAtTime(comp.time, false);
    } catch (e0) {
      return pathProp.value;
    }
  }

  var dest = targets[0].pathProp;
  var destLayer = targets[0].layer;
  var shapes = [];
  var i;

  for (i = 0; i < targets.length; i++) {
    shapes.push(readShape(targets[i].pathProp));
  }

  var closedRef = shapes[0].closed;
  for (i = 1; i < shapes.length; i++) {
    if (shapes[i].closed !== closedRef) {
      throw new Error(
        "열린 Path와 닫힌 Path는 함께 모프할 수 없습니다. " +
        targets[0].layer.name + "(" + (closedRef ? "닫힘" : "열림") + ") vs " +
        targets[i].layer.name + "(" + (shapes[i].closed ? "닫힘" : "열림") + "). " +
        "같은 종류(둘 다 닫힌 도형 또는 둘 다 열린 선)로 선택하세요."
      );
    }
  }

  var existing = [];
  if (MODE === "append") {
    if (dest.numKeys < 1) {
      throw new Error("이어붙이려면 대상 Path에 기존 키가 있어야 합니다. 먼저 패스 모프를 실행하세요.");
    }
    for (i = 1; i <= dest.numKeys; i++) {
      existing.push({
        time: dest.keyTime(i),
        shape: dest.keyValue(i)
      });
    }
  }

  var maxVerts = 0;
  for (i = 0; i < existing.length; i++) {
    if (existing[i].shape.vertices.length > maxVerts) {
      maxVerts = existing[i].shape.vertices.length;
    }
  }
  var startShape = MODE === "append" ? 1 : 0;
  for (i = startShape; i < shapes.length; i++) {
    if (shapes[i].vertices.length > maxVerts) {
      maxVerts = shapes[i].vertices.length;
    }
  }
  if (MODE !== "append" && shapes[0].vertices.length > maxVerts) {
    maxVerts = shapes[0].vertices.length;
  }

  clearKeys(dest);

  if (MODE === "append") {
    for (i = 0; i < existing.length; i++) {
      dest.setValueAtTime(existing[i].time, matchVertexCount(existing[i].shape, maxVerts));
    }
    var lastTime = existing[existing.length - 1].time;
    for (i = 1; i < shapes.length; i++) {
      dest.setValueAtTime(lastTime + i * INTERVAL, matchVertexCount(shapes[i], maxVerts));
    }
  } else {
    for (i = 0; i < shapes.length; i++) {
      dest.setValueAtTime(i * INTERVAL, matchVertexCount(shapes[i], maxVerts));
    }
  }

  for (i = 1; i <= dest.numKeys; i++) {
    dest.setInterpolationTypeAtKey(i, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
  }

  SHAPE_PATH_MORPH_LAST = {
    ok: true,
    mode: MODE,
    keys: dest.numKeys,
    verts: maxVerts,
    sources: targets.length,
    targetLayer: destLayer.name,
    targetPath: dest.name,
    interval: INTERVAL,
    comp: comp.name
  };

  log(
    "path-morph " + MODE +
      " keys=" + dest.numKeys +
      " verts=" + maxVerts +
      " dest=" + destLayer.name + "/" + dest.name
  );
})();
