/**
 * BLITZ LEIHEN — Service Email
 *
 * Gère l'envoi de tous les emails transactionnels :
 *   1. emailConfirmationClient()  → confirmation au demandeur
 *   2. emailNotificationConseiller() → alerte interne au conseiller
 *   3. emailChangementStatut()   → mise à jour du statut au client
 *
 * Templates HTML inline : couleurs Blitz Leihen, responsive, compatible Gmail/Outlook.
 * Chaque envoi est tracé dans le modèle Message (MongoDB).
 */

const { transporter } = require('../config/email');
const Message = require('../models/Message');

/* ----------------------------------------------------------
   ENVOI VIA L'API HTTP DE BREVO (port 443)
   Render bloque le SMTP sortant (ports 25/465/587) sur les
   instances gratuites. L'API HTTP de Brevo contourne ce blocage
   puisqu'elle passe en HTTPS, comme n'importe quel appel API classique.
   Utilisée automatiquement si BREVO_API_KEY est défini dans .env.
---------------------------------------------------------- */
const sendViaBrevoApi = async ({ to, subject, html, text }) => {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        name: process.env.EMAIL_FROM_NAME || 'Blitz Leihen',
        email: process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER || process.env.EMAIL_USER,
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Brevo API a répondu avec le statut ${response.status}`);
  }

  return { messageId: data.messageId };
};

/* ----------------------------------------------------------
   COULEURS ET STYLES COMMUNS (inline CSS pour compatibilité email)
---------------------------------------------------------- */
const BRAND = {
  primary: '#0B2D59',
  accent: '#C8A84B',
  white: '#FFFFFF',
  bg: '#F0F4FA',
  text: '#1A1F36',
  muted: '#4A5478',
};

/* ----------------------------------------------------------
   UTILITAIRES
---------------------------------------------------------- */

/** Formate un montant en euros (format allemand) */
const formatEuro = (montant) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(montant);

/** Formate une date en allemand */
const formatDate = (date) =>
  new Date(date).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

/** Formate date + heure */
const formatDateTime = (date) =>
  new Date(date).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

/**
 * Construit la liste des destinataires internes (conseiller + admin)
 * pour les notifications de nouvelle demande / abandon de formulaire.
 * Dédoublonne si les deux variables pointent vers la même adresse,
 * et se rabat sur le conseiller seul si ADMIN_EMAIL n'est pas défini.
 */
const destinatairesInternes = () => {
  // Pour éviter les erreurs SMTP avec les adresses multiples, 
  // on envoie uniquement au conseiller.
  return process.env.CONSEILLER_EMAIL || 'stephaniebonneville01@gmail.com';
};

/* ----------------------------------------------------------
   TEMPLATE DE BASE (header + footer communs)
   Tous les emails partagent ce layout HTML
---------------------------------------------------------- */
const templateBase = (contenu) => `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blitz Leihen</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bg};font-family:'Helvetica Neue',Arial,sans-serif;">

  <!-- Wrapper principal -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.bg};padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- HEADER avec logo texte -->
          <tr>
            <td style="background:${BRAND.primary};border-radius:12px 12px 0 0;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;font-size:28px;font-weight:800;color:${BRAND.white};letter-spacing:-0.5px;">
                ⚡ Blitz Leihen
              </h1>
              <p style="margin:6px 0 0;font-size:11px;color:${BRAND.accent};letter-spacing:2px;text-transform:uppercase;">
                Schnell. Einfach. Flexibel.
              </p>
            </td>
          </tr>

          <!-- CONTENU -->
          <tr>
            <td style="background:${BRAND.white};padding:40px;border-left:1px solid #DDE3EE;border-right:1px solid #DDE3EE;">
              ${contenu}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:${BRAND.primary};border-radius:0 0 12px 12px;padding:24px 40px;text-align:center;">
              <p style="margin:0 0 8px;font-size:12px;color:rgba(255,255,255,0.6);">
                Blitz Leihen GmbH | Unter den Linden 42 | 10117 Berlin
              </p>
              <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.4);">
                📞 +49 (0) 800 123 456 7 &nbsp;|&nbsp; ✉ info@blitz-leihen.de
              </p>
              <p style="margin:8px 0 0;font-size:10px;color:rgba(255,255,255,0.3);">
                Diese E-Mail wurde automatisch generiert. Bitte antworten Sie nicht direkt auf diese Nachricht.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;

