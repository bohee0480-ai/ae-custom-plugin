/**
 * Objects Line Flow — selected Path properties only (no layer fallback).
 */
(function () {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    throw new Error("활성 컴포지션이 없습니다.");
  }

  var targets = $.global.collectSelectedShapePaths(comp);
  if (targets.length < 1) {
    throw new Error("타임라인에서 Path 속성을 선택하세요.");
  }

  var here = new File($.fileName).parent;
  var skill = new File(here.fsName + "/apply-objects-line-flow.jsx");
  if (!skill.exists) {
    throw new Error("missing apply-objects-line-flow.jsx");
  }

  $.evalFile(skill);

  SHAPE_PATH_FLOW_LAST = {
    ok: true,
    paths: targets.length,
    destLayer: targets[0].layer.name,
    comp: comp.name
  };

  log("path-flow OK selectedPaths=" + targets.length);
})();
