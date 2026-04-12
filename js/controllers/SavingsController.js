/**
 * SavingsController — gere os cofrinhos (savings jars) do utilizador.
 * Controla a UI de criação, depósito, levantamento e remoção de cofrinhos.
 */
import { SavingsModel } from '../models/SavingsModel.js';
import { ModalView } from '../views/ModalView.js';
import { state } from '../state.js';

/** Formata valor para moeda BRL */
const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export class SavingsController {
    /** Inicializa as listas internas e o handle de unsubscribe do Firestore. */
    constructor() {
        /** @type {Array} Lista de cofrinhos em memória */
        this._jars = [];
        /** @type {function|null} Função de unsubscribe do Firestore */
        this._unsubscribe = null;
    }

    /** Inicializa os event listeners da UI de cofrinhos */
    init() {
        this._bindFormToggle();
        this._bindFormSave();
    }

    /**
     * Inicia sincronização em tempo real com o Firestore.
     * @param {string} uid - UID do utilizador autenticado
     */
    startSync(uid) {
        if (this._unsubscribe) this._unsubscribe();
        this._unsubscribe = SavingsModel.subscribe(uid, jars => {
            this._jars  = jars;
            state.savings = jars;
            this._renderJars();
        });
    }

    /** Para a sincronização e limpa a UI */
    stopSync() {
        if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
        this._jars    = [];
        state.savings = [];
        this._renderJars();
    }

    /** Bind do botão que mostra/oculta o formulário de novo cofrinho */
    _bindFormToggle() {
        document.getElementById('btn-open-savings-form')?.addEventListener('click', () => {
            document.getElementById('savings-form')?.classList.toggle('hidden');
        });
        document.getElementById('savings-form-cancel')?.addEventListener('click', () => {
            document.getElementById('savings-form')?.classList.add('hidden');
            this._clearForm();
        });
    }

    /** Bind do botão de guardar novo cofrinho */
    _bindFormSave() {
        document.getElementById('savings-form-save')?.addEventListener('click', () => this._createJar());
    }

    /** Limpa os campos do formulário de cofrinho */
    _clearForm() {
        ['savings-name', 'savings-emoji', 'savings-goal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }

    /** Cria um novo cofrinho a partir dos dados do formulário */
    async _createJar() {
        const uid  = state.currentUser?.uid;
        const name = document.getElementById('savings-name')?.value?.trim();
        const emoji = document.getElementById('savings-emoji')?.value?.trim() || '🐷';
        const goal  = parseFloat(document.getElementById('savings-goal')?.value) || 0;

        if (!uid || !name) {
            ModalView.showToast('Dá um nome ao cofrinho.', 'error');
            return;
        }

        await SavingsModel.add(uid, { name, emoji, goal });
        document.getElementById('savings-form')?.classList.add('hidden');
        this._clearForm();
        ModalView.showToast(`Cofrinho "${name}" criado!`, 'success');
    }

    /**
     * Abre um mini-modal para depositar ou levantar valor de um cofrinho.
     * @param {string} id - ID do cofrinho
     * @param {'deposit'|'withdraw'} action - tipo de operação
     * @param {string} name - nome do cofrinho (para mensagem)
     */
    async _openTransactionModal(id, action, name) {
        const label  = action === 'deposit' ? 'Depositar' : 'Levantar';
        const amount = await new Promise(resolve => {
            ModalView.openConfirmModal({
                title: `${label} — ${name}`,
                message: `<input type="number" id="jar-amount-input" step="0.01" min="0.01"
                    placeholder="Valor (R$)"
                    class="w-full mt-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-300">`,
                confirmLabel: label,
                onConfirm: () => {
                    const val = parseFloat(document.getElementById('jar-amount-input')?.value);
                    resolve(val);
                },
                onCancel: () => resolve(null)
            });
        });

        if (!amount || amount <= 0) return;
        const uid = state.currentUser?.uid;
        if (!uid) return;

        if (action === 'deposit') {
            await SavingsModel.deposit(uid, id, amount);
            ModalView.showToast(`${fmt(amount)} depositado em "${name}"!`, 'success');
        } else {
            const jar = this._jars.find(j => j.id === id);
            if (jar && amount > jar.saved) {
                ModalView.showToast('Saldo insuficiente no cofrinho.', 'error');
                return;
            }
            await SavingsModel.withdraw(uid, id, amount);
            ModalView.showToast(`${fmt(amount)} levantado de "${name}".`);
        }
    }

    /** Renderiza todos os cofrinhos no container #savings-list */
    _renderJars() {
        const container = document.getElementById('savings-list');
        if (!container) return;

        if (!this._jars.length) {
            container.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-4">Sem cofrinhos. Cria o primeiro!</p>`;
            return;
        }

        container.innerHTML = this._jars.map(jar => {
            const pct     = jar.goal > 0 ? Math.min((jar.saved / jar.goal) * 100, 100) : 0;
            const barColor = pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-indigo-500' : 'bg-amber-400';
            return `
                <div class="bg-slate-50 rounded-2xl p-4 mb-3">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-2">
                            <span class="text-2xl">${jar.emoji}</span>
                            <div>
                                <div class="text-sm font-bold text-slate-800">${jar.name}</div>
                                <div class="text-[11px] text-slate-400">
                                    ${fmt(jar.saved)}${jar.goal > 0 ? ` / ${fmt(jar.goal)}` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <button data-jar-deposit="${jar.id}" data-jar-name="${jar.name}"
                                class="px-3 py-1.5 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-xl hover:bg-emerald-100 transition">+ Dep.</button>
                            <button data-jar-withdraw="${jar.id}" data-jar-name="${jar.name}"
                                class="px-3 py-1.5 bg-amber-50 text-amber-600 text-xs font-bold rounded-xl hover:bg-amber-100 transition">- Lev.</button>
                            <button data-jar-delete="${jar.id}"
                                class="px-2 py-1.5 text-slate-300 hover:text-rose-500 transition text-sm">✕</button>
                        </div>
                    </div>
                    ${jar.goal > 0 ? `
                    <div class="w-full bg-slate-200 rounded-full h-1.5 mt-1">
                        <div class="${barColor} h-1.5 rounded-full transition-all duration-500" style="width:${pct}%"></div>
                    </div>
                    <div class="text-[10px] text-right text-slate-400 mt-0.5">${pct.toFixed(0)}%</div>
                    ` : ''}
                </div>
            `;
        }).join('');

        /* Bind acções em cada cofrinho */
        container.querySelectorAll('[data-jar-deposit]').forEach(btn => {
            btn.addEventListener('click', () => this._openTransactionModal(btn.dataset.jarDeposit, 'deposit', btn.dataset.jarName));
        });
        container.querySelectorAll('[data-jar-withdraw]').forEach(btn => {
            btn.addEventListener('click', () => this._openTransactionModal(btn.dataset.jarWithdraw, 'withdraw', btn.dataset.jarName));
        });
        container.querySelectorAll('[data-jar-delete]').forEach(btn => {
            btn.addEventListener('click', () => {
                const uid = state.currentUser?.uid;
                if (!uid) return;
                ModalView.openConfirmModal({
                    title: 'Apagar Cofrinho',
                    message: 'Tens a certeza? O saldo será perdido.',
                    confirmLabel: 'Sim, apagar',
                    onConfirm: () => SavingsModel.delete(uid, btn.dataset.jarDelete)
                });
            });
        });
    }
}
