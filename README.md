# Daymark

Daymark is a mobile-friendly reverse scheduler: instead of planning what you intend to do, you quickly record what actually happened.

## What is included

- Quick Add presets for the past 15 minutes, 30 minutes, or hour
- Exact timeline entry creation in 15-minute increments
- Editing, duplication, and deletion
- Daily navigation and lightweight summaries
- Device-only persistence that works without an account
- JSON backup export and import
- Optional Firebase email/password and Google accounts
- Cross-device Firestore sync with offline caching
- Installable web-app metadata and a small offline service worker
- A static GitHub Pages deployment workflow

## Run it locally

Use Node.js 22 or newer.

```bash
npm install
npm run dev
```

Account sync is optional. Follow [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) when you want to enable it.

## Publish on GitHub Pages

1. Create a GitHub repository and push this project to its `main` branch.
2. In the repository, open **Settings → Pages** and choose **GitHub Actions** as the source.
3. The included deployment workflow will build and publish the static app.
4. Follow [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) to turn on account sync.

The app automatically adjusts asset paths for project Pages URLs such as `username.github.io/repository-name`.

## Data model

Guest entries are stored in the browser on that device. Signed-in entries live at `users/{userId}/entries/{entryId}` in Firestore. The included security rules restrict every read and write to the matching authenticated user.
