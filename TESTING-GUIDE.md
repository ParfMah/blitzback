# Blitz Leihen — Guide de test (backend + communication frontend)

À suivre dans l'ordre. Chaque étape doit réussir avant de passer à la suivante.

---

## 1. Installation du backend

```bash
cd blitz-leihen-backend
npm install
```
✅ Doit se terminer sans erreur rouge (des warnings jaunes sont normaux).

Créez votre fichier `.env` à partir de `.env.example` et remplissez au minimum :
- `MONGODB_URI` (votre base MongoDB Atlas ou locale)
- `JWT_SECRET` (une chaîne aléatoire longue)
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS` (vos identifiants SMTP réels)
- `CONSEILLER_EMAIL`, `ADMIN_EMAIL`
- `FRONTEND_URL` (l'URL où tourne votre frontend, ex: `http://localhost:8080`)

## 2. Créer le premier compte admin

```bash
npm run seed
```
✅ Doit afficher un message de succès avec l'email/mot de passe créés. Notez-les.

## 3. Démarrer le serveur

```bash
npm start
```
✅ Dans la console, vous devez voir :
```
✅ MongoDB connecté
✅ Email SMTP connecté : smtp.xxx.com
🚀 Blitz Leihen API démarré
   Port : 3000
```
⚠️ Si "Email SMTP non disponible" apparaît → vos identifiants SMTP sont incorrects. Les
emails ne partiront pas tant que ce n'est pas corrigé. C'est le point le plus fréquent
d'échec (mot de passe d'application Gmail requis si vous utilisez Gmail, par exemple).

## 4. Tester l'API seule (sans le frontend)

Dans un navigateur, ouvrez :
```
http://localhost:3000/health
```
✅ Doit répondre un JSON du type `{"status":"ok", ...}`.

## 5. Vérifier la communication frontend → backend

Ouvrez chaque page HTML du frontend et vérifiez la balise dans le `<head>` :
```html
<meta name="api-base" content="http://localhost:3000">
```
⚠️ Cette URL doit correspondre exactement à l'adresse où tourne votre backend. C'est
l'erreur la plus fréquente : si le backend tourne sur un autre port/domaine, rien ne
fonctionnera silencieusement (formulaire, chat, dashboard).

Servez le frontend (ne l'ouvrez pas en double-clic — passez par un serveur local) :
```bash
cd blitz-leihen
npx serve .
# ou : python3 -m http.server 8080
```

Ouvrez la page d'accueil dans le navigateur, ouvrez les **outils développeur → onglet
Réseau (Network)**, et rechargez. Vous ne devez voir **aucune erreur CORS** en rouge dans
la console.

## 6. Test de bout en bout — LE TEST LE PLUS IMPORTANT

1. Allez sur `kontakt.html`, remplissez le formulaire de demande de crédit en entier
   avec **une vraie adresse email que vous consultez** (la vôtre)
2. Envoyez le formulaire
3. ✅ Vous devez voir un message de confirmation avec un numéro de référence
4. ✅ Dans la console du serveur backend, vous devez voir : `📋 Nouvelle demande : REF-XXX...`
5. **Vérifiez votre boîte mail (celle du formulaire)** → email de confirmation client
6. **Vérifiez la boîte `CONSEILLER_EMAIL`** → email récapitulatif complet
7. **Vérifiez la boîte `ADMIN_EMAIL`** (si différente) → même email récapitulatif
8. Connectez-vous sur `admin/login.html` avec le compte créé à l'étape 2
9. ✅ La demande doit apparaître dans le dashboard avec toutes les infos saisies

Si les étapes 5/6/7 échouent alors que l'étape 3 a réussi : c'est un problème SMTP
uniquement (voir étape 3), pas un problème de code.

## 7. Tester le chat en direct

1. Sur le site public, ouvrez la bulle de chat en bas à droite, envoyez un message
2. Sur `admin/chat.html`, connectez-vous → le message doit apparaître dans la boîte de
   réception en temps réel (sans recharger la page)
3. Répondez depuis l'admin → le message doit apparaître côté visiteur en temps réel

Si le temps réel ne fonctionne pas mais que les messages finissent par apparaître après
quelques secondes : Socket.IO n'est pas connecté mais le repli HTTP fonctionne — vérifiez
que le port du backend autorise les WebSockets (certains hébergeurs gratuits les bloquent).

## 8. Tester l'app mobile admin (PWA)

1. Ouvrez `admin-mobile/index.html` sur un téléphone (ou en mode responsive du navigateur)
2. Connectez-vous, vérifiez que le dashboard, la liste des demandes et les statistiques
   s'affichent avec de vraies données
3. Testez le changement de langue dans Paramètres

## 9. Points à vérifier visuellement (tous appareils)

- [ ] Le site s'affiche correctement sur mobile, tablette, desktop (largeurs 375px, 768px, 1280px+)
- [ ] Le menu mobile (hamburger) s'ouvre/ferme correctement
- [ ] Les listes déroulantes de date de naissance fonctionnent
- [ ] Le calculateur Schuldenquote se met à jour en temps réel dans le formulaire
- [ ] `simulation.html` calcule correctement et le bouton "Beantragen" pré-remplit bien
      `kontakt.html`

---

## Résumé des points de blocage les plus probables

| Symptôme | Cause probable |
|---|---|
| Rien ne se passe en soumettant le formulaire | `api-base` ne pointe pas vers le bon backend |
| Erreur CORS dans la console | `FRONTEND_URL` dans `.env` ne correspond pas à l'URL réelle du frontend |
| Demande créée mais aucun email reçu | Identifiants SMTP invalides (voir console au démarrage) |
| Email reçu par le client mais pas par conseiller/admin | `CONSEILLER_EMAIL`/`ADMIN_EMAIL` mal renseignés dans `.env` |
| Chat ne se connecte pas en temps réel | WebSockets bloqués par l'hébergeur, ou mauvais port |
