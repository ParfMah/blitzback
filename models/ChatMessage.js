/**
 * BLITZ LEIHEN — Modèle ChatMessage (Live-Chat)
 *
 * Un message individuel au sein d'une Conversation de chat en direct.
 *
 * NB : ce modèle est distinct de `Message.js`, qui trace les emails
 * et SMS envoyés pour les demandes de crédit — deux domaines séparés.
 */

const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({

  /* -------------------------------------------------------
     RÉFÉRENCE À LA CONVERSATION
  ------------------------------------------------------- */
  conversation: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Conversation',
    required: true,
    index:    true,
  },

  /* -------------------------------------------------------
     EXPÉDITEUR
  ------------------------------------------------------- */
  expediteur: {
    type:     String,
    enum:     ['visiteur', 'admin'],
    required: true,
  },

  // Renseigné uniquement si expediteur === 'admin'
  auteurAdmin: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     'Admin',
    default: null,
  },

  // Nom affiché de l'auteur admin au moment de l'envoi (snapshot,
  // pour ne pas dépendre d'un admin supprimé plus tard)
  auteurNom: {
    type:    String,
    default: '',
  },

  /* -------------------------------------------------------
     CONTENU
  ------------------------------------------------------- */
  texte: {
    type:      String,
    required:  [true, 'Nachricht darf nicht leer sein'],
    trim:      true,
    maxlength: [4000, 'Nachricht zu lang (max. 4000 Zeichen)'],
  },

  /* -------------------------------------------------------
     ÉTAT DE LECTURE
  ------------------------------------------------------- */
  lu: {
    type:    Boolean,
    default: false,
  },

}, {
  timestamps: true,
  collection: 'chatmessages',
});

/* Index pour charger rapidement l'historique d'une conversation */
chatMessageSchema.index({ conversation: 1, createdAt: 1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
