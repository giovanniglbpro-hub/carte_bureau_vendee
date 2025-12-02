// ===============================
//  Configuration selon ton GeoJSON
// ===============================
const COMMUNE_FIELD = 'nomCommune';
const BV_FIELD      = 'numeroBureauVote';

// ===============================
//  Références DOM
// ===============================
const selectCommune    = document.getElementById('selectCommune');
const selectBV         = document.getElementById('selectBV');
const maskOpacityInp   = document.getElementById('maskOpacity');
const othersOpacityInp = document.getElementById('othersOpacity');
const bureauColorInp   = document.getElementById('bureauColor');
const maskColorInp     = document.getElementById('maskColor');
const maskOpacityVal   = document.getElementById('maskOpacityVal');
const othersOpacityVal = document.getElementById('othersOpacityVal');

const searchInput  = document.getElementById('searchInput');
const searchBtn    = document.getElementById('searchBtn');
const searchStatus = document.getElementById('searchStatus');
const exportBtn    = document.getElementById('exportBtn');
const communeLabel = document.getElementById('communeLabel');
const locateBtn    = document.getElementById('locateBtn');

// ===============================
//  Carte Leaflet
// ===============================
const map = L.map('map').setView([46.65, -1.35], 9); // Vue Vendée

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

let geojsonLayer     = null;
let darkMask         = null;
let searchMarker     = null;
let selectedCommune  = null;
let selectedNumero   = null;

const communesSet   = new Set();
const bvParCommune  = new Map();

// ===============================
//  Helpers réglages
// ===============================
function getMaskOpacity() {
  return Number(maskOpacityInp.value) / 100;
}

function getOthersOpacity() {
  return Number(othersOpacityInp.value) / 100;
}

function getBureauColor() {
  return bureauColorInp.value;
}

function getMaskColor() {
  return maskColorInp.value;
}

function updateCommuneLabel() {
  if (selectedCommune) {
    communeLabel.textContent = `Commune choisie : ${selectedCommune}`;
  } else {
    communeLabel.textContent = 'Commune choisie : Toutes communes';
  }
}

// ===============================
//  Style des bureaux
// ===============================
function styleDefault(feature) {
  const props    = feature.properties;
  const commune  = props[COMMUNE_FIELD];

  // Si une commune est choisie, cacher totalement les autres
  if (selectedCommune && commune !== selectedCommune) {
    return {
      color: '#000000',
      weight: 0,
      opacity: 0,
      fillOpacity: 0
    };
  }

  return {
    color: '#000000',
    weight: 1,
    opacity: 1,
    fillColor: getMaskColor(),
    fillOpacity: getOthersOpacity()
  };
}

// ===============================
//  Masque sombre autour du bureau
// ===============================
function createMask(excludedLayer) {
  if (darkMask) {
    map.removeLayer(darkMask);
    darkMask = null;
  }

  if (!excludedLayer) return;

  const outerRing = [
    [90, -180], [90, 180], [-90, 180], [-90, -180]
  ];

  let rings = excludedLayer.getLatLngs();
  let inner;

  if (Array.isArray(rings[0][0])) inner = rings[0][0];
  else inner = rings[0];

  darkMask = L.polygon([outerRing, inner], {
    color: getMaskColor(),
    weight: 0,
    fillColor: getMaskColor(),
    fillOpacity: getMaskOpacity(),
    fillRule: 'evenodd'
  }).addTo(map);

  geojsonLayer.bringToFront();
}

// ===============================
//  Application des styles
// ===============================
function applyStyles() {
  if (!geojsonLayer) return;

  let highlightedLayer = null;

  geojsonLayer.eachLayer(layer => {
    const props   = layer.feature.properties;
    const commune = props[COMMUNE_FIELD];
    const num     = props[BV_FIELD];

    // Bureaux d'autres communes -> cachés
    if (selectedCommune && commune !== selectedCommune) {
      layer.setStyle({
        color: '#000000',
        weight: 0,
        opacity: 0,
        fillOpacity: 0
      });
      return;
    }

    // Bureau sélectionné
    if (
      selectedCommune &&
      selectedNumero &&
      commune === selectedCommune &&
      num === selectedNumero
    ) {
      layer.setStyle({
        color: getBureauColor(),
        weight: 3,
        opacity: 1,
        fillColor: getBureauColor(),
        fillOpacity: 0
      });
      highlightedLayer = layer;
      return;
    }

    // Bureau de la commune mais non sélectionné
    layer.setStyle(styleDefault(layer.feature));
  });

  if (highlightedLayer) createMask(highlightedLayer);
  else createMask(null);
}

