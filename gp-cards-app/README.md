# GP Cards – Web app (3 modes)

## Contenu
- **Planification** (offline/localStorage)
- **Observation** (segments + preuves + confiance)
- **Jeu** (multijoueur "jeu de l'oie" via WebSocket)

## Pré-requis
- Node.js 18+ (recommandé) et npm

## Démarrage (2 terminaux)
### 1) Serveur WebSocket (jeu)
```bash
cd server
npm install
npm start
```
Le serveur écoute sur `ws://localhost:8787`.

### 2) App web
```bash
cd web
npm install
npm run dev
```
Ouvre `http://localhost:5173`.

## Multijoueur
- Dans l'onglet **Jeu**, clique **Connecter**
- **Créer** une partie, puis copie le code `s_...`
- Sur un autre navigateur (ou autre machine sur le même réseau), **Rejoindre** avec ce code

> Pour jouer sur 2 machines, remplace `localhost` par l'IP de la machine hôte dans le champ WebSocket, ex. `ws://192.168.1.10:8787`.
