# Gestion des Versions : V1.0 (Stable) vs V2.0 (Développement)

## 1. État Actuel

*   **Version 1.0 (Stable) :**
    *   Tag : `v1.0-final`
    *   Base de données : `HistoryWalkDB`
    *   URL : `.../history-walk/` (Votre site actuel)

*   **Version 2.0 (Développement) :**
    *   Version du code : `2.0.0-alpha`
    *   Base de données : `HistoryWalkDB_v2` (Isolée)
    *   **Objectif :** Être hébergé sur un *nouveau* site pour ne pas écraser la V1.

---

## 2. Guide Pratique : Mise en place de l'Option B (Deux Sites)

Vous avez choisi d'avoir deux sites distincts. Voici la procédure exacte à suivre.

### Étape 1 : Créer le réservoir pour la V2
1.  Allez sur [GitHub.com](https://github.com) et connectez-vous.
2.  Créez un **nouveau dépôt** (New Repository).
3.  Nommez-le : `history-walk-v2`.
4.  Laissez-le vide (ne cochez pas "Add README", etc.).
5.  Copiez l'URL du dépôt (ex: `https://github.com/VOTRE_PSEUDO/history-walk-v2.git`).

### Étape 2 : Changer la destination (Dans votre terminal)
Nous allons dire à votre projet que "l'origine" n'est plus le vieux site V1, mais le nouveau site V2.

Ouvrez le terminal dans ce dossier et lancez ces commandes une par une :

```bash
# 1. On renomme le lien vers l'ancien site (V1) pour ne pas le perdre
git remote rename origin v1-archive

# 2. On ajoute le lien vers le NOUVEAU site (V2)
# REMPLACEZ L'ADRESSE CI-DESSOUS PAR CELLE DE VOTRE NOUVEAU DÉPÔT CRÉÉ À L'ÉTAPE 1
git remote add origin https://github.com/VOTRE_PSEUDO/history-walk-v2.git

# 3. On envoie le code V2 vers le nouveau dépôt
git push -u origin master
```

### Étape 3 : Mettre en ligne la V2
Maintenant que le projet est relié au nouveau dépôt, vous pouvez déployer comme d'habitude :

```bash
npm run deploy
```

### Résultat Final
*   **Site V1 :** Toujours accessible sur votre ancienne adresse (`.../history-walk/`).
*   **Site V2 :** Sera accessible sur la nouvelle adresse (`.../history-walk-v2/`) après avoir activé GitHub Pages dans les paramètres du nouveau dépôt (Settings > Pages > Source: gh-pages branch).

---

## 3. Revenir travailler sur la V1 (Cas rare)

Si un jour vous devez absolument corriger la V1 :
```bash
# Récupérer l'ancien code
git fetch v1-archive
git checkout v1-archive/master

# ... faire les corrections ...

# Pousser les corrections sur l'ancien site
git push v1-archive HEAD:master
```
