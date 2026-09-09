/**
 * @template tension-bounce
 * @description 선택 속성 구간에 바운스 텐션을 적용. 현재 컴프의 "바운스" 레이어에서 추출한 실제 프로파일(9키) 그대로 사용. 목표를 넘지 않고 시작점 쪽으로만 감쇠 반동. 모든 수치 속성 공통.
 * @params intensity=1
 * @tags bounce, 바운스, 튕김, 감쇠, 텐션, tension, easing
 * @example "선택 속성에 바운스 적용"
 */
var comp = app.project.activeItem;
if (!(comp instanceof CompItem)) { throw new Error("활성 컴포지션이 없습니다."); }

function easeCountFor(prop) {
  var t = prop.propertyValueType;
  if (t === PropertyValueType.TwoD) { return 2; }
  if (t === PropertyValueType.ThreeD) { return 3; }
  return 1;
}
function makeEaseArr(n, inf) {
  if (inf < 0.1) { inf = 0.1; } if (inf > 100) { inf = 100; }
  var a = []; var i;
  for (i = 0; i < n; i++) { a.push(new KeyframeEase(0, inf)); }
  return a;
}
function pickProperty() {
  if (typeof EASING_PANEL_PROP !== "undefined" && EASING_PANEL_PROP) {
    return EASING_PANEL_PROP;
  }
  var props = comp.selectedProperties;
  if (!props || props.length === 0) { throw new Error("속성을 선택하세요."); }
  var best = null, bestScore = -1, i;
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
  if (!best) { throw new Error("키프레임 ≥2 속성을 선택하세요."); }
  return best;
}
function getRangeKeys(prop) {
  if (typeof EASING_USE_ALL_KEYS !== "undefined" && EASING_USE_ALL_KEYS) {
    return { start: 1, end: prop.numKeys };
  }
  var sk = prop.selectedKeys;
  if (sk && sk.length >= 2) {
    var arr = [], i;
    for (i = 0; i < sk.length; i++) { arr.push(sk[i]); }
    arr.sort(function (a, b) { return a - b; });
    return { start: arr[0], end: arr[arr.length - 1] };
  }
  return { start: 1, end: prop.numKeys };
}
function isArr(v) { return v && v.length !== undefined && typeof v !== "string"; }
function lerp(a, b, f) {
  if (isArr(a)) {
    var out = [], i;
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
if (dur <= 0) { throw new Error("구간 길이가 0 이하입니다."); }
var n = easeCountFor(prop);

removeInteriorKeys(prop, tStart, tEnd);

// 실측 추출: 현재 컴프 "바운스" 레이어 9키 프로파일
// intensity는 반동 깊이(1-f)를 스케일. f=1(접촉) 키는 그대로.
var PROFILE = [
  { t: 0,     f: 0,     iIn: 8,     iOut: 78    },
  { t: 0.55,  f: 1,     iIn: 0.1,  iOut: 0.1  },
  { t: 0.655, f: 0.84,  iIn: 100,   iOut: 84.4671 },
  { t: 0.76,  f: 1,     iIn: 0.1,  iOut: 0.1  },
  { t: 0.84,  f: 0.93,  iIn: 94.4293, iOut: 100 },
  { t: 0.9,   f: 1,     iIn: 0.1,  iOut: 0.1  },
  { t: 0.95,  f: 0.975, iIn: 100,   iOut: 100   },
  { t: 0.985, f: 1,     iIn: 0.1,  iOut: 18    },
  { t: 1,     f: 1,     iIn: 20,    iOut: 10    }
];

var i;
for (i = 1; i < PROFILE.length - 1; i++) {
  var p = PROFILE[i];
  var ff = 1 - (1 - p.f) * intensity;
  prop.setValueAtTime(tStart + dur * p.t, lerp(vStart, vEnd, ff));
}

var kStart = rng.start;
for (i = 0; i < PROFILE.length; i++) {
  var idx = kStart + i;
  if (idx > prop.numKeys) { break; }
  prop.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
  prop.setTemporalEaseAtKey(idx, makeEaseArr(n, PROFILE[i].iIn), makeEaseArr(n, PROFILE[i].iOut));
}

EASING_PANEL_RESULT = "bounce applied: " + prop.name + " (intensity=" + intensity + ", " + PROFILE.length + " keys)";