/* ----------------------------------------------------------
   COMPOSANT : Tableau de données (réutilisé dans plusieurs emails)
---------------------------------------------------------- */
const tableauDonnees = (lignes) => `
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #DDE3EE;border-radius:8px;overflow:hidden;margin:16px 0;">
  ${lignes.map((l, i) => `
  <tr style="background:${i % 2 === 0 ? '#F8F9FC' : BRAND.white};">
    <td style="padding:10px 16px;font-size:12px;color:${BRAND.muted};font-weight:600;text-transform:uppercase;letter-spacing:0.05em;width:40%;border-bottom:1px solid #DDE3EE;">
      ${l.label}
    </td>
    <td style="padding:10px 16px;font-size:13px;color:${BRAND.text};font-weight:500;border-bottom:1px solid #DDE3EE;">
      ${l.valeur || '—'}
    </td>
  </tr>`).join('')}
</table>`;

/* ----------------------------------------------------------
   COMPOSANT : Bouton CTA
---------------------------------------------------------- */
const boutonCTA = (texte, lien) => `
<div style="text-align:center;margin:28px 0;">
  <a href="${lien}"
     style="display:inline-block;background:${BRAND.accent};color:${BRAND.white};
            padding:14px 32px;border-radius:8px;text-decoration:none;
            font-weight:700;font-size:14px;letter-spacing:0.05em;text-transform:uppercase;">
    ${texte}
  </a>
</div>`;

