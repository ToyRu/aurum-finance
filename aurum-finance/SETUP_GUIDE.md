# 🚀 Aurum Finance — Setup Guide
## Your app will be live in ~30 minutes. Follow each step carefully.

---

## STEP 1 — Create a GitHub Account
*(Skip if you already have one)*

1. Go to **github.com**
2. Click **Sign up** → enter your email, password, username
3. Verify your email

---

## STEP 2 — Upload the Code to GitHub

1. Go to **github.com** and click the **+** button (top right) → **New repository**
2. Name it: `aurum-finance`
3. Keep it **Private** ✅
4. Click **Create repository**
5. On the next page, click **uploading an existing file**
6. Drag and drop ALL the files from the `aurum-finance` folder you downloaded
   - Make sure to include the `src` folder and all files inside it
7. Click **Commit changes**

---

## STEP 3 — Create a Firebase Project

1. Go to **console.firebase.google.com**
2. Click **Create a project**
3. Name it: `aurum-finance` → click Continue → Continue → Create project
4. Once created, click **Continue**

### Enable Authentication:
5. In the left sidebar click **Build** → **Authentication**
6. Click **Get started**
7. Click **Email/Password** → toggle **Enable** → click **Save**

### Enable Firestore Database:
8. In the left sidebar click **Build** → **Firestore Database**
9. Click **Create database**
10. Choose **Start in test mode** → click **Next** → **Enable**

### Get your Firebase config:
11. Click the ⚙️ gear icon (top left) → **Project settings**
12. Scroll down to **Your apps** → click the **</>** (Web) icon
13. App nickname: `aurum-web` → click **Register app**
14. You'll see a block of code with your config. **Copy these 6 values:**
    - apiKey
    - authDomain
    - projectId
    - storageBucket
    - messagingSenderId
    - appId
15. Click **Continue to console**

---

## STEP 4 — Deploy to Vercel

1. Go to **vercel.com** → click **Sign up** → choose **Continue with GitHub**
2. Authorize Vercel to access GitHub
3. Click **Add New** → **Project**
4. Find `aurum-finance` in the list → click **Import**
5. Before clicking Deploy, click **Environment Variables** and add these 6 variables:

| Name | Value |
|------|-------|
| VITE_FIREBASE_API_KEY | (paste your apiKey) |
| VITE_FIREBASE_AUTH_DOMAIN | (paste your authDomain) |
| VITE_FIREBASE_PROJECT_ID | (paste your projectId) |
| VITE_FIREBASE_STORAGE_BUCKET | (paste your storageBucket) |
| VITE_FIREBASE_MESSAGING_SENDER_ID | (paste your messagingSenderId) |
| VITE_FIREBASE_APP_ID | (paste your appId) |

6. Click **Deploy** → wait ~2 minutes
7. You'll get a URL like `aurum-finance-abc123.vercel.app` 🎉

---

## STEP 5 — Install on Your Phone

### iPhone:
1. Open **Safari** (must be Safari, not Chrome)
2. Go to your Vercel URL
3. Tap the **Share** button (box with arrow at bottom)
4. Scroll down and tap **Add to Home Screen**
5. Tap **Add** — it now appears on your home screen like an app!

### Android:
1. Open **Chrome**
2. Go to your Vercel URL
3. Tap the **⋮** menu (top right)
4. Tap **Add to Home screen** → **Add**

---

## STEP 6 — Log In

1. Open the app on your phone or computer
2. Tap **Sign Up** → create your account with email + password
3. Log in on your computer with the same email + password
4. **Done!** Any data you add on your phone instantly appears on your PC, and vice versa ✅

---

## How Syncing Works

- Every time you add a transaction, goal, or stock, it saves to Firebase (your private cloud database) within 1.5 seconds
- The **✓ Synced** indicator in the top right shows when your data is saved
- Open the app on any device, log in, and your data is there

---

## Need to Update the App Later?

If you want to add new features, just replace the files on GitHub and Vercel will automatically redeploy within 2 minutes. No extra steps needed.

---

## Troubleshooting

**App shows blank page?**
→ Check that all 6 environment variables are set correctly in Vercel

**"Permission denied" error in the app?**
→ Make sure Firestore is in Test Mode (Firebase → Firestore → Rules → change "allow read, write: if false" to "allow read, write: if true")

**Forgot your password?**
→ Go to Firebase Console → Authentication → Users → find your email → reset password

---

*Built with React + Firebase + Vercel*
