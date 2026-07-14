/**
 * BLITZ LEIHEN — Service Live-Chat
 *
 * Contient toute la logique métier du chat en direct, partagée entre :
 *   - controllers/chatController.js (routes REST classiques)
 *   - sockets/chatSocket.js         (événements temps réel Socket.IO)
 *
 * Centraliser cette logique évite toute divergence entre le
 * comportement REST (chargement initial, fallback sans WebSocket)
 * et le comportement temps réel.
 */

const Conversation = require('../models/Conversation');
const ChatMessage  = require('../models/ChatMessage');
const { createError } = require('../middleware/errorHandler');

/* ----------------------------------------------------------
   TROUVER OU CRÉER UNE CONVERSATION
   Appelé quand un visiteur ouvre le widget de chat.
---------------------------------------------------------- */
async function trouverOuCreerConversation(visiteurId, meta = {}) {
  if (!visiteurId || typeof visiteurId !== 'string') {
    throw createError(400, 'visiteurId ist erforderlich');
  }

  let conversation = await Conversation.findOne({ visiteurId });

  if (!conversation) {
    conversation = await Conversation.create({
      visiteurId,
      nom:         meta.nom || '',
      email:       meta.email || '',
      pageOrigine: meta.pageOrigine || '',
      ipAdresse:   meta.ipAdresse || '',
      userAgent:   meta.userAgent || '',
      visiteurVille:                 meta.visiteurVille || '',
      visiteurRegion:                meta.visiteurRegion || '',
      visiteurPays:                  meta.visiteurPays || '',
      visiteurLocalisationAffichage: meta.visiteurLocalisationAffichage || '',
    });
  } else {
    // Met à jour l'identité déclarée si fournie et rouvre la
    // conversation si le visiteur revient après une clôture.
    let modifie = false;
    if (meta.nom && meta.nom !== conversation.nom) {
      conversation.nom = meta.nom;
      modifie = true;
    }
    if (meta.email && meta.email !== conversation.email) {
      conversation.email = meta.email;
      modifie = true;
    }
    // La localisation peut être précisée/rafraîchie à chaque connexion
    // (ex : visiteur en déplacement, ou localisation absente la 1ère fois)
    if (meta.visiteurLocalisationAffichage && meta.visiteurLocalisationAffichage !== conversation.visiteurLocalisationAffichage) {
      conversation.visiteurVille                 = meta.visiteurVille || '';
      conversation.visiteurRegion                = meta.visiteurRegion || '';
      conversation.visiteurPays                  = meta.visiteurPays || '';
      conversation.visiteurLocalisationAffichage = meta.visiteurLocalisationAffichage;
      modifie = true;
    }
    if (conversation.statut === 'ferme') {
      conversation.statut = 'ouvert';
      modifie = true;
    }
    if (modifie) await conversation.save();
  }

  return conversation;
}

/* ----------------------------------------------------------
   HISTORIQUE D'UNE CONVERSATION
---------------------------------------------------------- */
async function obtenirHistorique(conversationId, limite = 200) {
  return ChatMessage.find({ conversation: conversationId })
    .sort({ createdAt: 1 })
    .limit(limite);
}

/* ----------------------------------------------------------
   AJOUTER UN MESSAGE
   role: 'visiteur' | 'admin'
---------------------------------------------------------- */
async function ajouterMessage(conversationId, { role, texte, admin }) {
  const texteNettoye = (texte || '').trim();
  if (!texteNettoye) {
    throw createError(422, 'Nachricht darf nicht leer sein');
  }
  if (texteNettoye.length > 4000) {
    throw createError(422, 'Nachricht zu lang (max. 4000 Zeichen)');
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw createError(404, 'Konversation nicht gefunden');
  }

  const message = await ChatMessage.create({
    conversation: conversation._id,
    expediteur:   role,
    auteurAdmin:  role === 'admin' && admin ? admin._id : null,
    auteurNom:    role === 'admin' && admin ? admin.name : '',
    texte:        texteNettoye,
    lu:           false,
  });

  // Met à jour l'aperçu + compteurs non-lus de la conversation
  conversation.dernierMessage     = texteNettoye.slice(0, 200);
  conversation.dernierMessageDate = message.createdAt;
  conversation.dernierExpediteur  = role;

  if (role === 'visiteur') {
    conversation.nonLuAdmin += 1;
    // Un visiteur qui réécrit rouvre implicitement la conversation
    conversation.statut = 'ouvert';
  } else {
    conversation.nonLuVisiteur += 1;
    if (admin) conversation.adminAssigne = admin._id;
  }

  await conversation.save();

  return { message, conversation };
}

/* ----------------------------------------------------------
   LISTER LES CONVERSATIONS (admin)
---------------------------------------------------------- */
async function listerConversations({ statut, page = 1, limite = 30 } = {}) {
  const filtre = {};
  if (statut && statut !== 'toutes') filtre.statut = statut;

  const skip = (page - 1) * limite;

  const [conversations, total] = await Promise.all([
    Conversation.find(filtre)
      .sort({ dernierMessageDate: -1 })
      .skip(skip)
      .limit(limite)
      .populate('adminAssigne', 'name'),
    Conversation.countDocuments(filtre),
  ]);

  return { conversations, total, page, pages: Math.ceil(total / limite) };
}

/* ----------------------------------------------------------
   MARQUER COMME LU
   role: le rôle qui LIT les messages (donc on remet à zéro
   le compteur "nonLu" de ce même rôle)
---------------------------------------------------------- */
async function marquerCommeLu(conversationId, role) {
  const champ = role === 'admin' ? 'nonLuAdmin' : 'nonLuVisiteur';

  await Conversation.findByIdAndUpdate(conversationId, { [champ]: 0 });

  await ChatMessage.updateMany(
    {
      conversation: conversationId,
      lu: false,
      expediteur: role === 'admin' ? 'visiteur' : 'admin',
    },
    { lu: true }
  );
}

/* ----------------------------------------------------------
   FERMER / RÉOUVRIR UNE CONVERSATION
---------------------------------------------------------- */
async function changerStatutConversation(conversationId, statut) {
  if (!['ouvert', 'ferme'].includes(statut)) {
    throw createError(400, 'Ungültiger Status');
  }
  const conversation = await Conversation.findByIdAndUpdate(
    conversationId,
    { statut },
    { new: true }
  );
  if (!conversation) throw createError(404, 'Konversation nicht gefunden');
  return conversation;
}

/* ----------------------------------------------------------
   TOTAL DES CONVERSATIONS AVEC MESSAGES NON LUS (admin)
   Utilisé pour le badge de la sidebar admin.
---------------------------------------------------------- */
async function compterNonLusAdmin() {
  return Conversation.countDocuments({ nonLuAdmin: { $gt: 0 } });
}

module.exports = {
  trouverOuCreerConversation,
  obtenirHistorique,
  ajouterMessage,
  listerConversations,
  marquerCommeLu,
  changerStatutConversation,
  compterNonLusAdmin,
};
