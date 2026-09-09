/**
 * CEP panel basic easing — easy, out, hard, snap, linear, hold, antic
 * Set EASING_PANEL_TYPE before $.evalFile. Uses PARAMS optionally.
 */
var comp = app.project.activeItem;
if (!(comp instanceof CompItem)) {
  throw new Error("활성 컴포지션이 없습니다.");
}

var type = typeof EASING_PANEL_TYPE !== "undefined" ? String(EASING_PANEL_TYPE) : "";
if (!type) {
  throw new Error("EASING_PANEL_TYPE missing");
}

function easeCountFor(prop) {
  var t = prop.propertyValueType;
  if (t === PropertyValueType.TwoD) return 2;
  if (t === PropertyValueType.ThreeD) return 3;
  return 1;
}

function makeEaseArr(n, inf) {
  if (inf < 0.1) inf = 0.1;
  if (inf > 100) inf = 100;
  var a = [];
  var i;
  for (i = 0; i < n; i++) a.push(new KeyframeEase(0, inf));
  return a;
}

function pickProperty() {
  var props = comp.selectedProperties;
  if (!props || props.length === 0) throw new Error("속성을 선택하세요.");
  var best = null;
  var bestScore = -1;
  var i;
  for (i = 0; i < props.length; i++) {
    var p = props[i];
    if (!p || p.propertyType !== PropertyType.PROPERTY) continue;
    if (!p.canVaryOverTime) continue;
    var sk = (p.selectedKeys && p.selectedKeys.length) ? p.selectedKeys.length : 0;
    var nk = p.numKeys || 0;
    if (sk < 2 && nk < 2) continue;
    var score = sk * 1000 + nk;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  if (!best) throw new Error("키프레임 2개 이상인 속성을 선택하세요.");
  return best;
}

function getRangeKeys(prop) {
  var sk = prop.selectedKeys;
  if (sk && sk.length >= 2) {
    var arr = [];
    var i;
    for (i = 0; i < sk.length; i++) arr.push(sk[i]);
    arr.sort(function (a, b) { return a - b; });
    return { start: arr[0], end: arr[arr.length - 1] };
  }
  return { start: 1, end: prop.numKeys };
}

function isArr(v) {
  return v && v.length !== undefined && typeof v !== "string";
}

function lerpVal(a, b, f) {
  if (isArr(a)) {
    var out = [];
    var i;
    for (i = 0; i < a.length; i++) out.push(a[i] + (b[i] - a[i]) * f);
    return out;
  }
  return a + (b - a) * f;
}

function removeInteriorKeys(prop, tStart, tEnd) {
  var k;
  for (k = prop.numKeys; k >= 1; k--) {
    var t = prop.keyTime(k);
    if (t > tStart + 1e-4 && t < tEnd - 1e-4) prop.removeKey(k);
  }
}

function applyBezierRange(prop, rng, inInf, outInf) {
  var n = easeCountFor(prop);
  var inEase = makeEaseArr(n, inInf);
  var outEase = makeEaseArr(n, outInf);
  var k;
  for (k = rng.start; k <= rng.end; k++) {
    prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
    prop.setTemporalEaseAtKey(k, inEase, outEase);
  }
}

function applyInterpRange(prop, rng, inType, outType) {
  var k;
  for (k = rng.start; k <= rng.end; k++) {
    prop.setInterpolationTypeAtKey(k, inType, outType);
  }
}

var prop = pickProperty();
var rng = getRangeKeys(prop);

if (type === "easy") {
  applyBezierRange(prop, rng, 80, 80);
} else if (type === "out") {
  applyBezierRange(prop, rng, 0.1, 80);
} else if (type === "hard") {
  applyBezierRange(prop, rng, 16.67, 16.67);
} else if (type === "snap") {
  applyBezierRange(prop, rng, 100, 100);
} else if (type === "linear") {
  applyInterpRange(prop, rng, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
} else if (type === "hold") {
  applyInterpRange(prop, rng, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.HOLD);
} else if (type === "antic") {
  var tStart = prop.keyTime(rng.start);
  var tEnd = prop.keyTime(rng.end);
  var vStart = prop.keyValue(rng.start);
  var vEnd = prop.keyValue(rng.end);
  var dur = tEnd - tStart;
  if (dur <= 0) throw new Error("구간 길이가 0 이하입니다.");
  removeInteriorKeys(prop, tStart, tEnd);
  var pull = (PARAMS && PARAMS.intensity !== undefined) ? Number(PARAMS.intensity) : 1;
  if (pull < 0.2) pull = 0.2;
  if (pull > 2) pull = 2;
  var anticVal = lerpVal(vStart, vEnd, -0.1 * pull);
  prop.setValueAtTime(tStart + dur * 0.14, anticVal);
  rng = getRangeKeys(prop);
  applyBezierRange(prop, rng, 70, 85);
} else {
  throw new Error("Unknown easing type: " + type);
}

EASING_PANEL_RESULT = type + " applied: " + prop.name + " (keys " + rng.start + "->" + rng.end + ")";
