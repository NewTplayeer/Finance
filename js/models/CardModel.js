import { db } from '../firebase.js';
import { APP_ID } from '../config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const getRef = (uid) => doc(db, 'artifacts', APP_ID, 'users', uid, 'settings', 'cards');

export const CardModel = {
    async getCards(uid) {
        const snap = await getDoc(getRef(uid));
        return snap.exists() ? (snap.data().cards || []) : [];
    },

    async saveCards(uid, cards) {
        await setDoc(getRef(uid), { cards });
    }
};
