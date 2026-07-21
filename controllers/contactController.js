/**
 * BLITZ LEIHEN — Contrôleur Contact
 *
 * Gère le formulaire de contact simple de la page kontakt.html,
 * distinct du formulaire de demande de prêt (kreditantrag.html /
 * demandeController.js).
 *
 *   POST /api/contact → envoyer un message (public)
 *
 * Contrairement aux demandes de prêt, aucune donnée n'est persistée
 * en base : le message est transmis directement par e-mail au
 * conseiller, avec un accusé de réception envoyé au visiteur.
 */

const emailService = require('../services/emailService');

/* ----------------------------------------------------------
   POST /api/contact — PUBLIC
   Envoie un message libre depuis le formulaire de contact.
---------------------------------------------------------- */
exports.envoyerMessageContact = async (req, res, next) => {
  try {
    const data = {
      name: req.body.name || req.body.nom || req.body.vorname || '—',
      email: req.body.email || '—',
      telefon: req.body.telefon || req.body.phone || '—',
      betreff: req.body.betreff || req.body.sujet || req.body.subject || '—',
      nachricht: req.body.nachricht || req.body.message || '—',
      visiteurLocalisationAffichage: req.body.visiteurLocalisationAffichage || '',
    };

    console.log(`✉️  Nouveau message de contact : ${data.name} <${data.email}>`);

    // Email au conseiller : on attend la confirmation d'envoi pour
    // pouvoir renvoyer un statut fiable au visiteur (pas de DB ici,
    // donc pas de deuxième chance si l'email échoue silencieusement).
    const resultatConseiller = await emailService.emailMessageContact(data);

    if (!resultatConseiller.success) {
      return res.status(502).json({
        success: false,
        message: 'Ihre Nachricht konnte nicht zugestellt werden. Bitte versuchen Sie es später erneut oder rufen Sie uns an.',
      });
    }

    // Accusé de réception au visiteur — non bloquant, ne doit pas
    // faire échouer la réponse si l'envoi échoue.
    emailService.emailConfirmationClient(data).catch((err) => {
      console.error('Erreur envoi accusé de réception contact (non bloquant) :', err.message);
    });

    res.status(200).json({
      success: true,
      message: 'Ihre Nachricht wurde erfolgreich gesendet. Wir melden uns innerhalb von 24 Stunden bei Ihnen.',
    });

  } catch (err) {
    next(err);
  }
};
