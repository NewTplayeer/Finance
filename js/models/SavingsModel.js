/**
 * SavingsModel — CRUD de cofrinhos (savings jars) no Firestore.
 * Suporta modo pessoal (users/{uid}/savings) e partilhado (sharedSpaces/{spaceId}/savings).
 */
import { db } from '../firebase.js';
import { APP_ID } from '../config.js';
import {
    collection, doc, addDoc, updateDoc, deleteDoc,
    onSnapshot, increment
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/** Retorna a coleção activa: pessoal ou espaço partilhado */
const getRef = (uid, spaceId = null) => spaceId
    ? collection(db, 'artifacts', APP_ID, 'sharedSpaces', spaceId, 'savings')
    : collection(db, 'artifacts', APP_ID, 'users', uid, 'savings');

/** Retorna a referência de um cofrinho específico */
const getDocRef = (uid, id, spaceId = null) => spaceId
    ? doc(db, 'artifacts', APP_ID, 'sharedSpaces', spaceId, 'savings', id)
    : doc(db, 'artifacts', APP_ID, 'users', uid, 'savings', id);

export const SavingsModel = {
    /**
     * Cria um novo cofrinho.
     * @param {string} uid
     * @param {{ name, emoji, goal, yieldRate }} data
     * @param {string|null} spaceId
     */
    async add(uid, { name, emoji = '🐷', goal = 0, color = '#6366f1', yieldRate = 0 }, spaceId = null) {
        await addDoc(getRef(uid, spaceId), {
            name,
            emoji,
            goal:      parseFloat(goal)      || 0,
            yieldRate: parseFloat(yieldRate) || 0,
            saved:     0,
            color,
            creator:   uid,
            createdAt: new Date().toISOString()
        });
    },

    /**
     * Actualiza campos de um cofrinho.
     * @param {string} uid
     * @param {string} id
     * @param {Object} data
     * @param {string|null} spaceId
     */
    async update(uid, id, data, spaceId = null) {
        await updateDoc(getDocRef(uid, id, spaceId), data);
    },

    /**
     * Deposita valor num cofrinho (incremento atómico).
     * @param {string} uid
     * @param {string} id
     * @param {number} amount
     * @param {string|null} spaceId
     */
    async deposit(uid, id, amount, spaceId = null) {
        await updateDoc(getDocRef(uid, id, spaceId), { saved: increment(parseFloat(amount)) });
    },

    /**
     * Levanta valor de um cofrinho (decremento atómico).
     * @param {string} uid
     * @param {string} id
     * @param {number} amount
     * @param {string|null} spaceId
     */
    async withdraw(uid, id, amount, spaceId = null) {
        await updateDoc(getDocRef(uid, id, spaceId), { saved: increment(-parseFloat(amount)) });
    },

    /**
     * Apaga um cofrinho permanentemente.
     * @param {string} uid
     * @param {string} id
     * @param {string|null} spaceId
     */
    async delete(uid, id, spaceId = null) {
        await deleteDoc(getDocRef(uid, id, spaceId));
    },

    /**
     * Subscreve alterações em tempo real nos cofrinhos.
     * @param {string} uid
     * @param {function} callback
     * @param {string|null} spaceId
     * @param {function|null} onError
     * @returns {function} unsubscribe
     */
    subscribe(uid, callback, spaceId = null, onError = null) {
        return onSnapshot(
            getRef(uid, spaceId),
            snap => { callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))); },
            err  => {
                console.error('SavingsModel.subscribe error:', err);
                if (onError) onError(err);
            }
        );
    }
};
