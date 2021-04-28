import { Map } from 'https://cdn.skypack.dev/maplibre-gl';

const map = new Map({
  hash: false,
  maxZoom: 20,
  attributionControl: false,
  container: document.getElementById('map'),
  style: './style.json',
  center: [2.85, 48.35],
  zoom: 9,
  interactive: false,
});
map.on('idle', () => {
  document.body.classList.remove('loading');
});

window.map = map;
