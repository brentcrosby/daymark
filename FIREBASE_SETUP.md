# Turn on free account sync

Daymark works without an account as soon as it opens. Complete these steps only if you want the same timeline on multiple devices.

## 1. Create the free project

1. Open [Firebase Console](https://console.firebase.google.com/) and create a project.
2. Keep the project on the no-cost **Spark** plan. Google Analytics is optional and is not needed by Daymark.
3. Add a **Web app** to the project. Firebase will show a configuration object with six values.

## 2. Enable sign-in

1. Open **Authentication → Sign-in method**.
2. Enable **Email/Password**.
3. Optionally enable **Google** and choose a support email.
4. Under **Authentication → Settings → Authorized domains**, add your GitHub Pages domain, such as `yourname.github.io`.

## 3. Create the database

1. Open **Firestore Database** and create a database in production mode.
2. Choose a region near you. This cannot be changed later.
3. Replace the database rules with the contents of `firestore.rules`, then publish them.

Those rules are important: they ensure that each signed-in person can only read and change their own timeline.

## 4. Add the six app values

For local development, copy `.env.example` to `.env.local` and paste the values from the Firebase Web app configuration.

For GitHub Pages, open the repository’s **Settings → Secrets and variables → Actions → Variables**, then create:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

These identifiers are designed to be included in a web app and are not passwords. Access is protected by Firebase Authentication and the included Firestore rules.

You may also add `SITE_URL` with the complete public site URL. The deployment workflow can infer the usual GitHub Pages URL when this is omitted.

## 5. Redeploy

Run the GitHub Pages workflow again or push a small commit. The **Guest** button will then offer email/password and Google sign-in.
