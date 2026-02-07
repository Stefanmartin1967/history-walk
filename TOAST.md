# Audit des Toasts (Notifications)

Ce document recense les notifications (`toasts`) de l'application et analyse leur pertinence selon la philosophie **"Silence is Golden"** : une action réussie visible à l'écran ne devrait pas nécessiter de confirmation textuelle.

## 1. Import de Photos (Desktop) - 🚨 Zone Critique
*Le module d'import de photos est la source principale de "l'avalanche de toasts" (parfois 5+ à la suite).*

| Message (Exemple) | Type | Critique | Recommandation |
| :--- | :--- | :--- | :--- |
| `"${outliers.length} photos écartées du groupe..."` | Info | Utile car c'est une action automatique invisible, mais participe au bruit. | **Grouper** dans le résumé final. |
| `"Déjà présentes dans {poiName} ({count} photos)..."` | Warning | Redondant si affiché pour chaque cluster. | **Supprimer** ou regrouper. |
| `"${count} photos ignorées (déjà présentes)..."` | Warning | Idem ci-dessus. | **Supprimer** ou regrouper. |
| `"${added} photos ajoutées ({duplicates} ignorées)."` | Success | **TRÈS BRUYANT**. Apparaît pour *chaque* ajout intermédiaire via la modale. | **Supprimer**. La fermeture de la modale suffit. |
| `"Import terminé. X photos ajoutées."` | Success | C'est le seul nécessaire. Il arrive souvent APRES les autres, noyé dans la masse. | **A CONSERVER** (Unique bilan). |
| `"Placez le marqueur pour le groupe..."` | Info | Instruction utile pour guider l'utilisateur. | **A conserver** (Instruction). |

**Verdict :** Il faut supprimer tous les toasts intermédiaires de succès/warning et ne garder que le **Toast Bilan** final et les **Instructions** d'interaction.

---

## 2. Gestion des Circuits
*Beaucoup de confirmations d'actions évidentes.*

| Message | Type | Critique | Recommandation |
| :--- | :--- | :--- | :--- |
| `"Circuit marqué comme fait / non fait"` | Success | Inutile. La case se coche/décoche visuellement + changement de style. | **A Supprimer**. |
| `"Titre du circuit mis à jour"` | Success | Inutile. Le titre change sous les yeux de l'utilisateur. | **A Supprimer**. |
| `"Mode sélection activé / désactivé"` | Info | Limite. Le panneau latéral s'ouvre/ferme, ce qui est un feedback suffisant. | **A Discuter** (Peut-être garder pour le "Désactivé" pour confirmer l'arrêt). |
| `"Ajouté au circuit"` | Success | Inutile. Le compteur incrémente et la ligne se dessine. | **A Supprimer**. |
| `"Impossible de boucler (Circuit vide ou plein)"` | Warning | Utile (Feedback d'erreur/limitation). | **A Conserver**. |
| `"Circuit importé et sauvegardé : X étapes"` | Success | Utile car l'import est une action complexe "en arrière-plan". | **A Conserver**. |

---

## 3. Système & Fichiers (Import/Export/Sauvegarde)

| Message | Type | Critique | Recommandation |
| :--- | :--- | :--- | :--- |
| `"Carte {nom} chargée."` | Success | Inutile. La carte s'affiche. | **A Supprimer**. |
| `"Restauration en cours..."` | Info | Utile pour faire patienter (feedback système). | **A Conserver**. |
| `"Données restaurées (avec succès) !"` | Success | Redondant après le chargement visible des données. | **A Supprimer** (Le résultat est visible). |
| `"Sauvegarde téléchargée..."` | Success | Inutile. Le navigateur gère déjà le feedback de téléchargement. | **A Supprimer**. |
| `"Trace réelle importée avec succès."` | Success | Inutile si la trace s'affiche sur la carte. | **A Supprimer**. |
| `"Fichier de sauvegarde invalide"` | Error | Indispensable. | **A Conserver**. |

---

## 4. Mobile & GPS

| Message | Type | Critique | Recommandation |
| :--- | :--- | :--- | :--- |
| `"Acquisition GPS en cours..."` | Info | Utile (latence matérielle). | **A Conserver**. |
| `"Lieu créé (Zone : ...)"` | Success | Utile car confirme la détection automatique de la Zone (info invisible autrement). | **A Conserver** (Ou déplacer l'info Zone dans l'UI). |
| `"Circuits terminés masqués / affichés"` | Info | Inutile. La liste se met à jour instantanément. | **A Supprimer**. |
| `"Thème changé"` | Success | Totalement inutile. L'écran change de couleur. | **A Supprimer**. |
| `"Position capturée: lat, long"` | Info | Debug ? Utile si pas de feedback visuel immédiat. | **A Discuter** (Peut-être trop technique). |

---

## 5. Édition (RichEditor)

| Message | Type | Critique | Recommandation |
| :--- | :--- | :--- | :--- |
| `"Lieu créé avec succès !"` | Success | Inutile. Le panneau détail s'ouvre. | **A Supprimer**. |
| `"Modifications enregistrées."` | Success | Inutile. Le panneau se ferme ou se met à jour. | **A Supprimer**. |
| `"Le nom est obligatoire."` | Warning | Indispensable (Validation). | **A Conserver**. |

---

## Résumé du Plan d'Action proposée

1.  **Grand Nettoyage ("Silence is Golden")** : Supprimer systématiquement les toasts de succès pour : Sauvegarde, Édition, Ajout POI, Changement Thème, Filtres.
2.  **Refonte de l'Import Photo** : Supprimer les toasts intermédiaires (boucle) pour ne garder qu'un **compte-rendu final agrégé**.
3.  **Conservation des Erreurs & Attente** : Garder uniquement ce qui signale un problème, une limitation, ou une action longue (loading).
