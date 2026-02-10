# Rapport d'Analyse du Code Mort

## Résumé
L'analyse du codebase a révélé plusieurs éléments inutilisés, incluant des fichiers orphelins, des fonctions JavaScript mortes (définies mais jamais appelées), des exports inutiles, et des classes CSS obsolètes. Aucun bloc significatif de code commenté n'a été trouvé (uniquement de la documentation).

## 1. Fichiers Orphelins
Ces fichiers sont présents dans le projet mais ne semblent jamais être importés ou utilisés par l'application principale.

*   `history_walk_datamanager/src/counter.js` : Fichier template Vite inutilisé.
*   `history_walk_datamanager/src/javascript.svg` : Asset par défaut inutilisé.
*   `tools/correct_djerba_v2.py` : Script Python manuel (probablement un utilitaire ponctuel).

## 2. Code JavaScript Mort (Fonctions Inutilisées)
Ces fonctions sont exportées et définies, mais aucune trace de leur utilisation n'a été trouvée dans l'ensemble du projet (ni interne, ni externe). Elles peuvent probablement être supprimées sans risque.

*   **`src/data.js`**
    *   `getDomainFromUrl` : Jamais appelé.

*   **`src/voice.js`**
    *   `startDictation` : Fonctionnalité de dictée vocale présente mais jamais activée (seul l'arrêt est géré par l'UI).
    *   `speakText` : Synthèse vocale jamais appelée.

*   **`src/state.js`**
    *   `setCurrentMap` : Setter inutilisé (la variable `currentMap` est probablement modifiée directement ou inutilisée).

*   **`src/logger.js`**
    *   `exportModificationLog` : Fonction d'export de logs jamais branchée à l'interface.

*   **`src/database.js`**
    *   `clearAllUserData` : Fonction de nettoyage complet jamais exposée.

## 3. Exports Inutilisés (Usage Interne Uniquement)
Ces fonctions sont exportées (`export function ...`) mais ne sont utilisées **que** à l'intérieur de leur propre fichier. L'export est donc inutile et peut être retiré pour rendre la fonction privée (ou la fonction est un vestige).

*   **`src/mobile.js`** : `renderMobileSearch`, `renderMobileMenu`
*   **`src/circuit.js`** : `notifyCircuitChanged`, `saveCircuitDraft`, `renderCircuitPanel`, `updateCircuitMetadata`, `convertToDraft`, `generateCircuitQR`
*   **`src/desktopMode.js`** : `createDraftMarker`
*   **`src/templates.js`** : `renderSource`
*   **`src/map.js`** : `iconMap`, `initMapListeners`, `getIconHtml`, `createHistoryWalkIcon`, `handleMarkerClick`
*   **`src/events.js`** : `EventBus`
*   **`src/photo-manager.js`** : `currentPhotoList`, `currentPhotoIndex`, `compressImage`
*   **`src/ui.js`** : `adjustTime`, `requestSoftDelete`
*   **`src/sync.js`** : `handleScanResultDefault`

## 4. Classes CSS Inutilisées
Ces classes sont définies dans `style.css` mais n'apparaissent nulle part dans le code HTML ou JavaScript (recherche textuelle stricte). Elles sont probablement des résidus d'anciennes versions de l'interface.

**Classes certainement mortes :**
*   `.add-poi-btn`
*   `.header-name-input`
*   `.panel-nom-arabe`

**Classes potentiellement mortes (à vérifier si construction dynamique improbable) :**
*   `.circuit-info-bar`
*   `.circuit-item-actions`, `.circuit-item-name`
*   `.details-header-nav`, `.details-nav`
*   `.editable-content`
*   `.generator-card`, `.generator-container`, `.generator-label`
*   `.header-title-mobile`
*   `.poi-list-icon`
*   `.taxi-info-bar`
*   `.title-actions`, `.title-section-line`
*   `.toolbar-sep`
*   `.topbar-center`
*   `.welcome-container`
*   `history_walk_datamanager/src/style.css` : `.hidden-row`

*Note : Les classes `toast-*` (error, info, success) sont utilisées dynamiquement via JS et ont été exclues de cette liste.*

## 5. Code Commenté
L'analyse n'a révélé aucun bloc significatif de code mis en commentaire (ex: vieilles fonctions désactivées). Les seuls blocs de commentaires trouvés (`src/map.js`, `src/voice.js`) sont de la documentation ou des explications techniques légitimes.

## Recommandations
1.  **Supprimer** les fichiers orphelins (`counter.js`, `javascript.svg`).
2.  **Supprimer** les fonctions JavaScript "Vraiment Mortes" (`getDomainFromUrl`, `startDictation`, etc.).
3.  **Nettoyer** les exports inutiles en retirant le mot-clé `export` pour les fonctions à usage interne uniquement.
4.  **Supprimer** les classes CSS listées après une dernière vérification visuelle (si vous n'avez pas de features "cachées" qui les utilisent).
