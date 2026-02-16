# Gestion des Versions : V1.0 (Stable) vs V2.0 (Développement)

Félicitations pour le passage à la version 2.0 !

## 1. État Actuel

*   **Version 1.0 (Stable) :**
    *   Le code est archivé sous le tag Git `v1.0-final`.
    *   La base de données s'appelle `HistoryWalkDB`.
    *   C'est la version actuellement en ligne (si vous l'avez déployée).

*   **Version 2.0 (Développement) :**
    *   C'est la version active sur votre ordinateur.
    *   Le code est marqué `2.0.0-alpha`.
    *   La base de données s'appelle `HistoryWalkDB_v2` (totalement isolée de la V1).
    *   Vous pouvez travailler dessus sans risque de casser vos données locales V1.

## 2. Attention : Le Déploiement en Ligne

⚠️ **IMPORTANT : L'adresse URL (GitHub Pages)**

Par défaut, GitHub Pages n'héberge qu'une seule version à la fois sur votre adresse `https://<votre-pseudo>.github.io/history-walk/`.

*   **Si vous lancez `npm run deploy` maintenant :**
    *   Vous allez **ÉCRASER** la version 1.0 en ligne avec la version 2.0 (encore en développement).
    *   Les utilisateurs perdront l'accès à la V1 stable.

### Comment garder la V1 en ligne et travailler sur la V2 ?

**Option A (Recommandée - Simple) :**
1.  Ne touchez pas au déploiement (`npm run deploy`) pour l'instant. Laissez la V1 en ligne.
2.  Travaillez sur la V2 uniquement en **local** sur votre ordinateur avec :
    ```bash
    npm run dev
    ```
    Cela ouvre une adresse locale (ex: `http://localhost:5173`) qui est votre "V2 de test".

**Option B (Avancée - Deux Sites) :**
Si vous voulez absolument que la V2 soit accessible en ligne pour des tests (par exemple sur mobile) sans écraser la V1 :
1.  Créez un **nouveau dépôt GitHub** (ex: `history-walk-v2`).
2.  Envoyez le code V2 sur ce nouveau dépôt.
3.  Activez GitHub Pages sur ce nouveau dépôt.
    *   Vous aurez alors deux adresses :
        *   V1 : `.../history-walk/`
        *   V2 : `.../history-walk-v2/`

## 3. Revenir à la V1 (Si besoin)

Si vous devez corriger un bug urgent sur la V1 :
1.  Validez vos changements V2 (`git commit`).
2.  Revenez au tag V1 : `git checkout v1.0-final`.
3.  Créez une branche de correctif : `git checkout -b fix/v1-bug`.
4.  Corrigez, testez, et déployez.
5.  Revenez à la V2 : `git checkout master`.
