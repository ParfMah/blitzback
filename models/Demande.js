/**
 * BLITZ LEIHEN — Modèle Demande de prêt
 *
 * Représente une demande de crédit soumise via le formulaire frontend.
 * Contient :
 *   - Informations personnelles du demandeur
 *   - Informations financières
 *   - Statut de traitement (Neu → Analyse → Akzeptiert/Abgelehnt)
 *   - Numéro de référence unique (format BL-YYYY-XXXXXX)
 *   - Historique des changements de statut
 */

const mongoose = require('mongoose');

/* ----------------------------------------------------------
   SCHÉMA HISTORIQUE DES STATUTS
   Chaque changement de statut est tracé avec date + auteur
---------------------------------------------------------- */
const historiqueStatutSchema = new mongoose.Schema({
  statut: {
    type: String,
    enum: ['Neu', 'Analyse', 'Akzeptiert', 'Abgelehnt'],
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  // Identifiant de l'admin ayant effectué le changement
  modifiePar: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
  },
  commentaire: {
    type: String,
    maxlength: 500,
    default: '',
  },
}, { _id: false }); // Pas besoin d'_id pour les sous-documents

/* ----------------------------------------------------------
   SCHÉMA PRINCIPAL — DEMANDE DE PRÊT
---------------------------------------------------------- */
const demandeSchema = new mongoose.Schema({

  /* -------------------------------------------------------
     NUMÉRO DE RÉFÉRENCE UNIQUE
     Généré automatiquement au format BL-2025-123456
     Utilisé dans les emails et l'espace admin
  ------------------------------------------------------- */
  referenceNumber: {
    type:    String,
    unique:  true,
    index:   true,
  },

  /* -------------------------------------------------------
     INFORMATIONS PERSONNELLES
  ------------------------------------------------------- */
  vorname: {
    type:     String,
    required: [true, 'Vorname ist erforderlich'],
    trim:     true,
    maxlength: [50, 'Vorname darf max. 50 Zeichen haben'],
  },

  nachname: {
    type:     String,
    required: [true, 'Nachname ist erforderlich'],
    trim:     true,
    maxlength: [50, 'Nachname darf max. 50 Zeichen haben'],
  },

  geburtsdatum: {
    type:     Date,
    required: [true, 'Geburtsdatum ist erforderlich'],
    validate: {
      validator: function (val) {
        // Doit avoir au moins 18 ans
        const today  = new Date();
        const age    = today.getFullYear() - val.getFullYear();
        const mDiff  = today.getMonth() - val.getMonth();
        const dDiff  = today.getDate() - val.getDate();
        const realAge = age - (mDiff < 0 || (mDiff === 0 && dDiff < 0) ? 1 : 0);
        return realAge >= 18 && realAge <= 90;
      },
      message: 'Das Mindestalter beträgt 18 Jahre',
    },
  },

  staatsangehoerigkeit: {
    type: String,
    enum: ['deutsch', 'andere'],
    default: 'deutsch',
  },

  email: {
    type:     String,
    required: [true, 'E-Mail-Adresse ist erforderlich'],
    trim:     true,
    lowercase: true,
    match: [
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      'Ungültige E-Mail-Adresse',
    ],
    index: true,
  },

  telefon: {
    type:     String,
    required: [true, 'Telefonnummer ist erforderlich'],
    trim:     true,
    match: [
      /^[\+]?[\d\s\-\(\)]{8,20}$/,
      'Ungültige Telefonnummer',
    ],
  },

  adresse: {
    type:     String,
    required: [true, 'Adresse ist erforderlich'],
    trim:     true,
    maxlength: [200, 'Adresse darf max. 200 Zeichen haben'],
  },

  ort: {
    type:     String,
    required: [true, 'Ort/PLZ ist erforderlich'],
    trim:     true,
    maxlength: [100, 'Ort darf max. 100 Zeichen haben'],
  },

  land: {
    type:     String,
    required: [true, 'Wohnsitzland ist erforderlich'],
    trim:     true,
  },

  beschaeftigung: {
    type: String,
    enum: [
      'Angestellt (unbefristet)',
      'Angestellt (befristet)',
      'Selbstständig',
      'Beamter',
      'Rentner',
      'Student',
      'Arbeitssuchend',
      'Sonstiges',
    ],
    required: [true, 'Beschäftigungsstatus ist erforderlich'],
  },

  // Revenu mensuel net en euros
  einkommen: {
    type:    Number,
    required: [true, 'Monatliches Einkommen ist erforderlich'],
    min: [0, 'Einkommen kann nicht negativ sein'],
    max: [1000000, 'Ungültiger Einkommenswert'],
  },

  // Dettes / charges mensuelles existantes en euros (crédits en cours,
  // leasing, pensions alimentaires, etc.) — utilisé pour calculer la
  // Schuldenquote (taux d'endettement, voir virtual plus bas)
  bestehendeVerbindlichkeiten: {
    type:    Number,
    default: 0,
    min:     [0, 'Verbindlichkeiten können nicht negativ sein'],
    max:     [1000000, 'Ungültiger Wert'],
  },

  /* -------------------------------------------------------
     INFORMATIONS DU PRÊT DEMANDÉ
  ------------------------------------------------------- */
  kreditart: {
    type: String,
    enum: [
      'Privatkredit',
      'Immobilienkredit',
      'Autofinanzierung',
      'Renovierungskredit',
      'Hypothekenkredit',
      'Umschuldung',
    ],
    required: [true, 'Kreditart ist erforderlich'],
  },

  // Montant demandé en euros
  kreditbetrag: {
    type:    Number,
    required: [true, 'Kreditbetrag ist erforderlich'],
    min: [1000,    'Mindestbetrag ist 1.000 €'],
    max: [2000000, 'Maximalbetrag ist 2.000.000 €'],
  },

  // Durée souhaitée en mois
  laufzeit: {
    type:    Number,
    required: [true, 'Laufzeit ist erforderlich'],
    min: [6,   'Mindestlaufzeit ist 6 Monate'],
    max: [360, 'Maximallaufzeit ist 360 Monate (30 Jahre)'],
  },

  // Raison du financement (texte libre)
  verwendungszweck: {
    type:    String,
    trim:    true,
    maxlength: [300, 'Verwendungszweck darf max. 300 Zeichen haben'],
    default: '',
  },

  /* -------------------------------------------------------
     OPTION SMS
     Le client a-t-il accepté les notifications par SMS ?
  ------------------------------------------------------- */
  sms_verification: {
    type:    String,
    enum:    ['ja', 'nein'],
    default: 'nein',
  },

  // Si SMS activé : numéro vérifié (après confirmation OTP)
  smsVerifie: {
    type:    Boolean,
    default: false,
  },

  /* -------------------------------------------------------
     CONSENTEMENTS RGPD (obligatoires)
  ------------------------------------------------------- */
  datenschutz:       { type: Boolean, required: true, default: false },
  agb:               { type: Boolean, required: true, default: false },
  schufa_zustimmung: { type: Boolean, required: true, default: false },

  /* -------------------------------------------------------
     STATUT ET TRAITEMENT
  ------------------------------------------------------- */
  statut: {
    type:    String,
    enum:    ['Neu', 'Analyse', 'Akzeptiert', 'Abgelehnt'],
    default: 'Neu',
    index:   true,
  },

  // Admin assigné au traitement de cette demande
  assigneA: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     'Admin',
    default: null,
  },

  // Note interne du conseiller
  noteInterne: {
    type:    String,
    maxlength: 2000,
    default: '',
  },

  // Historique complet des changements de statut
  historiqueStatuts: [historiqueStatutSchema],

  /* -------------------------------------------------------
     LOCALISATION DU VISITEUR (collectée côté client via API IP)
     Complémentaire à ipAdresse (qui est l'IP côté serveur) :
     ces champs donnent la ville/région/pays approximatifs du
     visiteur au moment de la soumission du formulaire, utiles
     pour le conseiller et le suivi des abandons.
  ------------------------------------------------------- */
  visiteurVille: {
    type:    String,
    default: '',
  },

  visiteurRegion: {
    type:    String,
    default: '',
  },

  visiteurPays: {
    type:    String,
    default: '',
  },

  visiteurLocalisationAffichage: {
    type:    String,  // ex: "Berlin, Brandenburg, Germany"
    default: '',
  },

  /* -------------------------------------------------------
     TRAÇABILITÉ TECHNIQUE
  ------------------------------------------------------- */
  // Adresse IP du demandeur (pour audit)
  ipAdresse: {
    type:    String,
    default: '',
  },

  // User-Agent du navigateur
  userAgent: {
    type:    String,
    default: '',
  },

  // Emails envoyés (traçabilité)
  emailClientEnvoye:    { type: Boolean, default: false },
  emailConseillerEnvoye:{ type: Boolean, default: false },

}, {
  timestamps: true, // Ajoute createdAt et updatedAt automatiquement
  collection:  'demandes',
});

