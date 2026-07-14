/**
 * BLITZ LEIHEN — Modèle Conversation (Live-Chat)
 *
 * Représente une conversation de chat en direct entre un visiteur
 * du site public et un conseiller (admin).
 *
 * Une conversation est identifiée côté visiteur par un identifiant
 * anonyme généré et stocké dans le localStorage du navigateur
 * (voir js/chat-widget.js), ce qui permet à un visiteur de retrouver
 * son historique s'il revient sur le site.
 */

const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({

  /* -------------------------------------------------------
     IDENTIFIANT VISITEUR
     UUID généré côté client (localStorage), pas d'authentification
     requise pour un visiteur — c'est ce qui permet de retrouver
     la conversation entre deux visites.
  ------------------------------------------------------- */
  visiteurId: {
    type:     String,
    required: true,
    unique:   true,
    index:    true,
    trim:     true,
  },

  /* -------------------------------------------------------
     IDENTITÉ DÉCLARÉE PAR LE VISITEUR (facultatif)
  ------------------------------------------------------- */
  nom: {
    type:      String,
    trim:      true,
    maxlength: [100, 'Name darf max. 100 Zeichen haben'],
    default:   '',
  },

  email: {
    type:      String,
    trim:      true,
    lowercase: true,
    default:   '',
  },

  /* -------------------------------------------------------
     LOCALISATION DU VISITEUR (collectée côté client via API IP,
     même mécanisme que pour les demandes de prêt — voir Demande.js)
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
    type:    String, // ex: "Berlin, Brandenburg, Germany"
    default: '',
  },

  /* -------------------------------------------------------
     STATUT DE LA CONVERSATION
  ------------------------------------------------------- */
  statut: {
    type:    String,
    enum:    ['ouvert', 'ferme'],
    default: 'ouvert',
    index:   true,
  },

  /* -------------------------------------------------------
     CONSEILLER ASSIGNÉ (facultatif)
  ------------------------------------------------------- */
  adminAssigne: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     'Admin',
    default: null,
  },

  /* -------------------------------------------------------
     APERÇU DU DERNIER MESSAGE (pour la liste des conversations
     côté admin, évite une jointure à chaque affichage)
  ------------------------------------------------------- */
  dernierMessage: {
    type:    String,
    default: '',
  },

  dernierMessageDate: {
    type:    Date,
    default: Date.now,
  },

  dernierExpediteur: {
    type: String,
    enum: ['visiteur', 'admin', null],
    default: null,
  },

  /* -------------------------------------------------------
     COMPTEURS NON LUS
  ------------------------------------------------------- */
  nonLuAdmin: {
    type:    Number,
    default: 0,
    min:     0,
  },

  nonLuVisiteur: {
    type:    Number,
    default: 0,
    min:     0,
  },

  /* -------------------------------------------------------
     CONTEXTE TECHNIQUE
  ------------------------------------------------------- */
  pageOrigine: {
    type:    String,
    default: '',
  },

  ipAdresse: {
    type:    String,
    default: '',
  },

  userAgent: {
    type:    String,
    default: '',
  },

}, {
  timestamps: true,
  collection: 'conversations',
});

/* Index pour trier rapidement la boîte de réception admin */
conversationSchema.index({ statut: 1, dernierMessageDate: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
