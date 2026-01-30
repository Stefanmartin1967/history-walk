# History Walk

History Walk est une application web progressive (PWA) de guide touristique interactif, conçue pour l'exploration de Djerba. Elle permet aux utilisateurs de créer, modifier et suivre des circuits touristiques, avec un support complet hors ligne.

## Fonctionnalités Principales

*   **Cartographie Interactive** : Utilise Leaflet pour afficher les points d'intérêt (POI) sur une carte de Djerba (GeoJSON).
*   **Mode Hors Ligne (PWA)** : L'application fonctionne sans connexion internet grâce à Vite PWA.
*   **Gestion de Circuits** :
    *   Création de circuits personnalisés en sélectionnant des POIs.
    *   Calcul de distance (vol d'oiseau ou tracé réel).
    *   Export/Import GPX.
    *   Sauvegarde locale des circuits.
*   **Suivi de Visite** : Marquage des lieux comme "Visité", filtrage des lieux vus/non vus.
*   **Interface Mobile & Desktop** :
    *   **Desktop** : Vue carte complète, éditeur de circuit avancé, gestion des photos.
    *   **Mobile** : Liste des lieux, navigation simplifiée, capture GPS de nouveaux lieux.
*   **Console de Fusion** : Outil d'administration pour fusionner les données collectées sur le terrain (via sauvegarde mobile) avec la base de données principale.

## Stack Technique

*   **Frontend** : Vanilla JavaScript (ES Modules).
*   **Build Tool** : Vite.
*   **Cartographie** : Leaflet.js.
*   **Icônes** : Lucide.
*   **Données** : GeoJSON pour les cartes, IndexedDB pour le stockage local.
*   **Photos** : Exif.js pour l'extraction de métadonnées GPS.

## Installation et Lancement

1.  Clonez le dépôt :
    ```bash
    git clone https://github.com/votre-utilisateur/history-walk.git
    cd history-walk
    ```

2.  Installez les dépendances :
    ```bash
    npm install
    ```

3.  Lancez le serveur de développement :
    ```bash
    npm run dev
    ```

4.  Ouvrez votre navigateur à l'adresse indiquée (généralement `http://localhost:5173/history-walk/`).

## Utilisation

### Mode Desktop
*   Naviguez sur la carte.
*   Cliquez sur "Sélection" pour commencer à créer un circuit.
*   Cliquez sur des points pour les ajouter à votre circuit.
*   Utilisez le panneau de droite pour organiser l'ordre des étapes.
*   Exportez votre circuit en GPX ou sauvegardez-le dans le navigateur.

### Mode Mobile
*   L'interface s'adapte automatiquement sur petit écran.
*   Accédez à vos circuits ("Circuits").
*   Recherchez des lieux ("Rech.").
*   Ajoutez un nouveau lieu avec votre position GPS actuelle ("Ajout").
*   Gérez vos sauvegardes et paramètres ("Menu").

### Console de Fusion (`fusion.html`)
Cet outil permet de mettre à jour le fichier GeoJSON maître (`djerba.geojson`) à partir des données collectées par les utilisateurs sur le terrain.
1.  Ouvrez `http://localhost:5173/history-walk/fusion.html`.
2.  Chargez le fichier source (`djerba.geojson`).
3.  Chargez une sauvegarde mobile (`HistoryWalk_Backup_...json` ou `.txt`).
4.  Analysez les différences (nouveaux lieux, corrections GPS, notes).
5.  Validez et téléchargez la nouvelle version du GeoJSON.

## Structure du Projet

*   `src/` : Code source JavaScript.
    *   `main.js` : Point d'entrée principal.
    *   `state.js` : Gestion de l'état global de l'application.
    *   `map.js` : Logique de la carte Leaflet.
    *   `circuit.js` : Gestion de la logique des circuits.
    *   `database.js` : Interaction avec IndexedDB.
    *   `fusion.js` : Logique de la console de fusion.
*   `public/` : Ressources statiques (icônes, manifest).
*   `index.html` : Page principale de l'application.
*   `fusion.html` : Page de la console de fusion.
