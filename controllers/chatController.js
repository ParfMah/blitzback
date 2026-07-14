/**
 * BLITZ LEIHEN — Contrôleur Live-Chat
 *
 * Gère les opérations REST du chat en direct. En complément,
 * sockets/chatSocket.js gère la diffusion en temps réel via Socket.IO ;
 * les deux couches réutilisent services/chatService.js pour ne jamais
 * dupliquer la logique métier.
 *
 * Routes publiques (visiteur, pas d'authentification) :
 *   POST /api/chat/conversations                    → démarrer / retrouver une conversation
 *   GET  /api/chat/conversations/:visiteurId         → historique du visiteur
 *   POST /api/chat/conversations/:visiteurId/message → envoyer un message (visiteur)
 *
 * Routes admin (JWT requis) :
 *   GET  /api/chat/admin/conversations               → lister toutes les conversations
 *   GET  /api/chat/admin/conversations/:id           → détail + historique
 *   POST /api/chat/admin/conversations/:id/message   → envoyer un message (admin)
 *   PUT  /api/chat/admin/conversations/:id/statut     → fermer / réouvrir
 *   PUT  /api/chat/admin/conversations/:id/lu         → marquer comme lu
 *   GET  /api/chat/admin/non-lus                      → total conversations non lues
 */

const chatService = require('../services/chatService');
const { createError } = require('../middleware/errorHandler');

/* Accès à l'instance Socket.IO attachée à l'app par server.js,
   pour diffuser en temps réel les messages envoyés via REST
   (fallback quand un client n'a pas de connexion WebSocket active). */
function getIo(req) {
  return req.app.get('io');
}

/* ============================================================
   ROUTES PUBLIQUES — VISITEUR
============================================================ */

/* POST /api/chat/conversations */
exports.demarrerConversation = async (req, res, next) => {
  try {
    const { visiteurId, nom, email, pageOrigine, visiteurVille, visiteurRegion, visiteurPays, visiteurLocalisationAffichage } = req.body;

    const conversation = await chatService.trouverOuCreerConversation(visiteurId, {
      nom,
      email,
      pageOrigine,
      ipAdresse: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
      visiteurVille,
      visiteurRegion,
      visiteurPays,
      visiteurLocalisationAffichage,
    });

    const messages = await chatService.obtenirHistorique(conversation._id);

    res.status(200).json({
      success: true,
      data: { conversation, messages },
    });
  } catch (error) {
    next(error);
  }
};

/* GET /api/chat/conversations/:visiteurId */
exports.obtenirConversationVisiteur = async (req, res, next) => {
  try {
    const conversation = await chatService.trouverOuCreerConversation(req.params.visiteurId);
    const messages = await chatService.obtenirHistorique(conversation._id);

    res.status(200).json({
      success: true,
      data: { conversation, messages },
    });
  } catch (error) {
    next(error);
  }
};

/* POST /api/chat/conversations/:visiteurId/message */
exports.envoyerMessageVisiteur = async (req, res, next) => {
  try {
    const conversation = await chatService.trouverOuCreerConversation(req.params.visiteurId);

    const { message } = await chatService.ajouterMessage(conversation._id, {
      role:  'visiteur',
      texte: req.body.texte,
    });

    // Diffusion temps réel : à la room de la conversation + à la
    // boîte de réception admin (pour rafraîchir la liste/badge)
    const io = getIo(req);
    if (io) {
      io.to(`conversation:${conversation._id}`).emit('nouveau_message', message);
      io.to('admins').emit('conversation_maj', {
        conversationId: conversation._id,
        dernierMessage: message.texte,
        dernierMessageDate: message.createdAt,
      });
    }

    res.status(201).json({ success: true, data: { message } });
  } catch (error) {
    next(error);
  }
};

/* ============================================================
   ROUTES ADMIN
============================================================ */

/* GET /api/chat/admin/conversations */
exports.listerConversations = async (req, res, next) => {
  try {
    const { statut, page, limite } = req.query;

    const resultat = await chatService.listerConversations({
      statut,
      page:   page ? parseInt(page, 10) : 1,
      limite: limite ? parseInt(limite, 10) : 30,
    });

    res.status(200).json({ success: true, data: resultat });
  } catch (error) {
    next(error);
  }
};

/* GET /api/chat/admin/conversations/:id */
exports.obtenirConversationAdmin = async (req, res, next) => {
  try {
    const messages = await chatService.obtenirHistorique(req.params.id);
    if (!messages) throw createError(404, 'Konversation nicht gefunden');

    res.status(200).json({ success: true, data: { messages } });
  } catch (error) {
    next(error);
  }
};

/* POST /api/chat/admin/conversations/:id/message */
exports.envoyerMessageAdmin = async (req, res, next) => {
  try {
    const { message, conversation } = await chatService.ajouterMessage(req.params.id, {
      role:  'admin',
      texte: req.body.texte,
      admin: req.admin,
    });

    const io = getIo(req);
    if (io) {
      io.to(`conversation:${conversation._id}`).emit('nouveau_message', message);
      io.to('admins').emit('conversation_maj', {
        conversationId: conversation._id,
        dernierMessage: message.texte,
        dernierMessageDate: message.createdAt,
      });
    }

    res.status(201).json({ success: true, data: { message } });
  } catch (error) {
    next(error);
  }
};

/* PUT /api/chat/admin/conversations/:id/statut */
exports.changerStatut = async (req, res, next) => {
  try {
    const conversation = await chatService.changerStatutConversation(req.params.id, req.body.statut);

    const io = getIo(req);
    if (io) {
      io.to(`conversation:${conversation._id}`).emit('conversation_statut', {
        conversationId: conversation._id,
        statut: conversation.statut,
      });
    }

    res.status(200).json({ success: true, data: { conversation } });
  } catch (error) {
    next(error);
  }
};

/* PUT /api/chat/admin/conversations/:id/lu */
exports.marquerLu = async (req, res, next) => {
  try {
    await chatService.marquerCommeLu(req.params.id, 'admin');
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

/* GET /api/chat/admin/non-lus */
exports.compterNonLus = async (req, res, next) => {
  try {
    const total = await chatService.compterNonLusAdmin();
    res.status(200).json({ success: true, data: { total } });
  } catch (error) {
    next(error);
  }
};
