// Firebase initialization
// NOTE: The firebaseConfig values were pasted by the user. Please verify these values are correct
// The original paste appeared malformed; adjust values if initialization fails.
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyB7eboAPVaPR_k0WHMxszkE6JhKteOUbT8",
  authDomain: "fitness-tracker-ff682.firebaseapp.com",
  projectId: "fitness-tracker-ff682",
  storageBucket: "fitness-tracker-ff682.firebasestorage.app",
  messagingSenderId: "966314983555",
  appId: "1:966314983555:web:f7ee61b57df64d274e5bb6"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