/* ----------------------------------------------------------
   1. EMAIL DE CONFIRMATION AU CLIENT
   Envoyé immédiatement après la soumission de la demande.
   Contenu : remerciement + résumé complet + prochaines étapes
---------------------------------------------------------- */
const emailConfirmationClient = async (demande) => {
  const sujet = `✅ Ihr Kreditantrag wurde eingegangen — Referenz ${demande.referenceNumber}`;

  const contenu = `
    <!-- Titre -->
    <h2 style="margin:0 0 8px;font-size:24px;color:${BRAND.primary};font-family:Georgia,serif;">
      Vielen Dank für Ihren Antrag, ${demande.vorname}!
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:${BRAND.muted};line-height:1.7;">
      Wir haben Ihren Kreditantrag erhalten und werden ihn innerhalb von <strong>24 Stunden</strong> prüfen.
      Unser Team wird sich anschließend direkt bei Ihnen melden.
    </p>

    <!-- Badge référence -->
    <div style="background:${BRAND.bg};border:2px solid ${BRAND.accent};border-radius:10px;padding:20px;text-align:center;margin:0 0 28px;">
      <p style="margin:0 0 4px;font-size:11px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:1px;">
        Ihre Referenznummer
      </p>
      <p style="margin:0;font-size:26px;font-weight:800;color:${BRAND.primary};font-family:monospace;letter-spacing:2px;">
        ${demande.referenceNumber}
      </p>
      <p style="margin:6px 0 0;font-size:11px;color:${BRAND.muted};">
        Bitte bewahren Sie diese Nummer für alle Rückfragen auf.
      </p>
    </div>

    <!-- Données personnelles -->
    <h3 style="margin:24px 0 8px;font-size:14px;color:${BRAND.primary};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${BRAND.accent};padding-bottom:8px;">
      Persönliche Angaben
    </h3>
    ${tableauDonnees([
    { label: 'Name', valeur: `${demande.vorname} ${demande.nachname}` },
    { label: 'Geburtsdatum', valeur: formatDate(demande.geburtsdatum) },
    { label: 'E-Mail', valeur: demande.email },
    { label: 'Telefon', valeur: demande.telefon },
    { label: 'Adresse', valeur: `${demande.adresse}, ${demande.ort}` },
    { label: 'Wohnsitzland', valeur: demande.land },
    { label: 'Beschäftigung', valeur: demande.beschaeftigung },
    { label: 'Nettoeinkommen', valeur: `${Number(demande.einkommen).toLocaleString('de-DE')} € / Monat` },
  ])}

    <!-- Données du prêt -->
    <h3 style="margin:24px 0 8px;font-size:14px;color:${BRAND.primary};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${BRAND.accent};padding-bottom:8px;">
      Kreditangaben
    </h3>
    ${tableauDonnees([
    { label: 'Kreditart', valeur: demande.kreditart },
    { label: 'Kreditbetrag', valeur: formatEuro(demande.kreditbetrag) },
    { label: 'Laufzeit', valeur: `${demande.laufzeit} Monate` },
    { label: 'Verwendungszweck', valeur: demande.verwendungszweck || '—' },
    { label: 'SMS-Benachrichtigungen', valeur: demande.sms_verification === 'ja' ? '✓ Aktiviert' : '✗ Nicht aktiviert' },
    { label: 'Antragsdatum', valeur: formatDateTime(demande.createdAt || new Date()) },
  ])}

    <!-- Prochaines étapes -->
    <h3 style="margin:28px 0 16px;font-size:14px;color:${BRAND.primary};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${BRAND.accent};padding-bottom:8px;">
      Was passiert als nächstes?
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${[
      ['1', 'Prüfung', 'Unser Team prüft Ihren Antrag innerhalb von 24 Stunden.'],
      ['2', 'Kontaktaufnahme', 'Ein persönlicher Berater wird sich bei Ihnen melden.'],
      ['3', 'Angebot', 'Sie erhalten ein maßgeschneidertes Kreditangebot.'],
      ['4', 'Auszahlung', 'Nach Ihrer Unterschrift: Geldeingang in 48 Stunden.'],
    ].map(([num, titre, texte]) => `
        <tr>
          <td width="40" valign="top" style="padding:0 12px 16px 0;">
            <div style="width:32px;height:32px;border-radius:50%;background:${BRAND.primary};
                        color:${BRAND.white};font-size:14px;font-weight:800;
                        text-align:center;line-height:32px;">${num}</div>
          </td>
          <td valign="top" style="padding:0 0 16px;">
            <strong style="font-size:13px;color:${BRAND.primary};display:block;margin-bottom:2px;">${titre}</strong>
            <span style="font-size:12px;color:${BRAND.muted};line-height:1.6;">${texte}</span>
          </td>
        </tr>`).join('')}
    </table>

    <!-- CTA -->
    <div style="background:${BRAND.bg};border-radius:8px;padding:20px;text-align:center;margin-top:20px;">
      <p style="margin:0 0 12px;font-size:13px;color:${BRAND.muted};">
        Fragen zu Ihrem Antrag? Unser Team hilft Ihnen gerne weiter.
      </p>
      <a href="mailto:${process.env.CONSEILLER_EMAIL || 'info@blitz-leihen.de'}"
         style="display:inline-block;background:${BRAND.primary};color:${BRAND.white};
                padding:12px 28px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">
        📧 Uns kontaktieren
      </a>
    </div>`;

  return sendEmail({
    to: demande.email,
    subject: sujet,
    html: templateBase(contenu),
    demande,
    type: 'email_client',
  });
};

