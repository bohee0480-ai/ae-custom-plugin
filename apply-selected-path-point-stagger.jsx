/**
 * Point Stagger on selected Path(s) with >= 2 keys.
 * PARAMS.pointStagger (default 20)
 */
(function () {
  var P = typeof PARAMS !== "undefined" && PARAMS ? PARAMS : {};
  var PS = Number(P.pointStagger);
  if (isNaN(PS)) PS = 20;

  var lib = new File($.fileName).parent.fsName + "/lib-path-morph-expr.jsx";
  $.evalFile(new File(lib));
  var H = $.global.pathMorphExprHelpers;
  if (!H) throw new Error("lib-path-morph-expr missing");

  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    throw new Error("활성 컴프가 없습니다.");
  }

  var paths = $.global.collectSelectedShapePaths(comp);
  if (!paths.length) {
    throw new Error("Path 속성을 선택하세요.");
  }

  var applied = 0;
  var skipped = 0;
  var i;
  var expr = H.buildPointStaggerExpr();
  var ctrlPack = null;

  for (i = 0; i < paths.length; i++) {
    var pp = paths[i].pathProp;
    if (pp.numKeys < 2) {
      skipped++;
      continue;
    }
    H.syncPathMorphRefs(comp, pp, paths[i].layer);
    if (!ctrlPack) {
      ctrlPack = H.ensureCtrl(comp, paths[i].layer);
    }
    H.ensureSlider(ctrlPack.fx, "Point Stagger", PS);
    pp.expression = expr;
    pp.expressionEnabled = true;
    applied++;
  }

  if (applied === 0) {
    throw new Error("키 2개 이상인 Path를 선택하세요. 먼저 A→B를 실행하세요.");
  }

  SHAPE_PATH_STAGGER_LAST = {
    ok: true,
    applied: applied,
    skipped: skipped,
    pointStagger: PS,
    ctrl: H.CTRL_NAME,
    message: "포인트 스태거 " + applied + "개 Path · CTRL " + PS + "%"
  };

  log("path-point-stagger OK applied=" + applied);
})();
