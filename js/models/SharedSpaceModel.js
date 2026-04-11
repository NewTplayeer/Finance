import { db } from '../firebase.js';
import { APP_ID } from '../config.js';
import {
    doc, setDoc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Usa path: artifacts/{APP_ID}/sharedSpaces/{spaceId}/info/meta
const getSpaceRef = (spaceId) =>
    doc(db, 'artifacts', APP_ID, 'sharedSpaces', spaceId, 'info', 'meta');

export const SharedSpaceModel = {
    generateCode() {
        return Math.random().toString(36).substring(2, 10).toUpperCase();
    },

    async create(uid, userName) {
        const spaceId = this.generateCode();
        await setDoc(getSpaceRef(spaceId), {
            createdBy: uid,
            members: [uid],
            memberNames: { [uid]: userName || 'Utilizador' },
            createdAt: new Date().toISOString()
        });
        return spaceId;
    },

    async join(uid, spaceId, userName) {
        const ref = getSpaceRef(spaceId);
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error("Código inválido. Verifica com quem partilhou.");

        const data = snap.data();
        const members = Array.isArray(data.members) ? [...data.members] : [];

        if (members.length >= 2 && !members.includes(uid)) {
            throw new Error("Este espaço já tem 2 membros.");
        }

        if (!members.includes(uid)) members.push(uid);

        // Usa notação de objeto plano em vez de arrayUnion para evitar problemas de import
        const update = { members };
        update[`memberNames.${uid}`] = userName || 'Utilizador';
        await updateDoc(ref, update);

        return spaceId;
    },

    async get(spaceId) {
        const snap = await getDoc(getSpaceRef(spaceId));
        return snap.exists() ? { id: spaceId, ...snap.data() } : null;
    }
};
