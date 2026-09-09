/**
 * @template tension-overshoot
 * @description 선택 속성 구간에 오버슈트 텐션을 적용. 현재 컴프의 "오버슈트" 레이어에서 추출한 프로파일을 그대로 사용(키 2개 + 강한 ease로 끝 방향 오버슈트 유도). 모든 수치 속성 공통.
 * @params intensity=1
 * @tags overshoot, 오버슈트, 텐션, tension, easing
 * @example "선택 속성에 오버슈트 적용"
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
var dur = tEnd - tStart;
if (dur <= 0) { throw new Error("구간 길이가 0 이하입니다."); }
var n = easeCountFor(prop);

removeInteriorKeys(prop, tStart, tEnd);

// 추출값: key1 in=16 out=23.1274, key2 in=73.3878 out=16.6667
// intensity는 뒤 키 in(감속)을 스케일. 오버슈트 느낌은 뒤 키 infIn이 높을수록 강해짐.
var inf1In  = 16;
var inf1Out = 23.1274;
var inf2In  = 73.3878 * intensity;
var inf2Out = 16.6667;
if (inf2In > 100) { inf2In = 100; }
if (inf2In < 0.1) { inf2In = 0.1; }

prop.setInterpolationTypeAtKey(rng.start, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
prop.setInterpolationTypeAtKey(rng.end,   KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
prop.setTemporalEaseAtKey(rng.start, makeEaseArr(n, inf1In), makeEaseArr(n, inf1Out));
prop.setTemporalEaseAtKey(rng.end,   makeEaseArr(n, inf2In), makeEaseArr(n, inf2Out));

EASING_PANEL_RESULT = "overshoot applied: " + prop.name + " (intensity=" + intensity + ")";