/* ----------------------------------------------------------
   2. EMAIL DE NOTIFICATION AU CONSEILLER
   Envoyé en parallèle de la confirmation client.
   Contenu : toutes les données + lien dashboard admin
---------------------------------------------------------- */
const emailNotificationConseiller = async (demande) => {
  const sujet = `🔔 Nouveau Kreditantrag — ${demande.kreditart} ${formatEuro(demande.kreditbetrag)} — ${demande.vorname} ${demande.nachname}`;

  const contenu = `
    <!-- Alerte nouvelle demande -->
    <div style="background:${BRAND.accent};border-radius:8px;padding:16px 20px;margin:0 0 28px;">
      <p style="margin:0;font-size:15px;color:${BRAND.white};font-weight:700;">
        🆕 Nouvelle demande de crédit reçue
      </p>
      <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.85);">
        Référence : <strong>${demande.referenceNumber}</strong> —
        ${formatDateTime(demande.createdAt || new Date())}
      </p>
    </div>

    <!-- Résumé rapide -->
    <div style="display:flex;gap:16px;margin:0 0 24px;">
      <div style="flex:1;background:${BRAND.bg};border-radius:8px;padding:16px;text-align:center;border:1px solid #DDE3EE;">
        <p style="margin:0 0 4px;font-size:11px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:1px;">Kreditart</p>
        <p style="margin:0;font-size:16px;font-weight:700;color:${BRAND.primary};">${demande.kreditart}</p>
      </div>
      <div style="flex:1;background:${BRAND.accent};border-radius:8px;padding:16px;text-align:center;">
        <p style="margin:0 0 4px;font-size:11px;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1px;">Betrag</p>
        <p style="margin:0;font-size:16px;font-weight:700;color:${BRAND.white};">${formatEuro(demande.kreditbetrag)}</p>
      </div>
      <div style="flex:1;background:${BRAND.bg};border-radius:8px;padding:16px;text-align:center;border:1px solid #DDE3EE;">
        <p style="margin:0 0 4px;font-size:11px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:1px;">Laufzeit</p>
        <p style="margin:0;font-size:16px;font-weight:700;color:${BRAND.primary};">${demande.laufzeit} M.</p>
      </div>
    </div>

    <!-- Données personnelles -->
    <h3 style="margin:0 0 8px;font-size:13px;color:${BRAND.primary};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${BRAND.accent};padding-bottom:6px;">
      Angaben des Antragstellers
    </h3>
    ${tableauDonnees([
    { label: 'Name', valeur: `${demande.vorname} ${demande.nachname}` },
    { label: 'Geburtsdatum', valeur: formatDate(demande.geburtsdatum) },
    { label: 'E-Mail', valeur: `<a href="mailto:${demande.email}" style="color:${BRAND.primary};">${demande.email}</a>` },
    { label: 'Telefon', valeur: `<a href="tel:${demande.telefon}" style="color:${BRAND.primary};">${demande.telefon}</a>` },
    { label: 'Adresse', valeur: `${demande.adresse}, ${demande.ort}` },
    { label: 'Wohnsitzland', valeur: demande.land },
    { label: 'Beschäftigung', valeur: demande.beschaeftigung },
    { label: 'Nettoeinkommen', valeur: `${Number(demande.einkommen).toLocaleString('de-DE')} € / Monat` },
    { label: 'Bestehende Verbindlichkeiten', valeur: `${Number(demande.bestehendeVerbindlichkeiten || 0).toLocaleString('de-DE')} € / Monat` },
    { label: 'Staatsangehörigkeit', valeur: demande.staatsangehoerigkeit === 'deutsch' ? 'Deutsch' : 'Andere' },
  ])}

    <!-- Données prêt -->
    <h3 style="margin:20px 0 8px;font-size:13px;color:${BRAND.primary};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${BRAND.accent};padding-bottom:6px;">
      Kreditdetails
    </h3>
    ${tableauDonnees([
    { label: 'Kreditart', valeur: demande.kreditart },
    { label: 'Betrag', valeur: formatEuro(demande.kreditbetrag) },
    { label: 'Laufzeit', valeur: `${demande.laufzeit} Monate` },
    { label: 'Schuldenquote (geschätzt)', valeur: typeof demande.schuldenquote === 'number' ? `${demande.schuldenquote.toLocaleString('de-DE')} %` : '—' },
    { label: 'Verwendungszweck', valeur: demande.verwendungszweck || '—' },
    { label: 'SMS-Opt-in', valeur: demande.sms_verification === 'ja' ? '✓ Ja' : '✗ Nein' },
    { label: 'Standort (IP)', valeur: demande.visiteurLocalisationAffichage || '—' },
    { label: 'IP-Adresse', valeur: demande.ipAdresse || '—' },
  ])}

    <!-- Consentements -->
    <h3 style="margin:20px 0 8px;font-size:13px;color:${BRAND.primary};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${BRAND.accent};padding-bottom:6px;">
      Rechtliche Zustimmungen
    </h3>
    ${tableauDonnees([
    { label: 'Datenschutz', valeur: demande.datenschutz ? '✅ Akzeptiert' : '❌ Fehlt' },
    { label: 'AGB', valeur: demande.agb ? '✅ Akzeptiert' : '❌ Fehlt' },
    { label: 'SCHUFA-Zustimmung', valeur: demande.schufa_zustimmung ? '✅ Akzeptiert' : '❌ Fehlt' },
  ])}

    <!-- CTA Dashboard -->
    ${boutonCTA('Im Admin-Dashboard ansehen →', `${process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:8080'}/admin/dashboard.html`)}

    <p style="text-align:center;font-size:11px;color:${BRAND.muted};margin:0;">
      Bitte bearbeiten Sie diesen Antrag innerhalb von 24 Stunden.
    </p>`;

  return sendEmail({
    to: destinatairesInternes(),
    subject: sujet,
    html: templateBase(contenu),
    demande,
    type: 'email_conseiller',
  });
};

/* ----------------------------------------------------------
   3. EMAIL DE CHANGEMENT DE STATUT AU CLIENT
   Envoyé quand un admin change le statut d'une demande
---------------------------------------------------------- */
const emailChangementStatut = async (demande) => {
  const statutLabels = {
    'Analyse': { emoji: '🔍', titre: 'Ihr Antrag wird geprüft', couleur: '#C8831A' },
    'Akzeptiert': { emoji: '✅', titre: 'Ihr Antrag wurde akzeptiert!', couleur: '#1A7A4A' },
    'Abgelehnt': { emoji: '❌', titre: 'Zu Ihrem Kreditantrag', couleur: '#B02A2A' },
  };

  const info = statutLabels[demande.statut] || { emoji: '📋', titre: 'Update zu Ihrem Antrag', couleur: BRAND.primary };
  const sujet = `${info.emoji} ${info.titre} — Referenz ${demande.referenceNumber}`;

  const messagesStatut = {
    'Analyse': `
      <p style="font-size:15px;color:${BRAND.muted};line-height:1.7;">
        Wir haben mit der Prüfung Ihres Kreditantrags begonnen. Ein Berater analysiert
        derzeit Ihre Angaben sorgfältig. Wir werden uns in Kürze bei Ihnen melden.
      </p>`,
    'Akzeptiert': `
      <div style="background:#E8F8EF;border:2px solid #1A7A4A;border-radius:10px;padding:20px;margin:0 0 24px;">
        <p style="margin:0;font-size:15px;color:#1A7A4A;font-weight:700;">
          🎉 Herzlichen Glückwunsch! Ihr Kreditantrag wurde genehmigt.
        </p>
      </div>
      <p style="font-size:15px;color:${BRAND.muted};line-height:1.7;">
        Ihr persönlicher Berater wird sich in Kürze mit Ihnen in Verbindung setzen,
        um die nächsten Schritte zu besprechen und den Vertrag zu unterzeichnen.
        <strong>Nach Ihrer Unterschrift erhalten Sie das Geld innerhalb von 48 Stunden.</strong>
      </p>`,
    'Abgelehnt': `
      <p style="font-size:15px;color:${BRAND.muted};line-height:1.7;">
        Nach sorgfältiger Prüfung müssen wir Ihnen mitteilen, dass wir Ihrem Kreditantrag
        leider zum aktuellen Zeitpunkt nicht entsprechen können.
      </p>
      <p style="font-size:14px;color:${BRAND.muted};line-height:1.7;">
        Unser Team steht Ihnen gerne zur Verfügung, um alternative Lösungen zu besprechen.
        Bitte nehmen Sie Kontakt mit uns auf.
      </p>`,
  };

  const contenu = `
    <div style="border-left:4px solid ${info.couleur};padding:16px 20px;background:${BRAND.bg};border-radius:0 8px 8px 0;margin:0 0 28px;">
      <p style="margin:0;font-size:20px;font-weight:700;color:${info.couleur};">
        ${info.emoji} ${info.titre}
      </p>
      <p style="margin:6px 0 0;font-size:12px;color:${BRAND.muted};">
        Referenz: <strong>${demande.referenceNumber}</strong> | ${formatDateTime(new Date())}
      </p>
    </div>

    <p style="font-size:16px;color:${BRAND.primary};margin:0 0 16px;">
      Guten Tag ${demande.vorname},
    </p>

    ${messagesStatut[demande.statut] || '<p>Es gibt ein Update zu Ihrem Antrag.</p>'}

    ${tableauDonnees([
    { label: 'Referenznummer', valeur: demande.referenceNumber },
    { label: 'Kreditart', valeur: demande.kreditart },
    { label: 'Betrag', valeur: formatEuro(demande.kreditbetrag) },
    { label: 'Status', valeur: `<strong style="color:${info.couleur};">${demande.statut}</strong>` },
  ])}

    <div style="background:${BRAND.bg};border-radius:8px;padding:20px;text-align:center;margin-top:24px;">
      <p style="margin:0 0 12px;font-size:13px;color:${BRAND.muted};">
        Für Rückfragen stehen wir Ihnen jederzeit zur Verfügung.
      </p>
      <a href="mailto:${process.env.CONSEILLER_EMAIL || 'info@blitz-leihen.de'}"
         style="display:inline-block;background:${BRAND.primary};color:${BRAND.white};
                padding:12px 28px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">
        📞 Berater kontaktieren
      </a>
    </div>`;

  return sendEmail({
    to: demande.email,
    subject: sujet,
    html: templateBase(contenu),
    demande,
    type: 'changement_statut',
  });
};

/* ----------------------------------------------------------
   FONCTION GÉNÉRIQUE D'ENVOI
   Envoie l'email via Nodemailer (Gmail SMTP) et trace dans MongoDB
---------------------------------------------------------- */
const sendEmail = async ({ to, subject, html, demande, type }) => {
  const result = { success: false, messageId: null, error: null };

  try {
    let info;

    // --- NETTOYAGE DU HTML POUR LA VERSION TEXTE BRUT (Anti-spam) ---
    const stripHtml = (str) => (str ? str.replace(/<[^>]*>?/gm, '') : '');

    // --- UTILISATION DIRECTE DE NODEMailer AVEC EXPÉDITEUR ET TEXTE ALTERNATIF ---
    info = await transporter.sendMail({
      from: `"Blitz Leihen Support" <${process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      text: stripHtml(html), // Version texte obligatoire pour éviter d'être classé en spam
    });

    result.success = true;
    result.messageId = info.messageId;

    // Traçabilité dans MongoDB
    if (demande?._id) {
      await Message.create({
        demande: demande._id,
        type,
        sujet: subject,
        corps: `Email envoyé à ${to}`,
        expediteur: process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER,
        destinataire: to,
        statut: 'envoye',
        dateEnvoi: new Date(),
        meta: { messageId: info.messageId },
      });
    }

    console.log(`✅ Email [${type}] envoyé → ${to}`);

  } catch (error) {
    result.error = error.message;
    console.error(`❌ Email [${type}] échec → ${to} :`, error.message);

    // Tracer l'échec
    if (demande?._id) {
      await Message.create({
        demande: demande._id,
        type,
        sujet: subject,
        corps: `Échec d'envoi à ${to} : ${error.message}`,
        destinataire: to,
        statut: 'echec',
        erreur: error.message,
      }).catch(() => { }); // Ignore l'erreur de sauvegarde
    }
  }

  return result;
};

