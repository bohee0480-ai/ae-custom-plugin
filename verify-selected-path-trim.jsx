(function () {
  var last = typeof SHAPE_PATH_TRIM_LAST === "object" && SHAPE_PATH_TRIM_LAST ? SHAPE_PATH_TRIM_LAST : null;
  if (!last || !last.ok) {
    throw new Error("트림패스 결과가 없습니다.");
  }

  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    throw new Error("활성 컴포지션이 없습니다.");
  }

  var paths = $.global.collectSelectedShapePaths(comp);
  if (!paths || paths.length < 1) {
    throw new Error("검증할 Path가 선택되어 있지 않습니다.");
  }

  function findTrim(vectorsGroup) {
    if (!vectorsGroup) return null;
    var i;
    for (i = 1; i <= vectorsGroup.numProperties; i++) {
      if (vectorsGroup.property(i).matchName === "ADBE Vector Filter - Trim") {
        return vectorsGroup.property(i);
      }
    }
    return null;
  }

  var ok = 0;
  var i;
  for (i = 0; i < paths.length; i++) {
    var trim = findTrim(paths[i].vectorsGroup);
    if (!trim) throw new Error(paths[i].layer.name + ": Trim Paths 없음");

    var endP = trim.property("ADBE Vector Trim End");
    var startP = trim.property("ADBE Vector Trim Start");
    if (!endP || endP.numKeys !== 2) {
      throw new Error(paths[i].layer.name + ": End 키는 2개여야 함 (" + (endP ? endP.numKeys : 0) + ")");
    }
    if (Math.abs(endP.keyValue(1) - 0) > 0.01 || Math.abs(endP.keyValue(2) - 100) > 0.01) {
      throw new Error(paths[i].layer.name + ": End가 0→100이 아님");
    }
    if (!startP || startP.numKeys !== 2) {
      throw new Error(paths[i].layer.name + ": Start 키는 2개여야 함");
    }
    if (Math.abs(startP.keyValue(1) - 0) > 0.01 || Math.abs(startP.keyValue(2) - 100) > 0.01) {
      throw new Error(paths[i].layer.name + ": Start가 0→100이 아님");
    }
    if (startP.keyTime(1) < endP.keyTime(2) - 0.001) {
      throw new Error(paths[i].layer.name + ": 퇴장이 등장 전에 시작됨");
    }
    ok++;
  }

  if (ok !== last.applied) {
    throw new Error("적용 수 불일치: " + ok + " vs " + last.applied);
  }

  last.verified = true;
  log("trim-paths verify OK applied=" + ok);
})();
