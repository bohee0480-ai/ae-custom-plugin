/**
 * Antic + Spring — anticipation wind-up then spring settle (combined profile)
 * Set PARAMS.intensity (0~2, default 1) before $.evalFile
 */
var comp = app.project.activeItem;
if (!(comp instanceof CompItem)) { throw new Error("No active composition"); }

function easeCountFor(prop) {
  var t = prop.propertyValueType;
  if (t === PropertyValueType.TwoD) { return 2; }
  if (t === PropertyValueType.ThreeD) { return 3; }
  return 1;
}

function makeEaseArr(n, inf) {
  if (inf < 0.1) { inf = 0.1; }
  if (inf > 100) { inf = 100; }
  var a = [];
  var i;
  for (i = 0; i < n; i++) { a.push(new KeyframeEase(0, inf)); }
  return a;
}

function pickProperty() {
  if (typeof EASING_PANEL_PROP !== "undefined" && EASING_PANEL_PROP) {
    return EASING_PANEL_PROP;
  }
  var props = comp.selectedProperties;
  if (!props || props.length === 0) { throw new Error("Select a property with 2+ keyframes"); }
  var best = null;
  var bestScore = -1;
  var i;
  for (i = 0; i < props.length; i++) {
    var p = props[i];
    if (!p || p.propertyType !== PropertyType.PROPERTY) { continue; }
    if (!p.canVaryOverTime) { continue; }
    var sk = (p.selectedKeys && p.selectedKeys.length) ? p.selectedKeys.length : 0;
    var nk = p.numKeys || 0;
    if (sk < 2 && nk < 2) { continue; }
    var score = sk * 1000 + nk;
    if (score > bestScore) { best = p; bestScore = score; }
  }
  if (!best) { throw new Error("Select a property with 2+ keyframes"); }
  return best;
}

function getRangeKeys(prop) {
  if (typeof EASING_USE_ALL_KEYS !== "undefined" && EASING_USE_ALL_KEYS) {
    return { start: 1, end: prop.numKeys };
  }
  var sk = prop.selectedKeys;
  if (sk && sk.length >= 2) {
    var arr = [];
    var i;
    for (i = 0; i < sk.length; i++) { arr.push(sk[i]); }
    arr.sort(function (a, b) { return a - b; });
    return { start: arr[0], end: arr[arr.length - 1] };
  }
  return { start: 1, end: prop.numKeys };
}

function isArr(v) { return v && v.length !== undefined && typeof v !== "string"; }

function lerp(a, b, f) {
  if (isArr(a)) {
    var out = [];
    var i;
    for (i = 0; i < a.length; i++) { out.push(a[i] + (b[i] - a[i]) * f); }
    return out;
  }
  return a + (b - a) * f;
}

function removeInteriorKeys(prop, tStart, tEnd) {
  var k;
  for (k = prop.numKeys; k >= 1; k--) {
    var t = prop.keyTime(k);
    if (t > tStart + 1e-4 && t < tEnd - 1e-4) { prop.removeKey(k); }
  }
}

var intensity = (PARAMS && PARAMS.intensity !== undefined) ? Number(PARAMS.intensity) : 1;
if (intensity < 0) { intensity = 0; }
if (intensity > 2) { intensity = 2; }

var prop = pickProperty();
var rng = getRangeKeys(prop);
var tStart = prop.keyTime(rng.start);
var tEnd = prop.keyTime(rng.end);
var vStart = prop.keyValue(rng.start);
var vEnd = prop.keyValue(rng.end);
var dur = tEnd - tStart;
if (dur <= 0) { throw new Error("Keyframe span duration is zero"); }

var n = easeCountFor(prop);
var ANTIC_T = 0.14;
var pull = intensity;
if (pull < 0.2) { pull = 0.2; }
if (pull > 2) { pull = 2; }

removeInteriorKeys(prop, tStart, tEnd);

var PROFILE = [
  { t: 0,     f: 0,      iIn: 70,  iOut: 85  },
  { t: ANTIC_T, f: -0.1 * pull, iIn: 70, iOut: 85 },
  { t: 0.64,  f: 1.07,   iIn: 14.0451, iOut: 25.8814 },
  { t: 0.74,  f: 0.96,   iIn: 38.6667, iOut: 38.6667 },
  { t: 0.82,  f: 1.03,   iIn: 44, iOut: 44 },
  { t: 0.89,  f: 0.98,   iIn: 49.3333, iOut: 49.3333 },
  { t: 0.94,  f: 1.012,  iIn: 54.6667, iOut: 54.6667 },
  { t: 0.97,  f: 0.995,  iIn: 60, iOut: 60 },
  { t: 1,     f: 1,      iIn: 86, iOut: 8 }
];

var i;
for (i = 1; i < PROFILE.length - 1; i++) {
  var p = PROFILE[i];
  var ff;
  if (p.t <= ANTIC_T) {
    ff = p.f;
  } else {
    ff = 1 + (p.f - 1) * intensity;
  }
  prop.setValueAtTime(tStart + dur * p.t, lerp(vStart, vEnd, ff));
}

rng = getRangeKeys(prop);
var kStart = rng.start;
for (i = 0; i < PROFILE.length; i++) {
  var idx = kStart + i;
  if (idx > prop.numKeys) { break; }
  prop.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
  prop.setTemporalEaseAtKey(idx, makeEaseArr(n, PROFILE[i].iIn), makeEaseArr(n, PROFILE[i].iOut));
}

EASING_PANEL_RESULT = "antic+spring applied: " + prop.name + " (intensity=" + intensity + ", " + PROFILE.length + " keys)";
