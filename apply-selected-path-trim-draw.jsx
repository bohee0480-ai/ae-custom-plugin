/**
 * Trim Paths draw-on only — End 0→100, Start=0 fixed. No exit.
 * PARAMS: duration, startTime, easeInfluence
 */
(function () {
  var P = typeof PARAMS !== "undefined" && PARAMS ? PARAMS : {};
  var DUR = (P.duration !== undefined && P.duration !== null) ? Number(P.duration) : 0.8;
  var T0 = (P.startTime !== undefined && P.startTime !== null) ? Number(P.startTime) : 0;
  var IN_INF = (P.easeInfluence !== undefined && P.easeInfluence !== null) ? Number(P.easeInfluence) : 80;

  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    throw new Error("활성 컴프가 없습니다.");
  }

  var paths = $.global.collectSelectedShapePaths(comp);
  if (!paths || paths.length < 1) {
    throw new Error("타임라인에서 Path 속성을 선택하세요.");
  }

  function applyEase(prop) {
    var k;
    for (k = 1; k <= prop.numKeys; k++) {
      prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
      prop.setTemporalEaseAtKey(k, [new KeyframeEase(0, IN_INF)], [new KeyframeEase(0, IN_INF)]);
    }
  }

  function clearKeys(prop) {
    if (!prop || prop.numKeys === 0) return;
    var k;
    for (k = prop.numKeys; k >= 1; k--) {
      prop.removeKey(k);
    }
  }

  function getOrAddTrim(vg) {
    var i;
    for (i = 1; i <= vg.numProperties; i++) {
      if (vg.property(i).matchName === "ADBE Vector Filter - Trim") {
        return vg.property(i);
      }
    }
    return vg.addProperty("ADBE Vector Filter - Trim");
  }

  var tEnd = T0 + DUR;
  var applied = 0;
  var i;

  for (i = 0; i < paths.length; i++) {
    var trim = getOrAddTrim(paths[i].vectorsGroup);
    var endP = trim.property("ADBE Vector Trim End");
    var startP = trim.property("ADBE Vector Trim Start");
    if (!endP || !startP) continue;

    clearKeys(endP);
    clearKeys(startP);
    try { endP.expression = ""; } catch (e1) {}
    try { startP.expression = ""; } catch (e2) {}

    endP.setValueAtTime(T0, 0);
    endP.setValueAtTime(tEnd, 100);
    applyEase(endP);
    startP.setValue(0);

    paths[i].layer.enabled = true;
    applied++;
  }

  if (applied === 0) {
    throw new Error("Trim Paths를 넣을 Path가 없습니다.");
  }

  SHAPE_PATH_TRIM_DRAW_LAST = {
    ok: true,
    applied: applied,
    duration: DUR,
    startTime: T0,
    message: "트림 드로잉 " + applied + "개 Path · End 0→100"
  };

  log("trim-draw OK applied=" + applied);
})();
