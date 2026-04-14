/**
 * LoanModel — CRUD de empréstimos no Firestore.
 * Suporta modo pessoal (users/{uid}/loans) e partilhado (sharedSpaces/{spaceId}/loans).
 */
import { db } from '../firebase.js';
import { APP_ID } from '../config.js';
import {
    collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const getRef = (uid, spaceId = null) => spaceId
    ? collection(db, 'artifacts', APP_ID, 'sharedSpaces', spaceId, 'loans')
    : collection(db, 'artifacts', APP_ID, 'users', uid, 'loans');

const getDocRef = (uid, id, spaceId = null) => spaceId
    ? doc(db, 'artifacts', APP_ID, 'sharedSpaces', spaceId, 'loans', id)
    : doc(db, 'artifacts', APP_ID, 'users', uid, 'loans', id);

export const LoanModel = {
    async add(uid, {
        debtor, amount, interestRate = 0,
        startDate = '', dueDate = '',
        installments = 1, paymentDay = null,
        paymentType = 'Saldo',
        method = 'Dinheiro', notes = ''
    }, spaceId = null) {
        await addDoc(getRef(uid, spaceId), {
            debtor,
            amount:       parseFloat(amount),
            interestRate: parseFloat(interestRate) || 0,
            startDate,
            dueDate,
            installments: Math.max(1, parseInt(installments) || 1),
            paymentDay:   paymentDay ? parseInt(paymentDay) : null,
            paymentType,
            method,
            notes,
            paidMonths: [],
            creator:   uid,
            createdAt: new Date().toISOString()
        });
    },

    async update(uid, id, data, spaceId = null) {
        await updateDoc(getDocRef(uid, id, spaceId), data);
    },

    /**
     * Alterna o estado pago/pendente de um empréstimo para um mês específico.
     * @param {string} uid
     * @param {string} id
     * @param {boolean} isPaidForMonth - true se já estava pago neste mês
     * @param {string} monthKey - YYYY-MM do mês a alternar
     * @param {string|null} spaceId
     */
    async togglePaidForMonth(uid, id, isPaidForMonth, monthKey, spaceId = null) {
        const docRef = getDocRef(uid, id, spaceId);
        if (isPaidForMonth) {
            await updateDoc(docRef, { paidMonths: arrayRemove(monthKey) });
        } else {
            await updateDoc(docRef, { paidMonths: arrayUnion(monthKey) });
        }
    },

    async delete(uid, id, spaceId = null) {
        await deleteDoc(getDocRef(uid, id, spaceId));
    },

    subscribe(uid, callback, spaceId = null, onError = null) {
        return onSnapshot(
            getRef(uid, spaceId),
            snap => { callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))); },
            err  => {
                console.error('LoanModel.subscribe error:', err);
                if (onError) onError(err);
            }
        );
    },

    calcTotal(amount, rate, startDate, dueDate) {
        const a = parseFloat(amount) || 0;
        if (!rate || !startDate || !dueDate) return a;
        const ms     = new Date(dueDate) - new Date(startDate);
        const months = Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24 * 30)));
        return a * (1 + (parseFloat(rate) / 100) * months);
    }
};
