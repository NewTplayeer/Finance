/**
 * AdminModel — registo de utilizadores e leitura de dados globais para o painel de administração.
 * Path de registo: artifacts/{APP_ID}/registry/{uid}
 */
import { db } from '../firebase.js';
import { APP_ID } from '../config.js';
import {
    collection, doc, setDoc, getDocs
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/** Referência da coleção de registo de utilizadores */
const registryRef = () => collection(db, 'artifacts', APP_ID, 'registry');

/** Referência do documento de um utilizador no registo */
const userRegistryRef = (uid) => doc(db, 'artifacts', APP_ID, 'registry', uid);

export const AdminModel = {
    /**
     * Guarda ou actualiza o registo do utilizador no login/registo.
     * Chamado pelo AuthController sempre que um utilizador autentica.
     * @param {string} uid
     * @param {{ name: string, email: string, cpf?: string }} data
     */
    async saveUser(uid, { name, email, cpf }) {
        const payload = {
            uid,
            name:      name  || 'Utilizador',
            email:     email || '',
            lastLogin: new Date().toISOString()
        };
        if (cpf) payload.cpf = cpf;
        await setDoc(userRegistryRef(uid), payload, { merge: true });
    },

    /**
     * Regista o utilizador pela primeira vez (cria o documento com createdAt).
     * Deve ser chamado apenas no registo inicial.
     * @param {string} uid
     * @param {{ name: string, email: string, cpf?: string }} data
     */
    async registerUser(uid, { name, email, cpf }) {
        const payload = {
            uid,
            name:      name  || 'Utilizador',
            email:     email || '',
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
        };
        if (cpf) payload.cpf = cpf;
        await setDoc(userRegistryRef(uid), payload, { merge: true });
    },

    /**
     * Lê todos os utilizadores registados (apenas para admins).
     * @returns {Promise<Array>}
     */
    async getAllUsers() {
        const snap = await getDocs(registryRef());
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
};