/* ----------------------------------------------------------
   MIDDLEWARE PRÉ-SAVE : Génération du numéro de référence
   Format : BL-2025-123456 (6 chiffres aléatoires)
---------------------------------------------------------- */
demandeSchema.pre('save', async function (next) {
  // Ne générer le numéro qu'à la création (pas aux mises à jour)
  if (this.isNew) {
    this.referenceNumber = await generateUniqueRef();

    // Initialiser l'historique des statuts avec "Neu"
    this.historiqueStatuts = [{
      statut:    'Neu',
      date:      new Date(),
      modifiePar: null,
      commentaire: 'Antrag eingegangen',
    }];
  }
  next();
});

/* ----------------------------------------------------------
   MIDDLEWARE PRÉ-SAVE : Tracking des changements de statut
   Ajoute une entrée dans historiqueStatuts à chaque modification
---------------------------------------------------------- */
demandeSchema.pre('save', function (next) {
  if (!this.isNew && this.isModified('statut')) {
    this.historiqueStatuts.push({
      statut:    this.statut,
      date:      new Date(),
      modifiePar: this._modifiePar || null,
      commentaire: this._commentaireStatut || '',
    });
  }
  next();
});

/* ----------------------------------------------------------
   MÉTHODE VIRTUELLE : Nom complet du demandeur
---------------------------------------------------------- */
demandeSchema.virtual('nomComplet').get(function () {
  return `${this.vorname} ${this.nachname}`;
});

