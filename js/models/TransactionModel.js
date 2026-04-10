import { db } from '../firebase.js';
import { APP_ID, currentMonthKey } from '../config.js';
import {
    collection, doc, addDoc, updateDoc, deleteDoc,
    onSnapshot, writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const getRef = (uid) => collection(db, 'artifacts', APP_ID, 'users', uid, 'transactions');
const getDocRef = (uid, id) => doc(db, 'artifacts', APP_ID, 'users', uid, 'transactions', id);

export const TransactionModel = {
    async add(uid, { desc, amount, category, installments = 1, method = "Dinheiro/Pix", dateKey = currentMonthKey, bank = "" }) {
        const ref = getRef(uid);
        const part = amount / installments;
        for (let i = 0; i < installments; i++) {
            const isPaid = (method === "Dinheiro/Pix" || method === "Cartão Débito" || category === "Receita");
            await addDoc(ref, {
                desc: installments > 1 ? `${desc} (${i + 1}/${installments})` : desc,
                amount: part,
                category,
                method,
                bank,
                monthKey: dateKey,
                paid: isPaid,
                creator: uid,
                createdAt: new Date().toISOString()
            });
        }
    },

    async togglePaid(uid, transaction) {
        await updateDoc(getDocRef(uid, transaction.id), { paid: !transaction.paid });
    },

    async delete(uid, id) {
        await deleteDoc(getDocRef(uid, id));
    },

    async clearAll(uid, transactions) {
        const batch = writeBatch(db);
        transactions.forEach(t => batch.delete(getDocRef(uid, t.id)));
        await batch.commit();
    },

    subscribe(uid, callback) {
        return onSnapshot(getRef(uid), (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            callback(data);
        });
    }
};
