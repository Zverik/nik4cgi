// Client code for "Get Veloroad".
// Written by Ilya Zverev, licensed WTFPL.
// (sorry for the mess)

var map, layers, rect, scale, fileContainer;

window.onload = function() {
	map = L.map('map', { minZoom: 6, maxZoom: 15 }).setView([60, 30], 7);

	// layers
	var veloroad = L.tileLayer('http://tile.osmz.ru/veloroad/{z}/{x}/{y}.png', { attribution: 'Map &copy; OpenStreetMap | Tiles &copy Ilya Zverev' });
	var osmlayer = L.tileLayer('http://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'Map &copy; OpenStreetMap' });
	layers = { 'veloroad': veloroad, 'veloroaden': veloroad, 'osm': osmlayer };
	map.addLayer(veloroad);

	// map data bounds. Remove if not needed
	L.geoJson(bounds, { style: function() { return { color: '#600', weight: 3, fill: false }; } }).addTo(map);
	// scale bar position
	scale = L.marker([59.8, 29], { draggable: true });
	// rectangle for image bounding box
	rect = L.rectangle([[59.8, 29], [60.2, 31]], { stroke: false });
	map.addLayer(rect);
	rect.editing.enable();
	// this is for "dimensions from zoom" option
	map.on('zoomend', function() { document.getElementById('zoom').value = map.getZoom(); });

	// drawing selected GPX trace on the map
	fileContainer = L.featureGroup().addTo(map);
	document.getElementById('file').addEventListener('change', function() {
		loadGPX(this.files[0]);
	}, false);

	updateFormat('A5');
	readPermalink();
}

function changeLayer(value) {
	var found = false;
	for( layer in layers ) {
		if( layer == value )
			found = true;
		map.removeLayer(layers[layer]);
	}
	map.addLayer(layers[found ? value : 'osm']);
}

// Snatched from leaflet.filelayer plugin
function loadGPX(file) {
	var layerOptions = { style: { color: '#012d64', opacity: 1, width: 4 } },
		fileSizeLimit = 4000;

	var fileSize = (file.size / 1024).toFixed(4);
	if (fileSize > fileSizeLimit) {
		alert('File size exceeds limit (' + fileSize + ' > ' + fileSizeLimit + 'kb)');
		return;
	}

	var reader = new FileReader();
	reader.onload = L.Util.bind(function (e) {
		try {
			// Format is either 'gpx' or 'kml'
			var content = e.target.result;
			if (typeof content == 'string') {
				content = ( new window.DOMParser() ).parseFromString(content, "text/xml");
			}
			content = toGeoJSON['gpx'](content);
			if (typeof content == 'string') {
				content = JSON.parse(content);
			}
			var layer = L.geoJson(content, layerOptions);
			if (layer.getLayers().length === 0) {
				alert('GeoJSON has no valid layers.');
				return;
			}
			fileContainer.clearLayers();
			fileContainer.addLayer(layer);
			map.fitBounds(layer.getBounds());
		}
		catch (err) {
			alert(err);
		}
	}, this);
	reader.readAsText(file);
}

function fitToTrace() {
	if( fileContainer.getLayers().length > 0 )
		rect.editing._setSize(fileContainer.getBounds().pad(0.02));
}

function updateFormat(format) {
	var fmt = format || document.getElementById('format').value,
		width = 0, height = 0,
		scale = document.getElementById('upx').checked ? 3.54 : 1;
	if( fmt == 'A4' ) { width = 297; height = 210; }
	else if( fmt == 'A5' ) { width = 210; height = 148; }
	else if( fmt == 'A6' ) { width = 148; height = 105; }
	if( width && height ) {
		document.getElementById('width').value = Math.round(width * scale);
		document.getElementById('height').value = Math.round(height * scale);
	}
}

function moveAreaHere() {
	var width4 = map.getSize().x / 4,
		height4 = map.getSize().y / 4,
		center = map.latLngToLayerPoint(map.getCenter()),
		ll1 = map.layerPointToLatLng(L.point(center.x - width4, center.y - height4)),
		ll2 = map.layerPointToLatLng(L.point(center.x + width4, center.y + height4));
	rect.editing._setSize([ll1, ll2]);
}

function fitPaper() {
	var margins = document.getElementById('margin').value,
		width = document.getElementById('width').value - margins * 2,
		height = document.getElementById('height').value - margins * 2;
	if( width < 10 || height < 10 )
		return;
	var topLeft = map.project(rect.getBounds().getNorthWest(), 18),
		bottomRight = map.project(rect.getBounds().getSouthEast(), 18),
		bwidth2 = (bottomRight.x - topLeft.x) / 2,
		bheight2 = (bottomRight.y - topLeft.y) / 2,
		bcenter = L.point((topLeft.x + bottomRight.x) / 2, (topLeft.y + bottomRight.y) / 2),
		bprop = bwidth2 / bheight2,
		prop = width / height;
	if( bwidth2 < bheight2 )
		prop = 1 / prop;

	if( bprop < prop ) {
		// increase width
		bwidth2 = bheight2 * prop;
	} else {
		// increase height
		bheight2 = bwidth2 / prop;
	}

	var ll1 = map.unproject(L.point(bcenter.x - bwidth2, bcenter.y + bheight2), 18),
		ll2 = map.unproject(L.point(bcenter.x + bwidth2, bcenter.y - bheight2), 18);
	rect.editing._setSize([ll1, ll2]);
}

function prepareBBox() {
	var bbox = rect.getBounds(),
		left = L.Util.formatNum(bbox.getWest(), 4),
		right = L.Util.formatNum(bbox.getEast(), 4),
		ttop = L.Util.formatNum(bbox.getNorth(), 4),
		bottom = L.Util.formatNum(bbox.getSouth(), 4);

	document.getElementById('fbbox').value = left + ',' + bottom + ',' + right + ',' + ttop;
	document.getElementById('fscalepos').value = scale.getLatLng().lng + ',' + scale.getLatLng().lat;
}

function enableScale(visible) {
	if( visible ) {
		map.addLayer(scale);
		if( !map.getBounds().contains(scale.getLatLng()) )
			scale.setLatLng(map.getCenter());
	} else
		map.removeLayer(scale);
}

function permalink() {
	function getRadio(arr) {
		for( var i = 0; i < arr.length; i++ )
			if( document.getElementById(arr[i]).checked )
				return document.getElementById(arr[i]).value;
		return null;
	}
	function d2(n) {
		return n > 9 ? '' + n : '0' + n;
	}
	prepareBBox();
	var opts = {};
	opts['zoom'] = map.getZoom();
	opts['lat'] = map.getCenter().lat;
	opts['lon'] = map.getCenter().lng;
	opts['bbox'] = document.getElementById('fbbox').value;
	opts['slat'] = scale.getLatLng().lat;
	opts['slon'] = scale.getLatLng().lng;
	opts['scale'] = getRadio(['scale']) ? document.getElementById('scalens').value : '';
	opts['units'] = getRadio(['umm', 'upx']);
	opts['width'] = document.getElementById('width').value;
	opts['height'] = document.getElementById('height').value;
	opts['margin'] = document.getElementById('margin').value;
	opts['dim'] = getRadio(['dim1', 'dim2', 'dim3', 'dim4']);
	opts['fit'] = document.getElementById('fit').checked ? 'on' : '';
	opts['style'] = document.getElementById('fstyle').value;
	opts['format'] = getRadio(['fmt1', 'fmt2', 'fmt3']);
	var href = false;
	for( o in opts ) {
		href = href ? href + '&' : '?';
		href += o + '=' + encodeURIComponent(opts[o]);
	}
	var date = new Date(),
		dateStr = d2(date.getFullYear() % 100) + d2(date.getMonth() + 1) + d2(date.getDate()),
		timeStr = d2(date.getHours()) + d2(date.getMinutes());
	var link = document.getElementById('permalink');
	link.href = href;
	link.style.display = 'block';
	link.innerHTML = opts['style'] + '-' + dateStr + '-' + timeStr + '.' + opts['format'];
	document.getElementById('permbtn').value = 'Update permalink';
}

function readPermalink() {
	function setRadio(arr, value) {
		for( var i = 0; i < arr.length; i++ )
			document.getElementById(arr[i]).checked = document.getElementById(arr[i]).value == value;
	}
	// from http://stackoverflow.com/a/2880929/1297601
	var opts = (function(a) {
		if (a == "") return {};
		var b = {};
		for (var i = 0; i < a.length; ++i)
		{
			var p=a[i].split('=');
			if (p.length != 2) continue;
			b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
		}
	    return b;
	})(window.location.search.substr(1).split('&'));

	if( opts['zoom'] ) map.setZoom(opts['zoom']);
	if( opts['lat'] && opts['lon'] )
		map.panTo(L.latLng(opts['lat'], opts['lon']));
	if( opts['bbox'] ) {
		var bbox = opts['bbox'].split(',');
		if( bbox.length == 4 )
			rect.editing._setSize([L.latLng(bbox[1], bbox[0]), L.latLng(bbox[3], bbox[2])]);
	}
	if( opts['slat'] && opts['slon'] )
		scale.setLatLng(L.latLng(opts['slat'], opts['slon']));
	document.getElementById('scale').checked = opts['scale'];
	enableScale(!(!opts['scale']));
	if( opts['scale'] ) document.getElementById('scalens').value = opts['scale'];
	if( opts['units'] ) setRadio(['umm', 'upx'], opts['units']);
	if( opts['width'] ) document.getElementById('width').value = opts['width'];
	if( opts['height'] ) document.getElementById('height').value = opts['height'];
	if( opts['margin'] ) document.getElementById('margin').value = opts['margin'];
	if( opts['dim'] ) setRadio(['dim1', 'dim2', 'dim3', 'dim4'], opts['dim']);
	document.getElementById('fit').checked = opts['fit'];
	if( opts['style'] ) {
		document.getElementById('fstyle').value = opts['style'];
		changeLayer(opts['style']);
	}
	if( opts['format'] ) setRadio(['fmt1', 'fmt2', 'fmt3'], opts['format']);
}
