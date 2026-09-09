/**
 * A→B: exactly 2 selected Paths → 2 keys on the first Path.
 * PARAMS.interval (default 1)
 */
(function () {
  var P = typeof PARAMS !== "undefined" && PARAMS ? PARAMS : {};
  var INTERVAL = Number(P.interval);
  if (isNaN(INTERVAL) || INTERVAL <= 0) INTERVAL = 1;

  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    throw new Error("활성 컴프가 없습니다.");
  }

  var targets = $.global.collectSelectedShapePaths(comp);
  if (targets.length !== 2) {
    throw new Error("A→B는 Path를 정확히 2개 선택하세요. (A=첫 번째, B=두 번째)");
  }

  PARAMS = { mode: "replace", interval: INTERVAL };
  var morphFile = new File($.fileName).parent.fsName + "/apply-selected-path-morph.jsx";
  $.evalFile(new File(morphFile));

  if (!SHAPE_PATH_MORPH_LAST || !SHAPE_PATH_MORPH_LAST.ok) {
    throw new Error("A→B 키 생성 실패");
  }
  if (SHAPE_PATH_MORPH_LAST.keys !== 2) {
    throw new Error("A→B 키 개수 오류: " + SHAPE_PATH_MORPH_LAST.keys);
  }

  SHAPE_PATH_AB_LAST = {
    ok: true,
    keys: 2,
    interval: INTERVAL,
    targetLayer: SHAPE_PATH_MORPH_LAST.targetLayer,
    message: "A→B 2키 · " + SHAPE_PATH_MORPH_LAST.targetLayer
  };

  log("path-ab OK keys=2 interval=" + INTERVAL);
})();
