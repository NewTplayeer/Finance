/**
 * LoanModel — CRUD de empréstimos no Firestore.
 * Path: artifacts/{APP_ID}/users/{uid}/loans/{loanId}
 */
import { db } from '../firebase.js';
import { APP_ID } from '../config.js';
import {
    collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/** Referência da coleção de empréstimos do utilizador */
const getRef = (uid) => collection(db, 'artifacts', APP_ID, 'users', uid, 'loans');

/** Referência de um empréstimo específico */
const getDocRef = (uid, id) => doc(db, 'artifacts', APP_ID, 'users', uid, 'loans', id);

export const LoanModel = {
    /**
     * Regista um novo empréstimo.
     * @param {string} uid
     * @param {{ debtor, amount, interestRate, startDate, dueDate, method, notes }} data
     */
    async add(uid, { debtor, amount, interestRate = 0, startDate, dueDate, method = 'Dinheiro', notes = '' }) {
        await addDoc(getRef(uid), {
            debtor,
            amount: parseFloat(amount),
            interestRate: parseFloat(interestRate) || 0,
            startDate,
            dueDate,
            method,
            notes,
            paid: false,
            createdAt: new Date().toISOString()
        });
    },

    /**
     * Alterna o estado pago/pendente de um empréstimo.
     * @param {string} uid
     * @param {string} id
     * @param {boolean} currentPaid - estado atual
     */
    async togglePaid(uid, id, currentPaid) {
        await updateDoc(getDocRef(uid, id), { paid: !currentPaid });
    },

    /**
     * Apaga um empréstimo permanentemente.
     * @param {string} uid
     * @param {string} id
     */
    async delete(uid, id) {
        await deleteDoc(getDocRef(uid, id));
    },

    /**
     * Subscreve alterações em tempo real nos empréstimos.
     * @param {string} uid
     * @param {function} callback
     * @returns {function} unsubscribe
     */
    subscribe(uid, callback) {
        return onSnapshot(getRef(uid), snap => {
            callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    },

    /**
     * Calcula o total a receber com juros simples.
     * Fórmula: total = amount × (1 + (rate/100) × months)
     * @param {number} amount - valor emprestado
     * @param {number} rate - taxa mensal em %
     * @param {string} startDate - ISO date
     * @param {string} dueDate - ISO date
     * @returns {number} total com juros
     */
    calcTotal(amount, rate, startDate, dueDate) {
        if (!rate || !startDate || !dueDate) return amount;
        const ms = new Date(dueDate) - new Date(startDate);
        const months = Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24 * 30)));
        return amount * (1 + (rate / 100) * months);
    }
};
