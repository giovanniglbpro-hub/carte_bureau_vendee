// ===============================
//  Configuration selon ton GeoJSON
// ===============================
const COMMUNE_FIELD = 'nomCommune';
const BV_FIELD      = 'numeroBureauVote';
const CIRCO_FIELD   = 'nomCirconscription';

// Clés de stockage local
const STORAGE_KEYS = {
  settings: 'bvVend_settings',
  last:     'bvVend_last',
  favs:     'bvVend_favs',
  hist:     'bvVend_hist'
};

// ===============================
//  Références DOM
// ===============================
const selectCommune    = document.getElementById('selectCommune');
const selectBV         = document.getElementById('selectBV');
const othersOpacityInp = document.getElementById('othersOpacity');
const bureauColorInp   = document.getElementById('bureauColor');
const maskColorInp     = document.getElementById('maskColor');
const othersOpacityVal = document.getElementById('othersOpacityVal');

const searchInput   = document.getElementById('searchInput');
const searchBtn     = document.getElementById('searchBtn');
const searchStatus  = document.getElementById('searchStatus');
const exportBtn     = document.getElementById('exportBtn');
const communeLabel  = document.getElementById('communeLabel');
const locateBtn     = document.getElementById('locateBtn');
const radiusSelect  = document.getElementById('radiusSelect');
const basemapSelect = document.getElementById('basemapSelect');
const resetBtn      = document.getElementById('resetBtn');
const copyLinkBtn   = document.getElementById('copyLinkBtn');
const helpBtn       = document.getElementById('helpBtn');
const favAddBtn     = document.getElementById('favAddBtn');
const favClearBtn   = document.getElementById('favClearBtn');
const favSelect     = document.getElementById('favSelect');
const histClearBtn  = document.getElementById('histClearBtn');
const historySelect = document.getElementById('historySelect');
const infoBV        = document.getElementById('infoBV');
const modeBtn       = document.getElementById('modeBtn');

// ===============================
//  Carte Leaflet + fonds
// ===============================
const baseLayers = {
  osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }),
  light: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap & Carto'
  }),
  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap & Carto'
  })
};

const map = L.map('map', {
  center: [46.65, -1.35],
  zoom: 9,
  layers: [baseLayers.osm]
});

let currentBase = 'osm';

let geojsonLayer     = null;
let searchMarker     = null;
let locateCircle     = null;
let selectedCommune  = null;
let selectedNumero   = null;
let uiMode           = 'pc'; // 'pc' ou 'mobile'

const communesSet   = new Set();
const bvParCommune  = new Map();

// ===============================
//  Helpers réglages & stockage
// ===============================
function getOthersOpacity() {
  return Number(othersOpacityInp?.value || 70) / 100;
}

function getBureauColor() {
  return bureauColorInp?.value || '#ff0000';
}

function getMaskColor() {
  return maskColorInp?.value || '#888888';
}

function updateCommuneLabel() {
  if (selectedCommune) {
    communeLabel.textContent = `Commune choisie : ${selectedCommune}`;
  } else {
    communeLabel.textContent = 'Commune choisie : Toutes communes';
  }
}

function saveSettings() {
  const settings = {
    othersOpacity: othersOpacityInp ? othersOpacityInp.value : null,
    bureauColor:   bureauColorInp ? bureauColorInp.value : null,
    maskColor:     maskColorInp ? maskColorInp.value : null,
    basemap:       currentBase,
    darkMode:      document.body.classList.contains('dark'),
    mode:          uiMode
  };
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

function loadSettings() {
  const raw = localStorage.getItem(STORAGE_KEYS.settings);
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    if (s.othersOpacity && othersOpacityInp) othersOpacityInp.value = s.othersOpacity;
    if (s.bureauColor && bureauColorInp)     bureauColorInp.value   = s.bureauColor;
    if (s.maskColor && maskColorInp)         maskColorInp.value     = s.maskColor;
    if (s.basemap && baseLayers[s.basemap]) {
      setBasemap(s.basemap, false);
      if (basemapSelect) basemapSelect.value = s.basemap;
    }
    if (s.darkMode) {
      document.body.classList.add('dark');
    }
    if (s.mode) {
      applyMode(s.mode, false);
    }
  } catch (e) {
    console.warn('Erreur chargement settings', e);
  }
}

