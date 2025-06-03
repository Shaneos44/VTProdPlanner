// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAU2AymyTHBwIpEj7eVw4hwVrBlvHO4zIY",
  authDomain: "vt-production-planner.firebaseapp.com",
  projectId: "vt-production-planner",
  storageBucket: "vt-production-planner.firebasestorage.app",
  messagingSenderId: "51893208612",
  appId: "1:51893208612:web:80e747705d13932a23fab1"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