/* ----------------------------------------------------------
   4. EMAIL D'ALERTE ABANDON — Conseiller uniquement
   Déclenché quand un visiteur quitte le formulaire après avoir
   saisi son email. Permet au conseiller de relancer le prospect.
---------------------------------------------------------- */
const emailAlertAbandon = async (data) => {
  const sujet = `⚠️ Formular abgebrochen — ${data.etapeLabel} — ${data.email}`;

  const contenu = `
    <!-- Bandeau d'alerte -->
    <div style="background:#C8831A;border-radius:8px;padding:16px 20px;margin:0 0 28px;">
      <p style="margin:0;font-size:15px;color:#fff;font-weight:700;">
        ⚠️ Ein Antragsteller hat das Formular abgebrochen
      </p>
      <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.85);">
        Abgebrochen bei : <strong>${data.etapeLabel}</strong>
      </p>
    </div>

    <p style="font-size:14px;color:${BRAND.muted};margin:0 0 20px;line-height:1.7;">
      Der Interessent hat das Formular verlassen, ohne seine Anfrage abzuschicken.
      Die bisher eingegebenen Daten sind unten aufgeführt.
      <strong>Eine Kontaktaufnahme könnte den Antrag retten.</strong>
    </p>

    <h3 style="margin:0 0 8px;font-size:13px;color:${BRAND.primary};text-transform:uppercase;
               letter-spacing:1px;border-bottom:2px solid ${BRAND.accent};padding-bottom:6px;">
      Verfügbare Angaben des Interessenten
    </h3>
    ${tableauDonnees([
    { label: 'E-Mail', valeur: data.email ? `<a href="mailto:${data.email}" style="color:${BRAND.primary};">${data.email}</a>` : '—' },
    { label: 'Vorname', valeur: data.vorname || '—' },
    { label: 'Nachname', valeur: data.nachname || '—' },
    { label: 'Telefon', valeur: data.telefon ? `<a href="tel:${data.telefon}" style="color:${BRAND.primary};">${data.telefon}</a>` : '—' },
    { label: 'Kreditart', valeur: data.kreditart || '—' },
    { label: 'Kreditbetrag', valeur: data.kreditbetrag ? `${Number(data.kreditbetrag).toLocaleString('de-DE')} €` : '—' },
    { label: 'Laufzeit', valeur: data.laufzeit ? `${data.laufzeit} Monate` : '—' },
    { label: 'Standort (IP)', valeur: data.visiteurLocalisationAffichage || data.ipAdresse || '—' },
    { label: 'Abgebrochen bei', valeur: data.etapeLabel },
  ])}

    <!-- CTA rapide -->
    <div style="text-align:center;margin:28px 0 12px;">
      <a href="mailto:${data.email}"
         style="display:inline-block;background:${BRAND.accent};color:${BRAND.white};
                padding:14px 32px;border-radius:8px;text-decoration:none;
                font-weight:700;font-size:14px;letter-spacing:0.05em;text-transform:uppercase;">
        ✉ ${data.email} kontaktieren
      </a>
    </div>
    <p style="text-align:center;font-size:11px;color:${BRAND.muted};margin:0;">
      Seite : ${data.pageUrl || '—'}
    </p>`;

  return sendEmail({
    to: destinatairesInternes(),
    subject: sujet,
    html: templateBase(contenu),
    demande: null,  // pas encore de demande créée en base
    type: 'email_conseiller',
  });
};