function saveLastSelection() {
  const obj = {
    commune: selectedCommune,
    numero:  selectedNumero
  };
  localStorage.setItem(STORAGE_KEYS.last, JSON.stringify(obj));
}

function loadLastSelection() {
  const raw = localStorage.getItem(STORAGE_KEYS.last);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadFavs() {
  const raw = localStorage.getItem(STORAGE_KEYS.favs);
  if (!raw) return [];
  try { return JSON.parse(raw) || []; } catch { return []; }
}

function saveFavs(favs) {
  localStorage.setItem(STORAGE_KEYS.favs, JSON.stringify(favs));
}

function loadHistory() {
  const raw = localStorage.getItem(STORAGE_KEYS.hist);
  if (!raw) return [];
  try { return JSON.parse(raw) || []; } catch { return []; }
}

function saveHistory(hist) {
  localStorage.setItem(STORAGE_KEYS.hist, JSON.stringify(hist));
}

// ===============================
//  Mode PC / Mobile
// ===============================
function applyMode(mode, save = true) {
  uiMode = mode === 'mobile' ? 'mobile' : 'pc';
  if (uiMode === 'mobile') {
    document.body.classList.add('mobile-mode');
    if (modeBtn) modeBtn.textContent = 'Mode PC';
  } else {
    document.body.classList.remove('mobile-mode');
    if (modeBtn) modeBtn.textContent = 'Mode mobile';
  }
  if (save) saveSettings();
}

if (modeBtn) {
  modeBtn.addEventListener('click', () => {
    applyMode(uiMode === 'pc' ? 'mobile' : 'pc');
  });
}

// Auto-mode par défaut si pas de réglage en mémoire
if (!localStorage.getItem(STORAGE_KEYS.settings)) {
  if (window.innerWidth < 768) {
    applyMode('mobile', false);
  } else {
    applyMode('pc', false);
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
//  Application des styles
// ===============================
function applyStyles() {
  if (!geojsonLayer) return;

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
      return;
    }

    // Bureau de la commune mais non sélectionné
    layer.setStyle(styleDefault(layer.feature));
  });
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
function setHighlighted(commune, numero, options = { zoom: true }) {
  selectedCommune = commune;
  selectedNumero  = numero;
  updateCommuneLabel();
  updateInfoBV();
  applyStyles();
  saveLastSelection();
  saveSettings();

  const layer = getHighlightedLayer();
  if (layer && options.zoom) {
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
//  Info bureau
// ===============================
function updateInfoBV() {
  if (!selectedCommune || !selectedNumero || !geojsonLayer) {
    infoBV.textContent = 'Bureau : aucun sélectionné.';
    return;
  }

  let props = null;

  geojsonLayer.eachLayer(layer => {
    const p = layer.feature.properties;
    if (p[COMMUNE_FIELD] === selectedCommune && p[BV_FIELD] === selectedNumero) {
      props = p;
    }
  });

  if (!props) {
    infoBV.textContent = 'Bureau : aucun sélectionné.';
    return;
  }

  const nomCommune = props[COMMUNE_FIELD];
  const num        = props[BV_FIELD];
  const nomBV      = props.nomBureauVote || '(nom bureau inconnu)';
  const circo      = props[CIRCO_FIELD] || 'Circo inconnue';

  infoBV.textContent =
    `Commune : ${nomCommune} | BV ${num} – ${nomBV} | ${circo}`;
}

// ===============================
//  Fonds de carte
// ===============================
function setBasemap(name, save = true) {
  if (currentBase === name) return;
  map.removeLayer(baseLayers[currentBase]);
  map.addLayer(baseLayers[name]);
  currentBase = name;
  if (save) saveSettings();
}

// ===============================
//  Favoris & historique
// ===============================
function refreshFavSelect() {
  const favs = loadFavs();
  if (!favSelect) return;
  favSelect.innerHTML = "<option value=''>-- Aucun --</option>";
  favs.forEach((f, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = `${f.commune} – BV ${f.numero}`;
    favSelect.appendChild(opt);
  });
}

function addCurrentToFavs() {
  if (!selectedCommune || !selectedNumero) {
    alert('Aucun bureau sélectionné.');
    return;
  }
  const favs = loadFavs();
  if (!favs.find(f => f.commune === selectedCommune && f.numero === selectedNumero)) {
    favs.push({ commune: selectedCommune, numero: selectedNumero });
    saveFavs(favs);
    refreshFavSelect();
    alert('Bureau ajouté aux favoris.');
  } else {
    alert('Ce bureau est déjà dans les favoris.');
  }
}

function clearFavs() {
  if (!confirm('Effacer tous les favoris ?')) return;
  saveFavs([]);
  refreshFavSelect();
}

function refreshHistorySelect() {
  const hist = loadHistory();
  if (!historySelect) return;
  historySelect.innerHTML = "<option value=''>-- Historique --</option>";
  hist.forEach((h, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = `${h.type === 'loc' ? '📍' : '🔎'} ${h.label}`;
    historySelect.appendChild(opt);
  });
}

function pushHistory(entry) {
  const hist = loadHistory();
  hist.unshift(entry);
  if (hist.length > 10) hist.pop();
  saveHistory(hist);
  refreshHistorySelect();
}

function clearHistory() {
  if (!confirm('Effacer tout l’historique ?')) return;
  saveHistory([]);
  refreshHistorySelect();
}

// ===============================
//  Chargement du GeoJSON
// ===============================
let initialBounds = null;

fetch('bureaux.geojson')
  .then(r => r.json())
  .then(data => {
    loadSettings();

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

        // Survol (PC)
        layer.on('mouseover', () => {
          layer.setStyle({ weight: 3 });
        });
        layer.on('mouseout', () => {
          applyStyles();
        });

        // Clic sur un bureau
        layer.on('click', () => {
          selectedCommune = commune;
          selectedNumero  = num;

          selectCommune.value = commune;
          populateBVSelect(commune);
          selectBV.value = num;

          setHighlighted(commune, num);

          // Popup info simple
          const circo = props[CIRCO_FIELD] || 'Circo inconnue';
          const nomBV = props.nomBureauVote || '';
          layer.bindPopup(
            `<b>${commune}</b><br>BV ${num} ${nomBV ? '– ' + nomBV : ''}<br>${circo}`
          ).openPopup();
        });
      }
    }).addTo(map);

    initialBounds = geojsonLayer.getBounds();
    map.fitBounds(initialBounds);

    populateCommuneSelect();
    syncUI();
    refreshFavSelect();
    refreshHistorySelect();

    // Appliquer éventuels paramètres d'URL ou dernière sélection
    applyURLParamsOrLast();
    applyStyles();
  })
  .catch(err => {
    console.error('Erreur chargement GeoJSON', err);
  });

