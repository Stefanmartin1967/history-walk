import { state } from './state.js';
import { eventBus } from './events.js';
import { downloadFile } from './utils.js';
import { showToast } from './toast.js';

export function initAdminMode() {
    eventBus.on('admin:mode-toggled', (isAdmin) => {
        toggleAdminUI(isAdmin);
    });
}

function toggleAdminUI(isAdmin) {
    let adminContainer = document.getElementById('admin-floating-container');

    if (isAdmin) {
        if (!adminContainer) {
            createAdminUI();
            adminContainer = document.getElementById('admin-floating-container');
        }
        adminContainer.style.display = 'flex';
    } else {
        if (adminContainer) {
            adminContainer.style.display = 'none';
        }
    }
}

function createAdminUI() {
    const container = document.createElement('div');
    container.id = 'admin-floating-container';
    container.style.position = 'fixed';
    container.style.bottom = '20px';
    container.style.left = '20px'; // Bottom Left to avoid map controls
    container.style.zIndex = '9999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    container.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    container.style.padding = '10px';
    container.style.borderRadius = '8px';
    container.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';

    const title = document.createElement('div');
    title.textContent = 'GOD MODE';
    title.style.color = '#ff0000';
    title.style.fontWeight = 'bold';
    title.style.fontSize = '12px';
    title.style.textAlign = 'center';
    title.style.marginBottom = '5px';
    container.appendChild(title);

    const btnExport = document.createElement('button');
    btnExport.textContent = 'Export Master GeoJSON';
    btnExport.style.padding = '8px 12px';
    btnExport.style.cursor = 'pointer';
    btnExport.style.backgroundColor = '#2563EB';
    btnExport.style.color = 'white';
    btnExport.style.border = 'none';
    btnExport.style.borderRadius = '4px';
    btnExport.style.fontSize = '12px';
    btnExport.style.fontWeight = '600';
    btnExport.addEventListener('click', exportMasterGeoJSON);

    container.appendChild(btnExport);

    document.body.appendChild(container);
}

function exportMasterGeoJSON() {
    if (!state.loadedFeatures || state.loadedFeatures.length === 0) {
        showToast("Aucune donnée à exporter.", "error");
        return;
    }

    const filename = prompt("Nom du fichier à exporter :", `djerba-master-${Date.now()}.geojson`);
    if (!filename) return;

    // Nettoyage et préparation des données
    const features = state.loadedFeatures.map(f => {
        // Clone profond pour ne pas modifier l'original
        const properties = JSON.parse(JSON.stringify(f.properties));

        // Fusionner userData dans properties (Officialisation des modifs)
        if (properties.userData) {
            Object.assign(properties, properties.userData);
            delete properties.userData; // On nettoie
        }

        // Supprimer les clés internes inutiles
        delete properties._leaflet_id;

        return {
            type: "Feature",
            geometry: f.geometry,
            properties: properties
        };
    });

    const geojson = {
        type: "FeatureCollection",
        features: features
    };

    try {
        const jsonStr = JSON.stringify(geojson, null, 2);
        const finalName = filename.endsWith('.geojson') ? filename : `${filename}.geojson`;

        downloadFile(finalName, jsonStr, 'application/geo+json');
        showToast("Export réussi !", "success");
    } catch (e) {
        console.error(e);
        showToast("Erreur lors de l'export.", "error");
    }
}
