# Gestion des Sauvegardes et Données

Ce document détaille la stratégie de gestion des données utilisateur dans History Walk, ainsi que les méthodes de sauvegarde et de transfert.

## 1. Philosophie "Clean Slate" (Page Blanche)

L'architecture de l'application repose sur une distinction stricte entre les données statiques (officielles) et les données dynamiques (utilisateur).

*   **Données Officielles (Static)** :
    *   Carte de base (`[mapId].geojson`)
    *   Circuits Officiels (`[mapId].json` + fichiers `.gpx` associés)
    *   *Ces données sont chargées depuis le serveur et ne sont jamais enregistrées dans les sauvegardes utilisateur pour éviter les doublons et conflits.*

*   **Données Utilisateur (Dynamic)** :
    *   Statut de visite (Lieux vus/non vus)
    *   Notes personnelles sur les lieux
    *   Lieux personnalisés (créés par l'utilisateur)
    *   Circuits personnalisés (créés ou importés manuellement)
    *   Photos associées (sur PC uniquement)

## 2. Méthodes de Sauvegarde

L'application propose deux formats de sauvegarde adaptés aux contraintes des appareils.

### A. Sauvegarde Mobile / Légère (`.txt`)
*   **Format** : JSON minifié, extension `.txt` pour faciliter le partage (WhatsApp, Email, etc.).
*   **Contenu** :
    *   Préférences utilisateur.
    *   État d'avancement (Lieux visités).
    *   Circuits créés par l'utilisateur.
    *   **EXCLUT** : Les circuits officiels (ils seront rechargés automatiquement) et les photos (trop lourd).
*   **Usage** : Sauvegarde quotidienne, transfert rapide entre téléphones.

### B. Sauvegarde PC / Complète (`.json`)
*   **Format** : Fichier JSON standard.
*   **Contenu** :
    *   Tout le contenu de la sauvegarde mobile.
    *   **INCLUT** : Les photos importées (encodées en Base64).
*   **Usage** : Archivage long terme, migration de données complexes.

## 3. Synchronisation et Transfert

### QR Code (Sync)
Pour transférer des données ou un circuit spécifique sans passer par un fichier :
1.  **PC** : Cliquez sur l'icône QR Code (Sync) ou Partager un circuit.
2.  **Mobile** : Ouvrez le menu "Scanner" et scannez l'écran du PC.
3.  **Résultat** : Les données (ou le circuit) sont importées et fusionnées localement.

### Import GPX (Circuits)
*   L'import d'un fichier GPX crée un **Circuit Utilisateur**.
*   Si ce GPX correspond à un circuit officiel (via son `HW-ID`), l'application proposera de mettre à jour le tracé officiel en mémoire, sans créer de doublon permanent dans la liste "Mes Circuits".

## 4. Stockage Local
*   L'application fonctionne entièrement hors-ligne grâce à **IndexedDB**.
*   Les données sont persistantes tant que l'utilisateur n'efface pas les données de navigation de son navigateur.
*   ⚠️ **Important** : Toujours effectuer une sauvegarde manuelle avant une mise à jour système majeure ou un nettoyage du navigateur.
