/**
 * Overshoot + Hold round-trip on selected Path(s) with >= 2 keys.
 */
(function () {
  var P = typeof PARAMS !== "undefined" && PARAMS ? PARAMS : {};
  var OVR = Number(P.overshoot);
  if (isNaN(OVR)) OVR = 1.70158;
  var HOLD = Number(P.hold);
  if (isNaN(HOLD)) HOLD = 2;
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
  var expr = H.buildOvershootReturnExpr();
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
    H.ensureSlider(ctrlPack.fx, "Overshoot", OVR);
    H.ensureSlider(ctrlPack.fx, "Hold", HOLD);
    pp.expression = expr;
    pp.expressionEnabled = true;
    applied++;
  }

  if (applied === 0) {
    throw new Error("키 2개 이상인 Path를 선택하세요.");
  }

  SHAPE_PATH_OVERSHOOT_LAST = {
    ok: true,
    applied: applied,
    skipped: skipped,
    overshoot: OVR,
    hold: HOLD,
    ctrl: H.CTRL_NAME,
    message: "오버슛 왕복 " + applied + "개 Path · Hold " + HOLD + "s"
  };

  log("path-overshoot-return OK applied=" + applied);
})();
