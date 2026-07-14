/**
 * BLITZ LEIHEN — Socket.IO du Live-Chat
 *
 * Gère la diffusion en temps réel des messages de chat entre les
 * visiteurs du site public et les conseillers connectés à l'admin.
 *
 * Rooms utilisées :
 *   - `conversation:<id>` → un visiteur + le(s) admin(s) qui consultent
 *     cette conversation précise reçoivent les nouveaux messages.
 *   - `admins`            → tous les admins connectés à la boîte de
 *     réception reçoivent les alertes de nouvelle conversation /
 *     nouveau message, pour rafraîchir la liste et le badge.
 *
 * Authentification :
 *   - Visiteur : aucune authentification, juste un visiteurId (UUID
 *     généré côté client). C'est un chat public, comme un widget
 *     classique de support client.
 *   - Admin    : le client doit fournir son token JWT existant
 *     (le même que pour l'API REST) lors de l'événement 'admin:auth'.
 *
 * Ce module réutilise services/chatService.js pour ne jamais dupliquer
 * la logique déjà présente dans controllers/chatController.js.
 */

const jwt   = require('jsonwebtoken');
const Admin = require('../models/Admin');
const chatService = require('../services/chatService');

function initChatSocket(io) {

  io.on('connection', (socket) => {

    // Chaque socket porte un état minimal :
    //   socket.data.role         'visiteur' | 'admin' | undefined
    //   socket.data.visiteurId   pour un visiteur
    //   socket.data.admin        document Admin pour un conseiller

    /* --------------------------------------------------------
       VISITEUR — Rejoint sa propre conversation
    -------------------------------------------------------- */
    socket.on('visiteur:join', async ({ visiteurId, nom, email, pageOrigine, visiteurVille, visiteurRegion, visiteurPays, visiteurLocalisationAffichage } = {}) => {
      try {
        if (!visiteurId) return;

        const conversation = await chatService.trouverOuCreerConversation(visiteurId, {
          nom, email, pageOrigine, visiteurVille, visiteurRegion, visiteurPays, visiteurLocalisationAffichage,
        });

        socket.data.role       = 'visiteur';
        socket.data.visiteurId = visiteurId;
        socket.join(`conversation:${conversation._id}`);

        const messages = await chatService.obtenirHistorique(conversation._id);
        socket.emit('visiteur:pret', { conversation, messages });

        // Informe les admins connectés qu'une conversation est active
        io.to('admins').emit('conversation_maj', {
          conversationId: conversation._id,
          dernierMessage: conversation.dernierMessage,
          dernierMessageDate: conversation.dernierMessageDate,
        });
      } catch (error) {
        socket.emit('erreur', { message: error.message || 'Fehler beim Starten des Chats' });
      }
    });

    /* --------------------------------------------------------
       VISITEUR — Envoi d'un message
    -------------------------------------------------------- */
    socket.on('visiteur:message', async ({ conversationId, texte } = {}) => {
      try {
        if (socket.data.role !== 'visiteur' || !conversationId) return;

        const { message, conversation } = await chatService.ajouterMessage(conversationId, {
          role: 'visiteur',
          texte,
        });

        io.to(`conversation:${conversationId}`).emit('nouveau_message', message);
        io.to('admins').emit('conversation_maj', {
          conversationId,
          dernierMessage: message.texte,
          dernierMessageDate: message.createdAt,
        });
      } catch (error) {
        socket.emit('erreur', { message: error.message || 'Nachricht konnte nicht gesendet werden' });
      }
    });

    /* --------------------------------------------------------
       ADMIN — Authentification + entrée dans la boîte de réception
    -------------------------------------------------------- */
    socket.on('admin:auth', async ({ token } = {}) => {
      try {
        if (!token) throw new Error('Token fehlt');

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const admin   = await Admin.findById(decoded.id).select('-password');

        if (!admin || !admin.actif) throw new Error('Nicht autorisiert');

        socket.data.role  = 'admin';
        socket.data.admin = admin;
        socket.join('admins');

        socket.emit('admin:pret', { admin: { id: admin._id, name: admin.name, role: admin.role } });
      } catch (error) {
        socket.emit('erreur', { message: 'Authentifizierung fehlgeschlagen' });
      }
    });

    /* --------------------------------------------------------
       ADMIN — Ouvre une conversation précise dans l'inbox
    -------------------------------------------------------- */
    socket.on('admin:join_conversation', async ({ conversationId } = {}) => {
      try {
        if (socket.data.role !== 'admin' || !conversationId) return;
        socket.join(`conversation:${conversationId}`);

        const messages = await chatService.obtenirHistorique(conversationId);
        await chatService.marquerCommeLu(conversationId, 'admin');

        socket.emit('admin:historique', { conversationId, messages });
      } catch (error) {
        socket.emit('erreur', { message: 'Konversation konnte nicht geladen werden' });
      }
    });

    /* --------------------------------------------------------
       ADMIN — Envoi d'un message
    -------------------------------------------------------- */
    socket.on('admin:message', async ({ conversationId, texte } = {}) => {
      try {
        if (socket.data.role !== 'admin' || !conversationId) return;

        const { message, conversation } = await chatService.ajouterMessage(conversationId, {
          role:  'admin',
          texte,
          admin: socket.data.admin,
        });

        io.to(`conversation:${conversationId}`).emit('nouveau_message', message);
        io.to('admins').emit('conversation_maj', {
          conversationId,
          dernierMessage: message.texte,
          dernierMessageDate: message.createdAt,
        });
      } catch (error) {
        socket.emit('erreur', { message: error.message || 'Nachricht konnte nicht gesendet werden' });
      }
    });

    /* --------------------------------------------------------
       ADMIN — Ferme / réouvre une conversation
    -------------------------------------------------------- */
    socket.on('admin:statut', async ({ conversationId, statut } = {}) => {
      try {
        if (socket.data.role !== 'admin' || !conversationId) return;

        const conversation = await chatService.changerStatutConversation(conversationId, statut);

        io.to(`conversation:${conversationId}`).emit('conversation_statut', {
          conversationId,
          statut: conversation.statut,
        });
        io.to('admins').emit('conversation_maj', { conversationId, statut: conversation.statut });
      } catch (error) {
        socket.emit('erreur', { message: 'Status konnte nicht geändert werden' });
      }
    });

  });
}

module.exports = initChatSocket;
