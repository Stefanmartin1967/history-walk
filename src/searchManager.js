// searchManager.js
import { DOM, openDetailsPanel } from './ui.js';
import { state } from './state.js';
import { getPoiName, getPoiId } from './data.js'; // On réutilise les outils robustes de data.js
import { map, highlightMarker } from './map.js';
import { getSearchResults } from './search.js';

export function setupSearch() {
    const query = DOM.searchInput.value;
    
    // Nettoyage de l'interface si vide
    DOM.searchResults.innerHTML = '';
    DOM.searchResults.style.display = 'none';
    
    if (!query || query.trim().length === 0) return;
    
    // 1. Filtrage des résultats (Logique centralisée)
    const results = getSearchResults(query);
    
    // 2. Affichage des résultats
    if (results.length > 0) {
        // On limite à 10 résultats pour ne pas surcharger
        results.slice(0, 10).forEach(feature => {
            const resultBtn = document.createElement('button');
            resultBtn.textContent = getPoiName(feature); // Utilise le nom intelligent (custom > officiel)
            
            resultBtn.addEventListener('click', () => {
                // Reset de la barre de recherche
                DOM.searchInput.value = '';
                DOM.searchResults.style.display = 'none';

                const targetId = getPoiId(feature);

                // A. Zoom sur la carte (CORRECTIF ROBUSTE)
                // On cherche le layer par son ID et non par référence d'objet
                state.geojsonLayer.eachLayer(layer => {
                    if (layer.feature && getPoiId(layer.feature) === targetId) {
                        map.flyTo(layer.getLatLng(), 16);
                        highlightMarker(targetId); // <--- Effet visuel immédiat
                    }
                });

                // B. Ouverture du panneau latéral
                // On retrouve l'index global de manière sûre
                const globalIndex = state.loadedFeatures.findIndex(f => getPoiId(f) === targetId);
                
                if (globalIndex > -1) {
                    // Vérifie si le lieu est dans le circuit actuel
                    let circuitIndex = -1;
                    if (state.currentCircuit) {
                        circuitIndex = state.currentCircuit.findIndex(f => getPoiId(f) === targetId);
                    }
                    
                    openDetailsPanel(globalIndex, circuitIndex !== -1 ? circuitIndex : null);
                }
            });
            DOM.searchResults.appendChild(resultBtn);
        });
        DOM.searchResults.style.display = 'block';
    }
}

export function setupSmartSearch() {
    // Écouteur pour la recherche GPS intelligente (Touche Entrée)
    // Permet de coller des coordonnées comme "33.8787, 10.8413"
    DOM.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = DOM.searchInput.value.trim();
            
            // Regex pour détecter les formats GPS courants
            const coordsRegex = /^(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)$/;
            const match = query.match(coordsRegex);

            if (match) {
                const lat = parseFloat(match[1]);
                const lng = parseFloat(match[3]);

                if (map) {
                    map.flyTo([lat, lng], 18, { duration: 1.5 });
                    DOM.searchResults.style.display = 'none';
                    DOM.searchInput.value = ''; 
                    DOM.searchInput.blur(); // Masque le clavier sur mobile
                }
            }
        }
    });
}