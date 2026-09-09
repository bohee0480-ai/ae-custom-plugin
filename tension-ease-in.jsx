/**
 * @template tension-ease-in
 * @description 선택 속성의 양 끝 키에 이즈인(끝에서 부드럽게 감속) 텐션을 적용. 위치뿐 아니라 Scale/Rotation/Opacity/이펙트 슬라이더 등 모든 수치 속성 공통.
 * @params endInfluence=90, startInfluence=0.1
 * @tags ease-in, 이즈인, 감속, 텐션, tension, easing, decelerate
 * @example "선택한 속성에 이즈인 적용"
 */
var comp = app.project.activeItem;
if (!(comp instanceof CompItem)) {
  throw new Error("활성 컴포지션이 없습니다.");
}

function easeCountFor(prop) {
  var t = prop.propertyValueType;
  if (t === PropertyValueType.TwoD) {
    return 2;
  }
  if (t === PropertyValueType.ThreeD) {
    return 3;
  }
  return 1;
}

function makeEaseArr(n, inf) {
  var a = [];
  var i;
  for (i = 0; i < n; i++) {
    a.push(new KeyframeEase(0, inf));
  }
  return a;
}

function pickProperty() {
  if (typeof EASING_PANEL_PROP !== "undefined" && EASING_PANEL_PROP) {
    return EASING_PANEL_PROP;
  }
  var props = comp.selectedProperties;
  if (!props || props.length === 0) {
    throw new Error("속성을 하나 이상 선택하세요.");
  }
  var best = null;
  var bestScore = -1;
  var i;
  for (i = 0; i < props.length; i++) {
    var p = props[i];
    if (!p || p.propertyType !== PropertyType.PROPERTY) {
      continue;
    }
    if (!p.canVaryOverTime) {
      continue;
    }
    var sk = (p.selectedKeys && p.selectedKeys.length) ? p.selectedKeys.length : 0;
    var nk = p.numKeys || 0;
    if (sk < 2 && nk < 2) {
      continue;
    }
    var score = sk * 1000 + nk;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  if (!best) {
    throw new Error("키프레임 2개 이상을 가진 속성을 선택하세요.");
  }
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
    for (i = 0; i < sk.length; i++) {
      arr.push(sk[i]);
    }
    arr.sort(function (a, b) { return a - b; });
    return { start: arr[0], end: arr[arr.length - 1] };
  }
  return { start: 1, end: prop.numKeys };
}

var endInf = (PARAMS && PARAMS.endInfluence !== undefined) ? Number(PARAMS.endInfluence) : 90;
var startInf = (PARAMS && PARAMS.startInfluence !== undefined) ? Number(PARAMS.startInfluence) : 0.1;
if (endInf < 0.1) { endInf = 0.1; }
if (endInf > 100) { endInf = 100; }
if (startInf < 0.1) { startInf = 0.1; }
if (startInf > 100) { startInf = 100; }

var prop = pickProperty();
var rng = getRangeKeys(prop);
var n = easeCountFor(prop);

prop.setInterpolationTypeAtKey(rng.start, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
prop.setInterpolationTypeAtKey(rng.end, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
prop.setTemporalEaseAtKey(rng.start, makeEaseArr(n, startInf), makeEaseArr(n, startInf));
prop.setTemporalEaseAtKey(rng.end, makeEaseArr(n, endInf), makeEaseArr(n, startInf));

EASING_PANEL_RESULT = "ease-in applied: " + prop.name + " (key " + rng.start + "->" + rng.end + ", in=" + endInf + ", start=" + startInf + ")";
