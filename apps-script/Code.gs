/**
 * CATALOGUE APPUI — script à coller dans le tableur Google
 * (Extensions > Apps Script). Voir README.md, « Mise en service ».
 *
 * Il fait le lien entre le tableur et l'application :
 *  - envoie à l'application le catalogue, les photos et les réglages ;
 *  - enregistre les inscriptions dans l'onglet « Clients » (et complète les clients ajoutés à la main) ;
 *  - vérifie les connexions ;
 *  - enregistre les commandes, baisse le stock et prévient l'équipe par e-mail ;
 *  - remet le stock quand une commande passe au statut « Annulée ».
 *
 * Rien n'est à modifier ici : tout se règle dans les onglets du tableur.
 */

// Adresses utilisées si la case « E-mails de l'équipe » de l'onglet Réglages est vide
const EMAILS_EQUIPE_PAR_DEFAUT = ["les.jardins.de.lappui@gmail.com", "eti.jardins@appui.fr"];

// Les plantes : un onglet par catalogue (l'ancien onglet unique « Catalogue » reste accepté)
const ONGLETS_CATALOGUE = ["Plants de légumes", "Plants de fleurs"];
const ONGLET_CATALOGUE = "Catalogue";
// Colonnes de la fiche détaillée, ajoutées par installer() à droite des onglets de plantes
const ENTETES_FICHE = ["Nom latin", "Couleur", "Hauteur", "Port", "Feuillage", "Exposition", "Rusticité",
  "Floraison", "Utilisation", "Description"];
const ONGLET_CLIENTS = "Clients";
const ONGLET_COMMANDES = "Commandes";
const ONGLET_REGLAGES = "Réglages";
const ONGLET_PRESENTATION = "Présentation catalogues";
// Dossier des photos, à côté du tableur (le premier nom trouvé est utilisé, sinon il est créé)
const NOMS_DOSSIER_PHOTOS = ["Photos catalogue APPUI", "Photos du catalogue"];

const ENTETES_CLIENTS = ["Date d'inscription", "Prénom", "Nom", "E-mail", "Téléphone", "Commune",
  "Actif", "Identifiant", "Mot de passe (chiffré)", "Jeton"];
const ENTETES_COMMANDES = ["N°", "Date", "Client", "Téléphone", "E-mail", "Détail", "Total (€)",
  "Message du client", "Statut", "Stock remis", "Code (ne pas modifier)"];
const COL_STATUT = 9, COL_STOCK_REMIS = 10, COL_CODE = 11;
const ENTETES_REGLAGES = ["Réglage", "Valeur"];
const REGLAGES_PAR_DEFAUT = [
  ["Nom de la structure", "APPUI"],
  ["Informations de retrait", "Retrait des commandes sur le site du chantier, aux horaires communiqués par l'équipe."],
  ["Téléphone de contact", ""],
  ["E-mails de l'équipe", EMAILS_EQUIPE_PAR_DEFAUT.join(", ")],
  ["Envoyer un récapitulatif au client", "Oui"],
];
const ENTETES_PRESENTATION = ["Catalogue", "Titre affiché", "Description", "Icône", "Couleur", "Ordre des catégories", "Photo"];
const PRESENTATION_PAR_DEFAUT = [
  ["Légumes", "Plants de légumes", "Plants potagers et aromatiques produits par le chantier d'insertion.", "🥕", "anis", "", "salade"],
  ["Fleurs", "Plants de fleurs", "Vivaces, annuelles et mellifères pour le jardin et les pollinisateurs.", "🌼", "orange", "Vivaces, Annuelles, Mellifères", "coleus"],
];

// Noms de colonnes acceptés dans l'onglet Catalogue (sans accents ni majuscules)
const COLONNES = {
  catalogue: ["catalogue", "univers", "gamme"],
  nom: ["nom", "plante", "produit"],
  variete: ["variete"],
  prix: ["prix", "prix (€)", "prix (eur)", "prix €"],
  unite: ["unite", "conditionnement", "format"],
  stock: ["stock", "quantite", "quantite disponible"],
  afficher: ["afficher", "visible", "en ligne"],
  photo: ["photo", "image", "lien photo"],
};

// ---------- Points d'entrée ----------
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "catalogue";
  if (action !== "catalogue") return json_({ ok: false, erreur: "Action inconnue" });
  const cat = lireCatalogue_();
  const lignes = [cat.entetes].concat(cat.lignes.map((l) => l.affiches.slice()));
  if (cat.index.photo >= 0) {
    const photos = photosParNom_();
    for (let i = 1; i < lignes.length; i++) {
      const v = String(lignes[i][cat.index.photo]).trim();
      // Absente du dossier Drive : le nom est gardé, l'application utilise alors la photo livrée avec elle
      if (v && !/^https?:\/\//i.test(v)) lignes[i][cat.index.photo] = photos[cleFichier_(v)] || v;
    }
  }
  const r = reglages_();
  return json_({
    ok: true,
    lignes,
    // Toutes les photos du dossier : l'appli y cherche aussi la photo de chaque variété (« calibrachoa sweet love »)
    photos: photosParNom_(),
    reglages: {
      nomStructure: r["nom de la structure"] || "",
      infosRetrait: r["informations de retrait"] || "",
      telephoneContact: r["telephone de contact"] || "",
      emailsEquipe: emailsEquipe_(),
    },
    catalogues: presentation_(),
  });
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, erreur: "Requête illisible" }); }
  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    if (d.action === "inscription") return json_(inscription_(d));
    if (d.action === "connexion") return json_(connexion_(d));
    if (d.action === "commande") return json_(commande_(d));
    return json_({ ok: false, erreur: "Action inconnue" });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, erreur: "Erreur du serveur, réessayez dans un instant." });
  } finally {
    verrou.releaseLock();
  }
}

// Déclencheur automatique de Google : s'exécute à chaque modification du tableur.
// Commande passée au statut « Annulée » → les quantités retournent dans le stock.
function onEdit(e) {
  const f = e.range.getSheet();
  if (f.getName() !== ONGLET_COMMANDES || e.range.getColumn() !== COL_STATUT || e.range.getNumRows() !== 1) return;
  const ligne = e.range.getRow();
  if (ligne < 2 || normaliser_(e.range.getValue()) !== "annulee") return;
  if (normaliser_(f.getRange(ligne, COL_STOCK_REMIS).getValue()) === "oui") return;
  let articles;
  try { articles = JSON.parse(f.getRange(ligne, COL_CODE).getValue()); } catch (err) { return; }
  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    const cat = lireCatalogue_();
    articles.forEach((a) => {
      const l = cat.trouver(a.cle);
      if (l && cat.index.stock >= 0) {
        const stock = l.valeurs[cat.index.stock];
        if (stock !== "") cat.ecrireStock(l, nombre_(stock) + Number(a.quantite));
      }
    });
    f.getRange(ligne, COL_STOCK_REMIS).setValue("Oui");
  } finally {
    verrou.releaseLock();
  }
}

