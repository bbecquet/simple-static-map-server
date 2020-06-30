const map = new mapboxgl.Map({
  hash: false,
  maxZoom: 20,
  attributionControl: false,
  container: document.getElementById('map'),
  style: './style.json',
  center: [2.85, 48.35],
  zoom: 9
});
map.on('idle', () => {
  document.body.classList.remove('loading');
});

window.map = map;
