# Firebase Setup Instructions

To enable cloud database functionality for your NHC Discipline System, follow these steps:

## 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"
3. Enter project name: `nhc-discipline-system`
4. Continue through the setup wizard
5. Choose your country/region
6. Create project

## 2. Set up Realtime Database

1. In your Firebase project console, click "Realtime Database" in the left sidebar
2. Click "Create Database"
3. Choose "Start in test mode" (you can secure it later)
4. Select your database location (closest to South Africa: `europe-west1`)
5. Click "Done"

## 3. Get Firebase Configuration

1. In Firebase Console, click the gear icon ⚙️ next to "Project Overview"
2. Select "Project settings"
3. Scroll down to "Your apps" section
4. Click the web icon `</>` to add a web app
5. Enter app nickname: `NHC Discipline System`
6. Check "Also set up Firebase Hosting" (optional)
7. Click "Register app"
8. Copy the configuration object

## 4. Update firebase-config.js

Replace the placeholder values in `firebase-config.js` with your actual Firebase configuration:

```javascript
const firebaseConfig = {
    apiKey: "your-actual-api-key",
    authDomain: "your-project-id.firebaseapp.com",
    databaseURL: "https://your-project-id-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "your-sender-id",
    appId: "your-app-id"
};
```

## 5. Database Security Rules (Optional)

For production use, update your database rules in Firebase Console > Realtime Database > Rules:

```json
{
  "rules": {
    "learners": {
      ".read": true,
      ".write": true
    },
    "transgressions": {
      ".read": true,
      ".write": true
    }
  }
}
```

## 6. Deploy to Netlify

1. Push your code to GitHub/GitLab
2. Connect your repository to Netlify
3. Deploy settings:
   - Build command: (leave empty)
   - Publish directory: `.` (current directory)
4. Deploy site

## Features Now Available:

✅ **Real-time Sync**: All devices see updates instantly
✅ **Offline Support**: Works when internet is down
✅ **Backup System**: Data stored both locally and in cloud
✅ **Multi-device Access**: Same data on all devices
✅ **Connection Status**: Shows online/offline status

## Troubleshooting:

- If you see "Cloud database connection failed", check your Firebase config
- Make sure your database URL includes the correct region
- Verify your Firebase project has Realtime Database enabled
- Check browser console for detailed error messages