# Blitz Leihen — Backend API

> API REST Node.js/Express pour le site de prêt **Blitz Leihen GmbH**  
> Base de données : MongoDB Atlas | Emails : Nodemailer | SMS : Twilio (optionnel)

---

## 📁 Structure des fichiers

```
blitz-leihen-backend/
│
├── 📄 server.js                → Point d'entrée Express + Socket.IO (CORS, Helmet, Rate limiting)
├── 📄 package.json             → Dépendances npm
├── 📄 .env.example             → Template des variables d'environnement
├── 📄 .gitignore
│
├── 📂 config/
│   ├── database.js             → Connexion MongoDB Atlas (Mongoose)
│   ├── email.js                → Transporter Nodemailer (SMTP)
│   └── sms.js                  → Client Twilio (optionnel)
│
├── 📂 models/
│   ├── Demande.js              → Schéma demande de prêt (validation, hooks, virtuals)
│   ├── Admin.js                → Schéma admin (bcrypt, verrouillage, JWT)
│   ├── Message.js              → Schéma emails/SMS/notes envoyés
│   ├── Conversation.js         → Schéma conversation de Live-Chat
│   └── ChatMessage.js          → Schéma message de Live-Chat
│
├── 📂 controllers/
│   ├── demandeController.js    → CRUD demandes + envois auto
│   ├── authController.js       → Login/logout/refresh JWT
│   ├── adminController.js      → Dashboard stats + gestion admins
│   └── chatController.js       → Routes REST du Live-Chat
│
├── 📂 routes/
│   ├── demandes.js             → /api/demandes
│   ├── auth.js                 → /api/auth
│   ├── admin.js                → /api/admin
│   └── chat.js                 → /api/chat
│
├── 📂 middleware/
│   ├── auth.js                 → Vérification JWT + contrôle des rôles
│   ├── validate.js             → Règles express-validator
│   └── errorHandler.js         → Gestionnaire global des erreurs
│
├── 📂 services/
│   ├── emailService.js         → Templates HTML + envoi emails
│   ├── smsService.js           → Envoi SMS Twilio
│   └── chatService.js          → Logique métier du Live-Chat (partagée REST + Socket.IO)
│
├── 📂 sockets/
│   └── chatSocket.js           → Événements Socket.IO du Live-Chat
│
└── 📂 scripts/
    └── seedAdmin.js            → Création du premier compte admin
```

---

## 🚀 Installation et démarrage

### Étape 1 — Cloner et installer

```bash
cd blitz-leihen-backend
npm install
```

### Étape 2 — Configurer les variables d'environnement

```bash
cp .env.example .env
```

Ouvrir `.env` et remplir **au minimum** :

```env
MONGODB_URI=mongodb+srv://USER:PASS@cluster.mongodb.net/blitz-leihen
JWT_SECRET=votre_secret_64_caracteres_minimum
EMAIL_USER=votre.email@gmail.com
EMAIL_PASS=votre_app_password_gmail
CONSEILLER_EMAIL=conseiller@blitz-leihen.de
```

### Étape 3 — Créer le premier compte administrateur

```bash
npm run seed
```

> ⚠️ Changer le mot de passe immédiatement après la première connexion.

### Étape 4 — Démarrer le serveur

```bash
# Développement (avec rechargement automatique)
npm run dev

# Production
npm start
```

Le serveur démarre sur `http://localhost:3000`.  
Vérification : `GET http://localhost:3000/health`

---

## 🔧 Configuration détaillée

### MongoDB Atlas

