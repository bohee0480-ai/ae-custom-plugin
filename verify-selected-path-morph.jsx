(function () {
  var last = typeof SHAPE_PATH_MORPH_LAST === "object" && SHAPE_PATH_MORPH_LAST ? SHAPE_PATH_MORPH_LAST : null;
  if (!last || !last.ok) {
    throw new Error("패스 모프 결과가 없습니다.");
  }

  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    throw new Error("활성 컴포지션이 없습니다.");
  }

  var targets = $.global.collectSelectedShapePaths(comp);
  if (targets.length < 1) {
    throw new Error("검증할 Path가 선택되어 있지 않습니다.");
  }

  var dest = targets[0].pathProp;
  if (dest.numKeys < 2) {
    throw new Error("대상 Path 키가 부족합니다: " + dest.numKeys);
  }
  if (dest.numKeys !== last.keys) {
    throw new Error("키 개수 불일치: " + dest.numKeys + " vs " + last.keys);
  }

  var i;
  var verts = dest.keyValue(1).vertices.length;
  for (i = 2; i <= dest.numKeys; i++) {
    if (dest.keyValue(i).vertices.length !== verts) {
      throw new Error("버텍스 수 불일치 key " + i + ": " + dest.keyValue(i).vertices.length);
    }
  }

  last.verified = true;
  last.verifyVerts = verts;
  log("path-morph verify OK keys=" + dest.numKeys + " verts=" + verts);
})();
