/**
 * LogModel — registo de eventos do sistema para o painel de administração.
 * Path: artifacts/{APP_ID}/logs/{logId}
 * Tipos: 'user_registered' | 'user_login_email' | 'user_login_google' | 'user_logout' | 'error'
 */
import { db } from '../firebase.js';
import { APP_ID } from '../config.js';
import {
    collection, addDoc, getDocs, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/** Referência da coleção de logs do sistema */
const logsRef = () => collection(db, 'artifacts', APP_ID, 'logs');

export const LogModel = {
    /**
     * Regista um evento no sistema.
     * @param {'user_registered'|'user_login_email'|'user_login_google'|'user_logout'|'error'} type
     * @param {string} uid
     * @param {{ email?: string, name?: string, message?: string }} meta
     */
    async write(type, uid, meta = {}) {
        try {
            await addDoc(logsRef(), {
                type,
                uid:       uid   || '',
                email:     meta.email   || '',
                name:      meta.name    || '',
                message:   meta.message || '',
                userAgent: navigator?.userAgent?.slice(0, 120) || '',
                timestamp: new Date().toISOString()
            });
        } catch (_) {
            // Logs nunca devem bloquear o fluxo principal
        }
    },

    /**
     * Lê os últimos N eventos (apenas para admins).
     * @param {number} n - máximo de entradas a devolver
     * @returns {Promise<Array>}
     */
    async getLast(n = 100) {
        const q    = query(logsRef(), orderBy('timestamp', 'desc'), limit(n));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
};
