import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import {
    Auth,
    getAuth,
    getReactNativePersistence,
    initializeAuth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

// Initialize Firebase
// Use platform-specific App ID so analytics are attributed to the correct Firebase app
const appId =
  Platform.OS === "android"
    ? process.env.EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID ||
      process.env.EXPO_PUBLIC_FIREBASE_APP_ID
    : process.env.EXPO_PUBLIC_FIREBASE_APP_ID;

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth with platform-specific persistence
// Native (iOS/Android): Uses AsyncStorage for persistence across app reloads
// Web: Falls back to browser's localStorage
let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (error) {
  // If already initialized (web or other scenarios), get existing instance
  auth = getAuth(app);
}

const db = getFirestore(app);
const functions = getFunctions(app, "europe-north1"); // Use same region as Functions
const storage = getStorage(app);

// Connect to Functions emulator in development
if (__DEV__) {
  // Uncomment this line if you want to use the Functions emulator
  // connectFunctionsEmulator(functions, 'localhost', 5001);
}

export { auth, db, functions, storage };
