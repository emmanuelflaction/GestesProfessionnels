# Déployer en ligne via GitHub (front) + Render (backend WebSocket)

Ce guide vise un déploiement **très simple** :
- **Front (site web)** sur **GitHub Pages**
- **Backend (WebSocket pour le mode Jeu)** sur **Render** (Node)

> Pourquoi séparé ? GitHub Pages héberge du statique (HTML/CSS/JS) mais **pas** un serveur WebSocket.

---

## A. Publier le code sur GitHub

1. Crée un nouveau dépôt sur GitHub, ex. `gp-cards-app`
2. Sur ton Mac, dans le dossier du projet :

```bash
cd gp-cards-app
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <URL_DE_TON_REPO_GITHUB>
git push -u origin main
```

---

## B. Déployer le front sur GitHub Pages (Vite)

### Option la plus simple : GitHub Actions (recommandée)

1. Dans ton repo GitHub :
   - Settings → Pages
   - Source : **GitHub Actions**

2. Ajoute ce fichier dans ton repo :
`.github/workflows/pages.yml`

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [ "main" ]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: "pages"
  cancel-in-progress: false
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install & build
        working-directory: web
        run: |
          npm ci
          npm run build
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: web/dist
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

3. Commit + push. Après 1–2 minutes, GitHub Pages te donne une URL du type :
`https://<ton_user>.github.io/<ton_repo>/`

---

## C. Déployer le serveur WebSocket sur Render

1. Va sur Render → **New** → **Web Service**
2. Connecte ton repo GitHub
3. Paramètres :
   - Root Directory : `server`
   - Build Command : `npm install`
   - Start Command : `npm start`
   - Runtime : Node
4. Une fois déployé, Render te donne une URL (ex. `https://xxxx.onrender.com`)

### Important
- Le WebSocket sera alors :
  - `wss://xxxx.onrender.com` (en HTTPS)
- Dans l’app (mode **Jeu**), remplace le champ WebSocket par cette URL.

---

## D. Vérifier le mode Jeu (multi-joueurs)

- Ouvre le site GitHub Pages sur 2 navigateurs / 2 machines
- Onglet **Jeu**
- Colle l’URL `wss://...` du serveur Render
- Clique **Connecter**
- Crée une partie, puis rejoins-la ailleurs avec le code

---

## E. Notes
- Les plans gratuits peuvent mettre en veille (latence au 1er lancement).
- Pour un usage en classe, un petit plan payant peut être nécessaire.

