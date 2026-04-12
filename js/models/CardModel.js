/**
 * CardModel — persistência do array de cartões bancários no Firestore.
 * Path: artifacts/{APP_ID}/users/{uid}/settings/cards
 */
import { db } from '../firebase.js';
import { APP_ID } from '../config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/** Referência ao documento de cartões do utilizador */
const getRef = (uid) => doc(db, 'artifacts', APP_ID, 'users', uid, 'settings', 'cards');

export const CardModel = {
    /**
     * Lê o array de cartões guardado. Devolve [] se ainda não existir.
     * @param {string} uid
     * @returns {Promise<Array>}
     */
    async getCards(uid) {
        const snap = await getDoc(getRef(uid));
        return snap.exists() ? (snap.data().cards || []) : [];
    },

    /**
     * Substitui o array completo de cartões no Firestore.
     * @param {string} uid
     * @param {Array} cards - lista de { bankName, closingDay, dueDay }
     */
    async saveCards(uid, cards) {
        await setDoc(getRef(uid), { cards });
    }
};
