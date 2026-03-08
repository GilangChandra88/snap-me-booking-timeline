import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
    apiKey: "AIzaSyAxtL1GIikGU-FYyaR_QBv3OFGln6t7tcE",
    authDomain: "snap-me-boking.firebaseapp.com",
    databaseURL: "https://snap-me-boking-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "snap-me-boking",
    storageBucket: "snap-me-boking.firebasestorage.app",
    messagingSenderId: "512426706645",
    appId: "1:512426706645:web:4481b12ee5a175bef6045c",
    measurementId: "G-Q6XS343MXX"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
