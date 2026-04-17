/**
 * ExportUtils — exporta todos os dados do utilizador do Firestore para JSON.
 * Busca directamente nas colecções Firestore para garantir dados completos
 * (todas as transacções de todos os meses, não só o mês activo em memória).
 */
import { db } from '../firebase.js';
import { APP_ID } from '../config.js';
import { state } from '../state.js';
import {
    collection, doc, getDocs, getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/** Lê todos os documentos de uma colecção e devolve array com id incluído */
async function fetchCollection(path) {
    const snap = await getDocs(collection(db, ...path));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export const ExportUtils = {
    /**
     * Busca todos os dados do utilizador no Firestore e força o download como JSON.
     * Inclui transacções de todos os meses, clientes, cofrinhos, empréstimos,
     * assinaturas e preferências (metas, categorias, métodos, cartões).
     */
    async exportDatabaseToJson() {
        const uid = state.currentUser?.uid;
        if (!uid) {
            alert('Precisas de estar autenticado para exportar os dados.');
            return;
        }

        const base = ['artifacts', APP_ID, 'users', uid];

        const [transactions, clients, savings, loans, subscriptions, prefsSnap] = await Promise.all([
            fetchCollection([...base, 'transactions']),
            fetchCollection([...base, 'clients']),
            fetchCollection([...base, 'savings']),
            fetchCollection([...base, 'loans']),
            fetchCollection([...base, 'subscriptions']),
            getDoc(doc(db, ...base, 'settings', 'prefs'))
        ]);

        const prefs = prefsSnap.exists() ? prefsSnap.data() : {};

        const exportData = {
            exportedAt: new Date().toISOString(),
            uid,
            transactions,
            clients,
            savings,
            loans,
            subscriptions,
            budgets:            prefs.budgets            ?? {},
            customCategories:   prefs.customCategories   ?? [],
            customMethods:      prefs.customMethods       ?? [],
            customMethodsOrder: prefs.customMethodsOrder  ?? [],
            cards:              prefs.cards               ?? [],
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_financas_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();

        URL.revokeObjectURL(url);
    }
};
