/**
 * mask-reveal branch B + B-exit on selected Path properties.
 * End 0→100 (draw on), then Start 0→100 (same-direction wipe). End stays 100.
 * PARAMS: duration, hold, startTime, easeInfluence
 */
(function () {
  var P = typeof PARAMS !== "undefined" && PARAMS ? PARAMS : {};
  var DUR = (P.duration !== undefined && P.duration !== null) ? Number(P.duration) : 0.7;
  var HOLD = (P.hold !== undefined && P.hold !== null) ? Number(P.hold) : 0.3;
  var T0 = (P.startTime !== undefined && P.startTime !== null) ? Number(P.startTime) : 0;
  var IN_INF = (P.easeInfluence !== undefined && P.easeInfluence !== null) ? Number(P.easeInfluence) : 80;

  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    throw new Error("활성 컴포지션이 없습니다.");
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

  function getOrAddTrim(vectorsGroup) {
    if (!vectorsGroup) return null;
    var i;
    for (i = 1; i <= vectorsGroup.numProperties; i++) {
      if (vectorsGroup.property(i).matchName === "ADBE Vector Filter - Trim") {
        return vectorsGroup.property(i);
      }
    }
    return vectorsGroup.addProperty("ADBE Vector Filter - Trim");
  }

  var tDraw = T0 + DUR;
  var tExit0 = tDraw + HOLD;
  var tExit1 = tExit0 + DUR;

  var applied = 0;
  var skipped = 0;
  var i;
  for (i = 0; i < paths.length; i++) {
    var vg = paths[i].vectorsGroup;
    var trim = getOrAddTrim(vg);
    if (!trim) {
      skipped++;
      continue;
    }

    var endP = trim.property("ADBE Vector Trim End");
    var startP = trim.property("ADBE Vector Trim Start");
    if (!endP || !startP) {
      skipped++;
      continue;
    }

    clearKeys(endP);
    clearKeys(startP);
    try { endP.expression = ""; } catch (e1) {}
    try { startP.expression = ""; } catch (e2) {}

    endP.setValueAtTime(T0, 0);
    endP.setValueAtTime(tDraw, 100);
    applyEase(endP);

    startP.setValueAtTime(tExit0, 0);
    startP.setValueAtTime(tExit1, 100);
    applyEase(startP);

    paths[i].layer.enabled = true;
    applied++;
    log(
      paths[i].layer.name +
        " Trim End 0→100 " +
        T0 +
        "→" +
        tDraw +
        "s | Start 0→100 " +
        tExit0 +
        "→" +
        tExit1 +
        "s"
    );
  }

  if (applied === 0) {
    throw new Error("Trim Paths를 넣을 Path가 없습니다.");
  }

  SHAPE_PATH_TRIM_LAST = {
    ok: true,
    applied: applied,
    skipped: skipped,
    duration: DUR,
    hold: HOLD,
    tDraw: tDraw,
    tExit0: tExit0,
    tExit1: tExit1,
    comp: comp.name
  };

  log("trim-paths OK applied=" + applied + " skipped=" + skipped);
})();
