
if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = Array.prototype.slice.call(arguments);
    return this.replace(/{(\d+)}/g, function(match, number) {
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

function parseBool(string) {
  if (string) {
    switch (string.toLowerCase().trim()) {
      case "true": case "yes": case "1": case "on": return true;
      case "false": case "no": case "0": case "off": case null: return false;
      default: return Boolean(string);
    }
  }
  return false;
}

function parseBaseUrl(url) {
  const regex = /[^?#]+/g;
  const match = regex.exec(url);
  return match.hasOwnProperty('0') ? match[0] : null;
}

function parseAnchor(url) {
  const apos = url.lastIndexOf('#');
  return (apos > 0 && apos < url.length - 1) ? url.substring(apos + 1) : null;
}

function parseUrlParams(url) {
  const regex = /[?&]([^=#]+)=([^&#]*)/g;
  let params = {};
  let match;
  while(match = regex.exec(url)) {
    params[match[1]] = match[2];
  }
  return params;
}

function guessIFrame() {
  return window.location !== window.parent.location;
}

function parseBaseUrlDir() {
  const baseUrl = parseBaseUrl(window.location.href);
  return baseUrl.substring(0, baseUrl.lastIndexOf('/'));
}

function createBaseLayer() {
  return L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}.png',
        { attribution:
            '<a href="https://carto.com/help/building-maps/basemap-list/">Map tiles by Carto under CC BY 3.0</a> | ' +
            '<a href="http://osm.org/copyright">Data by OpenStreetMap under ODbL</a>'
        });
}

function loadJson(fileUrl) {
  return new Promise(function(resolve, reject) {
    $.ajax({ url: fileUrl })
      .fail(() => reject("Error querying " + fileUrl))
      .done(content => {
        resolve((typeof content === 'string') ? JSON.parse(content) : content);
      });
  });
}

function loadPlain(fileUrl) {
  return new Promise(function(resolve, reject) {
    $.ajax({ url: fileUrl })
      .fail(() => reject("Error querying " + fileUrl))
      .done(content => resolve(content));
  });
}

function forEachPoint(geometry, predicate) {
  if (geometry.length == 2 && !geometry[0].hasOwnProperty("length")) {
    predicate(geometry);
  }
  else {
    for (var component of geometry) {
      forEachPoint(component, predicate);
    }
  }
}

function renderPreviewHtml(title, clickHandler) {
  var html = '';
  html += '<div class="popup-pin">';
  html += '<h2><a href="javascript:void(0)" onclick="' + clickHandler + '">';
  html += title;
  html += '</a></h2>';
  html += '</div>';
  return html;
}

function isRegionVisible(ags, zoom) {
  return false;

  if (zoom < 6) {
    // Bundesländer
    return ags.length == 2;
  }
  else { //if (zoom < 8) {
    // Landkreise
    return ags.length == 4 || ags.length == 5;
  }
  //else {
  //  // Landkreise und Berliner Bezirke
  //  return ags.length > 2 && ags != "11000";
  //}
  //return false;
}

function asset(name) {
  const assetsBaseUrl = 'https://raw.githubusercontent.com/ImmunHelden/WirVsVirusMap/master/assets';
  return [ assetsBaseUrl, name ].join('/');
}

$(window).on('hashchange', function(e) {
  let preselectId = parseAnchor(window.location.href);
  console.log(preselectId);
  if (preselectId) {
    focusPin(preselectId);
  }
});

const wvv = {};

function closeDetails() {
  wvv.dom.pane.hide();
  wvv.dom.canvas.css("width", "100%");
  wvv.map.invalidateSize();
  //$("#platforms-pane").show();
}

wvv.hostBaseUrl = parseBaseUrlDir(window.location.href);

const defaultIcon = {
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34]
};

const defaultSettings = {
  embedded: guessIFrame(),
  lockLink: '/',
  zoom: 6,
  platforms: [
    //{
    //name: 'Default',
    //sources: [
      { name: 'Default', restBaseUrl: wvv.hostBaseUrl, icon: defaultIcon }
    //]
    //}
  ]
};

function WirVsVirusMap(domElementName, actualSettings) {
  const settings = { ...defaultSettings, ...actualSettings };

  if (typeof domElementName !== 'string' || domElementName.length == 0) {
    console.error('Please pass the ID of the DOM element to host WirVsVirusMap as first argument.');
    return;
  }

  if ($('#' + domElementName).length == 0) {
    console.error('Cannot find DOM element to host WirVsVirusMap. ' +
                  'Try adding this to your HTML: <div id="' + domElementName + '"></div>');
    return;
  }

  L.Control.Platforms = L.Control.extend({
    onAdd: function(map) {
      var div = L.DomUtil.create('div', 'leaflet-bar');
      div.style.backgroundColor = "#fff";
      div.style.padding = "3px 8px";
      div.id = "platforms-pane";

      var html = '';
      html += '<table>';
      html += '<tr><th>';
      html += '  Anzeigen und Gesuche';
      html += '</th></tr>';

      for (var i = 0; i < platforms.length; i++) {
        html += '<tr><td>';
        html += '<input type="checkbox" id="platform{0}" checked onchange="togglePlatform(this, {0});">'.format(i);
        html += '<label for="platform{0}" title="Anzeigen und Gesuche von {1}">'.format(i, platforms[i].name);
        html += platforms[i].name;
        html += '</label>';
        html += '</td></tr>';
      }

      html += '</table>';

      div.innerHTML = html;
      return div;
    }
  });

  //var platforms = parsePlatforms(params);

  wvv.dom = {};
  wvv.dom.root = $('#' + domElementName).addClass('wvvm-root')
      .append('<div id="osm-map-canvas"></div>')
      .append('<div class="pane"></div>');

  if (settings.embedded) {
    const href = settings.lockLink || '/';
    wvv.dom.root.append('<a href="' + href + '" target="_parent" class="lock"></a>');
  }

  wvv.dom.canvas = $('#osm-map-canvas');
  wvv.dom.lock = $('.wvvm-root > div.lock');
  wvv.dom.pane = $('.wvvm-root > div.pane')
      .append('<iframe></iframe>')
      .append('<a href="javascript:void(0)" onclick="closeDetails();">Einklappen &gt;&gt;</a>');

  wvv.dom.paneDetails = $('.wvvm-root > div.pane > iframe');
  wvv.dom.paneClose = $('.wvvm-root > div.pane > a');

  wvv.map = new L.map('osm-map-canvas', {
    center: [51.5, 10],
    zoom: settings.zoom,
    zoomControl: !settings.embedded
    //dragging: interactive,
    //doubleClickZoom: interactive,
    //scrollWheelZoom: interactive
  });

  createBaseLayer().addTo(wvv.map);

  var platformsView = new L.Control.Platforms({ position: 'bottomleft' });
  //platformsView.addTo(map);

  function invalidInfo(info, message) {
    console.warn("Encountered invalid item in response:", message, info);
    return false;
  }

  function isInteger(N) {
    return !isNaN(N) && parseInt(Number(N)) == N && !isNaN(parseInt(N, 10));
  }

  function isValidPinInfo(I) {
    if (!I.hasOwnProperty("latlng") || !I.latlng.hasOwnProperty("length") || I.latlng.length != 2)
      return invalidInfo(I, 'Expected pin property "latlng" to be an array with 2 elements');
    if (!parseFloat(I.latlng[0]) || !parseFloat(I.latlng[1]))
      return invalidInfo(I, 'Expected elements of pin property "latlng" to be floating point numbers');
    if (!I.hasOwnProperty("title"))
      return invalidInfo(I, 'Expected string value in pin property "title"');
    return true;
  }

  var allPinsById = {};

  // TODO: It needs a place to live
  let followupHtml;
  console.log(wvv.hostBaseUrl + '/followup.html');
  loadPlain(wvv.hostBaseUrl + '/followup.html').then(
    html => { followupHtml = html; },
    err => console.error(err)
  );

  function viewDetails(id) {
    if (!allPinsById.hasOwnProperty(id)) {
      console.error("Requested invalid ID");
      return;
    }

    wvv.dom.paneDetails.attr("srcdoc", '<img src="../images/spin_loading.gif" style="width:100%;">');
    wvv.dom.pane.show();
    wvv.dom.canvas.css("width", "calc(100% - 400px)");

    const pinInfo = allPinsById[id];
    console.log(pinInfo);

    // TODO: if there's space left for the map at all
    wvv.map.invalidateSize();
    wvv.map.panTo(L.latLng(pinInfo.latlng));
    //$("#platforms-pane").hide();

    if (pinInfo.hasOwnProperty("details")) {
      wvv.dom.paneDetails.attr("srcdoc", pinInfo.details.html());
    }
    else {
      const contentBaseUrl = settings.platforms[pinInfo.platformIdx].restBaseUrl + "/details/";
      console.log('request:', contentBaseUrl + id);
      loadPlain(contentBaseUrl + id).then(
        html => {
          const annotations = [];
          annotations.push('<base href="' + wvv.hostBaseUrl + '/" target="_blank">');
          annotations.push('<link rel="stylesheet" href="details.css">');
          pinInfo.details = $('<div>' + annotations.join('') + html + '</div>');

          const followupHandler =
            'setTimeout(function() { document.getElementById("followup").style.display="flex"; }, 500)';
          pinInfo.details.find('a').each((i, elem) => {
            const targetUrl = $(elem).attr('href');
            if (targetUrl && targetUrl.hasOwnProperty('length') && targetUrl.length > 0) {
              if (targetUrl.charAt(0) == '#') {
                $(elem).attr('href', wvv.hostBaseUrl + targetUrl);
              }
              else {
                $(elem).attr('onclick', followupHandler);
              }
            }
          });
          pinInfo.details.children('div').each((i, elem) => $(elem).css('margin-left', '25px').css('margin-right', '10px'));
          pinInfo.details.append(followupHtml);

          setTimeout(() => { wvv.dom.paneDetails.attr("srcdoc", pinInfo.details.html()); }, 200);
        },
        err => {
          console.error("Error repsonse from: ", contentBaseUrl + id);
          closeDetails();
        }
      );
    }
  }

  function mayViewDetails(id) {
    if (!settings.embedded && window.innerWidth >= 600) {
      viewDetails(id);
    }
  }

  function focusPin(id) {
    if (allPinsById.hasOwnProperty(id)) {
      allPinsById[id].popup.openPopup();
      mayViewDetails(id);
      wvv.map.flyTo(allPinsById[id].latlng, 12, {
        animate: true,
        duration: 3
      });
      return;
    }
  }

  var pinsReady = [];
  for (let i = 0; i < settings.platforms.length; i++) {
    pinsReady.push(loadJson(settings.platforms[i].restBaseUrl + '/pins').then(pinsById => {
      for (let id in pinsById) {
        if (isValidPinInfo(pinsById[id])) {
          const pin = {
            latlng: L.latLng(pinsById[id].latlng),
            title: pinsById[id].title,
            platformIdx: i,
            marker: null,
            popup: null,
            elem: null
          };
          const clickHandler = "viewDetails('" + id + "');";
          const content = renderPreviewHtml(pin.title, clickHandler);
          pin.marker = L.marker(pin.latlng, { "icon": new L.Icon(settings.platforms[i].icon) });
          pin.popup = pin.marker.bindPopup(content);
          pin.elem = $(pin.popup.addTo(wvv.map).getElement());
          pin.marker.on('click', function() { mayViewDetails(id); });
          allPinsById[id] = pin;
        }
      }
    }));
  }

  // TODO: Get back code to load regions
  const regionsReady = new Promise((resolve, reject) => resolve());

  Promise.all(pinsReady.concat([regionsReady])).then(function() {
    let preselectId = parseAnchor(window.location.href);
    console.log(preselectId);
    if (preselectId) {
      focusPin(preselectId);
    }
  });

  function togglePlatform(checkbox, platformIdx) {
    const show = $(checkbox).is(':checked');
    console.log("Anzeigen von ", settings.platforms[platformIdx].name, (show ? "ein" : "aus") + "blenden");

    const toggle = (show ? function(elem) { elem.show(); }
                          : function(elem) { elem.hide(); });

    for (const id in allPinsById) {
      if (allPinsById[id].platformIdx == platformIdx) {
        toggle(allPinsById[id].elem);
      }
    }
  }
}

/*


  var allRegionsByAgs = {};

  function viewDetailsR(ags) {
    if (!allRegionsByAgs.hasOwnProperty(ags)) {
      console.error("Requested invalid region", ags);
      return;
    }

    wvv.dom.paneDetails.html('<img src="../../images/spin_loading.gif"  style="width:100%;">');
    wvv.dom.pane.show();
    wvv.dom.canvas.css("width", "calc(100% - 400px)");

    const regionInfo = allRegionsByAgs[ags];
    console.log(regionInfo);

    // TODO: if there's space left for the map at all
    wvv.map.invalidateSize();
    wvv.map.panTo(regionInfo.center);
    //$("#platforms-pane").hide();

    if (regionInfo.idsByPlatform.length == 0) {
      const text = "<b>Leider liegen für diese Postleitzahlen bis jetzt keine Angebote vor:</b><br>" +
                    regionInfo.zips.join(", ");

      wvv.dom.paneDetails.html('<div style="padding: 1rem;">' + text + '</div>');
    }
    else if (regionInfo.hasOwnProperty("cachedDetails")) {
      // TODO: select the divs to show!
      wvv.dom.paneDetails.html(regionInfo.cachedDetails);
    }
    else {
      // Select platforms that have IDs for the region and request details.
      const contentReady = [];
      const idxs = [];
      const ids = regionInfo.idsByPlatform;
      for (let i = 0; i < ids.length; i++) {
        if (ids[i] && ids[i].hasOwnProperty('length') && ids[i].length > 0) {
          contentReady.push(loadPlain(settings.platforms[i].restBaseUrl + "/details/" + ids[i].join(',')));
          //contentReady.push(loadPlain(platforms[i].url + "/details_html?ids=" + ids[i].join(',')));
          idxs.push(i);
        }
      }

      // We should have bailed out early in this case!
      if (contentReady.length == 0) {
        console.error("[Internal] IDs by platform cannot be empty at this point", regionInfo);
        return;
      }

      // Once all platforms responded, display their content.
      Promise.all(contentReady).then(
        function(htmls) {
          // TODO: Select the relevant DIVs (for static hosting, we always get all details)
          //const snippets = [];
          //for (let i = 0; i < idxs.length; i++) {
          //  const platformIdx = idxs[i];
          //  for (const id of regionInfo.idsByPlatform[platformIdx]) {
          //    const elem = $('#' + id, '<div>' + htmls[i] + '</div>');
          //    snippets.push(elem.html());
          //  }
          //}
          regionInfo.cachedDetails = htmls;
          wvv.dom.paneDetails.html(htmls);
        },
        err => closeDetails()
      );
    }
  }




  //    loadJson('assets/zipcodes.de.json').then(zipCodes => {
  //      const reg = {};
  //      for (const entry of zipCodes) {
  //        if (!reg.hasOwnProperty(entry.zipcode))
  //          reg[entry.zipcode] = { "ags": entry.community_code, "latlngs": [] };
  //        reg[entry.zipcode].latlngs.push([parseFloat(entry.latitude), parseFloat(entry.longitude)]);
  //      }
  //      console.log(JSON.stringify(reg));
  //    });

  var regionsByAgsReady = loadJson(asset('Karte_de_geodata.geo.json')).then(geoJson => {
    var geoJsonLayer = L.geoJSON(geoJson).addTo(wvv.map);
    geoJsonLayer.eachLayer(function (layer) {
      var lnglatRange = [[90, -90], [180, -180]];
      forEachPoint(layer.feature.geometry.coordinates, lnglat => {
        for (var i = 0; i < lnglat.length; i++) {
          if (lnglat[i] < lnglatRange[i][0]) // min
            lnglatRange[i][0] = lnglat[i];
          if (lnglat[i] > lnglatRange[i][1]) // max
            lnglatRange[i][1] = lnglat[i];
        }
      });

      var centerLatLng = L.latLng((lnglatRange[1][1] + lnglatRange[1][0]) / 2,
                                  (lnglatRange[0][1] + lnglatRange[0][0]) / 2);

      if (allRegionsByAgs.hasOwnProperty(layer.feature.properties.ags))
        console.warn("Duplicate ags?", layer.feature.properties.ags);

      var domElement = $(layer.getElement());
      allRegionsByAgs[layer.feature.properties.ags] = {
        elem: domElement,
        center: centerLatLng,
        name: layer.feature.properties.name,
        fill: domElement.css("fill"),
        opacity: domElement.css("fill-opacity"),
        zips: [],
        idsByPlatform: []
      };

      layer.on('mouseover', function (e) {
        var region = allRegionsByAgs[layer.feature.properties.ags];
        region.elem.css("fill", "#00C0C0");
        region.elem.css("fill-opacity", "0.2");
        console.log(layer.feature.properties.ags);
      });
      layer.on('mouseout', function (e) {
        var region = allRegionsByAgs[layer.feature.properties.ags];
        region.elem.css("fill", region.fill);
        region.elem.css("fill-opacity", region.opacity);
      });
      layer.on('click', function (e) {
        var region = allRegionsByAgs[layer.feature.properties.ags];
        var clickHandler = "viewDetailsR('" + layer.feature.properties.ags + "');";
        var popupContent = renderPreviewHtml(region.name, clickHandler);
        L.popup().setLatLng(region.center).setContent(popupContent).openOn(wvv.map);
        eval(clickHandler);
      });
    });

    var updateVisibleRegions = function() {
      var zoom = wvv.map.getZoom();
      for (var ags in allRegionsByAgs) {
        if (isRegionVisible(ags, zoom)) {
          allRegionsByAgs[ags].elem.show();
        }
        else {
          allRegionsByAgs[ags].elem.hide();
        }
      }
    };

    wvv.map.on('zoomend', updateVisibleRegions);
    updateVisibleRegions();
  });

  var zip2argsReady = loadJson(asset('zip2ags.json'));

  let idsByZipCodeReady = [];
  for (let i = 0; i < settings.platforms.length; i++) {
    idsByZipCodeReady.push(loadJson(settings.platforms[i].restBaseUrl + "/regions"));
  }

  const maxIdsPerRegionSize = { "2": 1, "5": 1 };

  function registerIdsInRegion(ags, ids, platformIdx) {
    if (allRegionsByAgs.hasOwnProperty(ags)) {
      const regionIds = allRegionsByAgs[ags].idsByPlatform;
      // JS will extend array as necessary
      const platformIds = regionIds[platformIdx] || [];
      //const platformIds = existing ? regionIds[platformIdx] : [];
      regionIds[platformIdx] = platformIds.concat(ids);
      maxIdsPerRegionSize[ags.length] =
          Math.max(maxIdsPerRegionSize[ags.length],
                    regionIds[platformIdx].length);
      return true;
    }
    return false;
  }

  function registerZipInRegion(ags, zip) {
    if (!allRegionsByAgs.hasOwnProperty(ags))
      return false;
    allRegionsByAgs[ags].zips.push(zip);
    return true;
  };


  var regionsReady = Promise.all(idsByZipCodeReady.concat([zip2argsReady, regionsByAgsReady]))
          .then(function (values) {
    if (settings.platforms.length != values.length - 2) {
      console.error("[Internal] Invalid promise results order");
      return;
    }

    // Result from zip2argsReady. The regionsByAgsReady promise has no return value.
    // The first platforms.length elements are IDs by ZIP
    const zip2ags = values[values.length - 2];
    const idsByZipCode = values;

    // TODO: Handle/detect overlap in IDs between different platforms!
    for (let i = 0; i < settings.platforms.length; i++) {
      for (const zip in idsByZipCode[i]) {
        const entry = idsByZipCode[i][zip];

        // Determine AGS code for given ZIP and validate.
        if (!zip2ags.hasOwnProperty(zip)) {
          console.warn("Unknown ZIP code", zip, "Dropping IDs", entry);
          continue;
        }
        const ags = zip2ags[zip].ags;
        if (!allRegionsByAgs.hasOwnProperty(ags)) {
          console.warn("Unknown AGS code", ags, "for zip", zip, "Dropping IDs", entry);
          continue;
        }

        if (!registerIdsInRegion(ags.substr(0, 2), entry, i)) {
          console.warn("Invalid AGS Bundesland prefix in", ags, "Dropping IDs", entry);
        }
        if (!registerIdsInRegion(ags.substr(0, 5), entry, i)) {
          console.warn("Invalid AGS Landkreis prefix in", ags, "Dropping IDs", entry);
        }
        if (ags.length > 5) {
          // TODO: We may have/use a more detailed encoding in the future.
          console.log("AGS code provides further region encoding", ags);
        }
      }
    }

    for (const zip in zip2ags) {
      var ags = zip2ags[zip].ags;
      if (!allRegionsByAgs.hasOwnProperty(ags)) {
        console.error("[Internal] Unknown AGS code", ags, "for zip", zip);
        continue;
      }
      if (!registerZipInRegion(ags.substr(0, 2), zip)) {
        console.error("[Internal] Invalid AGS Bundesland prefix in", ags);
      }
      if (!registerZipInRegion(ags.substr(0, 5), zip)) {
        console.error("[Internal] Invalid AGS Landkreis prefix in", ags);
      }
    }

    const numIds = function(region) {
      let sum = 0;
      for (const ids of region.idsByPlatform)
        sum += ids ? ids.length : 0;
      return sum;
    }

    for (var ags in allRegionsByAgs) {
      const region = allRegionsByAgs[ags];
      const strength = numIds(region) / maxIdsPerRegionSize[ags.length];
      region.opacity = strength * 0.5;
      region.elem.css("fill-opacity", region.opacity);
    }
  });

*/