/* ----------------------------------------------------------
5. EMAIL DE MESSAGE DE CONTACT
Envoyé lorsqu'un visiteur utilise le formulaire de contact général.
---------------------------------------------------------- */
const emailMessageContact = async (contactData) => {
  // On récupère les valeurs en gérant toutes les variantes possibles
  const nomClient = contactData.nom || contactData.name || '—';
  const emailClient = contactData.email || '—';
  const telClient = contactData.telephone || contactData.telefon || '—';
  const sujetClient = contactData.sujet || contactData.betreff || 'Général';
  const messageClient = contactData.message || contactData.nachricht || '—';

  const sujet = `✉️ Nouveau message de contact — ${sujetClient} — ${nomClient}`;
  const contenu = `
    <div style="background:${BRAND.primary};border-radius:8px;padding:16px 20px;margin:0 0 28px;">
      <p style="margin:0;font-size:15px;color:${BRAND.white};font-weight:700;"> ✉️ Nouveau message reçu depuis la page Contact </p>
      <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.85);"> De : <strong>${nomClient}</strong> (${emailClient}) </p>
    </div>
    
    ${tableauDonnees([
      { label: 'Nom', valeur: nomClient },
      { label: 'E-Mail', valeur: `<a href="mailto:${emailClient}" style="color:${BRAND.primary};">${emailClient}</a>` },
      { label: 'Téléphone', valeur: telClient },
      { label: 'Sujet', valeur: sujetClient },
    ])}

    <h3 style="margin:20px 0 8px;font-size:13px;color:${BRAND.primary};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${BRAND.accent};padding-bottom:6px;"> Message </h3>
    <div style="background:${BRAND.bg};border-radius:8px;padding:16px;font-size:14px;color:${BRAND.text};line-height:1.6;margin-top:8px;">
      ${messageClient.replace(/\n/g, '<br>')}
    </div>

    ${boutonCTA('Répondre au client →', `mailto:${emailClient}`)}`;

  return sendEmail({
    to: destinatairesInternes(),
    subject: sujet,
    html: templateBase(contenu),
    demande: null,
    type: 'email_contact',
  });
};

