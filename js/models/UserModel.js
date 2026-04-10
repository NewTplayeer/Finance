import { db } from '../firebase.js';
import { APP_ID } from '../config.js';
import { doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const getPrefsRef = (uid) => doc(db, 'artifacts', APP_ID, 'users', uid, 'settings', 'prefs');

export const UserModel = {
    async getPrefs(uid) {
        const snap = await getDoc(getPrefsRef(uid));
        return snap.exists() ? snap.data() : null;
    },

    async savePrefs(uid, data) {
        await setDoc(getPrefsRef(uid), data, { merge: true });
    },

    subscribeToPrefs(uid, callback) {
        return onSnapshot(getPrefsRef(uid), (snap) => {
            callback(snap.exists() ? snap.data() : null);
        });
    }
};
