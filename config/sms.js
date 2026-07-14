/**
 * BLITZ LEIHEN — Configuration SMS (Twilio)
 *
 * Architecture préparée pour l'intégration future de Twilio.
 * Pour activer les SMS :
 *   1. Créer un compte sur https://www.twilio.com
 *   2. Remplir TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER dans .env
 *   3. Passer SMS_ENABLED=true dans .env
 *   4. Décommenter la ligne require('twilio') ci-dessous
 *   5. Installer Twilio : npm install twilio
 */

// Décommenter quand Twilio est installé et configuré :
// const twilio = require('twilio');

/**
 * Retourne le client Twilio si les SMS sont activés.
 * Retourne null si SMS_ENABLED=false ou credentials manquants.
 */
const getSmsClient = () => {
  const enabled = process.env.SMS_ENABLED === 'true';
  const sid     = process.env.TWILIO_ACCOUNT_SID;
  const token   = process.env.TWILIO_AUTH_TOKEN;

  if (!enabled || !sid || !token) {
    return null;
  }

  // Décommenter avec Twilio installé :
  // return twilio(sid, token);

  // Mode simulé tant que Twilio n'est pas installé
  return {
    messages: {
      create: async (opts) => {
        console.log('[SMS SIMULÉ] À :', opts.to, '| Message :', opts.body);
        return { sid: 'SIMULATED_SID', status: 'sent' };
      }
    }
  };
};

const smsClient  = getSmsClient();
const smsEnabled = !!smsClient;

if (smsEnabled) {
  console.log('✅ SMS Twilio activé — numéro :', process.env.TWILIO_PHONE_NUMBER);
} else {
  console.log('ℹ️  SMS désactivé (SMS_ENABLED=false ou credentials manquants)');
}

module.exports = { smsClient, smsEnabled };
