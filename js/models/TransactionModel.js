/**
 * TransactionModel — CRUD de transações financeiras no Firestore.
 * Suporta modo pessoal (por uid) e modo partilhado (por spaceId).
 */
import { db } from '../firebase.js';
import { APP_ID, currentMonthKey } from '../config.js';
import {
    collection, doc, addDoc, updateDoc, deleteDoc,
    onSnapshot, writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/** Retorna a coleção activa: pessoal ou espaço partilhado */
const getActiveRef = (uid, spaceId = null) => spaceId
    ? collection(db, 'artifacts', APP_ID, 'sharedSpaces', spaceId, 'transactions')
    : collection(db, 'artifacts', APP_ID, 'users', uid, 'transactions');

/** Retorna a referência de um documento de transação específico */
const getActiveDocRef = (uid, id, spaceId = null) => spaceId
    ? doc(db, 'artifacts', APP_ID, 'sharedSpaces', spaceId, 'transactions', id)
    : doc(db, 'artifacts', APP_ID, 'users', uid, 'transactions', id);

export const TransactionModel = {
    /**
     * Adiciona uma ou mais transações (suporta parcelas).
     * @param {string} uid
     * @param {{ desc, amount, category, installments, method, dateKey, bank, place, clientId }} data
     * @param {string|null} spaceId
     */
    async add(uid, {
        desc, amount, category,
        installments = 1,
        method       = 'Dinheiro/Pix',
        dateKey      = currentMonthKey,
        bank         = '',
        place        = '',
        clientId     = ''
    }, spaceId = null) {
        const ref = getActiveRef(uid, spaceId);
        const n   = Math.max(1, Math.floor(installments));
        const part = parseFloat((amount / n).toFixed(2));
        const [baseYear, baseMonth] = dateKey.split('-').map(Number);

        for (let i = 0; i < n; i++) {
            const d = new Date(baseYear, baseMonth - 1 + i, 1);
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const isPaid = (method === 'Dinheiro/Pix' || method === 'Cartão Débito' || category === 'Receita');
            await addDoc(ref, {
                desc:     n > 1 ? `${desc} (${i + 1}/${n})` : desc,
                amount:   part,
                category,
                method,
                bank,
                place:    place || '',
                clientId: clientId || '',
                monthKey,
                paid:     isPaid,
                creator:  uid,
                createdAt: new Date().toISOString()
            });
        }
    },

    /**
     * Alterna o estado pago/pendente de uma transação.
     * @param {string} uid
     * @param {{ id, paid }} transaction
     * @param {string|null} spaceId
     */
    async togglePaid(uid, transaction, spaceId = null) {
        await updateDoc(getActiveDocRef(uid, transaction.id, spaceId), { paid: !transaction.paid });
    },

    /**
     * Atualiza os campos editáveis de uma transação.
     * @param {string} uid
     * @param {string} id
     * @param {{ desc, amount, category, method, bank, place }} data
     * @param {string|null} spaceId
     */
    async update(uid, id, { desc, amount, category, method, bank, place }, spaceId = null) {
        await updateDoc(getActiveDocRef(uid, id, spaceId), { desc, amount, category, method, bank, place: place || '' });
    },

    /**
     * Apaga uma transação.
     * @param {string} uid
     * @param {string} id
     * @param {string|null} spaceId
     */
    async delete(uid, id, spaceId = null) {
        await deleteDoc(getActiveDocRef(uid, id, spaceId));
    },

    /**
     * Apaga todas as transações em lote (batch).
     * @param {string} uid
     * @param {Array} transactions
     * @param {string|null} spaceId
     */
    async clearAll(uid, transactions, spaceId = null) {
        const batch = writeBatch(db);
        transactions.forEach(t => batch.delete(getActiveDocRef(uid, t.id, spaceId)));
        await batch.commit();
    },

    /**
     * Subscreve alterações em tempo real nas transações.
     * @param {string} uid
     * @param {function} callback - chamado com array de transações
     * @param {string|null} spaceId
     * @returns {function} unsubscribe
     */
    subscribe(uid, callback, spaceId = null) {
        return onSnapshot(getActiveRef(uid, spaceId), snap => {
            callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }
};
