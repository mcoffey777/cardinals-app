import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCwBHMrdfcW6ibmWEzn3D0StWwQqMW9vQU",
  authDomain: "cardinals-app.firebaseapp.com",
  databaseURL: "https://cardinals-app-default-rtdb.firebaseio.com",
  projectId: "cardinals-app",
  storageBucket: "cardinals-app.firebasestorage.app",
  messagingSenderId: "383368893375",
  appId: "1:383368893375:web:f62b5c14dbddaeccf6070a"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);