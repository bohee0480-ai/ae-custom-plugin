/**
 * @skill ae-path-wireframe — verify wireframe groups + expression errors (multi-layer)
 */
(function () {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) throw new Error("활성 컴프 없음");

  var applied = $.global.__PATH_WF_APPLIED__;
  var srcNames = [];
  if (applied && applied.length) {
    for (var a = 0; a < applied.length; a++) srcNames.push(applied[a].name);
  } else if ($.global.__PATH_WF_SRC__) {
    srcNames.push($.global.__PATH_WF_SRC__);
  } else {
    var sel = comp.selectedLayers;
    for (var s = 0; s < sel.length; s++) {
      if (sel[s].matchName === "ADBE Vector Layer") {
        var n = sel[s].name;
        if (n.length <= 11 || n.substring(n.length - 11) !== " Wireframe") {
          srcNames.push(n);
        }
      }
    }
  }
  if (srcNames.length === 0) throw new Error("검증 대상 없음 (apply 먼저 실행)");

  function verifyOne(srcName) {
    var wfName = srcName + " Wireframe";
    var wf = comp.layer(wfName);
    if (!wf) return srcName + ": WF missing";

    var src = comp.layer(srcName);
    if (!src) return srcName + ": src missing";

    var pathRefs = [];
    var contents = src.property("Contents");
    for (var g = 1; g <= contents.numProperties; g++) {
      var grp = contents.property(g);
      if (grp.matchName !== "ADBE Vector Group") continue;
      var sub = grp.property("Contents");
      for (var si = 1; si <= sub.numProperties; si++) {
        if (sub.property(si).matchName === "ADBE Vector Shape - Group") {
          pathRefs.push({
            groupName: grp.name,
            groupIdx: g,
            pathIdx: si
          });
        }
      }
    }

    var gC = wf.property("Contents");
    var existing = {};
    for (var i = 1; i <= gC.numProperties; i++) existing[gC.property(i).name] = true;

    var missing = 0;
    for (var r = 0; r < pathRefs.length; r++) {
      var label = pathRefs[r].groupName + "_g" + pathRefs[r].groupIdx + "_p" + pathRefs[r].pathIdx;
      if (!existing["Anchors_" + label]) missing++;
      if (!existing["Handles_" + label]) missing++;
      if (!existing["Lines_" + label]) missing++;
    }

    var totalErr = 0, totalPaths = 0;
    for (var i2 = 1; i2 <= gC.numProperties; i2++) {
      var grp2 = gC.property(i2);
      if (grp2.matchName !== "ADBE Vector Group") continue;
      var sub2 = grp2.property("Contents");
      for (var s2 = 1; s2 <= sub2.numProperties; s2++) {
        var ch = sub2.property(s2);
        if (ch.matchName !== "ADBE Vector Shape - Group") continue;
        var pp = ch.property("Path");
        if (!pp) continue;
        totalPaths++;
        var e = pp.expressionError;
        if (e && e.length > 0) totalErr++;
      }
    }

    var expectedGroups = pathRefs.length * 3;
    return srcName + ": " + totalPaths + " paths, " + totalErr + " err, " +
      gC.numProperties + "/" + expectedGroups + " grp, miss=" + missing +
      ", rot=" + src.transform.rotation.value.toFixed(1);
  }

  var lines = [];
  for (var n = 0; n < srcNames.length; n++) lines.push(verifyOne(srcNames[n]));
  var ctrl = comp.layer("CTRL_Wireframe");
  $.global.__PATH_WF_VERIFY__ = lines.join(" || ") + " | ctrl=" + (ctrl ? "yes" : "no");
})();
