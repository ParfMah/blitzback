/**
 * BLITZ LEIHEN — Modèle Message / Notification
 *
 * Stocke les notifications internes liées aux demandes :
 *   - Email envoyé au client
 *   - Email de notification au conseiller
 *   - SMS envoyé (si activé)
 *   - Notes internes entre admins
 *
 * Permet de tracer tout l'historique de communication
 * pour chaque demande dans l'espace admin.
 */

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({

  /* -------------------------------------------------------
     RÉFÉRENCE À LA DEMANDE
  ------------------------------------------------------- */
  demande: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Demande',
    required: true,
    index:    true,
  },

  /* -------------------------------------------------------
     TYPE DE MESSAGE
  ------------------------------------------------------- */
  type: {
    type: String,
    enum: [
      'email_client',       // Email de confirmation envoyé au client
      'email_conseiller',   // Email de notification envoyé au conseiller
      'sms_client',         // SMS envoyé au client
      'note_interne',       // Note interne d'un admin
      'changement_statut',  // Notification de changement de statut
      'system',             // Message système automatique
    ],
    required: true,
  },

  /* -------------------------------------------------------
     CONTENU DU MESSAGE
  ------------------------------------------------------- */
  sujet: {
    type:      String,
    trim:      true,
    maxlength: [200, 'Sujet trop long'],
    default:   '',
  },

  corps: {
    type:     String,
    required: [true, 'Corps du message requis'],
    maxlength: [10000, 'Corps du message trop long'],
  },

  /* -------------------------------------------------------
     EXPÉDITEUR ET DESTINATAIRE
  ------------------------------------------------------- */
  expediteur: {
    type:    String,
    default: 'system@blitz-leihen.de',
    trim:    true,
  },

  destinataire: {
    type:    String,
    default: '',
    trim:    true,
  },

  /* -------------------------------------------------------
     ÉTAT D'ENVOI
  ------------------------------------------------------- */
  statut: {
    type:    String,
    enum:    ['en_attente', 'envoye', 'echec'],
    default: 'en_attente',
  },

  // Message d'erreur si l'envoi a échoué
  erreur: {
    type:    String,
    default: '',
  },

  // Date effective d'envoi
  dateEnvoi: {
    type:    Date,
    default: null,
  },

  /* -------------------------------------------------------
     AUTEUR (pour les notes internes)
  ------------------------------------------------------- */
  auteur: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     'Admin',
    default: null,
  },

  /* -------------------------------------------------------
     MÉTADONNÉES TECHNIQUES
  ------------------------------------------------------- */
  meta: {
    type:    mongoose.Schema.Types.Mixed,
    default: {},
  },

}, {
  timestamps: true,
  collection: 'messages',
});

/* Index pour retrouver rapidement tous les messages d'une demande */
messageSchema.index({ demande: 1, createdAt: -1 });
messageSchema.index({ type: 1, statut: 1 });

module.exports = mongoose.model('Message', messageSchema);
