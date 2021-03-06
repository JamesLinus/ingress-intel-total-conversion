/// PORTAL DATA TOOLS ///////////////////////////////////////////////////
// misc functions to get portal info

// search through the links data for all that link from or to a portal. returns an object with separate lists of in
// and out links. may or may not be as accurate as the portal details, depending on how much data the API returns
window.getPortalLinks = function(guid) {

  var links = { in: [], out: [] };

  $.each(window.links, function(g,l) {
    var d = l.options.data;

    if (d.oGuid == guid) {
      links.out.push(g);
    }
    if (d.dGuid == guid) {
      links.in.push(g);
    }
  });

  return links;
}

window.getPortalLinksCount = function(guid) {
  var links = getPortalLinks(guid);
  return links.in.length+links.out.length;
}


// search through the fields for all that reference a portal
window.getPortalFields = function(guid) {
  var fields = [];

  $.each(window.fields, function(g,f) {
    var d = f.options.data;

    if ( d.points[0].guid == guid
      || d.points[1].guid == guid
      || d.points[2].guid == guid ) {

      fields.push(g);
    }
  });

  return fields;
}

window.getPortalFieldsCount = function(guid) {
  var fields = getPortalFields(guid);
  return fields.length;
}


// find the lat/lon for a portal, using any and all available data
// (we have the list of portals, the cached portal details, plus links and fields as sources of portal locations)
window.findPortalLatLng = function(guid) {
  if (window.portals[guid]) {
    return window.portals[guid].getLatLng();
  }

  // not found in portals - try the cached (and possibly stale) details - good enough for location
  var details = portalDetail.get(guid);
  if (details) {
    return L.latLng (details.latE6/1E6, details.lngE6/1E6);
  }

  // now try searching through fields
  for (var fguid in window.fields) {
    var f = window.fields[fguid].options.data;

    for (var i in f.points) {
      if (f.points[i].guid == guid) {
        return L.latLng (f.points[i].latE6/1E6, f.points[i].lngE6/1E6);
      }
    }
  }

  // and finally search through links
  for (var lguid in window.links) {
    var l = window.links[lguid].options.data;
    if (l.oGuid == guid) {
      return L.latLng (l.oLatE6/1E6, l.oLngE6/1E6);
    }
    if (l.dGuid == guid) {
      return L.latLng (l.dLatE6/1E6, l.dLngE6/1E6);
    }
  }

  // no luck finding portal lat/lng
  return undefined;
};


(function() {
  var cache = {};
  var cache_level = 0;
  var GC_LIMIT = 15000; // run garbage collector when cache has more that 5000 items
  var GC_KEEP  = 10000; // keep the 4000 most recent items

  window.findPortalGuidByPositionE6 = function(latE6, lngE6) {
    var item = cache[latE6+","+lngE6];
    if(item) return item[0];

    // now try searching through currently rendered portals
    for(var guid in window.portals) {
      var data = window.portals[guid].options.data;
      if(data.latE6 == latE6 && data.lngE6 == lngE6) return guid;
    }

    // now try searching through fields
    for(var fguid in window.fields) {
      var points = window.fields[fguid].options.data.points;

      for(var i in points) {
        var point = points[i];
        if(point.latE6 == latE6 && point.lngE6 == lngE6) return point.guid;
      }
    }

    // and finally search through links
    for(var lguid in window.links) {
      var l = window.links[lguid].options.data;
      if(l.oLatE6 == latE6 && l.oLngE6 == lngE6) return l.oGuid;
      if(l.dLatE6 == latE6 && l.dLngE6 == lngE6) return l.dGuid;
    }

    return null;
  };

  window.pushPortalGuidPositionCache = function(guid, latE6, lngE6) {
    cache[latE6+","+lngE6] = [guid, Date.now()];
    cache_level += 1;

    if(cache_level > GC_LIMIT) {
      Object.keys(cache) // get all latlngs
        .map(function(latlng) { return [latlng, cache[latlng][1]]; })  // map them to [latlng, timestamp]
        .sort(function(a,b) { return b[1] - a[1]; }) // sort them
        .slice(GC_KEEP) // drop the MRU
        .forEach(function(item) { delete cache[item[0]] }); // delete the rest
      cache_level = Object.keys(cache).length
    }
  }
})();


// get the AP gains from a portal, based only on the brief summary data from portals, links and fields
// not entirely accurate - but available for all portals on the screen
window.getPortalApGain = function(guid) {

  var p = window.portals[guid];
  if (p) {
    var data = p.options.data;

    var linkCount = getPortalLinksCount(guid);
    var fieldCount = getPortalFieldsCount(guid);

    var result = portalApGainMaths(data.resCount, linkCount, fieldCount);
    return result;
  }

  return undefined;
}

// given counts of resonators, links and fields, calculate the available AP
// doesn't take account AP for resonator upgrades or AP for adding mods
window.portalApGainMaths = function(resCount, linkCount, fieldCount) {

  var deployAp = (8-resCount)*DEPLOY_RESONATOR;
  if (resCount == 0) deployAp += CAPTURE_PORTAL;
  if (resCount != 8) deployAp += COMPLETION_BONUS;
  // there could also be AP for upgrading existing resonators, and for deploying mods - but we don't have data for that
  var friendlyAp = deployAp;

  var destroyResoAp = resCount*DESTROY_RESONATOR;
  var destroyLinkAp = linkCount*DESTROY_LINK;
  var destroyFieldAp = fieldCount*DESTROY_FIELD;
  var captureAp = CAPTURE_PORTAL + 8 * DEPLOY_RESONATOR + COMPLETION_BONUS;
  var destroyAp = destroyResoAp+destroyLinkAp+destroyFieldAp;
  var enemyAp = destroyAp+captureAp;

  return {
    friendlyAp: friendlyAp,
    enemyAp: enemyAp,
    destroyAp: destroyAp,
    destroyResoAp: destroyResoAp,
    captureAp: captureAp
  }
}
