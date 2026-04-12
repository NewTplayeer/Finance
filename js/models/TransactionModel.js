import { db } from '../firebase.js';
import { APP_ID, currentMonthKey } from '../config.js';
import {
    collection, doc, addDoc, updateDoc, deleteDoc,
    onSnapshot, writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Retorna a coleção correta: pessoal ou espaço partilhado
const getActiveRef = (uid, spaceId = null) => spaceId
    ? collection(db, 'artifacts', APP_ID, 'sharedSpaces', spaceId, 'transactions')
    : collection(db, 'artifacts', APP_ID, 'users', uid, 'transactions');

const getActiveDocRef = (uid, id, spaceId = null) => spaceId
    ? doc(db, 'artifacts', APP_ID, 'sharedSpaces', spaceId, 'transactions', id)
    : doc(db, 'artifacts', APP_ID, 'users', uid, 'transactions', id);

export const TransactionModel = {
    async add(uid, { desc, amount, category, installments = 1, method = "Dinheiro/Pix", dateKey = currentMonthKey, bank = "", clientId = "" }, spaceId = null) {
        const ref = getActiveRef(uid, spaceId);
        const n = Math.max(1, Math.floor(installments));
        const part = parseFloat((amount / n).toFixed(2));
        // Calcula o offset de meses a partir do dateKey base
        const [baseYear, baseMonth] = dateKey.split('-').map(Number);

        for (let i = 0; i < n; i++) {
            const d = new Date(baseYear, baseMonth - 1 + i, 1);
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const isPaid = (method === "Dinheiro/Pix" || method === "Cartão Débito" || category === "Receita");
            await addDoc(ref, {
                desc: n > 1 ? `${desc} (${i + 1}/${n})` : desc,
                amount: part,
                category,
                method,
                bank,
                clientId: clientId || "",
                monthKey,
                paid: isPaid,
                creator: uid,
                createdAt: new Date().toISOString()
            });
        }
    },

    async togglePaid(uid, transaction, spaceId = null) {
        await updateDoc(getActiveDocRef(uid, transaction.id, spaceId), { paid: !transaction.paid });
    },

    async delete(uid, id, spaceId = null) {
        await deleteDoc(getActiveDocRef(uid, id, spaceId));
    },

    async update(uid, id, { desc, amount, category, method, bank }, spaceId = null) {
        await updateDoc(getActiveDocRef(uid, id, spaceId), { desc, amount, category, method, bank });
    },

    async clearAll(uid, transactions, spaceId = null) {
        const batch = writeBatch(db);
        transactions.forEach(t => batch.delete(getActiveDocRef(uid, t.id, spaceId)));
        await batch.commit();
    },

    subscribe(uid, callback, spaceId = null) {
        return onSnapshot(getActiveRef(uid, spaceId), (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            callback(data);
        });
    }
};