// ---------- Comptes ----------
function inscription_(d) {
  const prenom = texte_(d.prenom), nom = texte_(d.nom), email = texte_(d.email).toLowerCase();
  const telephone = telephone_(d.telephone), mdp = String(d.motDePasse || "");
  if (!prenom || !nom) return { ok: false, erreur: "Merci d'indiquer votre prénom et votre nom." };
  if (!telephone && !email) return { ok: false, erreur: "Merci d'indiquer un téléphone ou un e-mail." };
  if (mdp.length < 6) return { ok: false, erreur: "Le mot de passe doit faire au moins 6 caractères." };
  const f = onglet_(ONGLET_CLIENTS, ENTETES_CLIENTS);
  if (trouverClient_(f, email) || trouverClient_(f, telephone)) {
    return { ok: false, erreur: "Un compte existe déjà avec ce téléphone ou cet e-mail. Utilisez « J'ai déjà un compte »." };
  }
  const id = Utilities.getUuid(), jeton = Utilities.getUuid();
  f.appendRow([new Date(), prenom, nom, email, telephone ? "'" + telephone : "", texte_(d.commune),
    "Oui", id, chiffrer_(mdp, id), jeton]);
  prevenirEquipe_("Nouvelle inscription – " + prenom + " " + nom,
    "Nouveau compte client sur le catalogue APPUI :\n\n" + prenom + " " + nom +
    (telephone ? "\nTéléphone : " + telephone : "") + (email ? "\nE-mail : " + email : "") +
    (d.commune ? "\nCommune : " + texte_(d.commune) : ""), email);
  return { ok: true, client: { id, jeton, prenom, nom, email, telephone } };
}

function connexion_(d) {
  const f = onglet_(ONGLET_CLIENTS, ENTETES_CLIENTS);
  const ident = texte_(d.identifiant);
  const trouve = trouverClient_(f, ident.includes("@") ? ident.toLowerCase() : telephone_(ident));
  if (!trouve) return { ok: false, erreur: "Aucun compte trouvé. Vérifiez votre saisie ou créez un compte." };
  const c = trouve.client;
  if (c.actif === "non") return { ok: false, erreur: "Ce compte est désactivé. Contactez APPUI." };
  const mdp = String(d.motDePasse || "");
  if (!c.hash) {
    // Client ajouté à la main, ou mot de passe effacé par l'équipe : celui saisi devient le sien.
    if (mdp.length < 6) return { ok: false, erreur: "Choisissez un mot de passe d'au moins 6 caractères." };
    f.getRange(trouve.ligne, 9).setValue(chiffrer_(mdp, c.id));
  } else if (chiffrer_(mdp, c.id) !== c.hash) {
    return { ok: false, erreur: "Mot de passe incorrect." };
  }
  // Même jeton sur tous les appareils du client (téléphone, ordinateur…)
  let jeton = c.jeton;
  if (!jeton) { jeton = Utilities.getUuid(); f.getRange(trouve.ligne, 10).setValue(jeton); }
  return { ok: true, client: { id: c.id, jeton, prenom: c.prenom, nom: c.nom, email: c.email, telephone: c.telephone } };
}

function trouverClient_(f, valeur) {
  if (!valeur) return null;
  const lignes = f.getDataRange().getValues();
  for (let i = 1; i < lignes.length; i++) {
    const l = lignes[i];
    if (!String(l[1]).trim() && !String(l[2]).trim()) continue;
    // Client saisi à la main à la boutique : on complète les colonnes techniques
    if (!String(l[7]).trim()) {
      l[7] = Utilities.getUuid();
      f.getRange(i + 1, 8).setValue(l[7]);
      if (!String(l[6]).trim()) { l[6] = "Oui"; f.getRange(i + 1, 7).setValue("Oui"); }
      if (!l[0]) f.getRange(i + 1, 1).setValue(new Date());
    }
    const c = { prenom: String(l[1]).trim(), nom: String(l[2]).trim(), email: String(l[3]).trim().toLowerCase(),
      telephone: telephone_(l[4]), actif: normaliser_(l[6]), id: String(l[7]), hash: l[8], jeton: l[9] };
    if (valeur === c.email || valeur === c.telephone || valeur === c.id) return { ligne: i + 1, client: c };
  }
  return null;
}

// ---------- Commandes ----------
function commande_(d) {
  const trouve = trouverClient_(onglet_(ONGLET_CLIENTS, ENTETES_CLIENTS), texte_(d.clientId));
  if (!trouve || trouve.client.jeton !== d.jeton) return { ok: false, erreur: "Session expirée : reconnectez-vous.", deconnecter: true };
  if (trouve.client.actif === "non") return { ok: false, erreur: "Ce compte est désactivé. Contactez APPUI.", deconnecter: true };
  const c = trouve.client;
  const demandes = (d.lignes || []).slice(0, 100)
    .map((l) => ({ cle: cleProduit_(l.catalogue, l.nom, l.variete, l.unite), quantite: Math.floor(Number(l.quantite)) }))
    .filter((l) => l.quantite > 0);
  if (!demandes.length) return { ok: false, erreur: "La commande est vide." };

  // Vérifie tout le panier avant de toucher au stock
  const cat = lireCatalogue_();
  const ix = cat.index, problemes = [], articles = [];
  demandes.forEach((dem) => {
    const l = cat.trouver(dem.cle);
    const v = l ? l.valeurs : null;
    const libelle = v ? [v[ix.nom], ix.variete >= 0 ? v[ix.variete] : ""].filter(String).join(" ") : "";
    if (!v || (ix.afficher >= 0 && ["non", "n", "0", "false", "faux"].includes(normaliser_(v[ix.afficher])))) {
      problemes.push("Un produit de votre panier n'est plus proposé.");
      return;
    }
    const stock = ix.stock >= 0 ? v[ix.stock] : "";
    if (stock !== "" && nombre_(stock) < dem.quantite) {
      problemes.push(nombre_(stock) > 0
        ? "Il ne reste que " + nombre_(stock) + " « " + libelle + " »."
        : "« " + libelle + " » vient d'être épuisé.");
      return;
    }
    const prix = ix.prix >= 0 ? nombre_(v[ix.prix]) : 0;
    articles.push({ l, cle: dem.cle, quantite: dem.quantite, libelle, prix,
      unite: ix.unite >= 0 ? String(v[ix.unite]).trim() : "", stock });
  });
  if (problemes.length) return { ok: false, erreur: problemes.join(" ") + " Votre panier a été mis à jour.", actualiser: true };

  // Baisse du stock (une case vide = stock non suivi, on n'y touche pas)
  articles.forEach((a) => {
    if (a.stock !== "") cat.ecrireStock(a.l, nombre_(a.stock) - a.quantite);
  });

  const euros = (n) => n.toFixed(2).replace(".", ",") + " €";
  const total = Math.round(articles.reduce((t, a) => t + a.prix * a.quantite, 0) * 100) / 100;
  const detail = articles.map((a) => "- " + a.quantite + " × " + a.libelle + (a.unite ? " (" + a.unite + ")" : "") +
    (a.prix ? " – " + euros(a.prix * a.quantite) : ""));
  const f = onglet_(ONGLET_COMMANDES, ENTETES_COMMANDES);
  const numero = "C" + Utilities.formatDate(new Date(), "Europe/Paris", "yyMMdd") + "-" + String(f.getLastRow()).padStart(3, "0");
  const client = c.prenom + " " + c.nom;
  f.appendRow([numero, new Date(), client, c.telephone ? "'" + c.telephone : "", c.email, detail.join("\n"),
    total, texte_(d.message), "À préparer", "",
    JSON.stringify(articles.map((a) => ({ cle: a.cle, quantite: a.quantite })))]);

  const recap = "Commande " + numero + "\n" + client + (c.telephone ? " – " + c.telephone : "") +
    (c.email ? " – " + c.email : "") + "\n\n" + detail.join("\n") + "\n\nTotal : " + euros(total) +
    (d.message ? "\n\nMessage : " + texte_(d.message) : "");
  prevenirEquipe_("Nouvelle commande " + numero + " – " + client, recap, c.email);
  if (normaliser_(reglages_()["envoyer un recapitulatif au client"]) !== "non" && c.email) {
    try {
      // Si le client répond, sa réponse part à toutes les adresses de l'équipe
      MailApp.sendEmail(c.email, "APPUI – votre commande " + numero,
        "Bonjour " + c.prenom + ",\n\nNous avons bien reçu votre commande. L'équipe vous recontacte pour le retrait.\n\n" +
        recap + "\n\nMerci et à bientôt,\nL'équipe APPUI", { replyTo: emailsEquipe_().join(",") });
    } catch (err) { console.error("Confirmation client non envoyée", err); }
  }
  return { ok: true, numero };
}

