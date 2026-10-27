(function () {
  "use strict";

  const CFG = window.APPUI_CONFIG || {};
  window.APPUI_CONFIG_DEFAUT = JSON.parse(JSON.stringify(CFG));
  const DEMO = !CFG.apiUrl;
  const CLE_PANIER = "appui.panier";
  const CLE_CLIENT = "appui.client";
  const CLE_CACHE = "appui.catalogue";
  const CLE_COMPTES_DEMO = "appui.demo.comptes";
  const CLE_VENTES_DEMO = "appui.demo.ventes";
  const SEUIL_STOCK_FAIBLE = 5;

  const $ = (s) => document.querySelector(s);
  const el = {
    ecranConnexion: $("#ecranConnexion"),
    formConnexion: $("#formConnexion"),
    formInscription: $("#formInscription"),
    erreurConnexion: $("#erreurConnexion"),
    appli: $("#appli"),
    contenu: $("#contenu"),
    titre: $("#titre"),
    sousTitre: $("#sousTitre"),
    symbole: $("#symbole"),
    btnRetour: $("#btnRetour"),
    outils: $("#outils"),
    recherche: $("#recherche"),
    compteur: $("#compteurPanier"),
    dlgPanier: $("#dlgPanier"),
    listePanier: $("#listePanier"),
    messagePanier: $("#messagePanier"),
    erreurPanier: $("#erreurPanier"),
    btnCommander: $("#btnCommander"),
    dlgConfirmation: $("#dlgConfirmation"),
    dlgCompte: $("#dlgCompte"),
    dlgFiche: $("#dlgFiche"),
    dlgQuantite: $("#dlgQuantite"),
    dateMaj: $("#dateMaj"),
  };

  let produits = [];
  let panier = lire(CLE_PANIER, {});
  let client = lire(CLE_CLIENT, null);
  let filtreCategorie = "";

  // ---------- Stockage local (peut être indisponible : navigation privée…) ----------
  function lire(cle, defaut) {
    try { const v = localStorage.getItem(cle); return v ? JSON.parse(v) : defaut; }
    catch (e) { return defaut; }
  }
  function ecrire(cle, valeur) {
    try {
      if (valeur === null) localStorage.removeItem(cle);
      else localStorage.setItem(cle, JSON.stringify(valeur));
    } catch (e) { /* ignoré */ }
  }

  // ---------- Échanges avec le tableur (script Apps Script) ----------
  async function appelApi(donnees) {
    if (DEMO) return demo(donnees);
    const rep = await fetch(CFG.apiUrl, {
      method: "POST",
      // text/plain évite la requête de pré-vérification CORS, non gérée par Apps Script
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(donnees),
    });
    if (!rep.ok) throw new Error("HTTP " + rep.status);
    return rep.json();
  }

  // Mode démonstration : comptes et commandes simulés sur l'appareil
  async function demo(d) {
    const comptes = lire(CLE_COMPTES_DEMO, []);
    if (d.action === "inscription") {
      if (comptes.some((c) => c.telephone === d.telephone || (d.email && c.email === d.email))) {
        return { ok: false, erreur: "Un compte existe déjà avec ce téléphone ou cet e-mail." };
      }
      const c = { id: "demo-" + Date.now(), jeton: "demo", prenom: d.prenom, nom: d.nom,
        email: d.email, telephone: d.telephone, motDePasse: d.motDePasse };
      comptes.push(c); ecrire(CLE_COMPTES_DEMO, comptes);
      return { ok: true, client: c };
    }
    if (d.action === "connexion") {
      const c = comptes.find((c) => c.telephone === d.identifiant || c.email === d.identifiant);
      if (!c) return { ok: false, erreur: "Aucun compte trouvé. Vérifiez votre saisie ou créez un compte." };
      if (c.motDePasse !== d.motDePasse) return { ok: false, erreur: "Mot de passe incorrect." };
      return { ok: true, client: c };
    }
    if (d.action === "commande") {
      // Comme le vrai programme : relit le stock, le vérifie puis le baisse
      await chargerCatalogue();
      const ventes = lire(CLE_VENTES_DEMO, {});
      for (const l of d.lignes) {
        const p = trouver(cleProduit(l.catalogue, l.nom, l.variete, l.unite));
        if (!p || (p.stock !== null && p.stock < l.quantite)) {
          return { ok: false, erreur: "« " + l.nom + " » n'est plus disponible en quantité suffisante. Votre panier a été mis à jour.", actualiser: true };
        }
      }
      d.lignes.forEach((l) => { const k = cleProduit(l.catalogue, l.nom, l.variete, l.unite); ventes[k] = (ventes[k] || 0) + l.quantite; });
      ecrire(CLE_VENTES_DEMO, ventes);
      return { ok: true, numero: "DEMO-" + String(Date.now()).slice(-4) };
    }
    return { ok: false, erreur: "Action inconnue" };
  }

  // ---------- Lecture du catalogue ----------
  function parseCsv(texte) {
    const lignes = [];
    let ligne = [], champ = "", guillemets = false;
    for (let i = 0; i < texte.length; i++) {
      const c = texte[i];
      if (guillemets) {
        if (c === '"') {
          if (texte[i + 1] === '"') { champ += '"'; i++; } else guillemets = false;
        } else champ += c;
      } else if (c === '"') guillemets = true;
      else if (c === ",") { ligne.push(champ); champ = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && texte[i + 1] === "\n") i++;
        ligne.push(champ); lignes.push(ligne); ligne = []; champ = "";
      } else champ += c;
    }
    if (champ !== "" || ligne.length) { ligne.push(champ); lignes.push(ligne); }
    return lignes;
  }

  // « Variété », « variete », « VARIÉTÉ » → « variete »
  const normaliser = (s) => String(s || "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");

  const COLONNES = {
    catalogue: ["catalogue", "univers", "gamme"],
    categorie: ["categorie", "categories", "famille", "rayon"],
    nom: ["nom", "plante", "produit"],
    variete: ["variete"],
    description: ["description", "infos", "commentaire"],
    prix: ["prix", "prix (€)", "prix (eur)", "prix €"],
    unite: ["unite", "conditionnement", "format"],
    stock: ["stock", "quantite", "quantite disponible"],
    afficher: ["afficher", "visible", "en ligne"],
    photo: ["photo", "image", "lien photo"],
    mellifere: ["mellifere", "melliferes"],
    // Informations de la fiche détaillée (facultatives)
    latin: ["nom latin", "latin"],
    couleur: ["couleur", "coloris"],
    hauteur: ["hauteur"],
    port: ["port"],
    feuillage: ["feuillage"],
    exposition: ["exposition"],
    rusticite: ["rusticite"],
    floraison: ["floraison"],
    utilisation: ["utilisation", "usage"],
  };
  const INFOS = ["latin", "couleur", "hauteur", "port", "feuillage", "exposition", "rusticite", "floraison", "utilisation", "description"];

  // Photos et informations livrées avec l'appli (photos/liste.json, data/fiches.json),
  // photos du dossier Drive (envoyées par le programme du tableur)
  let photosLivrees = new Set();
  let photosDrive = {};
  let fichesLivrees = {};

  // Identifiant d'un produit, identique au calcul du programme du tableur (cleProduit_).
  // Le format en fait partie : une même variété peut exister en godet et en pot.
  const cleProduit = (catalogue, nom, variete, format) => [catalogue, nom, variete, format].map(normaliser).join("|");

  const nombre = (s) => parseFloat(String(s).replace(/[^\d,.-]/g, "").replace(",", "."));

  function versProduits(lignes) {
    lignes = lignes.filter((l) => l.some((v) => String(v).trim() !== ""));
    if (!lignes.length) return [];
    const entetes = lignes[0].map(normaliser);
    const index = {};
    for (const [cle, noms] of Object.entries(COLONNES)) index[cle] = entetes.findIndex((h) => noms.includes(h));
    const val = (ligne, cle) => (index[cle] >= 0 ? String(ligne[index[cle]] || "").trim() : "");

    return lignes.slice(1).map((l) => {
      const stockBrut = val(l, "stock");
      const stock = stockBrut === "" ? null : Math.max(0, nombre(stockBrut) || 0);
      const prix = nombre(val(l, "prix"));
      // « Vivace, Mellifère » : la plante apparaît dans les deux catégories
      const categories = val(l, "categorie").split(/[,;\/+]/).map((c) => c.trim()).filter(Boolean)
        .map((c) => c.charAt(0).toUpperCase() + c.slice(1));
      // Colonne « Mellifère » à Oui : la plante apparaît aussi dans « Mellifères »
      if (["oui", "o", "x", "1"].includes(normaliser(val(l, "mellifere"))) &&
          !categories.some((c) => normaliser(c).startsWith("mellif"))) categories.push("Mellifères");
      return {
        id: cleProduit(val(l, "catalogue"), val(l, "nom"), val(l, "variete"), val(l, "unite")),
        catalogue: val(l, "catalogue") || "Catalogue",
        categories: categories.length ? categories : ["Divers"],
        nom: val(l, "nom"),
        variete: val(l, "variete"),
        prix: isNaN(prix) ? null : prix,
        unite: val(l, "unite"),
        stock,
        afficher: !["non", "n", "0", "false", "faux"].includes(normaliser(val(l, "afficher"))),
        photoTableur: val(l, "photo"),
        infosTableur: Object.fromEntries(INFOS.map((k) => [k, val(l, k)])),
      };
    }).filter((p) => p.nom && p.afficher).map((p) => {
      // Fiche : informations livrées (catalogue fournisseur). Dès que le tableur a la colonne,
      // c'est lui qui fait foi, même vide (installer() y a recopié les informations livrées).
      const livree = fichesLivrees[cleFichier(p.nom + " " + p.variete)] ||
        (p.variete ? {} : fichesLivrees[cleFichier(p.nom)]) || {};
      p.infos = { ...livree };
      for (const [k, v] of Object.entries(p.infosTableur)) {
        if (v) p.infos[k] = v;
        else if (index[k] >= 0) delete p.infos[k];
      }
      p.description = p.infos.description || "";
      p.photo = resoudrePhoto(p);
      delete p.infosTableur;
      return p;
    });
  }

  // « Tomate Cœur-de-Bœuf.JPG », « tomate coeur de boeuf », « tomatecoeurdeboeuf » → « tomatecoeurdeboeuf »
  // (même calcul que cleFichier_ du programme) : espaces, tirets, majuscules, accents et extension ne comptent pas
  const cleFichier = (nom) => normaliser(String(nom).trim().replace(/\.(jpe?g|png|gif|webp|heic)$/i, ""))
    .replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/[^a-z0-9]+/g, "");

  // Photo d'un produit : d'abord celle de la variété (« calibrachoa sweet love »), puis celle de la case Photo,
  // cherchées dans le dossier Drive puis parmi les photos livrées avec l'appli
  function resoudrePhoto(p) {
    const v = p.photoTableur;
    // Retenues pour les plantes à plusieurs variantes (voir photosDesVariantes)
    p.photoVariete = p.variete ? trouverPhoto(p.nom + " " + p.variete) : "";
    p.photoColonne = v ? (/^https?:\/\//i.test(v) ? lienPhoto(v) : trouverPhoto(v)) : "";
    const candidats = [p.variete ? p.nom + " " + p.variete : "", v, p.nom].filter(Boolean);
    for (const c of candidats) {
      if (/^https?:\/\//i.test(c)) return lienPhoto(c);
      const k = cleFichier(c);
      if (photosDrive[k]) return photosDrive[k];
      if (photosLivrees.has(k)) return "photos/" + k + ".webp";
    }
    return v ? lienPhoto(v) : "";
  }

  // Photo du dossier Drive ou livrée avec l'appli pour ce nom, sinon ""
  function trouverPhoto(nom) {
    const k = cleFichier(nom);
    return photosDrive[k] || (photosLivrees.has(k) ? "photos/" + k + ".webp" : "");
  }

  // Plante à plusieurs variantes : chaque variante n'a que SA photo (« clematite-boulevard-nubia »,
  // ou une case Photo qui lui est propre). Pas de photo de la plante en général : la case reste vide
  // tant que la bonne photo n'est pas déposée, pour ne pas montrer une couleur qui n'est pas la sienne.
  function photosDesVariantes(liste) {
    const groupes = {};
    liste.forEach((p) => (groupes[p.categories[0] + "|" + p.nom] = groupes[p.categories[0] + "|" + p.nom] || []).push(p));
    // Les tailles d'une même variété (godet, pot…) gardent la photo de la variété
    Object.values(groupes).filter((g) => new Set(g.map((x) => normaliser(x.variete))).size > 1).forEach((g) => {
      const varietes = {};
      g.forEach((x) => { if (x.photoTableur) (varietes[cleFichier(x.photoTableur)] = varietes[cleFichier(x.photoTableur)] || new Set()).add(normaliser(x.variete)); });
      g.forEach((x) => {
        const propre = x.photoTableur && varietes[cleFichier(x.photoTableur)].size === 1 ? x.photoColonne : "";
        x.photo = x.photoVariete || propre;
      });
    });
  }

  // Photo d'un produit : adresse complète (photo du dossier Drive, envoyée par le programme du tableur),
  // lien de partage Google Drive, ou simple nom de fichier → photo livrée avec l'appli (dossier photos/)
  function lienPhoto(v) {
    v = String(v || "").trim();
    if (!v) return "";
    if (!/^https?:\/\//i.test(v)) return "photos/" + cleFichier(v) + ".webp";
    const m = v.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([\w-]+)/);
    return m ? "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w800" : v;
  }

  // Catalogue + réglages venus du tableur (onglets Réglages et Présentation catalogues)
  function utiliserDonnees(d) {
    photosDrive = d.photos || {};
    produits = versProduits(d.lignes || []);
    if (DEMO) {
      const ventes = lire(CLE_VENTES_DEMO, {});
      produits.forEach((p) => { if (p.stock !== null && ventes[p.id]) p.stock = Math.max(0, p.stock - ventes[p.id]); });
    }
    for (const [cle, valeur] of Object.entries(d.reglages || {})) {
      if (Array.isArray(valeur) ? valeur.length : valeur) CFG[cle] = valeur;
    }
    // Présentation venue du tableur : les cases vides gardent les valeurs par défaut de config.js
    if (d.catalogues && Object.keys(d.catalogues).length) {
      const defauts = window.APPUI_CONFIG_DEFAUT.catalogues || {};
      CFG.catalogues = {};
      for (const [nom, infos] of Object.entries(d.catalogues)) {
        CFG.catalogues[nom] = { ...(defauts[nom] || {}) };
        for (const [k, v] of Object.entries(infos)) if (Array.isArray(v) ? v.length : v) CFG.catalogues[nom][k] = v;
      }
    }
    appliquerReglages();
  }

  async function chargerLivres() {
    if (photosLivrees.size) return;
    try {
      const [liste, fiches] = await Promise.all([
        fetch("photos/liste.json").then((r) => r.json()), fetch("data/fiches.json").then((r) => r.json())]);
      photosLivrees = new Set(liste);
      fichesLivrees = fiches;
    } catch (err) { /* hors connexion : photos du tableur seulement */ }
  }

  async function chargerCatalogue() {
    await chargerLivres();
    const formatDate = (d) => new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
    try {
      let donnees;
      if (DEMO) {
        const rep = await fetch("data/catalogue-exemple.csv", { cache: "no-store" });
        donnees = { lignes: parseCsv(await rep.text()) };
      } else {
        const rep = await fetch(CFG.apiUrl + "?action=catalogue&_=" + Date.now());
        donnees = await rep.json();
        if (!donnees.ok) throw new Error(donnees.erreur);
      }
      utiliserDonnees(donnees);
      ecrire(CLE_CACHE, { ...donnees, date: Date.now() });
      el.dateMaj.textContent = "Stocks à jour au " + formatDate(Date.now());
    } catch (err) {
      console.error(err);
      const cache = lire(CLE_CACHE, null);
      if (!cache) {
        el.contenu.innerHTML = '<p class="erreur">Impossible de charger le catalogue pour le moment. Vérifiez votre connexion puis réessayez.</p>';
        return false;
      }
      utiliserDonnees(cache);
      el.dateMaj.textContent = "Hors connexion — stocks du " + formatDate(cache.date);
    }
    // Retire du panier ce qui n'existe plus et ramène les quantités au stock disponible
    for (const id of Object.keys(panier)) {
      const p = trouver(id);
      if (p && p.stock !== null) panier[id] = Math.min(panier[id], Math.floor(p.stock));
      if (!p || panier[id] <= 0) delete panier[id];
    }
    sauverPanier();
    return true;
  }

  // ---------- Identification ----------
  function montrerConnexion() {
    el.appli.hidden = true;
    el.ecranConnexion.hidden = false;
    $("#modeDemo").hidden = !DEMO;
    $('.onglet[data-onglet="connexion"]').click();
  }

  document.querySelectorAll(".onglet").forEach((o) => o.addEventListener("click", () => {
    document.querySelectorAll(".onglet").forEach((x) => x.classList.toggle("actif", x === o));
    el.formConnexion.hidden = o.dataset.onglet !== "connexion";
    el.formInscription.hidden = o.dataset.onglet !== "inscription";
    el.erreurConnexion.hidden = true;
  }));

  async function soumettre(form, action) {
    const bouton = form.querySelector("button[type=submit]");
    const donnees = Object.fromEntries(new FormData(form));
    for (const k in donnees) donnees[k] = String(donnees[k]).trim();
    if (donnees.identifiant && !donnees.identifiant.includes("@")) donnees.identifiant = donnees.identifiant.replace(/[^\d+]/g, "").replace(/^\+33/, "0");
    if (donnees.telephone) donnees.telephone = donnees.telephone.replace(/[^\d+]/g, "").replace(/^\+33/, "0");
    if (donnees.email) donnees.email = donnees.email.toLowerCase();
    el.erreurConnexion.hidden = true;
    bouton.disabled = true;
    try {
      const rep = await appelApi({ action, ...donnees });
      if (!rep.ok) throw new Error(rep.erreur);
      client = rep.client;
      delete client.motDePasse;
      ecrire(CLE_CLIENT, client);
      form.reset();
      demarrerAppli();
    } catch (err) {
      el.erreurConnexion.textContent = err.message && !/fetch|HTTP|JSON/i.test(err.message)
        ? err.message : "Connexion impossible pour le moment. Vérifiez votre réseau et réessayez.";
      el.erreurConnexion.hidden = false;
    } finally {
      bouton.disabled = false;
    }
  }
  el.formConnexion.addEventListener("submit", (e) => { e.preventDefault(); soumettre(el.formConnexion, "connexion"); });
  el.formInscription.addEventListener("submit", (e) => { e.preventDefault(); soumettre(el.formInscription, "inscription"); });

  function deconnecter() {
    client = null;
    ecrire(CLE_CLIENT, null);
    el.dlgCompte.open && el.dlgCompte.close();
    location.hash = "";
    montrerConnexion();
  }

  // ---------- Affichage ----------
  const echapper = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const euros = (n) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  const nb = (n) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  const trouver = (id) => produits.find((p) => p.id === id);
  // Ordre des catalogues : celui de l'onglet « Présentation catalogues », puis les autres
  const listeCatalogues = () => {
    const ordre = Object.keys(CFG.catalogues || {}).map(normaliser);
    const rang = (c) => { const r = ordre.indexOf(normaliser(c)); return r < 0 ? ordre.length : r; };
    return [...new Set(produits.map((p) => p.catalogue))].sort((a, b) => rang(a) - rang(b));
  };
  const infosCatalogue = (c) => (CFG.catalogues || {})[c] || { titre: c, texte: "", icone: "🪴", couleur: "anis" };

  // Couleur de repli de chaque catégorie (sous la photo, ou si elle manque)
  const COULEURS = { tomates: "#B8432F", aubergines: "#5E3A6E", concombres: "#3F7A3A", courges: "#C46A1C",
    melons: "#C08A1A", piments: "#A8321F", salades: "#5E8F2E", aromatiques: "#4E6B55",
    annuelles: "#B24A72", vivaces: "#5B4E8F", melliferes: "#A86F08" };
  const couleurCategorie = (c) => COULEURS[normaliser(c)] || "#2c3e40";

  function etatStock(p) {
    if (p.stock === null) return { classe: "ok", texte: "Disponible" };
    if (p.stock === 0) return { classe: "epuise", texte: "Épuisé" };
    if (p.stock <= SEUIL_STOCK_FAIBLE) return { classe: "faible", texte: "Plus que " + nb(p.stock) };
    return { classe: "ok", texte: "En stock" };
  }

  function catalogueCourant() {
    const m = location.hash.match(/^#c=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function afficher() {
    const cat = catalogueCourant();
    if (cat && listeCatalogues().includes(cat)) afficherCatalogue(cat);
    else afficherAccueil();
  }

  // Fond photo d'une tuile, avec un voile pour lire le texte ; couleur si la photo manque
  const fondTuile = (couleur, photo) => "background-color:" + couleur + (photo
    ? ";background-image:linear-gradient(180deg,rgba(0,0,0,.02) 30%,rgba(0,0,0,.66)),url('" + photo.replace(/'/g, "%27") + "')"
    : "");

  // Photo d'illustration : celle choisie dans les réglages, sinon celle d'un produit de la sélection
  function photoDe(liste, prefere) {
    if (prefere) return lienPhoto(prefere);
    const p = liste.find((x) => x.photo && x.stock !== 0) || liste.find((x) => x.photo);
    return p ? p.photo : "";
  }

  const pluriel = (n, mot) => n + " " + mot + (n > 1 ? "s" : "");

  function afficherAccueil() {
    document.body.dataset.theme = "";
    el.titre.textContent = CFG.nomStructure || "APPUI";
    el.sousTitre.textContent = "travaillons ensemble";
    el.btnRetour.hidden = true;
    el.symbole.hidden = false;
    el.outils.hidden = true;
    el.contenu.innerHTML =
      '<section class="accueil">' +
      '<p class="bonjour">Bonjour ' + echapper(client.prenom || "") + ',</p>' +
      '<p class="accueil__question">Que souhaitez-vous découvrir ?</p><div class="univers">' +
      listeCatalogues().map((c) => {
        const i = infosCatalogue(c);
        const liste = produits.filter((p) => p.catalogue === c);
        const dispo = liste.filter((p) => p.stock !== 0).length;
        return '<a class="univers__tuile" href="#c=' + encodeURIComponent(c) + '" style="' +
          echapper(fondTuile(i.couleur === "orange" ? "#9A3D66" : "#7A5236", photoDe(liste, i.photo))) + '">' +
          '<span class="univers__nom">' + echapper(i.titre) + '</span>' +
          (i.texte ? '<span class="univers__texte">' + echapper(i.texte) + '</span>' : '') +
          '<span class="univers__nb">' + pluriel(dispo, "plant") + ' disponible' + (dispo > 1 ? 's' : '') + ' →</span></a>';
      }).join("") + '</div></section>';
  }

  function afficherCatalogue(cat) {
    const i = infosCatalogue(cat);
    document.body.dataset.theme = i.couleur;
    el.titre.textContent = i.titre;
    el.sousTitre.textContent = CFG.nomStructure || "APPUI";
    el.btnRetour.hidden = false;
    el.symbole.hidden = true;
    el.outils.hidden = false;
    document.documentElement.style.setProperty("--haut-entete", document.querySelector(".entete").offsetHeight + "px");

    const duCatalogue = produits.filter((p) => p.catalogue === cat);
    if (i.regrouperVarietes) photosDesVariantes(duCatalogue);
    const ordre = (i.ordreCategories || []).map(normaliser);
    const rang = (c) => { const r = ordre.indexOf(normaliser(c)); return r < 0 ? ordre.length : r; };
    const categories = [...new Set(duCatalogue.flatMap((p) => p.categories))].sort((a, b) => rang(a) - rang(b));
    if (!categories.includes(filtreCategorie)) filtreCategorie = "";
    const vitrine = i.photosCategories || {};

    // Nom affiché d'une catégorie (« Vivaces » → « Plantes vivaces »), « Toute la liste » pour tout voir
    const libelle = (c) => (i.libellesCategories || {})[c || "Tout"] || c || "Toute la liste";
    const ensemble = (c) => (c ? duCatalogue.filter((p) => p.categories.includes(c)) : duCatalogue);
    const photoCategorie = (c) => photoDe(ensemble(c), vitrine[c || "Tout"]);

    // Zone de choix : « Toute la liste » en grande tuile, puis une tuile photo par catégorie
    const tuile = (c, classe, detail) =>
      '<button type="button" class="tuile ' + classe + '" data-categorie="' + echapper(c) + '" aria-pressed="' +
      (c === filtreCategorie) + '" style="' + echapper(fondTuile(c ? couleurCategorie(c) : "#2c3e40", photoCategorie(c))) + '">' +
      '<span class="tuile__nom">' + echapper(libelle(c)) + '</span><span class="tuile__nb">' + detail + '</span></button>';
    const resume = categories.slice(0, 4).map((c) => libelle(c).replace(/^Plantes /, "").toLowerCase()).join(", ") +
      (categories.length > 4 ? "…" : "");
    const tuiles = categories.length < 2 ? "" :
      '<section class="choix' + (filtreCategorie ? ' choix--fait' : '') + '" aria-label="Catégories">' +
      tuile("", "tuile--toutes", pluriel(duCatalogue.length, "plant") + " · " + echapper(resume)) +
      '<div class="tuiles" style="--colonnes:' + (categories.length <= 3 ? categories.length : 4) + '">' +
      categories.map((c) => tuile(c, "", pluriel(ensemble(c).length, "plant"))).join("") + '</div></section>';

    const q = normaliser(el.recherche.value);
    const liste = duCatalogue.filter((p) =>
      (!filtreCategorie || p.categories.includes(filtreCategorie)) &&
      (!q || normaliser([p.nom, p.variete, p.categories.join(" "), p.description].join(" ")).includes(q)));

    // Une fiche par plante : toutes ses variétés réunies (catalogues « regrouperVarietes »),
    // sinon seulement les variétés qui partagent la même photo
    const fiches = [];
    const parCle = {};
    liste.forEach((p) => {
      const cle = i.regrouperVarietes ? p.categories[0] + "|" + p.nom
        : p.photo ? [p.categories[0], p.nom, p.photo].join("|") : p.id;
      if (!parCle[cle]) { parCle[cle] = []; fiches.push(parCle[cle]); }
      parCle[cle].push(p);
    });
    // Ordre alphabétique des plantes (puis des variétés), accents et majuscules ignorés
    const alpha = (a, b) => a.localeCompare(b, "fr", { sensitivity: "base", numeric: true });
    fiches.sort((a, b) => alpha(a[0].nom, b[0].nom) || alpha(a[0].variete || "", b[0].variete || ""));
    // Dans une carte, les tailles d'une même variété se suivent (ordre du tableur)
    fiches.forEach((g) => {
      const rang = new Map();
      g.forEach((x) => { if (!rang.has(normaliser(x.variete))) rang.set(normaliser(x.variete), rang.size); });
      g.sort((x, y) => rang.get(normaliser(x.variete)) - rang.get(normaliser(y.variete)));
    });

    // Séparation nette : bandeau de la sélection en cours, qui reste visible en faisant défiler
    const photoSel = photoCategorie(filtreCategorie);
    const selection = '<div class="selection" id="selection">' +
      '<span class="selection__vignette" style="' + echapper(fondTuile(couleurCategorie(filtreCategorie), photoSel)) + '"></span>' +
      '<span class="selection__texte"><small>' + (q ? '« ' + echapper(el.recherche.value.trim()) + ' » dans' : 'Vous regardez') +
      ' · ' + pluriel(liste.length, "plant") + '</small><strong>' + echapper(libelle(filtreCategorie)) + '</strong></span>' +
      (tuiles ? '<button type="button" class="selection__changer" aria-label="Changer de catégorie">Changer ↑</button>' : '') +
      '</div>';

    el.contenu.innerHTML = tuiles + selection +
      (liste.length ? '<div class="grille-produits">' + fiches.map(ficheProduit).join("") + '</div>'
        : '<p class="vide">Aucun plant ne correspond à votre recherche.</p>');
  }

  // Bouton d'achat : ouvre le choix de la quantité (rien n'entre au panier sans validation)
  function controleQuantite(p) {
    if (p.stock === 0) return '<span class="stock stock--epuise">Épuisé</span>';
    const qte = panier[p.id] || 0;
    return '<span class="quantite"><button type="button" data-choisir="' + echapper(p.id) + '" class="ajouter' +
      (qte ? ' ajouter--fait' : '') + '">' +
      (qte ? '✓ ' + qte + '<span class="ajouter__suite"> au panier</span>' : '+<span class="ajouter__mot"> Ajouter</span>') + '</button></span>';
  }

  // ---------- Choix de la quantité ----------
  let choix = null; // { id, q }

  function ouvrirQuantite(id) {
    const p = trouver(id);
    if (!p) return;
    const dans = panier[id] || 0;
    choix = { id, q: dans || 1, dans };
    dessinerQuantite();
    el.dlgQuantite.showModal();
  }

  function dessinerQuantite() {
    const p = trouver(choix.id);
    const max = p.stock !== null ? Math.floor(p.stock) : 999;
    choix.q = Math.max(choix.dans ? 0 : 1, Math.min(choix.q, max));
    const total = p.prix !== null ? euros(p.prix * choix.q) : "";
    $("#choixQuantite").innerHTML =
      '<h2>Combien de plants ?</h2>' +
      '<p class="choix__plante"><span><b>' + echapper(p.nom) + '</b>' + (p.variete ? ' ' + echapper(p.variete) : '') + '</span>' +
      '<small>' + [p.prix !== null ? euros(p.prix) + ' pièce' : '', p.unite, p.stock !== null ? 'il en reste ' + Math.floor(p.stock) : '']
        .filter(Boolean).map(echapper).join(' · ') + '</small></p>' +
      '<div class="choix__compteur">' +
      '<button type="button" data-pas="-1" aria-label="Un de moins"' + (choix.q <= (choix.dans ? 0 : 1) ? ' disabled' : '') + '>−</button>' +
      '<output aria-live="polite">' + choix.q + '</output>' +
      '<button type="button" data-pas="1" aria-label="Un de plus"' + (choix.q >= max ? ' disabled' : '') + '>+</button></div>' +
      (total ? '<p class="choix__total">Total : <b>' + total + '</b></p>' : '') +
      '<div class="actions">' +
      '<button type="button" class="btn-principal" data-valider>' +
        (choix.q === 0 ? 'Retirer du panier' : choix.dans ? 'Mettre à jour le panier' : 'Ajouter ' + choix.q + ' au panier') + '</button>' +
      '<button type="button" class="btn-secondaire" data-annuler>Annuler</button></div>';
  }

  el.dlgQuantite.addEventListener("click", (e) => {
    if (e.target === el.dlgQuantite || e.target.closest("[data-annuler]")) { el.dlgQuantite.close(); return; }
    const pas = e.target.closest("[data-pas]");
    if (pas) { choix.q += +pas.dataset.pas; dessinerQuantite(); return; }
    if (!e.target.closest("[data-valider]")) return;
    const p = trouver(choix.id);
    if (choix.q <= 0) delete panier[choix.id]; else panier[choix.id] = choix.q;
    sauverPanier();
    el.dlgQuantite.close();
    const nom = p.nom + (p.variete ? " " + p.variete : "");
    annoncer(choix.q <= 0 ? nom + " retiré du panier"
      : choix.dans ? "Panier mis à jour : " + choix.q + " × " + nom
      : "✓ " + choix.q + " × " + nom + " ajouté" + (choix.q > 1 ? "s" : "") + " au panier");
    afficher();
    if (el.dlgFiche.open && ficheOuverte) ouvrirFiche(ficheOuverte.ids, ficheOuverte.sel);
  });

  // Message de confirmation en bas de l'écran, avec accès direct au panier
  let minuteurToast = 0;
  function annoncer(texte) {
    const t = $("#toast");
    // Fiche ouverte : le message doit s'afficher au-dessus d'elle
    (el.dlgFiche.open ? el.dlgFiche : document.body).appendChild(t);
    t.innerHTML = '<span>' + echapper(texte) + '</span><button type="button" data-voir-panier>Voir le panier</button>';
    t.hidden = false;
    t.classList.remove("toast--sort"); void t.offsetWidth; t.classList.add("toast--sort");
    $("#btnPanier").classList.remove("btn-panier--rebond"); void $("#btnPanier").offsetWidth;
    $("#btnPanier").classList.add("btn-panier--rebond");
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(() => { t.hidden = true; }, 4000);
  }
  $("#toast").addEventListener("click", (e) => {
    if (!e.target.closest("[data-voir-panier]")) return;
    $("#toast").hidden = true;
    if (el.dlgFiche.open) el.dlgFiche.close();
    ouvrirPanier();
  });

  // Pastille de couleur d'une variété, d'après le premier coloris cité (« Rose vif bordé de blanc » → rose)
  const TEINTES = [["noir", "#2b2b2b"], ["blanc", "#f7f5ef"], ["creme", "#efe4c2"], ["jaune", "#f2c31b"],
    ["orange", "#ee8a2a"], ["saumon", "#f39a7b"], ["abricot", "#f6b77c"], ["framboise", "#c2185b"], ["rose", "#e8679c"],
    ["rouge", "#c62828"], ["bordeaux", "#7b1e2b"], ["pourpre", "#6a1b4d"], ["violet", "#7b3fa0"], ["mauve", "#b48bd6"],
    ["lilas", "#c4a3d6"], ["bleu", "#3f6fd1"], ["vert", "#4c8c3a"], ["argent", "#c0c5c8"], ["dore", "#d4a017"],
    ["chocolat", "#5b3a29"]];
  // Dans une liste de variantes : si certaines ont une couleur, celles qui n'en ont pas encore
  // gardent un rond vide, pour que les noms restent alignés
  function pastilleGroupe(groupe, x) {
    if (x.infos.couleur) return pastille(x.infos.couleur);
    return groupe.some((y) => y.infos.couleur) ? '<span class="pastille pastille--vide" aria-hidden="true"></span>' : '';
  }

  function pastille(couleur) {
    const c = normaliser(couleur);
    if (!c) return "";
    if (c.startsWith("melange")) return '<span class="pastille pastille--melange" aria-hidden="true"></span>';
    let meilleur = null;
    for (const [mot, hex] of TEINTES) {
      const pos = c.indexOf(mot);
      if (pos >= 0 && (!meilleur || pos < meilleur.pos)) meilleur = { pos, hex };
    }
    return meilleur ? '<span class="pastille" style="background:' + meilleur.hex + '" aria-hidden="true"></span>' : "";
  }

  const idsGroupe = (groupe) => echapper(groupe.map((x) => x.id).join("§"));

  // Nom d'une variante dans sa carte. Une même variété vendue en plusieurs tailles se distingue
  // par son format : « Grosso · Pot 3 L », ou « Pot 3 L » seul si la carte n'a qu'une variété.
  function nomVariante(groupe, x) {
    const nom = x.variete || x.nom;
    const memes = groupe.filter((y) => normaliser(y.variete) === normaliser(x.variete));
    if (memes.length < 2 || !x.unite) return nom;
    return memes.length === groupe.length ? x.unite : nom + " · " + x.unite;
  }

  function ficheProduit(groupe) {
    const p = groupe[0];
    const seul = groupe.length === 1;
    // Une seule variété (éventuellement en plusieurs tailles) : son nom en titre
    const uneVariete = groupe.every((x) => normaliser(x.variete) === normaliser(p.variete));
    const titre = uneVariete && p.variete ? p.variete : p.nom;
    const surtitre = uneVariete && p.variete ? p.nom : "";
    const formats = [...new Set(groupe.map((x) => x.unite).filter(Boolean))];
    const mellifere = p.categories.some((c) => normaliser(c).startsWith("mellif"));
    // Variante montrée sur la photo de la carte : la première qui a sa photo
    const actif = groupe.find((x) => x.photo) || p;
    const photo = actif.photo;
    const prix = (x) => (x.prix !== null ? euros(x.prix) : "");
    const s = etatStock(p);
    const lignes = seul
      ? '<div class="fiche__pied"><div class="fiche__bas"><span class="prix">' + prix(p) + '</span>' +
        (p.stock !== 0 ? '<span class="stock stock--' + s.classe + '">' + s.texte + '</span>' : '') + '</div>' +
        '<div class="fiche__action">' + controleQuantite(p) + '</div></div>'
      : '<ul class="varietes">' + groupe.map((x) => {
          const sx = etatStock(x);
          // Toucher le nom d'une variante affiche sa photo sur la carte
          return '<li class="' + (x.stock === 0 ? 'epuise' : '') + (x === actif ? ' varietes--active' : '') + '">' +
            '<button type="button" class="varietes__nom" data-voir="' + echapper(x.id) + '" data-photo="' + echapper(x.photo || '') +
            '" aria-pressed="' + (x === actif) + '" aria-label="Voir la photo de ' + echapper(nomVariante(groupe, x)) + '">' +
            '<span>' + pastilleGroupe(groupe, x) + echapper(nomVariante(groupe, x)) + '</span><small>' +
            [prix(x), x.stock !== 0 && sx.classe === "faible" ? sx.texte : ""].filter(Boolean).join(" · ") +
            '</small></button>' + controleQuantite(x) + '</li>';
        }).join("") + '</ul>';
    return '<article class="fiche' + (groupe.every((x) => x.stock === 0) ? ' fiche--epuisee' : '') + '" data-ids="' + idsGroupe(groupe) +
      '" data-sel="' + echapper(actif.id) + '">' +
      '<button type="button" class="fiche__photo fiche__ouvrir" style="background-color:' + couleurCategorie(p.categories[0]) + '" aria-label="Voir la fiche de ' + echapper(titre) + '">' +
      '<img src="' + echapper(photo || '') + '" alt="" loading="lazy"' + (photo ? '' : ' hidden') + ' onerror="this.hidden=true">' +
      '<span class="fiche__lettre" aria-hidden="true">' + echapper(titre.charAt(0)) + '</span>' +
      '<span class="fiche__badge">' + echapper(p.categories[0]) + '</span>' +
      (groupe.length > 1 ? '<span class="fiche__nbvar">' + echapper(actif.variete || (groupe.length + ' variantes')) + '</span>' : '') + '</button>' +
      '<div class="fiche__corps">' + (surtitre ? '<span class="fiche__surtitre">' + echapper(surtitre) + '</span>' : '') +
      '<h3 class="fiche__ouvrir">' + echapper(titre) + '</h3>' +
      (formats.length || mellifere ? '<div class="puces">' + formats.map((f) => '<span class="puce">' + echapper(f) + '</span>').join("") +
        (mellifere ? '<span class="puce puce--mell">🐝 Mellifère</span>' : '') + '</div>' : '') +
      lignes + '<button type="button" class="fiche__voir fiche__ouvrir">Voir la fiche ›</button></div></article>';
  }

  // Carte à variantes : la photo suit la variante touchée ; « Photo à venir » si elle n'en a pas encore
  function montrerVariante(b) {
    const carte = b.closest(".fiche");
    const x = trouver(b.dataset.voir);
    carte.dataset.sel = b.dataset.voir;
    carte.querySelectorAll(".varietes li").forEach((li) => {
      const actif = li.contains(b);
      li.classList.toggle("varietes--active", actif);
      li.querySelector("[data-voir]").setAttribute("aria-pressed", actif);
    });
    const img = carte.querySelector(".fiche__photo img");
    if (b.dataset.photo) { img.src = b.dataset.photo; img.hidden = false; } else img.hidden = true;
    const etiquette = carte.querySelector(".fiche__nbvar");
    if (etiquette && x) etiquette.textContent = b.dataset.photo ? (x.variete || x.nom) : "Photo à venir";
  }

  // ---------- Fiche détaillée ----------
  let ficheOuverte = null; // { ids, sel }

  function ouvrirFiche(ids, sel) {
    const groupe = ids.map(trouver).filter(Boolean);
    if (!groupe.length) return;
    const v = groupe.find((x) => x.id === sel) || groupe[0];
    ficheOuverte = { ids, sel: v.id };
    const p = groupe[0];
    // Variante choisie sans sa propre photo : pas de photo d'une autre couleur à la place
    const photo = groupe.length > 1 ? v.photo : v.photo || (groupe.find((x) => x.photo) || {}).photo || "";
    const mellifere = p.categories.some((c) => normaliser(c).startsWith("mellif"));
    const inf = v.infos;
    const lignesInfo = [["Couleur", inf.couleur], ["Hauteur", inf.hauteur], ["Port", inf.port], ["Feuillage", inf.feuillage],
      ["Exposition", inf.exposition], ["Rusticité", inf.rusticite], ["Floraison", inf.floraison], ["Utilisation", inf.utilisation],
      ["Format", v.unite]].filter(([, x]) => x);
    const s = etatStock(v);
    $("#ficheDetail").innerHTML =
      '<div class="detail__photo" style="background-color:' + couleurCategorie(p.categories[0]) + '">' +
      (photo ? '<img src="' + echapper(photo) + '" alt="' + echapper(p.nom + " " + v.variete) + '" onerror="this.remove()">'
        : '<span class="detail__sansphoto">Photo à venir</span>') +
      '<button type="button" class="detail__fermer" data-fermer aria-label="Fermer">✕</button></div>' +
      '<div class="detail__corps">' +
      '<div class="puces"><span class="puce">' + echapper(p.categories[0]) + '</span>' +
      (mellifere ? '<span class="puce puce--mell">🐝 Mellifère</span>' : '') + '</div>' +
      '<h2>' + echapper(p.nom) + '</h2>' + (inf.latin ? '<p class="detail__latin">' + echapper(inf.latin) + '</p>' : '') +
      (groupe.length > 1 ? '<p class="detail__titre-section">Choisissez ' +
        (groupe.every((x) => normaliser(x.variete) === normaliser(p.variete)) ? 'une taille' : 'une variante') + '</p><div class="detail__variantes">' +
        groupe.map((x) => '<button type="button" class="variante' + (x.id === v.id ? ' actif' : '') + (x.stock === 0 ? ' epuise' : '') +
          '" data-sel="' + echapper(x.id) + '">' + pastilleGroupe(groupe, x) + echapper(nomVariante(groupe, x)) + '</button>').join("") + '</div>' : '') +
      '<div class="detail__achat"><div><strong>' + echapper(nomVariante(groupe, v)) + '</strong>' +
      '<span class="prix">' + (v.prix !== null ? euros(v.prix) : '') + '</span>' +
      (v.stock !== 0 ? ' <span class="stock stock--' + s.classe + '">' + s.texte + '</span>' : '') + '</div>' +
      controleQuantite(v) + '</div>' +
      (lignesInfo.length ? '<dl class="detail__infos">' + lignesInfo.map(([k, x]) =>
        '<div><dt>' + k + '</dt><dd>' + echapper(x) + '</dd></div>').join("") + '</dl>' : '') +
      (inf.description ? '<p class="detail__desc">' + echapper(inf.description) + '</p>' : '') +
      '</div>';
    $("#ficheDetail").querySelectorAll("[data-fermer]").forEach((b) => b.addEventListener("click", () => el.dlgFiche.close()));
    if (!el.dlgFiche.open) el.dlgFiche.showModal();
  }


  // ---------- Panier ----------
  function sauverPanier() {
    ecrire(CLE_PANIER, panier);
    const total = Object.values(panier).reduce((a, b) => a + b, 0);
    el.compteur.textContent = total;
    el.compteur.hidden = !total;
  }

  function changerQuantite(id, delta) {
    const p = trouver(id);
    if (!p) return;
    let q = (panier[id] || 0) + delta;
    if (p.stock !== null) q = Math.min(q, Math.floor(p.stock));
    if (q <= 0) delete panier[id]; else panier[id] = q;
    sauverPanier();
  }

  el.contenu.addEventListener("click", (e) => {
    const v = e.target.closest("[data-voir]");
    if (v) { montrerVariante(v); return; }
    const o = e.target.closest(".fiche__ouvrir");
    if (o) { const f = o.closest(".fiche"); ouvrirFiche(f.dataset.ids.split("§"), f.dataset.sel); return; }
    const b = e.target.closest("[data-choisir]");
    if (b) ouvrirQuantite(b.dataset.choisir);
  });

  el.contenu.addEventListener("click", (e) => {
    if (e.target.closest(".selection__changer")) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const t = e.target.closest(".tuile");
    if (!t) return;
    filtreCategorie = t.dataset.categorie;
    afficher();
    // On bascule sur les plants de la catégorie choisie
    const sel = document.getElementById("selection");
    if (sel) sel.scrollIntoView({ behavior: "smooth", block: "start" });
  });


  const lignesPanier = () =>
    Object.entries(panier).map(([id, q]) => ({ p: trouver(id), q })).filter((l) => l.p);
  const totalPanier = () =>
    lignesPanier().reduce((t, { p, q }) => t + (p.prix !== null ? p.prix * q : 0), 0);

  function ouvrirPanier() {
    const lignes = lignesPanier();
    el.erreurPanier.hidden = true;
    el.listePanier.innerHTML = lignes.length
      ? '<ul class="lignes-panier">' + lignes.map(({ p, q }) =>
          '<li><span class="ligne__nom">' + echapper(p.nom) + (p.variete ? ' <em>' + echapper(p.variete) + '</em>' : '') +
          '<small>' + (p.prix !== null ? euros(p.prix) : '') + (p.unite ? ' / ' + echapper(p.unite) : '') + '</small></span>' +
          '<span class="quantite" data-id="' + echapper(p.id) + '"><button data-delta="-1" aria-label="Retirer">−</button><b>' + q +
          '</b><button data-delta="1" aria-label="Ajouter">+</button></span></li>').join("") +
        '</ul><p class="total">Total indicatif : <b>' + euros(totalPanier()) + '</b></p>'
      : '<p class="vide">Votre panier est vide pour le moment.</p>';
    el.btnCommander.disabled = !lignes.length;
    if (!el.dlgPanier.open) el.dlgPanier.showModal();
  }

  el.listePanier.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-delta]");
    if (!b) return;
    changerQuantite(b.parentElement.dataset.id, +b.dataset.delta);
    ouvrirPanier();
    afficher();
  });

  async function commander() {
    el.btnCommander.disabled = true;
    el.btnCommander.textContent = "Envoi en cours…";
    el.erreurPanier.hidden = true;
    try {
      const rep = await appelApi({
        action: "commande",
        clientId: client.id,
        jeton: client.jeton,
        lignes: lignesPanier().map(({ p, q }) => ({ catalogue: p.catalogue, nom: p.nom, variete: p.variete, unite: p.unite, quantite: q })),
        message: el.messagePanier.value.trim(),
      });
      if (!rep.ok) {
        if (rep.deconnecter) { el.dlgPanier.close(); deconnecter(); }
        if (rep.actualiser && await chargerCatalogue()) { afficher(); ouvrirPanier(); }
        throw new Error(rep.erreur);
      }
      panier = {};
      el.messagePanier.value = "";
      await chargerCatalogue(); // stocks à jour après la vente
      el.dlgPanier.close();
      $("#numeroCommande").textContent = rep.numero;
      el.dlgConfirmation.showModal();
      afficher();
    } catch (err) {
      el.erreurPanier.textContent = err.message && !/fetch|HTTP|JSON/i.test(err.message)
        ? err.message : "Envoi impossible pour le moment. Vérifiez votre réseau et réessayez.";
      el.erreurPanier.hidden = false;
    } finally {
      el.btnCommander.disabled = !lignesPanier().length;
      el.btnCommander.textContent = "Envoyer ma commande";
    }
  }

  function ouvrirCompte() {
    $("#infosCompte").innerHTML = '<dl class="compte">' +
      [["Nom", (client.prenom || "") + " " + (client.nom || "")], ["Téléphone", client.telephone], ["E-mail", client.email]]
        .filter(([, v]) => v && v.trim()).map(([k, v]) => '<dt>' + k + '</dt><dd>' + echapper(v) + '</dd>').join("") +
      '</dl><p class="aide">Pour modifier ces informations, <a class="lien-equipe" data-sujet="Modifier mes informations">écrivez à l\'équipe APPUI</a>.</p>';
    preparerLiensEquipe();
    el.dlgCompte.showModal();
  }

  el.dlgFiche.addEventListener("click", (e) => {
    if (e.target === el.dlgFiche) { el.dlgFiche.close(); return; } // clic à côté de la fiche
    const v = e.target.closest(".variante");
    if (v) { ouvrirFiche(ficheOuverte.ids, v.dataset.sel); return; }
    const b = e.target.closest("[data-choisir]");
    if (b) ouvrirQuantite(b.dataset.choisir);
  });

  // ---------- Événements ----------
  document.querySelectorAll("[data-fermer]").forEach((b) =>
    b.addEventListener("click", () => b.closest("dialog").close()));
  el.btnRetour.onclick = () => { location.hash = ""; };
  $("#btnPanier").onclick = ouvrirPanier;
  $("#btnCompte").onclick = ouvrirCompte;
  $("#btnDeconnexion").onclick = deconnecter;
  el.btnCommander.onclick = commander;
  el.recherche.addEventListener("input", afficher);
  window.addEventListener("hashchange", () => {
    el.recherche.value = "";
    filtreCategorie = "";
    if (client) afficher();
    window.scrollTo(0, 0);
  });

  // Recharge les stocks quand le client revient sur l'appli
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && client && await chargerCatalogue()) afficher();
  });

  // ---------- Installation comme application ----------
  let invitation = null;
  const bandeau = $("#bandeauInstall");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    invitation = e;
    if (!lire("appui.installRefusee", false)) bandeau.hidden = false;
  });
  $("#btnInstaller").onclick = () => {
    bandeau.hidden = true;
    if (invitation) { invitation.prompt(); invitation = null; }
  };
  $("#btnFermerInstall").onclick = () => { bandeau.hidden = true; ecrire("appui.installRefusee", true); };

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  // ---------- Démarrage ----------
  let catalogueCharge = null;
  async function demarrerAppli() {
    el.ecranConnexion.hidden = true;
    el.appli.hidden = false;
    el.contenu.innerHTML = '<p class="chargement">Chargement du catalogue…</p>';
    catalogueCharge = catalogueCharge || chargerCatalogue();
    if (await catalogueCharge) afficher();
  }

  // Liens « écrire à l'équipe » : toujours adressés à toutes les adresses de l'équipe
  function preparerLiensEquipe() {
    const emails = (CFG.emailsEquipe || []).join(",");
    document.querySelectorAll(".lien-equipe").forEach((a) => {
      a.hidden = !emails;
      a.href = "mailto:" + emails + "?subject=" + encodeURIComponent("APPUI – " + (a.dataset.sujet || "Demande"));
    });
  }

  function appliquerReglages() {
    preparerLiensEquipe();
    $("#infosRetrait").textContent = CFG.infosRetrait || "";
    $("#contactPied").textContent = CFG.telephoneContact ? "Contact : " + CFG.telephoneContact : "";
    if (!catalogueCourant()) el.titre.textContent = CFG.nomStructure || "APPUI";
  }

  appliquerReglages();
  sauverPanier();
  if (client) demarrerAppli(); else montrerConnexion();
})();
