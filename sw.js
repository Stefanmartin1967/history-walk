// sw.js - Version 1.0

const CACHE_NAME = 'history-walk-v1';

// Liste des fichiers INDISPENSABLES pour que l'app démarre sans internet.
// Vérifie bien que ces noms correspondent exactement à tes fichiers.
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',        // Si tu as un fichier CSS principal
    './main.js',
    './mobile.js',
    './state.js',
    './ui.js',
    './data.js',
    './database.js',
    './fileManager.js',
    './circuit.js',
    './utils.js',
    './zones.js',
    './gpx.js',
    './map.js',
    './searchManager.js',
    './desktopMode.js',
    './djerba.geojson',   // Ta carte par défaut (important !)
    // Ajoute ici tes icônes si elles sont locales (ex: ./icon-192.png)
];

// 1. INSTALLATION : On met en cache tous les fichiers vitaux
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installation...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Mise en cache des fichiers app shell');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting(); // Force l'activation immédiate
});

// 2. ACTIVATION : On nettoie les vieux caches si on change de version
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activation...');
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[Service Worker] Suppression vieux cache', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    return self.clients.claim();
});

// 3. FETCH : Interception des requêtes réseau
self.addEventListener('fetch', (event) => {
    // Stratégie : Cache d'abord, Réseau ensuite (Cache falling back to Network)
    event.respondWith(
        caches.match(event.request).then((response) => {
            // Si c'est dans le cache, on le rend tout de suite (OFFLINE OK)
            if (response) {
                return response;
            }
            // Sinon, on tente de le télécharger (ONLINE nécessaire)
            return fetch(event.request).catch(() => {
                // Si ça échoue (pas de réseau et pas dans le cache)
                // On pourrait renvoyer une page "Pas de connexion", 
                // mais pour les fichiers JS/JSON, on laisse échouer.
                console.log("Fichier introuvable hors ligne : ", event.request.url);
            });
        })
    );
});