1. Créer un compte sur [cloud.mongodb.com](https://cloud.mongodb.com)
2. Créer un cluster gratuit (M0)
3. Créer un utilisateur base de données
4. Autoriser l'IP du serveur (ou `0.0.0.0/0` pour tous)
5. Copier la chaîne de connexion dans `MONGODB_URI`

### Email (Gmail)

1. Activer l'authentification à 2 facteurs sur votre compte Google
2. Aller dans : Compte Google → Sécurité → Mots de passe des applications
3. Créer un mot de passe pour "Mail"
4. Copier le code 16 caractères dans `EMAIL_PASS`

### Email (SMTP professionnel — Mailgun, OVH, Ionos)

```env
EMAIL_HOST=smtp.mailgun.org      # ou smtp.mail.ovh.net
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=postmaster@domaine.com
EMAIL_PASS=votre_smtp_password
```

### SMS Twilio (optionnel)

1. Créer un compte sur [twilio.com](https://www.twilio.com)
2. Obtenir un numéro de téléphone
3. Remplir dans `.env` :
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+14155238886
SMS_ENABLED=true
```
4. Installer Twilio : `npm install twilio`
5. Décommenter `const twilio = require('twilio')` dans `config/sms.js`

---

## 📡 Référence API

### Authentification

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| POST | `/api/auth/login` | — | Connexion admin |
| POST | `/api/auth/logout` | — | Déconnexion |
| GET | `/api/auth/me` | ✅ JWT | Profil connecté |
| POST | `/api/auth/refresh` | ✅ JWT | Renouveler token |

#### Exemple connexion :
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin@blitz-leihen.de","password":"BlitzAdmin2025!"}'
```

**Réponse :**
```json
{
  "success": true,
  "token": "eyJhbGci...",
  "expiresAt": "2025-01-16T10:00:00.000Z",
  "user": { "id": "...", "name": "Administrateur", "role": "superadmin" }
}
```

---

### Demandes de prêt

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| POST | `/api/demandes` | — | Soumettre une demande |
| GET | `/api/demandes` | ✅ JWT | Liste paginée |
| GET | `/api/demandes/:id` | ✅ JWT | Détail complet |
| PUT | `/api/demandes/:id/statut` | ✅ JWT | Changer le statut |
| PUT | `/api/demandes/:id/assigner` | ✅ JWT | Assigner à un conseiller |
| POST | `/api/demandes/:id/note` | ✅ JWT | Ajouter une note interne |
| DELETE | `/api/demandes/:id` | ✅ superadmin | Supprimer |

#### Exemple soumission demande :
```bash
curl -X POST http://localhost:3000/api/demandes \
  -H "Content-Type: application/json" \
  -d '{
    "vorname": "Max", "nachname": "Mustermann",
    "geburtsdatum": "1985-06-15",
    "email": "max@example.de", "telefon": "+49171234567",
    "adresse": "Musterstr. 1", "ort": "10117 Berlin",
    "land": "Deutschland", "beschaeftigung": "Angestellt (unbefristet)",
    "einkommen": 3500,
    "kreditart": "Privatkredit", "kreditbetrag": 20000, "laufzeit": 36,
    "sms_verification": "ja",
    "datenschutz": true, "agb": true, "schufa_zustimmung": true
  }'
```

#### Filtres disponibles (GET /api/demandes) :
```
?page=1&limit=10
?statut=Neu
?kreditart=Privatkredit
?search=Mustermann
?depuis=2025-01-01&jusqu=2025-12-31
?sort=recent|ancien|montant
```

#### Changer le statut :
```bash
curl -X PUT http://localhost:3000/api/demandes/ID/statut \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"statut": "Akzeptiert", "commentaire": "Bonität geprüft, Antrag genehmigt"}'
```

---

### Dashboard Admin

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| GET | `/api/admin/stats` | ✅ JWT | Toutes les statistiques |
| GET | `/api/admin/stats/periode` | ✅ JWT | Stats sur période |
| GET | `/api/admin/admins` | ✅ superadmin | Liste des admins |
| POST | `/api/admin/admins` | ✅ superadmin | Créer un admin |
| PUT | `/api/admin/admins/:id` | ✅ superadmin | Modifier un admin |
| PUT | `/api/admin/mot-de-passe` | ✅ JWT | Changer son MDP |

---

### Live-Chat

Chat en direct entre les visiteurs du site public et les conseillers,
en temps réel via **Socket.IO** (avec repli automatique sur ces routes
REST si la connexion WebSocket échoue).

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| POST | `/api/chat/conversations` | Public | Démarrer/retrouver une conversation |
| GET | `/api/chat/conversations/:visiteurId` | Public | Historique du visiteur |
| POST | `/api/chat/conversations/:visiteurId/message` | Public | Envoyer un message (visiteur) |
| GET | `/api/chat/admin/conversations` | ✅ JWT | Lister toutes les conversations |
| GET | `/api/chat/admin/conversations/:id` | ✅ JWT | Historique d'une conversation |
| POST | `/api/chat/admin/conversations/:id/message` | ✅ JWT | Envoyer un message (admin) |
| PUT | `/api/chat/admin/conversations/:id/statut` | ✅ JWT | Fermer / réouvrir |
| PUT | `/api/chat/admin/conversations/:id/lu` | ✅ JWT | Marquer comme lu |
| GET | `/api/chat/admin/non-lus` | ✅ JWT | Total conversations non lues (badge) |

**Événements Socket.IO** (voir `sockets/chatSocket.js`) :

| Émis par | Événement | Description |
|----------|-----------|--------------|
| Visiteur | `visiteur:join` | Rejoint sa conversation |
| Visiteur | `visiteur:message` | Envoie un message |
| Admin | `admin:auth` | S'authentifie avec son token JWT |
| Admin | `admin:join_conversation` | Ouvre une conversation dans l'inbox |
| Admin | `admin:message` | Envoie un message |
| Admin | `admin:statut` | Ferme / réouvre une conversation |
| Serveur | `nouveau_message` | Diffuse un nouveau message aux deux parties |
| Serveur | `conversation_maj` | Notifie les admins connectés d'une mise à jour |

Côté site public, le widget est géré par `js/chat-widget.js` (bulle
flottante bas-droite, voir `css/chat-widget.css`). Côté admin, la boîte
de réception se trouve sur `admin/chat.html`.

---

## 🧮 Schuldenquote (taux d'endettement estimé)

Calculée automatiquement, à la fois :
- **Côté client** (`js/forms.js`) en temps réel pendant la saisie, pour donner un retour immédiat au demandeur.
- **Côté serveur** (virtual `schuldenquote` dans `models/Demande.js`) de façon faisant foi, sans jamais dépendre de la valeur envoyée par le client — visible dans l'email conseiller/admin et le dashboard.

**Formule :**
```
Schuldenquote (%) = (Verbindlichkeiten + Kreditbetrag / Laufzeit) / Einkommen × 100
```

La mensualité du nouveau crédit (`Kreditbetrag / Laufzeit`) est une
**estimation linéaire sans intérêts** — le taux réel dépend du
partenaire bancaire retenu et n'est connu qu'après étude du dossier.
C'est une estimation indicative, pas une offre contractuelle.

Champ associé : `bestehendeVerbindlichkeiten` (dettes/charges
mensuelles existantes, saisi par le demandeur, 0 par défaut).

---

## 🔒 Sécurité

| Mesure | Détail |
|--------|--------|
| **Mots de passe** | Hachés avec bcryptjs (salt = 12) |
| **JWT** | Expiration configurable (défaut 8h) |
| **Rate limiting** | 100 req/15min global, 5 demandes/heure, 10 logins/15min |
| **Verrouillage** | Compte bloqué après 5 tentatives échouées (30 min) |
| **CORS** | Origines whitlistées uniquement |
| **Helmet** | Headers HTTP de sécurité (XSS, HSTS, no-sniff) |
| **Validation** | express-validator sur tous les inputs |
| **Données sensibles** | `select: false` sur les champs MDP en MongoDB |
| **IP tracking** | Adresse IP stockée pour audit |

---

## 📧 Emails automatiques

| Déclencheur | Destinataire | Contenu |
|-------------|--------------|---------|
| Nouvelle demande | Client | Confirmation + résumé complet + référence |
| Nouvelle demande | Conseiller + Admin | Alerte + toutes les données + localisation (IP) + lien dashboard |
| Abandon de formulaire | Conseiller + Admin | Alerte + données partielles saisies |
| Statut → Analyse | Client | Notification de prise en charge |
| Statut → Akzeptiert | Client | Félicitations + prochaines étapes |
| Statut → Abgelehnt | Client | Information + invitation à contacter |

> `CONSEILLER_EMAIL` et `ADMIN_EMAIL` reçoivent tous deux les notifications
> internes (nouvelle demande, abandon). S'ils sont identiques, un seul
> email est envoyé (pas de doublon).

---

## 🗂️ Statuts des demandes

```
Neu ──────→ Analyse ──────→ Akzeptiert
                    └──────→ Abgelehnt
```

Chaque changement de statut est tracé dans `historiqueStatuts` avec la date, l'admin responsable et un commentaire optionnel.

---

## 🚢 Déploiement en production

### Variables d'environnement production :
```env
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://votre-domaine.com
```

### Render.com (recommandé)
1. Connecter le dépôt Git
2. Build command : `npm install`
3. Start command : `npm start`
4. Variables d'environnement dans le dashboard Render

### Railway / Heroku
Même principe — déposer les variables `.env` dans les settings de la plateforme.

---

## 📞 Support

**Blitz Leihen GmbH** | Unter den Linden 42 · 10117 Berlin  
📧 info@blitz-leihen.de | 📞 +49 (0) 800 123 456 7

---

*Backend Node.js/Express — commentaires en français dans tout le code.*
