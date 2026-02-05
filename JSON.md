# Structure et Rôle des Fichiers JSON

Ce document explique le rôle des différents fichiers JSON utilisés pour la gestion des circuits.

## 1. `djerba.json` (et `[mapId].json`)

Ce fichier est l'**Index des Circuits Officiels** pour une carte donnée (ici, Djerba).
*   **Contenu :** Liste des circuits validés et hébergés sur le serveur.
*   **Rôle :** C'est la source de vérité pour l'application lors du chargement initial. Les circuits listés ici sont chargés avec le flag `isOfficial: true`.
*   **Modification :** Ce fichier est statique et modifié uniquement par les développeurs ou via un export administrateur.

Exemple de structure :
```json
[
  {
    "id": "HW-OFFICIAL-1",
    "name": "Grand Tour de Djerba",
    "file": "djerba/grand_tour.gpx",
    "description": "Circuit complet...",
    "distance": "45.2 km",
    "isOfficial": true,
    "poiIds": ["..."]
  }
]
```

## 2. `circuits.json`

*   **Statut :** **Supprimé**.
*   **Rôle :** Ancien fichier d'index utilisé avant la prise en charge du multi-cartes (`[mapId].json`). Il n'est plus présent dans le projet.

## 3. Circuits Utilisateurs (Pas de fichier JSON serveur)

Les circuits créés par l'utilisateur ("Mes Circuits") **ne sont pas stockés dans ces fichiers JSON**.
*   **Stockage :** Ils sont sauvegardés dans le navigateur du visiteur (`LocalStorage` et `IndexedDB`).
*   **Export :** L'utilisateur peut télécharger ses circuits via le bouton "Sauvegarde PC (.json)", ce qui génère un fichier JSON à la demande, mais celui-ci n'est pas hébergé sur le serveur.

---
**En résumé :**
*   `djerba.json` = Contenu officiel du site (Lecture seule pour l'utilisateur).
*   Stockage Navigateur = Contenu personnel de l'utilisateur (Lecture/Écriture).
