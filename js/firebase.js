import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from './config.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Conecta aos emuladores se estiver rodando localmente
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    // Porta padrão do Emulador de Auth: 9099
    connectAuthEmulator(auth, "http://localhost:9099");
    
    // Porta padrão do Emulador de Firestore: 8080
    // Nota: O Firestore Emulator usa o hostname e porta separadamente
    connectFirestoreEmulator(db, "localhost", 8080);
}