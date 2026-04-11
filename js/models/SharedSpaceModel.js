import { db } from '../firebase.js';
import { APP_ID } from '../config.js';
import {
    doc, setDoc, getDoc, updateDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const getSpaceRef = (spaceId) => doc(db, 'artifacts', APP_ID, 'sharedSpaces', spaceId, 'info', 'meta');

export const SharedSpaceModel = {
    // Gera código de 8 caracteres maiúsculos
    generateCode() {
        return Math.random().toString(36).substring(2, 10).toUpperCase();
    },

    // Cria um novo espaço partilhado e devolve o ID
    async create(uid, userName) {
        const spaceId = this.generateCode();
        await setDoc(getSpaceRef(spaceId), {
            createdBy: uid,
            members: [uid],
            memberNames: { [uid]: userName },
            createdAt: new Date().toISOString()
        });
        return spaceId;
    },

    // Entra num espaço existente com código de convite
    async join(uid, spaceId, userName) {
        const ref = getSpaceRef(spaceId);
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error("Código inválido. Verifica com quem partilhou.");
        const data = snap.data();
        if (data.members?.length >= 2 && !data.members.includes(uid)) {
            throw new Error("Este espaço já tem 2 membros.");
        }
        await updateDoc(ref, {
            members: arrayUnion(uid),
            [`memberNames.${uid}`]: userName
        });
        return spaceId;
    },

    async get(spaceId) {
        const snap = await getDoc(getSpaceRef(spaceId));
        return snap.exists() ? { id: spaceId, ...snap.data() } : null;
    }
};
