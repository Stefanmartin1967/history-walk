# Procédure de Test et Rapport - Remise à Zéro des Circuits

Comme convenu, l'application a été remise à zéro. Il n'y a plus aucun circuit officiel ni fichier GPX dans le système.

## Objectif

Vérifier que le flux complet de création, modification, import de trace, et export fonctionne correctement sur une base propre.

## Étapes à réaliser par l'utilisateur

1.  **Vider le cache / la base de données locale (optionnel mais recommandé)** :
    *   Assurez-vous que votre navigateur n'a plus de données locales parasites (si vous ne l'avez pas déjà fait via "Vider ma DB").

2.  **Création d'un Circuit** :
    *   Ouvrez l'application.
    *   Créez un **Nouveau Circuit**.
    *   Ajoutez quelques points manuellement sur la carte.
    *   Sauvegardez ce circuit.

3.  **Modification et Import de Trace Réelle** :
    *   Rouvrez le circuit que vous venez de créer.
    *   Effectuez des modifications (changements de nom, ajouts de notes).
    *   **Importez une trace réelle (GPX)** pour ce circuit (via la fonction d'import/mise à jour du tracé).
    *   Vérifiez que le tracé s'affiche correctement.

4.  **Export et Validation** :
    *   Une fois satisfait du circuit, exportez le fichier `djerba.json` (ou le fichier de configuration global des circuits si c'est via une fonction d'admin).
    *   Vérifiez que le fichier GPX correspondant est bien généré/accessible (si vous testez en local ou via l'interface d'admin).

## Rapport à me faire

Une fois ces étapes réalisées, merci de me confirmer :

1.  Si la création s'est bien passée sans erreur.
2.  Si l'import de la trace réelle a bien mis à jour la géométrie du circuit sans casser les données existantes.
3.  Si l'export final contient bien les données attendues.
4.  Si vous rencontrez le moindre comportement inattendu (écran blanc, erreur console, données manquantes).

Dès réception de votre confirmation, nous pourrons considérer que la base est saine et continuer le développement/peuplement.
