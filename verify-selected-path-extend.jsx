(function () {
  var last = typeof SHAPE_PATH_EXTEND_LAST === "object" && SHAPE_PATH_EXTEND_LAST ? SHAPE_PATH_EXTEND_LAST : null;
  if (!last || !last.ok) throw new Error("패스 연장 결과가 없습니다.");

  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) throw new Error("활성 컴포지션이 없습니다.");

  var targets = $.global.collectSelectedShapePaths(comp);
  if (targets.length < 1) throw new Error("검증할 Path가 선택되어 있지 않습니다.");

  var shape = targets[0].pathProp.value;
  if (shape.closed) throw new Error("연장은 열린 패스만 가능합니다.");
  if (shape.vertices.length !== last.vertsAfter) {
    throw new Error("정점 수 불일치: " + shape.vertices.length + " vs " + last.vertsAfter);
  }
  if (shape.vertices.length <= last.vertsBefore) {
    throw new Error("정점이 늘어나지 않았습니다.");
  }

  last.verified = true;
  log("path-extend verify OK verts=" + shape.vertices.length);
})();
