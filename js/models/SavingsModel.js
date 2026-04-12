/**
 * SavingsModel — CRUD de cofrinhos (savings jars) no Firestore.
 * Path: artifacts/{APP_ID}/users/{uid}/savings/{jarId}
 */
import { db } from '../firebase.js';
import { APP_ID } from '../config.js';
import {
    collection, doc, addDoc, updateDoc, deleteDoc,
    onSnapshot, increment
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/** Retorna a referência da subcoleção de cofrinhos do utilizador */
const getRef = (uid) => collection(db, 'artifacts', APP_ID, 'users', uid, 'savings');

/** Retorna a referência de um cofrinho específico */
const getDocRef = (uid, id) => doc(db, 'artifacts', APP_ID, 'users', uid, 'savings', id);

export const SavingsModel = {
    /**
     * Cria um novo cofrinho.
     * @param {string} uid - UID do utilizador
     * @param {{ name, emoji, goal, color }} data - dados do cofrinho
     */
    async add(uid, { name, emoji = '🐷', goal = 0, color = '#6366f1' }) {
        await addDoc(getRef(uid), {
            name,
            emoji,
            goal: parseFloat(goal) || 0,
            saved: 0,
            color,
            createdAt: new Date().toISOString()
        });
    },

    /**
     * Deposita valor num cofrinho (incremento atómico).
     * @param {string} uid
     * @param {string} id - ID do cofrinho
     * @param {number} amount - valor a depositar
     */
    async deposit(uid, id, amount) {
        await updateDoc(getDocRef(uid, id), { saved: increment(parseFloat(amount)) });
    },

    /**
     * Levanta valor de um cofrinho (decremento atómico).
     * @param {string} uid
     * @param {string} id - ID do cofrinho
     * @param {number} amount - valor a levantar
     */
    async withdraw(uid, id, amount) {
        await updateDoc(getDocRef(uid, id), { saved: increment(-parseFloat(amount)) });
    },

    /**
     * Apaga um cofrinho permanentemente.
     * @param {string} uid
     * @param {string} id
     */
    async delete(uid, id) {
        await deleteDoc(getDocRef(uid, id));
    },

    /**
     * Subscreve alterações em tempo real nos cofrinhos.
     * @param {string} uid
     * @param {function} callback - chamado com array de cofrinhos
     * @returns {function} unsubscribe
     */
    subscribe(uid, callback) {
        return onSnapshot(getRef(uid), snap => {
            callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }
};
