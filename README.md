# Catalogue en ligne – APPUI

Application de commande pour les **particuliers**, proposée par le chantier d'insertion **APPUI**. Elle s'installe sur le téléphone comme une vraie appli, à partir d'un lien ou d'un QR code.

**Adresse :** https://elodie24000.github.io/appui-catalogue/
**Affiche avec QR code à imprimer :** https://elodie24000.github.io/appui-catalogue/affiche-qr.html

## Parcours client

1. **Identification** : le client se connecte (*J'ai déjà un compte*) ou s'inscrit (*Je crée mon compte* : prénom, nom, téléphone, e-mail, commune, mot de passe).
2. **Choix** entre deux catalogues :
   - **Légumes du chantier** : la production maraîchère du chantier d'insertion ;
   - **Plants de fleurs** : filtres **Vivaces**, **Annuelles** et **Mellifères**.
3. Il compose son panier en voyant l'état des stocks (*En stock*, *Plus que 3*, *Épuisé*).
4. **Envoi de la commande** : elle arrive dans le tableur et par e-mail chez APPUI, et le client reçoit un récapitulatif.

## Fonctionnement

```
   Google Drive de l'encadrant (compte Gmail)
   ├── Tableur « Catalogue APPUI »
   │     Catalogue · Clients · Commandes · Réglages · Présentation catalogues
   └── Dossier « Photos du catalogue »
                │  produits, photos, textes   ▲  inscriptions, commandes (stock baissé automatiquement)
                ▼                             │
          Application sur le téléphone des clients  ──▶  e-mails aux deux adresses de l'équipe
```

L'encadrant technique ne travaille **que dans le tableur et le dossier de photos**, jamais sur GitHub. Il gère seul les produits, les catégories, les photos, les stocks (qui baissent tout seuls à chaque commande et remontent si une commande est annulée), les clients (y compris ceux ajoutés à la boutique) et les textes de l'appli. ➡️ **[GUIDE-ENCADRANT.md](GUIDE-ENCADRANT.md)**

Charte graphique, tirée du logo : ardoise `#2c3e40`, orange brûlé `#c0682a`, vert anis `#b4be2a`, fond crème `#f5f3ec`. Les titres sont en police Quicksand.

---

## Mise en service (une seule fois, environ 20 minutes)

Ces étapes se font avec **le compte Gmail qui gérera le catalogue**, par exemple celui de l'encadrant ou un compte dédié à APPUI. C'est ce compte qui enverra les e-mails de commande.

### Étape 1 — Créer le tableur

1. Téléchargez le modèle [`modele/catalogue-appui.xlsx`](modele/catalogue-appui.xlsx) (bouton « Download raw file »).
2. Allez sur **drive.google.com**, cliquez sur **+ Nouveau > Importer un fichier** et choisissez le modèle.
3. Double-cliquez sur le fichier importé, puis faites **Fichier > Enregistrer au format Google Sheets**. Renommez-le « Catalogue APPUI ».
4. Supprimez les lignes d'exemple de l'onglet *Catalogue* et saisissez les vrais produits. Gardez la première ligne. Vérifiez les onglets *Réglages* et *Présentation catalogues*.

### Étape 2 — Installer le petit programme qui relie le tableur à l'appli

1. Dans le tableur : **Extensions > Apps Script**.
2. Effacez le contenu de la page, puis collez à la place tout le contenu de [`apps-script/Code.gs`](apps-script/Code.gs).
3. Cliquez sur 💾 **Enregistrer**. Il n'y a rien à modifier dans le code : les adresses e-mail de l'équipe se règlent dans l'onglet *Réglages*.
4. Dans la liste en haut, choisissez la fonction **`installer`** et cliquez sur ▶ **Exécuter**. Elle sépare la liste des plantes en deux onglets (« Plants de légumes » et « Plants de fleurs »), ajoute et pré-remplit les colonnes de la fiche détaillée (Nom latin, Couleur, Hauteur…), pose les filtres et les listes déroulantes, crée les onglets Clients, Commandes, Réglages et Présentation catalogues, et le dossier des photos à côté du tableur. On peut la relancer sans risque : elle ne refait rien deux fois. Google demande des autorisations : cliquez sur *Examiner les autorisations*, choisissez le compte, puis *Paramètres avancés > Accéder au projet* et *Autoriser*. C'est normal : c'est votre propre programme.
5. Cliquez sur **Déployer > Nouveau déploiement**. Avec la roue ⚙️, choisissez le type **Application Web**, puis :
   - *Exécuter en tant que* : **Moi** ;
   - *Qui peut accéder* : **Tout le monde**.
   Cliquez sur **Déployer** et **copiez l'URL de l'application Web**, qui se termine par `/exec`.

> « Tout le monde » signifie que l'application des clients peut contacter le programme. Personne n'a accès au tableur lui-même : le programme lit le catalogue, crée des comptes et enregistre des commandes, rien d'autre. Les mots de passe sont stockés chiffrés. Les photos du dossier « Photos du catalogue » sont visibles par toute personne qui a leur lien, pour pouvoir s'afficher dans l'appli : n'y mettez que des photos de produits.

### Étape 3 — Brancher l'appli

Collez l'URL `/exec` dans [`js/config.js`](js/config.js), à la ligne `apiUrl: ""`. C'est la seule modification à faire dans le code, une seule fois. Ensuite, les textes et la présentation des catalogues viennent des onglets *Réglages* et *Présentation catalogues* du tableur. Tant que `apiUrl` est vide, l'appli fonctionne en **mode démonstration** avec des produits fictifs.

### Étape 4 — Mettre l'appli en ligne

Sur GitHub : **Settings > Pages**, puis *Deploy from a branch*, branche `main`, dossier `/ (root)`. L'adresse est active au bout de quelques minutes.

### Étape 5 — Partager

- Partagez le tableur **et** le dossier « Photos du catalogue » avec l'encadrant technique : bouton **Partager**, son adresse Gmail, droit *Éditeur*.
- Imprimez l'affiche QR code.

### Modifier le programme plus tard

Si vous changez `Code.gs`, faites **Déployer > Gérer les déploiements > ✏️ > Version : Nouvelle version**. L'URL ne change pas.

## Contenu du dépôt

| Fichier | Rôle |
|---|---|
| `index.html`, `css/`, `js/app.js` | l'application |
| `js/config.js` | adresse du programme (et réglages du mode démonstration) |
| `apps-script/Code.gs` | programme à coller dans le tableur (catalogue, photos, comptes, commandes, stock, e-mails) |
| `modele/catalogue-appui.xlsx` | modèle du tableur (Catalogue, Clients, Commandes, Réglages, Présentation catalogues, Mode d'emploi) |
| `icons/` | logo détouré, icônes de l'appli, QR code |
| `affiche-qr.html` | affiche à imprimer |
| `manifest.webmanifest`, `sw.js` | installation sur téléphone, fonctionnement hors connexion |
| `data/catalogue-exemple.csv` | produits du mode démonstration |

## Données personnelles (RGPD)

Les comptes clients (nom, téléphone, e-mail, commune) sont conservés dans l'onglet *Clients* du tableur, sur le compte Google d'APPUI. Le client donne son accord à l'inscription. Pensez à mentionner ce traitement dans vos mentions légales et à supprimer les comptes inactifs depuis longtemps.
