// utils.js
import { zonesData } from './zones.js';
export function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename.replace(/[\\/:"*?<>|]/g, '-');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}
// Convertit [Degrés, Minutes, Secondes] en Décimal (33.87...)
function convertDMSToDD(degrees, minutes, seconds, direction) {
    let dd = degrees + minutes / 60 + seconds / (60 * 60);
    if (direction === "S" || direction === "W") {
        dd = dd * -1;
    }
    return dd;
}

// Extrait la latitude/longitude d'un fichier image
export function getExifLocation(file) {
    return new Promise((resolve, reject) => {
        EXIF.getData(file, function() {
            const latData = EXIF.getTag(this, "GPSLatitude");
            const latRef = EXIF.getTag(this, "GPSLatitudeRef");
            const lonData = EXIF.getTag(this, "GPSLongitude");
            const lonRef = EXIF.getTag(this, "GPSLongitudeRef");

            if (latData && lonData && latRef && lonRef) {
                const lat = convertDMSToDD(latData[0], latData[1], latData[2], latRef);
                const lng = convertDMSToDD(lonData[0], lonData[1], lonData[2], lonRef);
                resolve({ lat, lng });
            } else {
                reject("Pas de données GPS trouvées dans cette photo.");
            }
        });
    });
}

// Calcule la distance en mètres entre deux points (Formule de Haversine)
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Rayon de la terre en mètres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance en mètres
}

export function resizeImage(file, maxWidth = 1024, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Calcul du ratio pour ne pas déformer l'image
                if (width > maxWidth) {
                    height = Math.round(height * (maxWidth / width));
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Renvoie l'image en Base64 compressée
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

// Vérifie si un point (GPS) se trouve à l'intérieur d'une zone (Polygone)
export function isPointInPolygon(point, vs) {
    // point = [longitude, latitude]
    // vs = tableau de points du polygone
    var x = point[0], y = point[1];
    var inside = false;
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        var xi = vs[i][0], yi = vs[i][1];
        var xj = vs[j][0], yj = vs[j][1];
        
        var intersect = ((yi > y) != (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// --- DÉTECTEUR DE ZONE AUTOMATIQUE ---
export function getZoneFromCoords(lat, lng) {
    if (!zonesData || !zonesData.features) return "A définir";

    const point = [lng, lat]; 
    
    // On boucle sur tous les quartiers (Houmt Souk, Erriadh...)
    for (const feature of zonesData.features) {
        const polygon = feature.geometry.coordinates[0]; 
        
        // On utilise la fonction isPointInPolygon qui existe déjà dans votre fichier !
        if (isPointInPolygon(point, polygon)) { 
            return feature.properties.name; 
        }
    }
    return "Hors zone"; 
}