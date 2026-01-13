// searchManager.js
import { DOM, openDetailsPanel } from './ui.js';
import { state } from './state.js';
import { getPoiName, getPoiId } from './data.js';
import { map } from './map.js';

export function setupSearch() {
    const query = DOM.searchInput.value.toLowerCase().trim();
    DOM.searchResults.innerHTML = '';
    DOM.searchResults.style.display = 'none';
    if (query.length === 0) return;
    
    const results = state.loadedFeatures.filter(f => {
        // Filtre poubelle (Soft delete check)
        const poiId = getPoiId(f); 
        if (state.hiddenPoiIds && state.hiddenPoiIds.includes(poiId)) {
            return false;
        }

        const originalName = f.properties['Nom du site FR']?.toLowerCase() || '';
        const customName = f.properties.userData?.custom_title?.toLowerCase() || '';
        return originalName.includes(query) || customName.includes(query);
    });
    
    if (results.length > 0) {
        results.slice(0, 10).forEach(feature => {
            const resultBtn = document.createElement('button');
            resultBtn.textContent = getPoiName(feature);
            resultBtn.addEventListener('click', () => {
                DOM.searchInput.value = '';
                DOM.searchResults.style.display = 'none';

                state.geojsonLayer.eachLayer(layer => {
                    if (layer.feature === feature) {
                        map.flyTo(layer.getLatLng(), 16);
                    }
                });

                const featureId = state.loadedFeatures.indexOf(feature);
                if (featureId > -1) {
                    const circuitIndex = state.currentCircuit.findIndex(f => getPoiId(f) === getPoiId(feature));
                    openDetailsPanel(featureId, circuitIndex !== -1 ? circuitIndex : null);
                }
            });
            DOM.searchResults.appendChild(resultBtn);
        });
        DOM.searchResults.style.display = 'block';
    }
}

export function setupSmartSearch() {
    // Écouteur pour la recherche GPS intelligente (Touche Entrée)
    DOM.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = DOM.searchInput.value.trim();
            console.log("SmartSearch: Touche Entrée détectée. Recherche :", query);
            
            // Regex pour détecter "33.8787, 10.8413" ou "33.8787 10.8413"
            const coordsRegex = /^(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)$/;
            const match = query.match(coordsRegex);

            if (match) {
                const lat = parseFloat(match[1]);
                const lng = parseFloat(match[3]);
                console.log("Coordonnées valides :", lat, lng);

                const mapInstance = (typeof map !== 'undefined' ? map : window.map);
                
                if (mapInstance) {
                    mapInstance.flyTo([lat, lng], 18, { duration: 1.5 });
                    DOM.searchResults.style.display = 'none';
                } else {
                    console.error("Erreur : La carte est introuvable pour le zoom.");
                }
            }
        }
    });
}