// ---------- Catalogue, photos, réglages ----------
// Onglets des plantes : tous ceux dont le nom commence par « Plants de » (« Plants de légumes »,
// « Plants de fleurs », « Plants de petits fruits »…) ou l'ancien « Catalogue » ; à défaut le premier onglet
function feuillesCatalogue_() {
  const feuilles = classeur_().getSheets().filter((f) => {
    const n = normaliser_(f.getName());
    return n.startsWith("plants de ") || n === normaliser_(ONGLET_CATALOGUE);
  });
  return feuilles.length ? feuilles : classeur_().getSheets().slice(0, 1);
}

// « Plants de fleurs » → « Fleurs » : valeur de la colonne Univers quand la case est vide
function universDeFeuille_(feuille) {
  const n = normaliser_(feuille.getName());
  if (n.includes("legume")) return "Légumes";
  if (n.includes("fleur")) return "Fleurs";
  const reste = String(feuille.getName()).trim().replace(/^plants de\s+/i, "");
  return n.startsWith("plants de ") ? reste.charAt(0).toUpperCase() + reste.slice(1) : "";
}

// Réunit les onglets de plantes en un seul tableau (les colonnes sont reconnues par leur titre, dans n'importe quel ordre)
function lireCatalogue_() {
  const entetes = [], cles = [], lignes = [];
  const colonne = (titre) => {
    const k = normaliser_(titre);
    if (!k) return -1;
    let i = cles.indexOf(k);
    if (i < 0) { i = cles.push(k) - 1; entetes.push(String(titre).trim()); }
    return i;
  };
  feuillesCatalogue_().forEach((feuille) => {
    const plage = feuille.getDataRange();
    const valeurs = plage.getValues(), affiches = plage.getDisplayValues();
    if (!valeurs.length) return;
    const pos = valeurs[0].map(colonne);
    const colStock = valeurs[0].map(normaliser_).findIndex((h) => COLONNES.stock.includes(h));
    for (let r = 1; r < valeurs.length; r++) {
      const l = { feuille, ligne: r + 1, colStock: colStock + 1, valeurs: [], affiches: [], univers: universDeFeuille_(feuille) };
      pos.forEach((i, c) => { if (i >= 0) { l.valeurs[i] = valeurs[r][c]; l.affiches[i] = affiches[r][c]; } });
      lignes.push(l);
    }
  });
  const index = {};
  for (const cle in COLONNES) index[cle] = cles.findIndex((h) => COLONNES[cle].includes(h));
  // Univers absent ou vide : déduit du nom de l'onglet
  if (index.catalogue < 0) index.catalogue = colonne("Univers");
  lignes.forEach((l) => {
    for (let i = 0; i < entetes.length; i++) {
      if (l.valeurs[i] === undefined) { l.valeurs[i] = ""; l.affiches[i] = ""; }
    }
    if (String(l.valeurs[index.catalogue]).trim() === "" && l.univers) l.valeurs[index.catalogue] = l.affiches[index.catalogue] = l.univers;
  });
  const v = (l, cle) => (index[cle] >= 0 ? l.valeurs[index[cle]] : "");
  const parCle = {};
  for (let i = lignes.length - 1; i >= 0; i--) parCle[cleProduit_(v(lignes[i], "catalogue"), v(lignes[i], "nom"), v(lignes[i], "variete"), v(lignes[i], "unite"))] = lignes[i];
  return {
    entetes, lignes, index,
    trouver: (cle) => parCle[cle],
    ecrireStock: (l, valeur) => { if (l.colStock > 0) l.feuille.getRange(l.ligne, l.colStock).setValue(valeur); },
  };
}

// Même calcul que dans l'application (js/app.js, cleProduit). Le format en fait partie :
// une même variété peut être vendue en godet et en pot, chaque taille avec son prix et son stock.
function cleProduit_(catalogue, nom, variete, format) {
  return [catalogue, nom, variete, format].map(normaliser_).join("|");
}