function getHighlightedLayer() {
  let res = null;

  geojsonLayer.eachLayer(layer => {
    const props = layer.feature.properties;
    if (
      props[COMMUNE_FIELD] === selectedCommune &&
      props[BV_FIELD] === selectedNumero
    ) {
      res = layer;
    }
  });

  return res;
}

// ===============================
//  Zoom sur commune entière
// ===============================
function zoomToCommune(commune) {
  let bounds = null;

  geojsonLayer.eachLayer(layer => {
    const props = layer.feature.properties;
    if (props[COMMUNE_FIELD] === commune) {
      bounds = bounds ? bounds.extend(layer.getBounds()) : layer.getBounds();
    }
  });

  if (bounds) map.fitBounds(bounds, { padding: [30, 30] });
}

// ===============================
//  Sélection du bureau
// ===============================
function setHighlighted(commune, numero) {
  selectedCommune = commune;
  selectedNumero  = numero;
  updateCommuneLabel();
  applyStyles();

  const layer = getHighlightedLayer();
  if (layer) {
    map.fitBounds(layer.getBounds(), { maxZoom: 17, padding: [40, 40] });
  }
}

// ===============================
//  Listes déroulantes
// ===============================
function populateCommuneSelect() {
  Array.from(communesSet)
    .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
    .forEach(commune => {
      const opt = document.createElement('option');
      opt.value = commune;
      opt.textContent = commune;
      selectCommune.appendChild(opt);
    });
}

function populateBVSelect(commune) {
  selectBV.innerHTML = "<option value=''>-- Choisir --</option>";

  if (!commune) return;

  const list = Array.from(bvParCommune.get(commune) || [])
    .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));

  list.forEach(num => {
    const opt = document.createElement('option');
    opt.value = num;
    opt.textContent = `BV ${num}`;
    selectBV.appendChild(opt);
  });
}

// ===============================
//  Chargement du GeoJSON
// ===============================
fetch('bureaux.geojson')
  .then(r => r.json())
  .then(data => {
    geojsonLayer = L.geoJSON(data, {
      style: styleDefault,
      onEachFeature: (feature, layer) => {
        const props    = feature.properties;
        const commune  = props[COMMUNE_FIELD];
        const num      = props[BV_FIELD];

        communesSet.add(commune);
        if (!bvParCommune.has(commune)) {
          bvParCommune.set(commune, new Set());
        }
        bvParCommune.get(commune).add(num);

        layer.on('click', () => {
          selectedCommune = commune;
          selectedNumero  = num;

          selectCommune.value = commune;
          populateBVSelect(commune);
          selectBV.value = num;

          setHighlighted(commune, num);
        });
      }
    }).addTo(map);

    map.fitBounds(geojsonLayer.getBounds());
    populateCommuneSelect();
    updateCommuneLabel();
  });

// ===============================
//  UI sliders
// ===============================
function syncUI() {
  maskOpacityVal.textContent   = maskOpacityInp.value + '%';
  othersOpacityVal.textContent = othersOpacityInp.value + '%';
}
maskOpacityInp.addEventListener('input', () => { syncUI(); applyStyles(); });
othersOpacityInp.addEventListener('input', () => { syncUI(); applyStyles(); });
bureauColorInp.addEventListener('input', applyStyles);
maskColorInp.addEventListener('input', applyStyles);
syncUI();

// ===============================
//  Sélecteurs
// ===============================
selectCommune.addEventListener('change', () => {
  selectedCommune = selectCommune.value || null;
  selectedNumero  = null;
  populateBVSelect(selectedCommune);
  updateCommuneLabel();

  if (selectedCommune) {
    zoomToCommune(selectedCommune);
  } else if (geojsonLayer) {
    map.fitBounds(geojsonLayer.getBounds());
  }

  applyStyles();
});

selectBV.addEventListener('change', () => {
  if (selectBV.value) {
    setHighlighted(selectedCommune, selectBV.value);
  } else {
    selectedNumero = null;
    applyStyles();
  }
});

