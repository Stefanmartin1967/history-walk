# Gestion des Photos - Documentation Technique

## 1. Stockage Local (IndexedDB)

Contrairement à la plupart des applications web basiques qui utilisent le `localStorage` (limité à ~5 Mo), HistoryWalk utilise **IndexedDB**.

### Capacité
*   **Limite :** La limite est fixée par votre navigateur et votre espace disque disponible.
*   **En pratique :** Vous pouvez stocker des centaines, voire des milliers de photos sans problème, tant qu'il reste de la place sur votre disque dur.
*   **Base de Données :** Les photos sont stockées dans le "store" `poiUserData` de la base `HistoryWalkDB`.

### Compression
L'application redimensionne et compresse automatiquement les images avant de les stocker pour optimiser l'espace :
*   Format : JPEG
*   Qualité : 70%
*   Taille Max : 1024px (côté le plus long)

---

## 2. Sauvegarde et Restauration

Les photos étant stockées localement dans votre navigateur, il est **crucial** de faire des sauvegardes régulières pour ne pas les perdre (en cas de nettoyage du cache ou de panne PC).

### Comment Sauvegarder (PC Uniquement)
1.  Ouvrez le menu **Outils**.
2.  Cliquez sur le bouton **"Sauvegarder tout (PC)"** (Icône Disque Dur).
    *   *Note : Le bouton "Sauvegarde Mobile (.txt)" n'inclut PAS les photos pour rester léger.*
3.  Cela génère un fichier `.json` (ex: `HistoryWalk_FULL_PC_2023-10-27.json`).
4.  Ce fichier contient **toutes** vos données : Carte, POIs, Circuits, et **Photos**.

### Comment Restaurer
1.  Ouvrez le menu **Outils**.
2.  Cliquez sur **"Restaurer Données"**.
3.  Sélectionnez votre fichier `.json`.
4.  L'application va tout réimporter, y compris les galeries photos de chaque lieu.

---

## 3. Pistes d'Amélioration : Cloud Sync (Google Drive)

Actuellement, tout est local. Pour un usage multi-appareils ou une sécurité accrue, une intégration Cloud serait idéale.

### Concept : "Google Drive Sync" (Futur)
Au lieu de stocker les images en Base64 dans la base de données (ce qui alourdit les sauvegardes JSON), l'idée serait de :

1.  **Authentification :** L'utilisateur connecte son compte Google via OAuth2.
2.  **Dossier Dédié :** L'app crée un dossier `HistoryWalk_Photos` sur le Drive.
3.  **Upload :** À l'ajout d'une photo, elle est envoyée sur Drive.
4.  **Lien :** L'app ne stocke que l'ID du fichier Drive (ex: `1A2B3C...`).
5.  **Affichage :** L'app charge l'image à la demande via l'API Drive (thumbnail).

### Avantages
*   **Sauvegardes JSON ultra-légères** (quelques Ko au lieu de Mo/Go).
*   **Accès partout :** Les photos sont visibles depuis votre téléphone ou PC via Drive.
*   **Espace illimité** (selon votre forfait Google).

### Faisabilité Technique
*   Nécessite une `API Key` et un `Client ID` Google Cloud Platform.
*   Implique de modifier `photo-manager.js` pour gérer l'upload asynchrone.
*   Le mode "Hors Ligne" ne permettrait plus de voir les photos (sauf cache).
