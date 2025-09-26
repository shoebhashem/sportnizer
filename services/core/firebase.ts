import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAXb_sjYkj9YfieuZ3pK-DGlFYVCKMTn2I",
  authDomain: "sportnizer.firebaseapp.com",
  projectId: "sportnizer",
  storageBucket: "sportnizer.firebasestorage.app",
  messagingSenderId: "363301763041",
  appId: "1:363301763041:web:81f010704483d11cf544a0",
  measurementId: "G-9FV4DRN0YV"
};

const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, 'europe-north1'); // Use same region as Functions

// Connect to Functions emulator in development
if (__DEV__) {
  // Uncomment this line if you want to use the Functions emulator
  // connectFunctionsEmulator(functions, 'localhost', 5001);
}

export { auth, db, functions };
