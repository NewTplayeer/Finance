/**
 * SharedSpaceModel — cria e gere espaços partilhados no Firestore.
 * Path: artifacts/{APP_ID}/sharedSpaces/{spaceId}/info/meta
 * Máximo de 2 membros por espaço.
 */
import { db } from '../firebase.js';
import { APP_ID } from '../config.js';
import {
    doc, setDoc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/** Referência ao documento de metadados de um espaço partilhado */
const getSpaceRef = (spaceId) =>
    doc(db, 'artifacts', APP_ID, 'sharedSpaces', spaceId, 'info', 'meta');

export const SharedSpaceModel = {
    /**
     * Gera um código alfanumérico aleatório de 8 caracteres maiúsculos.
     * @returns {string}
     */
    generateCode() {
        return Math.random().toString(36).substring(2, 10).toUpperCase();
    },

    /**
     * Cria um novo espaço partilhado e devolve o código gerado.
     * @param {string} uid - UID do criador
     * @param {string} userName - nome do criador
     * @returns {Promise<string>} spaceId
     */
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

    /**
     * Entra num espaço existente com o código fornecido. Lança erro se inválido ou lotado.
     * @param {string} uid
     * @param {string} spaceId - código do espaço
     * @param {string} userName
     * @returns {Promise<string>} spaceId confirmado
     */
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

    /**
     * Lê os metadados de um espaço partilhado.
     * @param {string} spaceId
     * @returns {Promise<Object|null>}
     */
    async get(spaceId) {
        const snap = await getDoc(getSpaceRef(spaceId));
        return snap.exists() ? { id: spaceId, ...snap.data() } : null;
    }
};
