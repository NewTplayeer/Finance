/**
 * ClientModel — CRUD de clientes e fornecedores no Firestore.
 * Path: artifacts/{APP_ID}/users/{uid}/clients/{clientId}
 */
import { db } from '../firebase.js';
import { APP_ID } from '../config.js';
import {
    collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/** Referência da coleção de clientes do utilizador */
const getRef    = (uid)     => collection(db, 'artifacts', APP_ID, 'users', uid, 'clients');
/** Referência de um cliente específico */
const getDocRef = (uid, id) => doc(db, 'artifacts', APP_ID, 'users', uid, 'clients', id);

export const ClientModel = {
    /**
     * Adiciona um novo cliente com timestamp de criação.
     * @param {string} uid
     * @param {Object} data - campos do cliente
     */
    async add(uid, data) {
        await addDoc(getRef(uid), { ...data, createdAt: new Date().toISOString() });
    },

    /**
     * Actualiza os campos de um cliente existente.
     * @param {string} uid
     * @param {string} id
     * @param {Object} data
     */
    async update(uid, id, data) {
        await updateDoc(getDocRef(uid, id), data);
    },

    /**
     * Apaga um cliente permanentemente.
     * @param {string} uid
     * @param {string} id
     */
    async delete(uid, id) {
        await deleteDoc(getDocRef(uid, id));
    },

    /**
     * Subscreve alterações em tempo real na coleção de clientes.
     * @param {string} uid
     * @param {function} callback - chamado com array de clientes
     * @returns {function} unsubscribe
     */
    subscribe(uid, callback) {
        return onSnapshot(getRef(uid), (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            callback(data);
        });
    }
};
