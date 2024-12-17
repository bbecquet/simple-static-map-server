import * as M from 'maplibre-gl';

const map = new maplibregl.Map({
  hash: false,
  maxZoom: 20,
  attributionControl: false,
  container: document.getElementById('map'),
  center: [0, 0],
  zoom: 9,
  interactive: false,
});
map.on('idle', () => {
  document.body.classList.remove('loading');
});

window.map = map;
