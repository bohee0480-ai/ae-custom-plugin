/**
 * Collect Shape Path properties from timeline selection.
 * Path 속성 선택 우선 · 없으면 선택 Shape Layer의 첫 Path로 폴백.
 */
if (typeof log !== "function") {
  log = function (msg) {
    try { $.writeln("[shape-path] " + String(msg)); } catch (eLog) {}
  };
}

function firstPathInShapeLayer(layer) {
  var root;
  var hit;
  if (!layer || !(layer instanceof ShapeLayer)) return null;
  root = layer.property("ADBE Root Vectors Group");
  if (!root) return null;

  function walk(g) {
    var k;
    var p;
    var inner;
    for (k = 1; k <= g.numProperties; k++) {
      p = g.property(k);
      if (p.matchName === "ADBE Vector Shape - Group") {
        return {
          layer: layer,
          pathProp: p.property("ADBE Vector Shape"),
          pathGroup: p,
          vectorsGroup: p.parentProperty
        };
      }
      if (p.propertyType === PropertyType.INDEXED_GROUP || p.propertyType === PropertyType.NAMED_GROUP) {
        inner = walk(p);
        if (inner) return inner;
      }
    }
    return null;
  }

  return walk(root);
}

function pushUniquePath(results, seen, entry) {
  var pathProp;
  var layer;
  var parts;
  var key;
  if (!entry || !entry.pathProp) return;
  pathProp = entry.pathProp;
  layer = entry.layer;

  parts = [];
  var p = pathProp;
  while (p) {
    parts.unshift(String(p.propertyIndex) + ":" + String(p.matchName));
    if (p.matchName === "ADBE Root Vectors Group") break;
    p = p.parentProperty;
  }
  key = String(layer.index) + "::" + parts.join("/");
  if (seen[key]) return;
  seen[key] = true;
  results.push(entry);
}

function collectSelectedShapePaths(comp) {
  var results = [];
  var seen = {};
  if (!comp || !(comp instanceof CompItem)) return results;

  var sel = comp.selectedProperties;

  function identity(pathProp) {
    var parts = [];
    var p = pathProp;
    while (p) {
      parts.unshift(String(p.propertyIndex) + ":" + String(p.matchName));
      if (p.matchName === "ADBE Root Vectors Group") break;
      p = p.parentProperty;
    }
    var layer = pathProp.propertyGroup(pathProp.propertyDepth);
    return String(layer.index) + "::" + parts.join("/");
  }

  var i;
  if (sel && sel.length > 0) {
    for (i = 0; i < sel.length; i++) {
      var prop = sel[i];
      var pathProp = null;
      var pathGroup = null;

      if (prop.matchName === "ADBE Vector Shape") {
        pathProp = prop;
        pathGroup = prop.parentProperty;
      } else if (prop.matchName === "ADBE Vector Shape - Group") {
        pathGroup = prop;
        pathProp = prop.property("ADBE Vector Shape");
      }

      if (!pathProp || pathProp.propertyValueType !== PropertyValueType.SHAPE) continue;
      if (!pathGroup || pathGroup.matchName !== "ADBE Vector Shape - Group") continue;

      var layer = pathProp.propertyGroup(pathProp.propertyDepth);
      if (!(layer instanceof ShapeLayer)) continue;

      var key = identity(pathProp);
      if (seen[key]) continue;
      seen[key] = true;

      results.push({
        layer: layer,
        pathProp: pathProp,
        pathGroup: pathGroup,
        vectorsGroup: pathGroup.parentProperty
      });
    }
  }

  if (results.length > 0) {
    var selLayersEarly = comp.selectedLayers;
    var shapeLayerCount = 0;
    var layerResults = [];
    var layerSeen = {};
    var li;
    if (selLayersEarly && selLayersEarly.length > 0) {
      for (li = 0; li < selLayersEarly.length; li++) {
        if (selLayersEarly[li] instanceof ShapeLayer) {
          shapeLayerCount++;
          pushUniquePath(layerResults, layerSeen, firstPathInShapeLayer(selLayersEarly[li]));
        }
      }
    }
    if (shapeLayerCount >= 2 && layerResults.length >= 2 && results.length < shapeLayerCount) {
      return layerResults;
    }
    return results;
  }

  var selLayers = comp.selectedLayers;
  if (!selLayers || selLayers.length < 1) return results;

  for (i = 0; i < selLayers.length; i++) {
    pushUniquePath(results, seen, firstPathInShapeLayer(selLayers[i]));
  }

  return results;
}

$.global.collectSelectedShapePaths = collectSelectedShapePaths;