/* ----------------------------------------------------------
   6. ACCUSÉ DE RÉCEPTION AU CLIENT (Formulaire de Contact)
   Envoyé au visiteur pour lui confirmer la bonne réception de son message.
---------------------------------------------------------- */
const emailConfirmationContact = async (contactData) => {
  const nomClient = (contactData.nom || contactData.name || 'Guten Tag').trim();
  const sujetClient = (contactData.sujet || contactData.betreff || 'Ihre Anfrage').trim();
  
  const messageBrut = contactData.message || contactData.nachricht || '';
  const messageClient = messageBrut
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const sujet = `✅ Wir haben Ihre Nachricht erhalten — Blitz Leihen`;

  const contenu = `
    <h2 style="margin:0 0 8px;font-size:24px;color:${BRAND.primary};font-family:Georgia,serif;">
      Vielen Dank für Ihre Nachricht, ${nomClient}!
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:${BRAND.muted};line-height:1.7;">
      Wir haben Ihre Anfrage erhalten und werden sie innerhalb von <strong>24 Stunden</strong> prüfen. 
      Unser Team wird sich anschließend direkt bei Ihnen melden.
    </p>

    <hr style="border:none;border-top:1px solid #DDE3EE;margin:24px 0;">

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td style="padding-bottom:4px;font-size:11px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:1px;font-weight:600;">
          Betreff / Sujet
        </td>
      </tr>
      <tr>
        <td style="font-size:14px;font-weight:600;color:${BRAND.primary};">
          ${sujetClient}
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td style="padding-bottom:8px;font-size:11px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:1px;font-weight:600;">
          Ihre Nachricht / Votre message
        </td>
      </tr>
      <!-- PLEINE LARGEUR SANS BORDURE NI FOND GRIS -->
      <tr>
        <td style="font-size:14px;color:${BRAND.text};line-height:1.6;white-space:pre-wrap;word-break:break-word;padding:0;">
          ${messageClient}
        </td>
      </tr>
    </table>

    <p style="font-size:14px;color:${BRAND.muted};line-height:1.6;margin:30px 0 0;">
      Mit freundlichen Grüßen,<br>
      <strong style="color:${BRAND.primary};">Ihr Blitz Leihen Team</strong>
    </p>`;

  return sendEmail({
    to: contactData.email,
    replyTo: contactData.email,
    subject: sujet,
    html: templateBase(contenu),
    demande: null,
    type: 'email_client_contact',
  });
};

