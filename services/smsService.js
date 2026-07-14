/**
 * BLITZ LEIHEN — Service SMS
 *
 * Gère l'envoi de SMS via Twilio.
 * Activable en 4 étapes dans .env (voir config/sms.js).
 *
 * Fonctions :
 *   1. smsConfirmationDemande()    → SMS de confirmation immédiate
 *   2. smsNotificationMessage()    → SMS quand un message est disponible
 *   3. smsChangementStatut()       → SMS quand le statut change
 *   4. smsVerificationCode()       → SMS OTP pour vérifier le numéro
 */

const { smsClient, smsEnabled } = require('../config/sms');
const Message = require('../models/Message');

/* ----------------------------------------------------------
   UTILITAIRES
---------------------------------------------------------- */

/** Nettoie et valide un numéro de téléphone */
const normaliserTelephone = (tel) => {
  // Supprime espaces, tirets, parenthèses
  let cleaned = tel.replace(/[\s\-\(\)]/g, '');

  // Convertit le format allemand 0171... en +49171...
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  } else if (cleaned.startsWith('0') && !cleaned.startsWith('+')) {
    cleaned = '+49' + cleaned.slice(1);
  }

  return cleaned;
};

/** Tronque un texte à une longueur maximale */
const tronquer = (texte, max = 140) =>
  texte.length > max ? texte.slice(0, max - 3) + '...' : texte;

/* ----------------------------------------------------------
   1. SMS DE CONFIRMATION — Envoyé dès réception de la demande
   Informations : référence + prochaine étape
---------------------------------------------------------- */
const smsConfirmationDemande = async (demande) => {
  if (!smsEnabled || demande.sms_verification !== 'ja') {
    return { success: false, reason: 'SMS désactivé ou non souhaité par le client' };
  }

  const message = tronquer(
    `Blitz Leihen: Ihr Kreditantrag (${demande.referenceNumber}) wurde empfangen. ` +
    `Wir melden uns innerhalb von 24h. ` +
    `Betrag: ${Math.round(demande.kreditbetrag).toLocaleString('de-DE')} EUR. Danke!`
  );

  return sendSMS({
    to:      normaliserTelephone(demande.telefon),
    message,
    demande,
    type:    'sms_client',
  });
};

/* ----------------------------------------------------------
   2. SMS DE NOTIFICATION — Nouveau message disponible
   Envoyé quand l'admin poste une mise à jour
---------------------------------------------------------- */
const smsNotificationMessage = async (demande) => {
  if (!smsEnabled || demande.sms_verification !== 'ja') {
    return { success: false, reason: 'SMS désactivé ou non souhaité' };
  }

  const message = tronquer(
    `Blitz Leihen: Sie haben eine neue Nachricht zu Ihrem Antrag ` +
    `${demande.referenceNumber}. ` +
    `Bitte prüfen Sie Ihre E-Mails.`
  );

  return sendSMS({
    to:      normaliserTelephone(demande.telefon),
    message,
    demande,
    type:    'sms_client',
  });
};

/* ----------------------------------------------------------
   3. SMS CHANGEMENT DE STATUT
   Envoyé quand le statut passe à Akzeptiert ou Abgelehnt
---------------------------------------------------------- */
const smsChangementStatut = async (demande) => {
  if (!smsEnabled || demande.sms_verification !== 'ja') {
    return { success: false, reason: 'SMS désactivé ou non souhaité' };
  }

  const messages = {
    'Akzeptiert': `Blitz Leihen: 🎉 Ihr Kreditantrag ${demande.referenceNumber} wurde GENEHMIGT! Wir kontaktieren Sie für die nächsten Schritte.`,
    'Abgelehnt':  `Blitz Leihen: Bezüglich Ihres Antrags ${demande.referenceNumber} haben wir eine Entscheidung getroffen. Bitte prüfen Sie Ihre E-Mails.`,
    'Analyse':    `Blitz Leihen: Ihr Antrag ${demande.referenceNumber} wird aktuell geprüft. Wir melden uns bald.`,
  };

  const message = tronquer(
    messages[demande.statut] ||
    `Blitz Leihen: Update zu Ihrem Antrag ${demande.referenceNumber}. Bitte prüfen Sie Ihre E-Mails.`
  );

  return sendSMS({
    to:      normaliserTelephone(demande.telefon),
    message,
    demande,
    type:    'sms_client',
  });
};

/* ----------------------------------------------------------
   4. SMS CODE OTP — Vérification du numéro de téléphone
   Génère un code à 6 chiffres et l'envoie au client
   Le code doit être stocké en session/cache pour vérification
---------------------------------------------------------- */
const smsVerificationCode = async (telephone) => {
  if (!smsEnabled) {
    return { success: false, reason: 'SMS non configuré', code: null };
  }

  // Générer un code OTP à 6 chiffres
  const code = String(Math.floor(100000 + Math.random() * 900000));

  const message = `Blitz Leihen: Ihr Verifizierungscode lautet: ${code}. Gültig für 10 Minuten. Nicht weitergeben.`;

  const result = await sendSMS({
    to:      normaliserTelephone(telephone),
    message,
    demande: null,
    type:    'sms_client',
  });

  // Retourne le code pour que le contrôleur puisse le stocker et le vérifier
  return { ...result, code };
};

/* ----------------------------------------------------------
   FONCTION GÉNÉRIQUE D'ENVOI SMS
   Envoie via Twilio et trace dans MongoDB
---------------------------------------------------------- */
const sendSMS = async ({ to, message, demande, type }) => {
  const result = { success: false, sid: null, error: null };

  // Validation du numéro
  if (!to || to.length < 8) {
    result.error = 'Numéro de téléphone invalide';
    console.warn(`⚠️  SMS ignoré — numéro invalide : ${to}`);
    return result;
  }

  try {
    const response = await smsClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });

    result.success = true;
    result.sid     = response.sid;

    // Traçabilité MongoDB
    if (demande?._id) {
      await Message.create({
        demande:      demande._id,
        type,
        corps:        message,
        destinataire: to,
        statut:       'envoye',
        dateEnvoi:    new Date(),
        meta: { twilio_sid: response.sid, statut_twilio: response.status },
      });
    }

    console.log(`✅ SMS envoyé → ${to} | SID : ${response.sid}`);

  } catch (error) {
    result.error = error.message;
    console.error(`❌ SMS échec → ${to} :`, error.message);

    if (demande?._id) {
      await Message.create({
        demande:      demande._id,
        type,
        corps:        message,
        destinataire: to,
        statut:       'echec',
        erreur:       error.message,
      }).catch(() => {});
    }
  }

  return result;
};

module.exports = {
  smsConfirmationDemande,
  smsNotificationMessage,
  smsChangementStatut,
  smsVerificationCode,
};
