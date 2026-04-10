import { db } from '../firebase.js';
import { APP_ID } from '../config.js';
import {
    collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const getRef = (uid) => collection(db, 'artifacts', APP_ID, 'users', uid, 'clients');
const getDocRef = (uid, id) => doc(db, 'artifacts', APP_ID, 'users', uid, 'clients', id);

export const ClientModel = {
    async add(uid, data) {
        await addDoc(getRef(uid), { ...data, createdAt: new Date().toISOString() });
    },

    async update(uid, id, data) {
        await updateDoc(getDocRef(uid, id), data);
    },

    async delete(uid, id) {
        await deleteDoc(getDocRef(uid, id));
    },

    subscribe(uid, callback) {
        return onSnapshot(getRef(uid), (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            callback(data);
        });
    }
};