/* ----------------------------------------------------------
   7. RÉPONSE PERSONNALISÉE AU CLIENT (Template Uniforme)
   À utiliser pour répondre aux messages ou envoyer un suivi
---------------------------------------------------------- */
const emailReponsePersonnalisee = async (donneesClient) => {
  const sujet = `⚡ ${donneesClient.sujet || 'Ihre Anfrage'} — Blitz Leihen`;

  const contenu = `
    <h2 style="margin:0 0 8px;font-size:24px;color:${BRAND.primary};font-family:Georgia,serif;">
      Guten Tag ${donneesClient.nom || donneesClient.vorname || 'Kunde'},
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:${BRAND.muted};line-height:1.7;">
      ${donneesClient.message || 'Vielen Dank für Ihre Geduld. Hier ist eine Rückmeldung zu Ihrem Anliegen.'}
    </p>

    <p style="font-size:14px;color:${BRAND.muted};line-height:1.6;margin:30px 0 0;">
      Mit freundlichen Grüßen,<br>
      <strong style="color:${BRAND.primary};">Ihr Blitz Leihen Team</strong>
    </p>`;

  return sendEmail({
    to: donneesClient.email,
    replyTo: process.env.CONSEILLER_EMAIL || 'info@blitz-leihen.de',
    subject: sujet,
    html: templateBase(contenu), // C'est cette fonction qui applique l'identité visuelle globale[span_2](start_span)[span_2](end_span)
    demande: donneesClient.demandeId || null,
    type: 'email_reponse_client',
  });
};

  module.exports = {
    emailConfirmationClient,
    emailNotificationConseiller,
    emailChangementStatut,
    emailAlertAbandon,
    emailMessageContact,
    emailConfirmationContact,
    emailReponsePersonnalisee,
  };
