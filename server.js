/**
 * BLITZ LEIHEN — Serveur Express principal
 *
 * Point d'entrée de l'API backend.
 * Charge les middlewares globaux, les routes,
 * et lance la connexion à MongoDB Atlas.
 *
 * Démarrage :
 *   npm start        → production
 *   npm run dev      → développement (nodemon)
 */

// Chargement des variables d'environnement EN PREMIER
require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

// Connexions et configurations
const connectDB              = require('./config/database');
const { verifyEmailConnection } = require('./config/email');
require('./config/sms'); // Initialise le client SMS (log au démarrage)

// Routes
const demandesRoutes = require('./routes/demandes');
const authRoutes     = require('./routes/auth');
const adminRoutes    = require('./routes/admin');
const chatRoutes     = require('./routes/chat');
const contactRoutes  = require('./routes/contact');

// Socket.IO — Live-Chat en temps réel
const initChatSocket = require('./sockets/chatSocket');

// Middleware de gestion des erreurs (importé en dernier)
const errorHandler = require('./middleware/errorHandler');

// -------------------------------------------------------
// 1. INITIALISATION EXPRESS + SERVEUR HTTP
// -------------------------------------------------------
// Un serveur http natif est nécessaire (plutôt que app.listen direct)
// pour pouvoir y attacher Socket.IO en plus d'Express.
const app        = express();
const httpServer = http.createServer(app);
const PORT       = process.env.PORT || 3000;

// -------------------------------------------------------
// 2. MIDDLEWARES DE SÉCURITÉ
// -------------------------------------------------------

/**
 * Helmet : ajoute des headers HTTP de sécurité
 * (XSS protection, no-sniff, HSTS en prod, etc.)
 */
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

/**
 * CORS : autoriser uniquement le(s) domaine(s) frontend
 * Les URLs sont définies dans FRONTEND_URL (séparées par virgules)
 */
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:8080')
  .split(',')
  .map(url => url.trim());

app.use(cors({
  origin: function (origin, callback) {
    // Autoriser les requêtes sans Origin (Postman, apps mobiles)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origine non autorisée par CORS : ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

/**
 * Socket.IO : Live-Chat en temps réel
 * Attaché au même serveur HTTP qu'Express, avec la même politique
 * d'origines autorisées que l'API REST.
 */
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});
initChatSocket(io);

// Rend l'instance io accessible aux contrôleurs REST (req.app.get('io'))
// afin que l'envoi d'un message via HTTP diffuse aussi en temps réel.
app.set('io', io);

/**
 * Rate limiting global : protection contre les abus
 * Max 100 requêtes par IP sur 15 minutes (configurable via .env)
 */
const globalLimiter = rateLimit({
  windowMs:         parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:              parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    message: 'Zu viele Anfragen von dieser IP. Bitte warten Sie 15 Minuten.',
  },
});
app.use('/api/', globalLimiter);

/**
 * Rate limiting strict sur la soumission de demandes
 * Max 5 demandes de crédit par IP par heure
 */
const demandeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 5,
  message: {
    success: false,
    message: 'Maximale Anzahl an Kreditanträgen pro Stunde erreicht.',
  },
});

/**
 * Rate limiting strict sur la connexion admin
 * Max 10 tentatives par IP par 15 minutes
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Zu viele Anmeldeversuche. Bitte warten Sie 15 Minuten.',
  },
});

/**
 * Rate limiting sur le formulaire de contact
 * Max 10 messages par IP par heure (plus permissif que les
 * demandes de prêt, car sans impact BaFin/SCHUFA)
 */
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 10,
  message: {
    success: false,
    message: 'Maximale Anzahl an Nachrichten pro Stunde erreicht.',
  },
});

// -------------------------------------------------------
// 3. MIDDLEWARES UTILITAIRES
// -------------------------------------------------------

// Parsing JSON (limite 10mb pour les formulaires avec fichiers)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logs HTTP en développement
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  // En production : logs compacts
  app.use(morgan('combined'));
}

// -------------------------------------------------------
// 4. ROUTES DE L'API
// -------------------------------------------------------

// Route de santé (vérification que le serveur tourne)
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Blitz Leihen API läuft',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Routes principales avec leurs rate limiters
// Note : /api/demandes/abandon est exempt du demandeLimiter strict
// (5/heure) car ce n'est pas une vraie soumission de demande.
// Elle bénéficie uniquement du globalLimiter (100/15min).
app.use('/api/demandes/abandon', demandesRoutes);
app.use('/api/demandes', demandeLimiter, demandesRoutes);
app.use('/api/auth',     loginLimiter,   authRoutes);
app.use('/api/admin',                    adminRoutes);
app.use('/api/chat',                     chatRoutes);
app.use('/api/contact',  contactLimiter, contactRoutes);

// -------------------------------------------------------
// 5. ROUTE INCONNUE (404)
// -------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route nicht gefunden : ${req.method} ${req.originalUrl}`,
  });
});

// -------------------------------------------------------
// 6. MIDDLEWARE D'ERREURS GLOBAL (toujours en dernier)
// -------------------------------------------------------
app.use(errorHandler);

// -------------------------------------------------------
// 7. DÉMARRAGE DU SERVEUR
// -------------------------------------------------------
const startServer = async () => {
  // Connexion MongoDB Atlas
  await connectDB();

  // Vérification connexion email (non bloquante)
  await verifyEmailConnection();

  // Lancement du serveur HTTP (Express + Socket.IO sur le même port)
  httpServer.listen(PORT, () => {
    console.log('');
    console.log('🚀 Blitz Leihen API démarré');
    console.log(`   Port        : ${PORT}`);
    console.log(`   Environnement : ${process.env.NODE_ENV}`);
    console.log(`   URL API     : http://localhost:${PORT}/api`);
    console.log(`   Santé       : http://localhost:${PORT}/health`);
    console.log(`   Live-Chat   : Socket.IO actif sur le même port`);
    console.log('');
  });
};

startServer();

module.exports = app;