// ===============================
//  UI sliders
// ===============================
function syncUI() {
  if (othersOpacityVal && othersOpacityInp) {
    othersOpacityVal.textContent = othersOpacityInp.value + '%';
  }
}
if (othersOpacityInp) {
  othersOpacityInp.addEventListener('input', () => { syncUI(); applyStyles(); saveSettings(); });
}
if (bureauColorInp) {
  bureauColorInp.addEventListener('input', () => { applyStyles(); saveSettings(); });
}
if (maskColorInp) {
  maskColorInp.addEventListener('input', () => { applyStyles(); saveSettings(); });
}

// Fond
if (basemapSelect) {
  basemapSelect.addEventListener('change', () => {
    setBasemap(basemapSelect.value, true);
  });
}

// ===============================
//  Sélecteurs
// ===============================
selectCommune.addEventListener('change', () => {
  selectedCommune = selectCommune.value || null;
  selectedNumero  = null;
  populateBVSelect(selectedCommune);
  updateCommuneLabel();
  updateInfoBV();

  if (selectedCommune) {
    zoomToCommune(selectedCommune);
  } else if (geojsonLayer && initialBounds) {
    map.fitBounds(initialBounds);
  }

  applyStyles();
  saveLastSelection();
  saveSettings();
});

selectBV.addEventListener('change', () => {
  if (selectBV.value) {
    setHighlighted(selectedCommune, selectBV.value);
  } else {
    selectedNumero = null;
    updateInfoBV();
    applyStyles();
    saveLastSelection();
  }
});

