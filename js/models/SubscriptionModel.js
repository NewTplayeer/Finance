/**
 * SubscriptionModel — CRUD de assinaturas recorrentes no Firestore.
 * Suporta modo pessoal (users/{uid}/subscriptions) e partilhado (sharedSpaces/{spaceId}/subscriptions).
 */
import { db } from '../firebase.js';
import { APP_ID } from '../config.js';
import {
    collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const getRef = (uid, spaceId = null) => spaceId
    ? collection(db, 'artifacts', APP_ID, 'sharedSpaces', spaceId, 'subscriptions')
    : collection(db, 'artifacts', APP_ID, 'users', uid, 'subscriptions');

const getDocRef = (uid, id, spaceId = null) => spaceId
    ? doc(db, 'artifacts', APP_ID, 'sharedSpaces', spaceId, 'subscriptions', id)
    : doc(db, 'artifacts', APP_ID, 'users', uid, 'subscriptions', id);

export const SubscriptionModel = {
    async add(uid, { desc, amount, category, method = 'Cartão', bank = '', dayOfMonth = 1, startDate }, spaceId = null) {
        return addDoc(getRef(uid, spaceId), {
            desc,
            amount:     parseFloat(amount),
            category:   category || 'Serviços',
            method,
            bank:       bank || '',
            dayOfMonth: Math.max(1, Math.min(31, parseInt(dayOfMonth) || 1)),
            startDate:  startDate || new Date().toISOString().slice(0, 10),
            active:     true,
            creator:    uid,
            createdAt:  new Date().toISOString()
        });
    },

    async update(uid, id, data, spaceId = null) {
        await updateDoc(getDocRef(uid, id, spaceId), data);
    },

    async cancel(uid, id, spaceId = null) {
        await updateDoc(getDocRef(uid, id, spaceId), {
            active:      false,
            cancelledAt: new Date().toISOString()
        });
    },

    async reactivate(uid, id, spaceId = null) {
        await updateDoc(getDocRef(uid, id, spaceId), {
            active:      true,
            cancelledAt: null
        });
    },

    async delete(uid, id, spaceId = null) {
        await deleteDoc(getDocRef(uid, id, spaceId));
    },

    subscribe(uid, callback, spaceId = null, onError = null) {
        return onSnapshot(
            getRef(uid, spaceId),
            snap => { callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))); },
            err  => {
                console.error('SubscriptionModel.subscribe error:', err);
                if (onError) onError(err);
            }
        );
    }
};
