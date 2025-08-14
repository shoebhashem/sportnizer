import { initializeApp } from 'firebase/app';

// Optionally import the services that you want to use
import { getAuth } from 'firebase/auth';
import { getFirestore } from "firebase/firestore";
// import {...} from 'firebase/database';
// import {...} from 'firebase/firestore';
// import {...} from 'firebase/functions';
// import {...} from 'firebase/storage';

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
// For more information on how to access Firebase in your project,
// see the Firebase documentation: https://firebase.google.com/docs/web/setup#access-firebase

// Initialize Firebase Authentication and get a reference to the service
const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);

export { auth, db };
