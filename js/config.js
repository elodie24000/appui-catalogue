// ============================================================
//  RÉGLAGES DU CATALOGUE APPUI — à remplir une seule fois
// ============================================================
// Une fois le tableur branché (apiUrl), les onglets « Réglages » et
// « Présentation catalogues » du tableur remplacent les valeurs ci-dessous.
window.APPUI_CONFIG = {
  // Adresse de l'application web Apps Script (se termine par /exec).
  // Voir README.md, « Mise en service ». Si elle est vide, l'appli tourne en
  // mode démonstration avec data/catalogue-exemple.csv.
  apiUrl: "",

  nomStructure: "APPUI",
  infosRetrait: "Retrait des commandes sur le site du chantier, aux horaires communiqués par l'équipe.",
  telephoneContact: "", // affiché en bas de page si renseigné, ex. "05 53 00 00 00"
  // Toute demande écrite depuis l'appli part vers ces deux adresses
  emailsEquipe: ["les.jardins.de.lappui@gmail.com", "eti.jardins@appui.fr"],

  // Présentation des catalogues (le nom doit être celui de la colonne « Catalogue » du tableur)
  catalogues: {
    "Légumes": {
      titre: "Plants de légumes",
      texte: "Plants potagers et aromatiques produits par le chantier d'insertion.",
      couleur: "anis",
      // Photo de la grande tuile d'accueil (nom d'une photo du dossier photos/ ou du dossier Drive)
      photo: "salade",
      // Photo de chaque tuile de catégorie (sinon : la photo d'un des plants de la catégorie)
      photosCategories: { Tout: "tomate-marmande", Tomates: "tomate-noire-de-crimee", Aromatiques: "basilic-grand-vert" },
      libellesCategories: { Tout: "Toute la liste" },
    },
    "Fleurs": {
      titre: "Plants de fleurs",
      texte: "Vivaces, annuelles et mellifères pour le jardin et les pollinisateurs.",
      couleur: "orange",
      photo: "coleus",
      photosCategories: { Tout: "zinnia", Annuelles: "cosmos", Vivaces: "lupin", "Mellifères": "lavande" },
      libellesCategories: { Tout: "Toute la liste", Vivaces: "Plantes vivaces", Annuelles: "Plantes annuelles", "Mellifères": "Plantes mellifères" },
      ordreCategories: ["Vivaces", "Annuelles", "Mellifères"],
      // Une seule fiche par plante, avec le choix de la variante (couleur, photo)
      regrouperVarietes: true,
    },
  },
};