// Photos du dossier « Photos du catalogue » : nom du fichier (sans extension) → adresse de l'image
function photosParNom_() {
  const cache = CacheService.getScriptCache();
  const enCache = cache.get("photos");
  if (enCache) return JSON.parse(enCache);
  const photos = {};
  // Le dossier des photos et tous ses sous-dossiers (« fleurs », « légumes »…)
  const aVisiter = [dossierPhotos_()];
  while (aVisiter.length) {
    const dossier = aVisiter.pop();
    const sous = dossier.getFolders();
    while (sous.hasNext()) aVisiter.push(sous.next());
    const fichiers = dossier.getFiles();
    while (fichiers.hasNext()) {
      const f = fichiers.next();
      if (!/^image\//.test(f.getMimeType())) continue;
      try {
        if (f.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (err) { console.error("Partage impossible pour " + f.getName(), err); }
      photos[cleFichier_(f.getName())] = "https://drive.google.com/thumbnail?id=" + f.getId() + "&sz=w800";
    }
  }
  cache.put("photos", JSON.stringify(photos), 120); // nouvelles photos visibles sous 2 minutes
  return photos;
}

function dossierPhotos_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("DOSSIER_PHOTOS");
  if (id) { try { return DriveApp.getFolderById(id); } catch (err) { /* dossier supprimé : on le recrée */ } }
  const parents = DriveApp.getFileById(classeur_().getId()).getParents();
  const parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  let dossier = null;
  for (const nom of NOMS_DOSSIER_PHOTOS) {
    const existants = parent.getFoldersByName(nom);
    if (existants.hasNext()) { dossier = existants.next(); break; }
  }
  if (!dossier) dossier = parent.createFolder(NOMS_DOSSIER_PHOTOS[0]);
  dossier.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  props.setProperty("DOSSIER_PHOTOS", dossier.getId());
  return dossier;
}

// « Tomate Cœur-de-Bœuf.JPG », « tomate coeur de boeuf », « tomatecoeurdeboeuf » → « tomatecoeurdeboeuf »
function cleFichier_(nom) {
  return normaliser_(String(nom).trim().replace(/\.(jpe?g|png|gif|webp|heic)$/i, "")).replace(/œ/g, "oe")
    .replace(/æ/g, "ae").replace(/[^a-z0-9]+/g, "");
}

function reglages_() {
  const f = onglet_(ONGLET_REGLAGES, ENTETES_REGLAGES, REGLAGES_PAR_DEFAUT);
  const r = {};
  f.getDataRange().getDisplayValues().slice(1).forEach((l) => { if (l[0]) r[normaliser_(l[0])] = String(l[1]).trim(); });
  return r;
}

function emailsEquipe_() {
  const liste = String(reglages_()["e-mails de l'equipe"] || "").split(/[,;\s]+/).filter((m) => m.includes("@"));
  return liste.length ? liste : EMAILS_EQUIPE_PAR_DEFAUT;
}

function presentation_() {
  const f = onglet_(ONGLET_PRESENTATION, ENTETES_PRESENTATION, PRESENTATION_PAR_DEFAUT);
  const res = {};
  f.getDataRange().getDisplayValues().slice(1).forEach((l) => {
    const nom = String(l[0]).trim();
    if (!nom) return;
    res[nom] = {
      titre: String(l[1]).trim() || nom,
      texte: String(l[2]).trim(),
      icone: String(l[3]).trim() || "🪴",
      couleur: normaliser_(l[4]) || "anis",
      ordreCategories: String(l[5]).split(/[,;]/).map((c) => c.trim()).filter(Boolean),
      photo: l[6] ? (photosParNom_()[cleFichier_(l[6])] || String(l[6]).trim()) : "",
    };
  });
  return res;
}

// ---------- Outils ----------
// Envoie un message à toutes les adresses de l'équipe ; « Répondre » écrit directement au client.
function prevenirEquipe_(sujet, texte, emailClient) {
  try {
    MailApp.sendEmail(emailsEquipe_().join(","), sujet, texte, emailClient ? { replyTo: emailClient } : {});
  } catch (err) { console.error("E-mail à l'équipe non envoyé", err); }
}

function classeur_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function onglet_(nom, entetes, lignesParDefaut) {
  let f = classeur_().getSheetByName(nom);
  if (!f) {
    f = classeur_().insertSheet(nom);
    f.appendRow(entetes);
    (lignesParDefaut || []).forEach((l) => f.appendRow(l));
    f.getRange(1, 1, 1, entetes.length).setFontWeight("bold").setBackground("#2c3e40").setFontColor("#ffffff");
    f.setFrozenRows(1);
  }
  return f;
}

function chiffrer_(mdp, sel) {
  const octets = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sel + ":" + mdp, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(octets);
}

function normaliser_(v) {
  return String(v == null ? "" : v).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function nombre_(v) {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[^\d,.-]/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function texte_(v) { return String(v == null ? "" : v).trim().slice(0, 500); }
function telephone_(v) {
  let t = String(v == null ? "" : v).replace(/[^\d+]/g, "").replace(/^\+33/, "0");
  if (/^[1-9]\d{8}$/.test(t)) t = "0" + t; // 06… saisi à la main, devenu le nombre 6…
  return t.length >= 9 ? t : "";
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** À lancer une fois depuis l'éditeur (bouton ▶) : crée les onglets et le dossier Photos, et demande les autorisations. */
function installer() {
  separerCatalogue_();
  feuillesCatalogue_().forEach(preparerOngletPlantes_);
  onglet_(ONGLET_CLIENTS, ENTETES_CLIENTS).getRange("E:E").setNumberFormat("@");
  onglet_(ONGLET_COMMANDES, ENTETES_COMMANDES);
  onglet_(ONGLET_REGLAGES, ENTETES_REGLAGES, REGLAGES_PAR_DEFAUT);
  onglet_(ONGLET_PRESENTATION, ENTETES_PRESENTATION, PRESENTATION_PAR_DEFAUT);
  const dossier = dossierPhotos_();
  MailApp.getRemainingDailyQuota();
  console.log("Installation terminée. Dossier des photos : " + dossier.getUrl());
}

// Liste unique (premier onglet) → un onglet « Plants de légumes » et un onglet « Plants de fleurs ».
// L'ancienne liste est gardée, masquée, sous le nom « Ancienne liste (ne plus utiliser) ».
function separerCatalogue_() {
  const c = classeur_();
  if (ONGLETS_CATALOGUE.some((n) => c.getSheetByName(n))) return;
  const source = c.getSheetByName(ONGLET_CATALOGUE) || c.getSheets()[0];
  const valeurs = source.getDataRange().getValues();
  const iUnivers = valeurs[0].map(normaliser_).findIndex((h) => COLONNES.catalogue.includes(h));
  if (iUnivers < 0) { source.setName(ONGLETS_CATALOGUE[1]); return; }
  // Un onglet par valeur de la colonne Univers : Légumes → « Plants de légumes », Fleurs → « Plants de fleurs »…
  const parOnglet = {};
  valeurs.slice(1).forEach((l) => {
    const u = normaliser_(l[iUnivers]);
    if (!u && l.every((x) => String(x).trim() === "")) return;
    const nom = u.includes("legume") ? ONGLETS_CATALOGUE[0] : u.includes("fleur") || !u ? ONGLETS_CATALOGUE[1]
      : "Plants de " + String(l[iUnivers]).trim().toLowerCase();
    (parOnglet[nom] = parOnglet[nom] || []).push(l);
  });
  const noms = ONGLETS_CATALOGUE.filter((n) => parOnglet[n])
    .concat(Object.keys(parOnglet).filter((n) => !ONGLETS_CATALOGUE.includes(n)));
  noms.forEach((nom, i) => {
    const lignes = parOnglet[nom];
    const f = c.insertSheet(nom, i);
    f.getRange(1, 1, lignes.length + 1, valeurs[0].length).setValues([valeurs[0]].concat(lignes));
  });
  source.setName("Ancienne liste (ne plus utiliser)").hideSheet();
}

// Colonnes de la fiche (pré-remplies avec les informations déjà connues), titres en couleur,
// filtres en tête de colonne et listes déroulantes Oui / Non.
function preparerOngletPlantes_(f) {
  let titres = f.getRange(1, 1, 1, f.getLastColumn()).getValues()[0];
  const manquants = ENTETES_FICHE.filter((t) => !titres.map(normaliser_).includes(normaliser_(t)));
  if (manquants.length) {
    f.getRange(1, titres.length + 1, 1, manquants.length).setValues([manquants]);
    titres = titres.concat(manquants);
  }
  const k = titres.map(normaliser_);
  const col = (noms) => k.findIndex((h) => noms.includes(h));
  const iNom = col(COLONNES.nom), iVar = col(COLONNES.variete);
  const nbLignes = f.getLastRow() - 1;
  if (nbLignes > 0 && iNom >= 0) {
    const plage = f.getRange(2, 1, nbLignes, titres.length);
    const v = plage.getValues();
    const champs = { "nom latin": "latin", couleur: "couleur", hauteur: "hauteur", port: "port", feuillage: "feuillage",
      exposition: "exposition", rusticite: "rusticite", floraison: "floraison", utilisation: "utilisation", description: "description" };
    v.forEach((l) => {
      const fiche = FICHES[cleFichier_(l[iNom] + " " + (iVar >= 0 ? l[iVar] : ""))] ||
        (iVar >= 0 && String(l[iVar]).trim() ? null : FICHES[cleFichier_(l[iNom])]);
      if (!fiche) return;
      for (const titre in champs) {
        const i = k.indexOf(titre);
        if (i >= 0 && String(l[i]).trim() === "" && fiche[champs[titre]]) l[i] = fiche[champs[titre]];
      }
    });
    plage.setValues(v);
  }
  f.getRange(1, 1, 1, titres.length).setFontWeight("bold").setBackground("#2c3e40").setFontColor("#ffffff");
  f.setFrozenRows(1);
  f.setFrozenColumns(Math.max(iVar, iNom) + 1);
  // Filtre sur toutes les lignes (y compris celles ajoutées plus tard) : flèche dans chaque titre de colonne
  if (!f.getFilter()) f.getRange(1, 1, f.getMaxRows(), titres.length).createFilter();
  const ouiNon = SpreadsheetApp.newDataValidation().requireValueInList(["Oui", "Non"], true).setAllowInvalid(true).build();
  [col(["mellifere", "melliferes"]), col(COLONNES.afficher)].forEach((i) => {
    if (i >= 0) f.getRange(2, i + 1, Math.max(nbLignes, 1) + 200, 1).setDataValidation(ouiNon);
  });
}

// Informations déjà relevées dans le catalogue fournisseur, recopiées une fois dans le tableur par installer().
// Ensuite, c'est le tableur qui fait foi : ce qui y est écrit (ou effacé) s'affiche dans l'appli.
const FICHES = {
  "acorusgramineusogon": {"latin": "Acorus gramineus 'Ogon'", "hauteur": "20-40 cm", "port": "touffe", "feuillage": "persistant", "utilisation": "massif", "description": "Plante à rhizome formant une touffe compacte de longues feuilles effilées, persistantes et souples.", "couleur": "Feuillage vert et jaune doré"},
  "agapanthefirework": {"latin": "Agapanthus hybrida 'Fireworks'", "hauteur": "20-40 cm", "port": "touffe", "feuillage": "semi-persistant", "utilisation": "massif et bac", "description": "Splendide variété semi-persistante. Très florifère.", "couleur": "Bleu et blanc"},
  "alocasiamacrorhiza": {"latin": "Alocasia 'Macrorrhiza'", "hauteur": "60-80 cm", "port": "érigé", "utilisation": "massif", "description": "Grandes feuilles vertes brillantes jusqu'à 2 mètres de long.", "couleur": "Feuillage vert brillant"},
  "amaranthe": {"latin": "Amaranthus caudatus", "hauteur": "80-100 cm", "port": "retombant", "utilisation": "massif et vasque", "description": "Feuillage vert. Longs plumets retombants rouges de juillet à septembre.", "couleur": "Rouge", "floraison": "Juillet à septembre"},
  "anthemisagranddaisypink": {"latin": "Argyranthemum frutescens", "hauteur": "40-60 cm", "port": "droit", "utilisation": "massif et vasque", "description": "Une valeur sûre ! Série à grandes fleurs simples et fort développement.", "couleur": "Rose"},
  "bananiermaurelii": {"latin": "Ensete ventricosum 'Maurelii'", "hauteur": "100-120 cm", "port": "droit", "feuillage": "caduc", "utilisation": "massif", "description": "Feuillage rouge-orange sur la face supérieure et marron-chocolat sur la face inférieure. Protection obligatoire contre le froid pendant l'hiver.", "couleur": "Feuillage rouge-orange et chocolat", "rusticite": "Non rustique (à protéger l'hiver)"},
  "bananierredtiger": {"latin": "Musa 'Red Tiger'", "port": "droit", "feuillage": "caduc", "utilisation": "massif", "description": "Feuillage d'abord vert vif se colorant de striures rouges sur le dessus et de rayures pourpres sur le dessous. Très décoratif. Belle allure exotique.", "couleur": "Feuillage vert strié de rouge"},
  "begoniaappleblossom": {"couleur": "Blanc rosé, fleur double"},
  "calibrachoalemonslice": {"latin": "Calibrachoa hybrida Superbells®", "hauteur": "20-40 cm", "port": "semi-retombant", "utilisation": "massif, suspension et vasque", "description": "Gamme à grandes fleurs et à port compact en boule, performante toute la saison.", "couleur": "Jaune et blanc rayé"},
  "calibrachoaredstar": {"couleur": "Rouge à étoile jaune"},
  "calibrachoasweetlove": {"latin": "Calibrachoa hybrida Superbells®", "hauteur": "20-40 cm", "port": "semi-retombant", "utilisation": "massif, suspension et vasque", "description": "Gamme à grandes fleurs et à port compact en boule, performante toute la saison.", "couleur": "Rose vif bordé de blanc, fleur double"},
  "cannaredgoldenflamme": {"latin": "Canna indica Cannova® F1", "hauteur": "100-120 cm", "port": "droit", "utilisation": "massif et vasque", "description": "Canna très précoce, robuste, compact et très ramifié, à longue floraison. Adapté aux températures basses.", "couleur": "Rouge et jaune"},
  "canneasucre": {"latin": "Saccharum officinarum violaceum", "hauteur": "150-200 cm", "port": "droit", "feuillage": "caduc", "utilisation": "massif", "description": "Graminée à feuillage pourpre du plus bel effet pour structurer vos massifs !", "couleur": "Feuillage pourpre"},
  "capucinetiptop": {"hauteur": "20 cm", "port": "compact, forme rapidement un large tapis", "feuillage": "vert moyen, épais", "couleur": "Abricot veiné de fils orangés", "floraison": "De mai aux gelées", "description": "Plante annuelle, vigoureuse et compacte. Son feuillage forme rapidement un large tapis. De nombreuses et magnifiques fleurs solitaires, de couleur douce, se dressent pour pavaner et attirer les abeilles."},
  "clematitebleu": {"couleur": "Bleu violet"},
  "clematiteboulevardninon": {"couleur": "Blanc à cœur rose"},
  "clematiteboulevardnubia": {"couleur": "Rouge carmin"},
  "coleusskeletal": {"latin": "Plectranthus scutellarioides 'Skeletal'", "hauteur": "20-40 cm", "port": "boule", "utilisation": "massif et bac", "description": "Coleus compact résistant au soleil. Le plus original avec son feuillage en dentelle bordeaux aux bordures vertes.", "couleur": "Feuillage bordeaux bordé de vert"},
  "coleussolarflare": {"latin": "Plectranthus scutellarioides 'Solar Flare'", "hauteur": "40-60 cm", "port": "droit", "utilisation": "massif et bac", "description": "Coleus résistant au soleil. Feuillage vert chartreuse nervuré de noir.", "couleur": "Feuillage vert chartreuse nervuré de pourpre foncé"},
  "coreopsisuptickred": {"latin": "Coreopsis hybrida UpTick™ Red", "hauteur": "40-60 cm", "port": "droit", "feuillage": "caduc", "utilisation": "massif", "description": "Coreopsis hybride à très larges fleurs, fleurissant tout au long de la saison.", "couleur": "Rouge bordé de jaune", "floraison": "Tout au long de la saison"},
  "cosmosmelangeblancroseetcarmin": {"latin": "Cosmos bipinnatus", "hauteur": "60-80 cm", "port": "droit", "utilisation": "massif", "description": "La référence en massif. Très grandes fleurs.", "couleur": "Mélange blanc, rose et carmin"},
  "delospermahotorange": {"latin": "Delosperma nubigenum 'Wheels of Wonder'", "hauteur": "10-20 cm", "port": "traçant / boule", "feuillage": "persistant", "utilisation": "massif et vasque", "description": "Port vigoureux et grandes fleurs. Excellent en couvre-sol.", "couleur": "Orange à cœur jaune"},
  "delospermahotpink": {"latin": "Delosperma nubigenum 'Wheels of Wonder'", "hauteur": "10-20 cm", "port": "traçant / boule", "feuillage": "persistant", "utilisation": "massif et vasque", "description": "Port vigoureux et grandes fleurs. Excellent en couvre-sol.", "couleur": "Rose fuchsia à cœur jaune"},
  "dianthusbkahoripink": {"latin": "Dianthus Beauties® 'Kahori'", "hauteur": "10-20 cm", "port": "rond", "feuillage": "persistant", "utilisation": "massif", "description": "Variété d'une exceptionnelle précocité et floribondité. Plante compacte et arrondie aux fines feuilles argentées. Très nombreuses fleurs simples.", "couleur": "Rose fuchsia"},
  "dorotheanthusmezoo": {"latin": "Aptenia cordifolia 'Mezoo'", "hauteur": "10-20 cm", "port": "traçant", "utilisation": "suspension et vasque", "description": "Plante succulente au feuillage vert clair bordé crème. Croissance rapide ; excellente résistance à la sécheresse.", "couleur": "Feuillage vert clair bordé crème, petites fleurs rouges"},
  "echinacealakotajaune": {"hauteur": "40-60 cm", "port": "droit", "feuillage": "caduc", "utilisation": "massif et bac", "latin": "Echinacea purpurea Artisan™ (Lakota™) Yellow Ombre", "description": "Génétique récente d'Echinacea issue de semences. Plantes ramifiées dès la base, tiges solides, fleurs aux couleurs intenses.", "couleur": "Jaune"},
  "echinaceaminibelle": {"hauteur": "40-60 cm", "port": "droit", "feuillage": "caduc", "utilisation": "massif et bac", "latin": "Echinacea hybrida 'Minibelle'", "description": "Fleur double type scabieuse, d'une couleur rose très lumineuse. Port droit. Tolérant à la sécheresse.", "couleur": "Rose lumineux, fleur double"},
  "echinaceastaquilasunrise": {"hauteur": "60-80 cm", "port": "droit", "feuillage": "caduc", "utilisation": "massif et bac", "latin": "Echinacea hybrida Sunseekers 'Tequila Sunrise'", "description": "Fleurs semi-doubles. Très belle série au port compact et homogène, se ramifiant bien depuis le cœur.", "couleur": "Jaune à cœur rouge"},
  "echinaceasweetsandia": {"hauteur": "40-60 cm", "port": "droit", "feuillage": "caduc", "utilisation": "massif et bac", "latin": "Echinacea hybrida 'Sweet Sandia'", "description": "Variété compacte et homogène, très florifère, aux fleurs originales bicolores citron vert au cœur rose.", "couleur": "Bicolore citron vert au cœur rose"},
  "gaillardefanfare": {"latin": "Gaillardia grandiflora Fanfare", "hauteur": "20-40 cm", "port": "droit", "feuillage": "non persistant", "utilisation": "massif et vasque", "description": "Série à fleurs tubulées, à privilégier en fleurissement de proximité."},
  "gauraeverlast": {"latin": "Gaura lindheimeri Everlast™", "hauteur": "40-60 cm", "port": "droit", "feuillage": "persistant", "utilisation": "massif", "description": "Série très précoce avec une excellente ramification et une croissance rapide mais compacte. Feuillage qui ne jaunit pas."},
  "gaurarosyjane": {"latin": "Gaura lindheimeri 'Rosy Jane'", "hauteur": "60-80 cm", "port": "droit", "feuillage": "persistant", "utilisation": "massif et bac", "description": "Variété à fleurs bicolores, très vigoureuse.", "couleur": "Bicolore blanc et rose"},
  "geraniumcoombland": {"latin": "Geranium hybrida 'Coombland White'", "hauteur": "20-40 cm", "port": "traçant puis tapissant", "feuillage": "caduc", "utilisation": "massif et bac", "description": "Géranium vivace tapissant fleurissant du printemps à l'automne. Joli feuillage, bon couvre-sol non envahissant.", "couleur": "Blanc-rosé à blanc", "floraison": "Du printemps à l'automne"},
  "geraniumlierrelilas": {"latin": "Pelargonium peltatum, fleurs simples", "couleur": "Rose lilas"},
  "geraniumlierresnowcascade": {"couleur": "Blanc veiné de pourpre"},
  "geraniumstormynight": {"latin": "Geranium maculatum 'Stormy Night'", "hauteur": "40-60 cm", "port": "tapissant", "utilisation": "massif", "description": "Son feuillage bronze acajou met parfaitement en valeur sa belle floraison rose mauve. Le géranium idéal pour couvrir des zones de sous-bois.", "couleur": "Rose mauve, feuillage bronze acajou"},
  "geraniumzonaleiredimperial": {"couleur": "Rouge orangé"},
  "geraniumzonalerose": {"couleur": "Rose à cœur rose foncé"},
  "gomphrenatruffula": {"latin": "Gomphrena hybrida 'Truffula'", "hauteur": "40-60 cm", "port": "érigé", "utilisation": "massif et jardinière", "description": "Issu de bouture, ce gomphrena a une excellente ramification et fleurira tout l'été à partir de juin.", "couleur": "Rose violacé", "floraison": "Tout l'été, à partir de juin"},
  "heliopsissoledamor": {"latin": "Heliopsis helianthoides 'Sole d'Amore'", "hauteur": "20-40 cm", "port": "retombant", "feuillage": "caduc", "utilisation": "massif", "description": "Le plus rouge de la série Sole. Grandes fleurs intenses aux pointes jaunes. Feuillage noir.", "couleur": "Rouge orangé à pointes jaunes"},
  "hemerocallislighttheway": {"latin": "Hemerocallis 'Light on The Way'", "hauteur": "40-60 cm", "port": "touffe", "feuillage": "caduc", "utilisation": "massif", "description": "Feuilles semi-persistantes, port compact formant une touffe. Petites fleurs en forme de trompette, jaune citron, agréablement parfumées.", "couleur": "Jaune citron, parfumé", "floraison": "Juin et juillet"},
  "hemerocallisprimalscream": {"latin": "Hemerocallis 'Primal Scream'", "hauteur": "120 cm", "port": "touffe", "feuillage": "caduc", "utilisation": "massif", "description": "Excellente sélection à grandes fleurs (16 à 18 cm) ayant reçu plusieurs prix. Longue floraison.", "couleur": "Orange vif"},
  "heucherablackforestcake": {"hauteur": "20-40 cm", "port": "rond", "feuillage": "persistant", "latin": "Heuchera hybrida 'Black Forest Cake'", "utilisation": "massif et bac", "description": "Heuchère au port rond compact. Feuillage noir exceptionnel, belles hampes florales rouges d'un joli contraste.", "couleur": "Feuillage noir, fleurs rouges"},
  "heucheracaramel": {"hauteur": "20-40 cm", "port": "rond", "feuillage": "persistant", "latin": "Heuchera hybrida 'Caramel'", "utilisation": "massif", "description": "Feuillage aux teintes brun caramel persistant. Plantation en zone ombragée.", "couleur": "Feuillage brun caramel", "exposition": "Ombre"},
  "hibiscushcarousselghost": {"latin": "Hibiscus moscheutos Carousel® 'Ghost'", "hauteur": "100-120 cm", "port": "droit", "feuillage": "caduc", "utilisation": "massif et bac", "description": "Fleurs géantes (20 à 22 cm de diamètre) sur un feuillage profondément découpé presque noir.", "couleur": "Blanc pur, feuillage presque noir", "floraison": "Juillet à septembre"},
  "hibiscusholygrail": {"latin": "Hibiscus moscheutos Summerific® 'Holy Grail'", "hauteur": "80-100 cm", "port": "droit", "feuillage": "caduc", "utilisation": "massif", "description": "Série compacte. Fleurs de 20 cm de diamètre minimum à partir de juillet. La plante disparaît en hiver et repart de la souche au milieu du printemps.", "couleur": "Rouge foncé", "floraison": "À partir de juillet"},
  "hibiscussummermyvalentine": {"latin": "Hibiscus moscheutos Summerific® 'My Valentine'", "hauteur": "100-120 cm", "port": "droit", "feuillage": "caduc", "utilisation": "massif", "description": "Série à la croissance vigoureuse. Fleurs de 20 cm de diamètre minimum à partir de juillet. La plante disparaît en hiver et repart de la souche au milieu du printemps.", "couleur": "Rouge", "floraison": "À partir de juillet"},
  "hostaautumnfrost": {"latin": "Hosta Shadowland® 'Autumn Frost'", "hauteur": "20-40 cm", "port": "touffe", "feuillage": "caduc", "utilisation": "massif et bac", "couleur": "Feuillage bleu-vert largement bordé de jaune crème"},
  "hostadiamondlike": {"latin": "Hosta Shadowland® 'Diamond Lake'", "hauteur": "20-40 cm", "port": "touffe", "feuillage": "caduc", "utilisation": "massif et bac", "couleur": "Feuillage bleu-vert ondulé"},
  "imperataredbaron": {"latin": "Imperata cylindrica 'Red Baron'", "hauteur": "40-60 cm", "port": "droit", "feuillage": "caduc", "utilisation": "massif", "description": "Graminée semi-persistante au port droit étoffé. Larges feuilles vert vif tournant au rouge cramoisi au cours de l'été. Petits épis plumeux blanc argenté.", "couleur": "Feuillage vert vif puis rouge cramoisi"},
  "ipomeemarguerite": {"latin": "Ipomoea batatas 'Marguerite'", "hauteur": "20-40 cm", "port": "retombant", "utilisation": "massif, suspension et vasque", "description": "Croissance rapide. Extrêmement vigoureuse. Intéressante en association.", "couleur": "Feuillage vert tendre"},
  "ipomeemidnightlace": {"latin": "Ipomoea batatas Illusion® 'Midnight Lace'", "hauteur": "20-40 cm", "port": "boule / semi-retombant", "utilisation": "massif, suspension et vasque", "description": "Série d'Ipomée au feuillage original très fin.", "couleur": "Feuillage pourpre noir très découpé"},
  "lavandegrosso": {"latin": "Lavandula intermedia 'Grosso'", "hauteur": "40-60 cm", "port": "boule", "feuillage": "persistant", "utilisation": "massif et bac", "description": "Variété compacte, vigoureuse, à épis bleu-violet foncé très parfumés. Plants déjà vernalisés pour permettre la floraison dès la première année.", "couleur": "Bleu-violet foncé, très parfumé"},
  "leucanthemumbananacream": {"latin": "Leucanthemum superbum 'Banana Cream'", "hauteur": "40-60 cm", "port": "droit", "feuillage": "caduc", "utilisation": "massif", "description": "Très grandes fleurs au coloris original jaune crème.", "couleur": "Jaune crème"},
  "leucanthemumdaisymay": {"latin": "Leucanthemum superbum 'Daisy May'", "hauteur": "40-60 cm", "port": "droit", "feuillage": "caduc", "utilisation": "massif", "description": "Variété précoce à faible besoin de vernalisation. Port souple. Bonne remontée à fleur.", "couleur": "Blanc à cœur jaune"},
  "lobulariaprincessinpurple": {"latin": "Lobularia maritima 'Princess in Purple'", "hauteur": "20-40 cm", "port": "semi-retombant", "utilisation": "massif, vasque et suspension", "description": "Fleurs légèrement plus petites que 'Snow Princess' ; croissance plus courte.", "couleur": "Lavande à violet-pourpre"},
  "lobulariasnowprincess": {"latin": "Lobularia 'Snow Princess'", "hauteur": "20-40 cm", "port": "retombant", "utilisation": "massif, vasque et suspension", "description": "La variété originelle ! Grandes fleurs, croissance vigoureuse, floraison ininterrompue. Très bonne tolérance aux intempéries.", "couleur": "Blanc"},
  "lythrumsrobin": {"latin": "Lythrum salicaria 'Robin'", "hauteur": "40-60 cm", "port": "érigé", "feuillage": "caduc", "utilisation": "massif", "description": "Vivace utilisée en annuelle.", "couleur": "Carmin"},
  "mufliersonnetmix": {"latin": "Antirrhinum majus Sonnet F1 Mix", "hauteur": "40-60 cm", "port": "droit", "utilisation": "massif", "description": "Variété aux tiges solides portant de longs épis floraux, parfaitement adaptée au fleurissement en massifs ou aux gros conteneurs.", "couleur": "Mélange (rouge, blanc, jaune, rose…)"},
  "nemesiasunsatia": {"latin": "Nemesia hybrida Sunsatia™ Plus", "hauteur": "40-60 cm", "port": "semi-retombant", "utilisation": "suspension et vasque", "description": "Grandes fleurs, abondantes et odorantes. Bonne ramification naturelle, structure retombante compacte. Floraison très précoce. Bonne résistance aux intempéries."},
  "oenotheralemondrop": {"latin": "Oenothera fruticosa 'Lemon Drop'", "hauteur": "20-40 cm", "port": "boule / semi-retombant", "feuillage": "caduc", "utilisation": "massif et bac", "description": "Belle vivace à floraison jaune citron dès la mi-mai, remontante. Plante peu sensible à l'oïdium.", "couleur": "Jaune citron", "floraison": "Dès la mi-mai, remontante"},
  "osteospermumgrandcanyonmix": {"latin": "Osteospermum (Dimorphotheca ecklonis) Akila® F1 Grand Canyon Mix", "hauteur": "20-40 cm", "port": "boule", "utilisation": "massif", "description": "Variété présentant une excellente ramification naturelle.", "couleur": "Mélange crème, jaune, rose, violet et blanc"},
  "pennisetumalopperurol": {"latin": "Pennisetum alopecuroides"},
  "pennisetumsenchrusf": {"latin": "Cenchrus advena 'Fireworks'", "hauteur": "40-60 cm", "port": "touffe", "utilisation": "massif et bac", "description": "Coloris inédit, finement panaché pourpre-rosé. Longs épis souples.", "couleur": "Panaché pourpre-rosé"},
  "pennisetumvertigo": {"latin": "Pennisetum purpureum 'Vertigo'", "hauteur": "100-120 cm", "port": "droit", "utilisation": "massif", "description": "Magnifique plante de structure à larges feuilles retombantes.", "couleur": "Feuillage pourpre"},
  "pennisetumvillosum": {"latin": "Pennisetum villosum", "hauteur": "40-60 cm", "port": "touffe", "feuillage": "caduc", "utilisation": "massif", "description": "Épillets plumeux, tombants. Bel effet grâce au vent.", "couleur": "Épis blanc crème"},
  "plectranthuscoleoidesvariegata": {"latin": "Plectranthus coleoides 'Variegata'", "hauteur": "20-40 cm", "port": "droit puis retombant", "utilisation": "massif et bac", "description": "Plante vigoureuse à feuillage décoratif panaché.", "couleur": "Feuillage vert panaché de blanc crème"},
  "plectranthussasha": {"latin": "Plectranthus ciliatus 'Sasha'", "hauteur": "20-40 cm", "couleur": "Feuillage panaché jaune crème et vert"},
  "ricin": {"latin": "Ricinus communis 'Carmencita Red'", "hauteur": "120-160 cm", "port": "droit", "utilisation": "massif", "description": "Feuillage pourpre. En massif, très apprécié en plante d'incrustation. Attention : graines toxiques.", "couleur": "Feuillage pourpre"},
  "saugeblackandbloom": {"latin": "Salvia guaranitica 'Black & Bloom'", "hauteur": "80-100 cm", "port": "buissonnant", "feuillage": "caduc", "utilisation": "massif et bac", "description": "Variété plus vigoureuse, à plus grandes fleurs et au feuillage vert sombre plus large que la variété traditionnelle. Très ramifiée, tiges solides.", "couleur": "Bleu foncé"},
  "saugehotlips": {"latin": "Salvia greggii 'Hot Lips'", "hauteur": "40-60 cm", "port": "buissonnant", "feuillage": "semi-persistant", "utilisation": "massif et vasque", "description": "Floraison prolongée et portée au-dessus d'un feuillage fin aromatique. Excellente résistance à la sécheresse.", "couleur": "Bicolore rouge et blanc"},
  "scaevolafancyfantasyimp": {"latin": "Scaevola aemula Fancy", "hauteur": "20-40 cm", "port": "semi-érigé", "utilisation": "massif, suspension et vasque", "description": "Floraison précoce et généreuse tout au long de l'été et croissance homogène en boule."},
  "sempervivumchickcharmssteelappeal": {"latin": "Sempervivum Chick Charms® 'Steel Appeal'", "hauteur": "20 cm", "port": "semi-traçant", "feuillage": "persistant", "utilisation": "massif et vasque", "description": "Vivace succulente, superbe en association !", "couleur": "Rosette gris-vert à cœur pourpre"},
  "senecioangelwings": {"latin": "Senecio candicans 'Angel Wings'", "hauteur": "40-60 cm", "port": "droit", "feuillage": "persistant", "utilisation": "massif et vasque", "description": "Plante aux grandes feuilles argentées duveteuses.", "couleur": "Feuillage argenté"},
  "tenussimaangelair": {"latin": "Stipa tenuissima 'Angel Hair'", "hauteur": "60-80 cm", "port": "touffe", "feuillage": "semi-persistant", "utilisation": "massif"},
  "tenussimastipa": {"latin": "Stipa tenuissima"},
  "tubalghiahimba": {"latin": "Tulbaghia violacea 'Himba'", "hauteur": "20-50 cm", "port": "droit", "feuillage": "persistant", "utilisation": "massif", "description": "Variété vigoureuse, à très belles fleurs rose violacé et au large feuillage rubané vert. L'arôme d'ail est discret.", "couleur": "Rose violacé"},
  "verveinebonariensis": {"latin": "Verbena bonariensis", "couleur": "Mauve"},
  "verveinerigidasantos": {"latin": "Verbena rigida venosa 'Santos Deep Lilac'", "hauteur": "20-40 cm", "port": "divergent", "feuillage": "caduc", "utilisation": "massif et bac", "description": "Variété au port ramifié, à forte floraison. Très bonne tolérance à la chaleur.", "couleur": "Bleu violet"},
};
