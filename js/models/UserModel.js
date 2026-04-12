/**
 * UserModel — leitura e escrita das preferências do utilizador no Firestore.
 * Path: artifacts/{APP_ID}/users/{uid}/settings/prefs
 */
import { db } from '../firebase.js';
import { APP_ID } from '../config.js';
import { doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/** Referência ao documento de preferências do utilizador */
const getPrefsRef = (uid) => doc(db, 'artifacts', APP_ID, 'users', uid, 'settings', 'prefs');

export const UserModel = {
    /**
     * Lê as preferências guardadas no Firestore.
     * @param {string} uid
     * @returns {Promise<Object|null>}
     */
    async getPrefs(uid) {
        const snap = await getDoc(getPrefsRef(uid));
        return snap.exists() ? snap.data() : null;
    },

    /**
     * Guarda (merge) preferências no Firestore.
     * Os campos não mencionados não são apagados.
     * @param {string} uid
     * @param {Object} data - campos a guardar/actualizar
     */
    async savePrefs(uid, data) {
        await setDoc(getPrefsRef(uid), data, { merge: true });
    },

    /**
     * Subscreve alterações em tempo real nas preferências do utilizador.
     * @param {string} uid
     * @param {function} callback - chamado com o objecto de prefs ou null
     * @returns {function} unsubscribe
     */
    subscribeToPrefs(uid, callback) {
        return onSnapshot(getPrefsRef(uid), (snap) => {
            callback(snap.exists() ? snap.data() : null);
        });
    },

    /**
     * Atalho para guardar apenas as metas de gastos.
     * @param {string} uid
     * @param {Object} budgets - mapa { categoria: valorMeta }
     */
    async saveBudgets(uid, budgets) {
        await setDoc(getPrefsRef(uid), { budgets }, { merge: true });
    },

    /**
     * Lê apenas as metas de gastos do utilizador.
     * @param {string} uid
     * @returns {Promise<Object>}
     */
    async getBudgets(uid) {
        const prefs = await this.getPrefs(uid);
        return prefs?.budgets || {};
    }
};