/* ----------------------------------------------------------
   MÉTHODE VIRTUELLE : Montant formaté en euros (format allemand)
---------------------------------------------------------- */
demandeSchema.virtual('kreditbetragFormate').get(function () {
  return new Intl.NumberFormat('de-DE', {
    style:    'currency',
    currency: 'EUR',
  }).format(this.kreditbetrag);
});

/* ----------------------------------------------------------
   MÉTHODE VIRTUELLE : Age du demandeur
---------------------------------------------------------- */
demandeSchema.virtual('age').get(function () {
  if (!this.geburtsdatum) return null;
  const today = new Date();
  let age = today.getFullYear() - this.geburtsdatum.getFullYear();
  const m = today.getMonth() - this.geburtsdatum.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < this.geburtsdatum.getDate())) age--;
  return age;
});

/* ----------------------------------------------------------
   MÉTHODE VIRTUELLE : Schuldenquote (taux d'endettement estimé)
   Formule : (dettes existantes + mensualité estimée du nouveau
   crédit) / revenu net mensuel × 100
   La mensualité du nouveau crédit est estimée linéairement, SANS
   intérêts (montant ÷ durée) : le taux réel dépend du partenaire
   bancaire retenu et n'est pas connu à ce stade. Calculée
   côté serveur pour ne jamais dépendre d'une valeur envoyée par
   le client.
---------------------------------------------------------- */
demandeSchema.virtual('schuldenquote').get(function () {
  if (!this.einkommen || this.einkommen <= 0) return null;
  if (!this.kreditbetrag || !this.laufzeit) return null;

  const verbindlichkeiten = this.bestehendeVerbindlichkeiten || 0;
  const rateEstimee       = this.kreditbetrag / this.laufzeit;
  const quote             = ((verbindlichkeiten + rateEstimee) / this.einkommen) * 100;

  return Math.round(quote * 10) / 10; // arrondi à 1 décimale
});

/* ----------------------------------------------------------
   GÉNÉRATION DU NUMÉRO DE RÉFÉRENCE UNIQUE
   Essaie jusqu'à 5 fois en cas de collision (très rare)
---------------------------------------------------------- */
async function generateUniqueRef() {
  const Demande = mongoose.model('Demande');
  const year    = new Date().getFullYear();
  let ref, exists, attempts = 0;

  do {
    // 6 chiffres aléatoires : 000001 à 999999
    const num = String(Math.floor(Math.random() * 999999) + 1).padStart(6, '0');
    ref    = `BL-${year}-${num}`;
    exists = await Demande.findOne({ referenceNumber: ref }).lean();
    attempts++;
  } while (exists && attempts < 5);

  return ref;
}

/* ----------------------------------------------------------
   INDEX COMPOSÉS pour les requêtes fréquentes
---------------------------------------------------------- */
demandeSchema.index({ statut: 1, createdAt: -1 }); // Filtre par statut + tri par date
demandeSchema.index({ email: 1, createdAt: -1 });   // Historique d'un client

// Active les virtuals dans les sérialisations JSON
demandeSchema.set('toJSON',   { virtuals: true });
demandeSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Demande', demandeSchema);