// ===============================
//  Recherche d'adresse
// ===============================
function drawRadiusCircle(lat, lon) {
  if (!radiusSelect) return;
  const radius = Number(radiusSelect.value || 0);
  if (locateCircle) {
    map.removeLayer(locateCircle);
    locateCircle = null;
  }
  if (radius > 0) {
    locateCircle = L.circle([lat, lon], {
      radius,
      color: '#3388ff',
      weight: 1,
      fillOpacity: 0.1
    }).addTo(map);
  }
}

function searchAddress() {
  const q = searchInput.value.trim();
  if (!q) return;

  searchStatus.textContent = 'Recherche de l’adresse…';

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

      drawRadiusCircle(lat, lon);

      const pt = turf.point([lon, lat]);
      let foundCommune = null;
      let foundNum     = null;

      if (!geojsonLayer) {
        searchStatus.textContent = 'Adresse trouvée, mais bureaux non chargés.';
        return;
      }

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

        pushHistory({
          type: 'search',
          label: `${foundCommune} – BV ${foundNum}`,
          commune: foundCommune,
          numero: foundNum,
          lat, lon
        });
      } else {
        searchStatus.textContent = 'Adresse hors des bureaux enregistrés.';
      }
    })
    .catch(err => {
      console.error(err);
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

  searchStatus.textContent = 'Demande de localisation…';

  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      if (searchMarker) map.removeLayer(searchMarker);
      searchMarker = L.marker([lat, lon]).addTo(map);
      map.setView([lat, lon], 17);

      drawRadiusCircle(lat, lon);

      if (!geojsonLayer) {
        searchStatus.textContent = 'Localisation OK, mais bureaux non chargés.';
        return;
      }

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
        pushHistory({
          type: 'loc',
          label: `${foundCommune} – BV ${foundNum}`,
          commune: foundCommune,
          numero: foundNum,
          lat, lon
        });
      } else {
        searchStatus.textContent = 'Localisation OK, mais en dehors des bureaux enregistrés (sans doute hors Vendée).';
      }
    },
    err => {
      console.error('Erreur geoloc :', err);
      if (err.code === 1) {
        searchStatus.textContent = 'Localisation refusée.';
      } else if (err.code === 2) {
        searchStatus.textContent = 'Position indisponible.';
      } else if (err.code === 3) {
        searchStatus.textContent = 'Délai dépassé.';
      } else {
        searchStatus.textContent = 'Erreur de localisation.';
      }
      alert("La localisation n’a pas pu être obtenue.\nVérifie les permissions de ton navigateur.");
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
}

if (locateBtn) {
  locateBtn.addEventListener('click', locateMe);
}

// ===============================
//  Bouton Reset
// ===============================
function resetView() {
  selectedCommune = null;
  selectedNumero  = null;
  selectCommune.value = '';
  selectBV.innerHTML = "<option value=''>-- Choisir --</option>";

  if (searchMarker) { map.removeLayer(searchMarker); searchMarker = null; }
  if (locateCircle) { map.removeLayer(locateCircle); locateCircle = null; }

  updateCommuneLabel();
  updateInfoBV();
  if (initialBounds) map.fitBounds(initialBounds);
  applyStyles();
  saveLastSelection();
}

resetBtn.addEventListener('click', resetView);

// ===============================
//  Favoris & historique UI
// ===============================
if (favAddBtn) {
  favAddBtn.addEventListener('click', addCurrentToFavs);
}

if (favClearBtn) {
  favClearBtn.addEventListener('click', clearFavs);
}

if (favSelect) {
  favSelect.addEventListener('change', () => {
    const idx = favSelect.value;
    if (!idx) return;
    const favs = loadFavs();
    const f = favs[Number(idx)];
    if (!f) return;
    selectedCommune = f.commune;
    selectedNumero  = f.numero;

    selectCommune.value = f.commune;
    populateBVSelect(f.commune);
    selectBV.value = f.numero;

    setHighlighted(f.commune, f.numero);
  });
}