// ===============================
//  Recherche d'adresse
// ===============================
function searchAddress() {
  const q = searchInput.value.trim();
  if (!q) return;

  searchStatus.textContent = 'Recherche…';

  fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q))
    .then(r => r.json())
    .then(results => {
      if (!results.length) {
        searchStatus.textContent = 'Adresse introuvable.';
        return;
      }

      const r = results[0];
      const lat = parseFloat(r.lat);
      const lon = parseFloat(r.lon);

      if (searchMarker) map.removeLayer(searchMarker);
      searchMarker = L.marker([lat, lon]).addTo(map);
      map.setView([lat, lon], 17);

      const pt = turf.point([lon, lat]);
      let foundCommune = null;
      let foundNum     = null;

      geojsonLayer.eachLayer(layer => {
        if (turf.booleanPointInPolygon(pt, layer.feature)) {
          const props = layer.feature.properties;
          foundCommune = props[COMMUNE_FIELD];
          foundNum     = props[BV_FIELD];
        }
      });

      if (foundCommune && foundNum) {
        selectedCommune = foundCommune;
        selectedNumero  = foundNum;

        selectCommune.value = foundCommune;
        populateBVSelect(foundCommune);
        selectBV.value = foundNum;

        setHighlighted(foundCommune, foundNum);
        searchStatus.textContent = `➡ ${foundCommune}, BV ${foundNum}`;
      } else {
        searchStatus.textContent = 'Hors bureau.';
      }
    })
    .catch(() => {
      searchStatus.textContent = 'Erreur de recherche.';
    });
}

searchBtn.addEventListener('click', searchAddress);
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') searchAddress();
});

// ===============================
//  Localisation (GPS)
// ===============================
function locateMe() {
  if (!navigator.geolocation) {
    alert('La géolocalisation n’est pas supportée par ce navigateur.');
    return;
  }

  searchStatus.textContent = 'Localisation en cours…';

  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      if (searchMarker) map.removeLayer(searchMarker);
      searchMarker = L.marker([lat, lon]).addTo(map);
      map.setView([lat, lon], 17);

      if (!geojsonLayer) return;

      const pt = turf.point([lon, lat]);
      let foundCommune = null;
      let foundNum     = null;

      geojsonLayer.eachLayer(layer => {
        if (turf.booleanPointInPolygon(pt, layer.feature)) {
          const props = layer.feature.properties;
          foundCommune = props[COMMUNE_FIELD];
          foundNum     = props[BV_FIELD];
        }
      });

      if (foundCommune && foundNum) {
        selectedCommune = foundCommune;
        selectedNumero  = foundNum;

        selectCommune.value = foundCommune;
        populateBVSelect(foundCommune);
        selectBV.value = foundNum;

        setHighlighted(foundCommune, foundNum);
        searchStatus.textContent = `Vous êtes dans : ${foundCommune}, BV ${foundNum}`;
      } else {
        searchStatus.textContent = 'Vous êtes hors des bureaux enregistrés.';
      }
    },
    err => {
      console.error(err);
      searchStatus.textContent = 'Localisation refusée ou impossible.';
    },
    {
      enableHighAccuracy: true,
      timeout: 10000
    }
  );
}

locateBtn.addEventListener('click', locateMe);

// ===============================
//  Export PNG
// ===============================
exportBtn.addEventListener('click', () => {
  const mapDiv = document.getElementById('map');
  exportBtn.textContent = 'Export…';
  exportBtn.disabled = true;

  const layer = getHighlightedLayer();

  const doCapture = () => {
    html2canvas(mapDiv, { useCORS: true }).then(canvas => {
      const link = document.createElement('a');
      link.download = selectedCommune && selectedNumero
        ? `BV-${selectedCommune}-${selectedNumero}.png`
        : 'Vendee-carte.png';
      link.href = canvas.toDataURL();
      link.click();

      exportBtn.textContent = 'Exporter PNG';
      exportBtn.disabled = false;
    }).catch(() => {
      exportBtn.textContent = 'Exporter PNG';
      exportBtn.disabled = false;
      alert('Erreur lors de l’export PNG.');
    });
  };

  if (layer) {
    map.fitBounds(layer.getBounds(), { maxZoom: 17, padding: [40, 40] });
    map.once('moveend', () => setTimeout(doCapture, 200));
  } else {
    doCapture();
  }
});
