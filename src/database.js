// database.js
const DB_NAME = 'HistoryWalkDB';
const DB_VERSION = 4;
let db;

export function initDB() {
    return new Promise((resolve, reject) => {
        // Si la base de données est déjà ouverte avec la bonne version, on la réutilise.
        if (db && db.version === DB_VERSION) {
            return resolve(db);
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (event) => {
            console.error("Erreur d'initialisation de la base de données:", event);
            reject(new Error("Erreur d'initialisation IndexedDB."));
        };
        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            const tempDb = event.target.result;
            if (!tempDb.objectStoreNames.contains('poiUserData')) {
                tempDb.createObjectStore('poiUserData', { keyPath: ['mapId', 'poiId'] }).createIndex('mapId_index', 'mapId', { unique: false });
            }
            if (!tempDb.objectStoreNames.contains('savedCircuits')) {
                tempDb.createObjectStore('savedCircuits', { keyPath: 'id' }).createIndex('mapId_index', 'mapId', { unique: false });
            }
            if (!tempDb.objectStoreNames.contains('appState')) {
                tempDb.createObjectStore('appState', { keyPath: 'key' });
            }
            if (!tempDb.objectStoreNames.contains('modifications')) {
                // S'assurer que la clé est bien auto-incrémentée
                if(tempDb.objectStoreNames.contains('modifications')) tempDb.deleteObjectStore('modifications');
                tempDb.createObjectStore('modifications', { autoIncrement: true });
            }
        };
    });
}

export async function getAppState(key) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('appState', 'readonly');
        const request = transaction.objectStore('appState').get(key);
        request.onsuccess = () => resolve(request.result ? request.result.value : undefined);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function saveAppState(key, value) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('appState', 'readwrite');
        const request = transaction.objectStore('appState').put({ key, value });
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function getAllPoiDataForMap(mapId) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('poiUserData', 'readonly');
        const request = transaction.objectStore('poiUserData').index('mapId_index').getAll(mapId);
        request.onsuccess = () => {
            const userData = {};
            request.result.forEach(item => {
                const { mapId, poiId, ...data } = item;
                userData[poiId] = data;
            });
            resolve(userData);
        };
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function savePoiData(mapId, poiId, data) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('poiUserData', 'readwrite');
        const store = transaction.objectStore('poiUserData');
        const getRequest = store.get([mapId, poiId]);
        getRequest.onsuccess = () => {
            const existingData = getRequest.result || {};
            const dataToSave = { ...existingData, ...data, mapId, poiId };
            const putRequest = store.put(dataToSave);
            putRequest.onsuccess = () => resolve();
            putRequest.onerror = (event) => reject(event.target.error);
        };
        getRequest.onerror = (event) => reject(event.target.error);
    });
}

export async function batchSavePoiData(mapId, dataArray) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        if (dataArray.length === 0) return resolve();
        const transaction = db.transaction('poiUserData', 'readwrite');
        const store = transaction.objectStore('poiUserData');
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject(event.target.error);
        dataArray.forEach(item => {
            const { poiId, data } = item;
            const getRequest = store.get([mapId, poiId]);
            getRequest.onsuccess = () => {
                const existingData = getRequest.result || {};
                const dataToSave = { ...existingData, ...data, mapId, poiId };
                store.put(dataToSave);
            };
        });
    });
}

export async function getAllCircuitsForMap(mapId) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('savedCircuits', 'readonly');
        const request = transaction.objectStore('savedCircuits').index('mapId_index').getAll(mapId);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function saveCircuit(circuitData) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('savedCircuits', 'readwrite');
        const request = transaction.objectStore('savedCircuits').put(circuitData);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function deleteCircuitById(id) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('savedCircuits', 'readwrite');
        const request = transaction.objectStore('savedCircuits').delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function clearAllUserData() {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await initDB();
            const transaction = db.transaction(['poiUserData', 'savedCircuits', 'appState', 'modifications'], 'readwrite');
            const storesToClear = ['poiUserData', 'savedCircuits', 'appState', 'modifications'];
            let completed = 0;

            const checkCompletion = () => {
                completed++;
                if (completed === storesToClear.length) {
                    resolve();
                }
            };

            storesToClear.forEach(storeName => {
                const request = transaction.objectStore(storeName).clear();
                request.onsuccess = checkCompletion;
                request.onerror = (event) => {
                    console.error(`Erreur lors du vidage de ${storeName}`, event.target.error);
                    // On ne rejette pas pour permettre aux autres de continuer
                    checkCompletion(); 
                };
            });

            transaction.onerror = (event) => {
                reject(event.target.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

// --- AJOUTER À LA FIN DE database.js ---

export function deleteDatabase() {
    return new Promise((resolve, reject) => {
        // On suppose que le nom est défini en haut du fichier, sinon on utilise la valeur par défaut
        const dbName = 'HistoryWalkDB'; 
        
        // 1. On ferme la connexion active si elle existe (pour éviter le blocage)
        if (window.db) {
            window.db.close();
        }

        // 2. On lance la suppression
        const request = indexedDB.deleteDatabase(dbName);

        request.onsuccess = () => {
            console.log("Base de données supprimée.");
            localStorage.clear(); // On vide aussi le localStorage (préférences, brouillons)
            resolve();
        };

        request.onerror = (event) => {
            console.error("Erreur suppression DB:", event);
            reject("Impossible de supprimer la base de données.");
        };

        request.onblocked = () => {
            console.warn("Suppression bloquée.");
            // Souvent causé par un autre onglet ouvert sur le même site
            alert("Veuillez fermer les autres onglets de l'application pour permettre la réinitialisation.");
        };
    });
}

// Ajoutez ceci à la fin de src/database.js

export function clearStore(storeName) {
    return new Promise((resolve, reject) => {
        // On suppose que la DB est déjà ouverte (initDB a été appelé au démarrage)
        // Sinon, on réouvre une connexion rapide
        const request = indexedDB.open('HistoryWalkDB'); 

        request.onsuccess = (event) => {
            const db = event.target.result;
            try {
                const transaction = db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const clearRequest = store.clear();

                clearRequest.onsuccess = () => {
                    resolve();
                };

                clearRequest.onerror = (e) => {
                    console.error(`Erreur lors du vidage du store ${storeName}:`, e);
                    reject(e.target.error);
                };
            } catch (err) {
                // Si le store n'existe pas, on ne fait rien (pas grave)
                console.warn(`Le store ${storeName} n'existe pas, impossible de le vider.`);
                resolve();
            }
        };

        request.onerror = (event) => {
            reject("Impossible d'ouvrir la DB pour clearStore");
        };
    });
}