if (histClearBtn) {
  histClearBtn.addEventListener('click', clearHistory);
}

if (historySelect) {
  historySelect.addEventListener('change', () => {
    const idx = historySelect.value;
    if (!idx) return;
    const hist = loadHistory();
    const h = hist[Number(idx)];
    if (!h) return;

    if (h.lat && h.lon) {
      if (searchMarker) map.removeLayer(searchMarker);
      searchMarker = L.marker([h.lat, h.lon]).addTo(map);
      map.setView([h.lat, h.lon], 17);
      drawRadiusCircle(h.lat, h.lon);
    }

    if (h.commune && h.numero) {
      selectedCommune = h.commune;
      selectedNumero  = h.numero;

      selectCommune.value = h.commune;
      populateBVSelect(h.commune);
      selectBV.value = h.numero;

      setHighlighted(h.commune, h.numero);
    }
  });
}

// ===============================
//  Lien partageable
// ===============================
function buildShareURL(commune, numero) {
  const url = new URL(window.location.href);
  if (commune) url.searchParams.set('commune', commune);
  else url.searchParams.delete('commune');
  if (numero) url.searchParams.set('bv', numero);
  else url.searchParams.delete('bv');
  return url.toString();
}

if (copyLinkBtn) {
  copyLinkBtn.addEventListener('click', () => {
    if (!selectedCommune || !selectedNumero) {
      alert('Sélectionne d’abord une commune et un bureau.');
      return;
    }
    const link = buildShareURL(selectedCommune, selectedNumero);
    navigator.clipboard.writeText(link)
      .then(() => alert('Lien copié dans le presse-papiers.'))
      .catch(() => alert(link));
  });
}

// ===============================
//  Paramètres d’URL / dernière sélection
// ===============================
function applyURLParamsOrLast() {
  const params = new URLSearchParams(window.location.search);
  const communeParam = params.get('commune');
  const bvParam      = params.get('bv');

  if (communeParam && communesSet.has(communeParam)) {
    selectedCommune = communeParam;
    selectCommune.value = communeParam;
    populateBVSelect(communeParam);

    if (bvParam && bvParCommune.get(communeParam)?.has(bvParam)) {
      selectBV.value = bvParam;
      selectedNumero = bvParam;
      setHighlighted(communeParam, bvParam);
      return;
    } else {
      selectedNumero = null;
      zoomToCommune(communeParam);
      applyStyles();
      updateCommuneLabel();
      return;
    }
  }

  // Sinon, dernière sélection enregistrée
  const last = loadLastSelection();
  if (last && last.commune && communesSet.has(last.commune)) {
    selectedCommune = last.commune;
    selectCommune.value = last.commune;
    populateBVSelect(last.commune);
    if (last.numero && bvParCommune.get(last.commune)?.has(last.numero)) {
      selectBV.value = last.numero;
      selectedNumero = last.numero;
      setHighlighted(last.commune, last.numero, { zoom: false });
      zoomToCommune(last.commune);
      applyStyles();
    } else {
      selectedNumero = null;
      zoomToCommune(last.commune);
      applyStyles();
      updateCommuneLabel();
    }
  } else {
    updateCommuneLabel();
    updateInfoBV();
  }
}

// ===============================
//  Aide
// ===============================
if (helpBtn) {
  helpBtn.addEventListener('click', () => {
    alert(
      "MODE D’EMPLOI RAPIDE :\n\n" +
      "- Choisis une commune, puis un bureau : la carte zoome dessus.\n" +
      "- Mode mobile : interface allégée pour smartphone.\n" +
      "- Adresse : cherche une adresse et montre dans quel bureau elle tombe.\n" +
      "- Me localiser : utilise le GPS (surtout sur mobile).\n" +
      "- Exporter PNG : télécharge une image de la carte actuelle.\n" +
      "- Favoris (PC) : enregistre des bureaux importants pour les retrouver.\n" +
      "- Historique (PC) : garde les dernières recherches/localisations.\n" +
      "- Effacer favoris / historique : tout est effacé SUR TON NAVIGATEUR uniquement.\n" +
      "- Copier lien (PC) : lien direct vers le bureau / la commune sélectionné(e)."
    );
  });
}
