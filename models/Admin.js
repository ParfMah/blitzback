/**
 * BLITZ LEIHEN — Modèle Administrateur
 *
 * Gère les comptes admin de l'espace de gestion.
 * Sécurité :
 *   - Mot de passe haché avec bcryptjs (salt=12)
 *   - Verrouillage du compte après 5 tentatives échouées
 *   - Tracking des connexions (date, IP)
 *   - Tokens de réinitialisation de MDP avec expiration
 */

const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');

const adminSchema = new mongoose.Schema({

  /* -------------------------------------------------------
     IDENTITÉ
  ------------------------------------------------------- */
  name: {
    type:      String,
    required:  [true, 'Name ist erforderlich'],
    trim:      true,
    maxlength: [100, 'Name darf max. 100 Zeichen haben'],
  },

  email: {
    type:      String,
    required:  [true, 'E-Mail ist erforderlich'],
    unique:    true,
    lowercase: true,
    trim:      true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Ungültige E-Mail-Adresse'],
  },

  /* -------------------------------------------------------
     AUTHENTIFICATION
     Le mot de passe n'est JAMAIS retourné dans les requêtes
     grâce à `select: false`
  ------------------------------------------------------- */
  password: {
    type:     String,
    required: [true, 'Passwort ist erforderlich'],
    minlength: [8, 'Passwort muss mindestens 8 Zeichen haben'],
    select:   false, // Jamais inclus dans les réponses par défaut
  },

  /* -------------------------------------------------------
     RÔLE ET PERMISSIONS
  ------------------------------------------------------- */
  role: {
    type:    String,
    enum:    ['admin', 'superadmin', 'conseiller'],
    default: 'conseiller',
  },

  actif: {
    type:    Boolean,
    default: true,
  },

  /* -------------------------------------------------------
     SÉCURITÉ — Verrouillage du compte
     Après 5 tentatives échouées : compte verrouillé 30 min
  ------------------------------------------------------- */
  loginTentativesEchouees: {
    type:    Number,
    default: 0,
  },

  compteVerrouille: {
    type:    Boolean,
    default: false,
  },

  verrouillageFin: {
    type:    Date,
    default: null,
  },

  /* -------------------------------------------------------
     TRACKING DES CONNEXIONS
  ------------------------------------------------------- */
  derniereConnexion: {
    type:    Date,
    default: null,
  },

  derniereConnexionIP: {
    type:    String,
    default: '',
  },

  /* -------------------------------------------------------
     RÉINITIALISATION DU MOT DE PASSE
     Token temporaire envoyé par email (expire en 1h)
  ------------------------------------------------------- */
  resetPasswordToken: {
    type:   String,
    select: false,
  },

  resetPasswordExpires: {
    type:   Date,
    select: false,
  },

}, {
  timestamps: true,
  collection: 'admins',
});

/* ----------------------------------------------------------
   MIDDLEWARE PRÉ-SAVE : Hachage du mot de passe
   Exécuté seulement si le mot de passe a été modifié
---------------------------------------------------------- */
adminSchema.pre('save', async function (next) {
  // Ne re-hacher que si le MDP a changé (évite le double hachage)
  if (!this.isModified('password')) return next();

  try {
    // salt=12 : bon équilibre sécurité/performance
    const salt    = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

/* ----------------------------------------------------------
   MÉTHODE D'INSTANCE : Vérification du mot de passe
   Utilisée dans authController pour comparer le MDP saisi
---------------------------------------------------------- */
adminSchema.methods.verifierMotDePasse = async function (motDePasseSaisi) {
  return await bcrypt.compare(motDePasseSaisi, this.password);
};

/* ----------------------------------------------------------
   MÉTHODE D'INSTANCE : Enregistrer une tentative échouée
   Verrouille le compte après 5 échecs consécutifs (30 min)
---------------------------------------------------------- */
adminSchema.methods.enregistrerEchec = async function () {
  this.loginTentativesEchouees += 1;

  if (this.loginTentativesEchouees >= 5) {
    this.compteVerrouille = true;
    // Verrouillage de 30 minutes
    this.verrouillageFin  = new Date(Date.now() + 30 * 60 * 1000);
    console.warn(`⚠️  Compte admin verrouillé : ${this.email}`);
  }

  await this.save();
};

/* ----------------------------------------------------------
   MÉTHODE D'INSTANCE : Réinitialiser les tentatives
   Appelée après une connexion réussie
---------------------------------------------------------- */
adminSchema.methods.reinitialiserTentatives = async function (ip) {
  this.loginTentativesEchouees = 0;
  this.compteVerrouille        = false;
  this.verrouillageFin         = null;
  this.derniereConnexion       = new Date();
  this.derniereConnexionIP     = ip || '';
  await this.save();
};

/* ----------------------------------------------------------
   MÉTHODE D'INSTANCE : Vérifier si le compte est verrouillé
   Déverrouille automatiquement si le délai est dépassé
---------------------------------------------------------- */
adminSchema.methods.estVerrouille = async function () {
  if (!this.compteVerrouille) return false;

  // Vérifier si le délai de verrouillage est dépassé
  if (this.verrouillageFin && this.verrouillageFin < new Date()) {
    this.compteVerrouille        = false;
    this.verrouillageFin         = null;
    this.loginTentativesEchouees = 0;
    await this.save();
    return false;
  }

  return true;
};

/* ----------------------------------------------------------
   VIRTUEL : Données publiques (sans MDP)
---------------------------------------------------------- */
adminSchema.virtual('profilPublic').get(function () {
  return {
    id:    this._id,
    name:  this.name,
    email: this.email,
    role:  this.role,
    actif: this.actif,
    derniereConnexion: this.derniereConnexion,
  };
});

adminSchema.set('toJSON', {
  virtuals: true,
  transform: function (doc, ret) {
    // Supprimer les champs sensibles de toute sortie JSON
    delete ret.password;
    delete ret.resetPasswordToken;
    delete ret.resetPasswordExpires;
    delete ret.loginTentativesEchouees;
    return ret;
  },
});

module.exports = mongoose.model('Admin', adminSchema);
