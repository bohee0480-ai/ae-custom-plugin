/**
 * @skill objects-line-flow
 * Verify OLF CTRL(s) + OLF Design CTRL + OLF Dot motion/style/orient/roundness.
 */
(function () {
  var DOT_PREFIX = "OLF Dot ";
  var MOTION_PREFIX = "OLF CTRL ";
  var DESIGN_NAME = "OLF Design CTRL";

  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    throw new Error("활성 컴포지션이 없습니다.");
  }

  var design = null;
  var motions = [];
  var dots = [];
  var i, ly;

  for (i = 1; i <= comp.numLayers; i++) {
    ly = comp.layer(i);
    if (ly.name === DESIGN_NAME) design = ly;
    if (ly.name.indexOf(MOTION_PREFIX) === 0) motions.push(ly);
    if (ly.name.indexOf(DOT_PREFIX) === 0) dots.push(ly);
  }

  if (!design) throw new Error("디자인 컨트롤러 없음: " + DESIGN_NAME);
  if (motions.length < 1) throw new Error("모션 컨트롤러 없음 (" + MOTION_PREFIX + "*)");
  if (dots.length < 1) throw new Error("OLF Dot 레이어 없음");

  var dfx = design.property("ADBE Effect Parade");
  var needDesign = [
    "Fill Color",
    "Stroke Color",
    "Stroke Width",
    "Path Stroke Color",
    "Path Stroke Width",
    "Roundness",
    "Orient to Path",
    "Fixed Rotation"
  ];
  for (i = 0; i < needDesign.length; i++) {
    if (!dfx.property(needDesign[i])) {
      throw new Error("Design 옵션 누락: " + needDesign[i]);
    }
  }

  for (i = 0; i < motions.length; i++) {
    var mfx = motions[i].property("ADBE Effect Parade");
    if (!mfx.property("Speed") || !mfx.property("Size") || !mfx.property("Offset")) {
      throw new Error("모션 슬라이더 누락: " + motions[i].name);
    }
  }

  var badPos = 0;
  var badSize = 0;
  var badRot = 0;
  var badFill = 0;
  var badRound = 0;
  var notShape = 0;
  var kinds = { ellipse: 0, rect: 0, star: 0, other: 0 };

  for (i = 0; i < dots.length; i++) {
    ly = dots[i];
    if (!(ly instanceof ShapeLayer)) {
      notShape++;
      continue;
    }

    if (!ly.transform.position.expression || ly.transform.position.expressionError) {
      badPos++;
    }
    if (
      !ly.transform.rotation.expression ||
      ly.transform.rotation.expression.indexOf("Orient to Path") < 0 ||
      ly.transform.rotation.expressionError
    ) {
      badRot++;
    }

    var contents = ly
      .property("ADBE Root Vectors Group")
      .property(1)
      .property("ADBE Vectors Group");

    var fill = null;
    var stroke = null;
    var rc = null;
    var shapeKind = "other";
    var j;
    for (j = 1; j <= contents.numProperties; j++) {
      var p = contents.property(j);
      var mn = p.matchName;
      if (mn === "ADBE Vector Graphic - Fill") fill = p;
      if (mn === "ADBE Vector Graphic - Stroke") stroke = p;
      if (mn === "ADBE Vector Filter - RC") rc = p;
      if (mn === "ADBE Vector Shape - Ellipse") shapeKind = "ellipse";
      if (mn === "ADBE Vector Shape - Rect") shapeKind = "rect";
      if (mn === "ADBE Vector Shape - Star") shapeKind = "star";
    }
    kinds[shapeKind]++;

    if (!fill || !fill.property("ADBE Vector Fill Color").expression) badFill++;
    else if (fill.property("ADBE Vector Fill Color").expressionError) badFill++;

    if (!stroke || !stroke.property("ADBE Vector Stroke Width").expression) badFill++;
    else if (stroke.property("ADBE Vector Stroke Width").expressionError) badFill++;

    if (!rc) {
      badRound++;
    } else {
      var rad = rc.property("ADBE Vector RoundCorner Radius");
      if (!rad.expression || rad.expression.indexOf("Roundness") < 0 || rad.expressionError) {
        badRound++;
      }
    }

    // size expr on shape primitive
    var sizeOk = false;
    if (shapeKind === "ellipse") {
      var es = contents
        .property("ADBE Vector Shape - Ellipse")
        .property("ADBE Vector Ellipse Size");
      sizeOk = es.expression && !es.expressionError;
    } else if (shapeKind === "rect") {
      var rs = contents
        .property("ADBE Vector Shape - Rect")
        .property("ADBE Vector Rect Size");
      sizeOk = rs.expression && !rs.expressionError;
    } else if (shapeKind === "star") {
      var orad = contents
        .property("ADBE Vector Shape - Star")
        .property("ADBE Vector Star Outer Radius");
      sizeOk = orad.expression && !orad.expressionError;
    }
    if (!sizeOk) badSize++;
  }

  var sample = dots[0];
  var p0 = sample.transform.position.valueAtTime(0, false);
  var p1 = sample.transform.position.valueAtTime(1, false);
  var moved =
    Math.abs(p0[0] - p1[0]) > 0.5 || Math.abs(p0[1] - p1[1]) > 0.5;

  var orientOn = dfx.property("Orient to Path").property(1).value;
  var rotChanges = false;
  if (orientOn) {
    var r0 = sample.transform.rotation.valueAtTime(0, false);
    var r1 = sample.transform.rotation.valueAtTime(0.5, false);
    rotChanges = Math.abs(r0 - r1) > 0.01;
  }

  log(
    "verify objects-line-flow: dots=" +
      dots.length +
      " motions=" +
      motions.length +
      " design=1 kinds=e" +
      kinds.ellipse +
      "/r" +
      kinds.rect +
      "/s" +
      kinds.star +
      " badPos=" +
      badPos +
      " badSize=" +
      badSize +
      " badRot=" +
      badRot +
      " badFill=" +
      badFill +
      " badRound=" +
      badRound +
      " notShape=" +
      notShape +
      " moves=" +
      moved +
      " orient=" +
      orientOn +
      " rotChanges=" +
      rotChanges
  );

  if (
    badPos ||
    badSize ||
    badRot ||
    badFill ||
    badRound ||
    notShape ||
    !moved
  ) {
    throw new Error(
      "검증 실패 badPos=" +
        badPos +
        " badSize=" +
        badSize +
        " badRot=" +
        badRot +
        " badFill=" +
        badFill +
        " badRound=" +
        badRound +
        " notShape=" +
        notShape +
        " moves=" +
        moved
    );
  }

  if (orientOn && !rotChanges) {
    throw new Error("Orient on 인데 회전이 변하지 않음");
  }
})();
