# Guide de l'encadrant technique

**Vous n'avez rien à faire sur GitHub.** Tout se gère depuis **un seul fichier**, le tableur « Catalogue APPUI », et depuis le dossier de photos rangé à côté. Le tableur ressemble à Excel et vous l'ouvrez avec votre compte Gmail.

## Ouvrir le tableur

Avec votre adresse Gmail, vous avez un compte Google. Ce compte donne accès à **Google Drive** (votre espace de rangement en ligne) et à **Google Sheets** (l'équivalent d'Excel chez Google). C'est gratuit et il n'y a rien à installer.

1. Allez sur **drive.google.com** et connectez-vous avec votre adresse Gmail.
2. Ouvrez le fichier **« Catalogue APPUI »** (dans « Partagés avec moi » s'il a été créé par un autre compte).
3. Conseil : ajoutez cette page à vos **favoris**. La prochaine fois, un clic suffira.

À côté du fichier se trouve le dossier **« Photos catalogue APPUI »**. Vous pouvez y ranger les photos dans des sous-dossiers (par exemple « fleurs » et « légumes ») : l'appli les trouve aussi.

Le fichier contient ces onglets, en bas de l'écran :

| Onglet | À quoi il sert | Qui le remplit |
|---|---|---|
| **Plants de légumes** | les plants de légumes : prix, stocks, photos, fiches | **vous** |
| **Plants de fleurs** | les plants de fleurs : prix, stocks, photos, fiches | **vous** |
| **Commandes** | les commandes des clients | l'application, et vous pour le statut |
| **Clients** | les comptes clients | l'application, et vous pour les clients de la boutique |
| **Réglages** | les textes de l'appli et les adresses e-mail de l'équipe | vous, rarement |
| **Présentation catalogues** | le titre, la description, l'icône et la couleur de chaque catalogue | vous, rarement |

**Il n'y a jamais de bouton « Enregistrer »** : tout est enregistré automatiquement, et l'appli affiche les changements dès que le client l'ouvre.

---

## Les plantes (onglets « Plants de légumes » et « Plants de fleurs »)

Les légumes et les fleurs sont rangés dans **deux onglets séparés**, en bas de l'écran. Une ligne = une plante (ou une variété).

| Univers | Catégorie | Plante | Variété | Mellifère | Prix (€) | Quantité disponible | Format | Photo | Visible |
|---|---|---|---|---|---|---|---|---|---|
| Légumes | Tomates | Tomate | Cœur de bœuf | | 1,5 | 12 | godet | tomate-coeur-de-boeuf.jpg | Oui |
| Fleurs | Vivaces | Lavande | Grosso | Oui | 4,5 | 20 | godet | lavande.jpg | Oui |

- **Univers** : `Légumes` ou `Fleurs`. Si vous l'oubliez, l'onglet suffit : une ligne de l'onglet « Plants de fleurs » est une fleur.
- **Catégorie** : ce qui fait les grandes tuiles de l'appli.
  - pour les fleurs : `Vivaces` ou `Annuelles` ;
  - pour les légumes : `Tomates`, `Aromatiques`, `Concombres`, `Courges`…
  - **Une nouvelle catégorie** se crée simplement en l'écrivant : elle apparaît toute seule dans l'appli. Attention à l'orthographe : `Vivace` et `Vivaces` feraient deux tuiles.
- **Mellifère** : `Oui` (liste déroulante) et la plante apparaît aussi dans la tuile « Plantes mellifères ».
- **Prix (€)** : le chiffre seul, par exemple `4,5`.
- **Visible** : `Non` (liste déroulante) pour cacher une plante (pas encore prête, fin de saison) sans supprimer la ligne.
- **Plusieurs variétés d'une même fleur** (Calibrachoa Sweet love, Lemon slice…) : une ligne par variété, avec le même nom dans **Plante**. L'appli les regroupe en une seule fiche où le client choisit sa variété.

### Se retrouver dans la liste

- Chaque titre de colonne a une **petite flèche (filtre)** : cliquez dessus pour n'afficher, par exemple, que les `Vivaces`, ou que les plantes dont le stock est à `0`. Pour tout réafficher : flèche > **Tout sélectionner**.
- Les premières colonnes (Plante, Variété) restent visibles quand vous défilez vers la droite.
- Pour chercher une plante : **Ctrl + F** (ou ⌘ + F sur Mac).

### La fiche détaillée (colonnes de droite)

Quand le client touche une plante, une fiche s'ouvre. Elle se remplit avec les colonnes **Nom latin, Couleur, Hauteur, Port, Feuillage, Exposition, Rusticité, Floraison, Utilisation, Description**, à droite des onglets de plantes.

- Ces colonnes ont été **pré-remplies** pour une soixantaine de fleurs, d'après le catalogue du fournisseur.
- **Compléter** : écrivez dans la case vide, par exemple `40-60 cm` dans Hauteur. C'est visible dans l'appli dès que le client l'ouvre.
- **Corriger** : remplacez le texte. **Supprimer** une information : effacez la case, elle disparaît de la fiche.
- Une case vide n'affiche rien : il n'y a rien d'obligatoire.

### Un nouveau catalogue (par exemple « Petits fruits »)

1. Faites un clic droit sur l'onglet « Plants de fleurs » > **Dupliquer**, renommez la copie **« Plants de petits fruits »** (le nom doit commencer par « Plants de »), puis effacez toutes les lignes sauf la première.
2. Remplissez vos plantes, avec `Petits fruits` dans la colonne Univers.
3. Dans l'onglet **Présentation catalogues**, ajoutez une ligne `Petits fruits` avec son titre, une phrase de description, une couleur (`anis`, `orange` ou `ardoise`) et le nom d'une photo.

### Le stock

- **Il baisse tout seul** à chaque commande passée dans l'appli.
- **Pour une vente faite directement à la boutique**, baissez-le vous-même.
- `0` : le client voit « Épuisé » et ne peut plus commander ce produit.
- de `1` à `5` : il voit « Plus que 3 ».
- case vide : stock non suivi, le client voit « Disponible » (pratique pour les paniers de saison).
- Si un client commande plus que le stock disponible, l'appli refuse et lui indique ce qu'il reste.

### Les photos

1. Déposez la photo dans le dossier **« Photos catalogue APPUI »** (ou l'un de ses sous-dossiers) : glissez-la depuis votre ordinateur, ou bouton **+ Nouveau > Importer un fichier**.
2. Dans la colonne **Photo** du produit, écrivez **le nom du fichier**, par exemple `lavande.jpg`. Les majuscules et les accents n'ont pas d'importance, et l'extension (`.jpg`) est facultative.
3. La photo apparaît dans l'appli en moins de 2 minutes.

Conseil : donnez aux photos des noms simples (`tomate-coeur-de-boeuf.jpg` plutôt que `IMG_20260512_1043.jpg`).

## Les commandes (onglet « Commandes »)

Chaque commande arrive dans cet onglet, **le stock a déjà été baissé**. Elle porte un numéro, le nom et le téléphone du client et le détail de ce qu'il a commandé.

Mettez à jour la colonne **Statut** au fil de la préparation : *À préparer → Prête → Retirée*.

**Commande annulée** : choisissez `Annulée` dans le statut. Les quantités retournent automatiquement dans le stock, et la colonne « Stock remis » indique `Oui`. Ne touchez pas à la colonne « Code (ne pas modifier) ».

**Toutes les demandes partent par e-mail aux adresses de l'équipe** (onglet Réglages) : commandes, nouvelles inscriptions et messages des clients. Pour répondre à un client, faites simplement « Répondre » à l'e-mail reçu.

## Les clients (onglet « Clients »)

- **Les inscriptions** depuis l'appli s'ajoutent toutes seules.
- **Ajouter un client venu à la boutique** : sur une nouvelle ligne, remplissez **Prénom**, **Nom** et **Téléphone** (et l'**E-mail** si possible). Laissez les autres colonnes vides : elles se rempliront toutes seules. Dites au client de se connecter avec son téléphone : le mot de passe qu'il tapera la première fois deviendra le sien.
- **Un client a oublié son mot de passe** : effacez sa case « Mot de passe (chiffré) ». À sa prochaine connexion, le mot de passe qu'il tapera deviendra le nouveau.
- **Bloquer un compte** : mettez `Non` dans la colonne **Actif**.
- Ne modifiez pas les colonnes *Identifiant* et *Jeton*.

## Les réglages (onglets « Réglages » et « Présentation catalogues »)

- **Réglages** : nom affiché, informations de retrait (horaires, lieu), téléphone de contact, adresses e-mail de l'équipe (séparées par des virgules), envoi ou non d'un récapitulatif au client.
- **Présentation catalogues** : une ligne par catalogue, dans l'ordre où ils apparaissent à l'accueil de l'appli (voir plus haut « Un nouveau catalogue »).

## À ne pas faire

- Modifier ou déplacer la **première ligne** d'un onglet (les titres des colonnes).
- Renommer les onglets (sauf pour en créer un nouveau, voir plus haut) ou le dossier des photos.
- Ouvrir l'onglet masqué « Ancienne liste (ne plus utiliser) » : c'est la liste d'avant la séparation légumes / fleurs, gardée par sécurité.
- Fusionner des cellules.

## En cas de souci

| Problème | Solution |
|---|---|
| Une plante n'apparaît pas | Vérifiez la colonne **Visible**, que la colonne **Plante** est remplie et que l'onglet s'appelle bien « Plants de … ». |
| Une photo n'apparaît pas | Vérifiez que le nom écrit dans la colonne Photo correspond au nom du fichier dans le dossier, et attendez 2 minutes. |
| Le prix ne s'affiche pas | Tapez le chiffre seul, sans « € ». |
| Le stock est faux | Corrigez simplement le chiffre dans la colonne Quantité disponible. |
| Des lignes semblent avoir disparu | Un filtre est sans doute actif (flèche verte dans un titre) : flèche > **Tout sélectionner**. |
| Tout a disparu de l'application | La première ligne a sans doute été modifiée : utilisez **Fichier > Historique des versions** pour revenir en arrière. |
