/**
 * LoanController — gere o registo de empréstimos com cálculo de juros.
 * Controla a UI de criação, quitação e remoção de empréstimos.
 */
import { LoanModel } from '../models/LoanModel.js';
import { ModalView } from '../views/ModalView.js';
import { state } from '../state.js';

/** Formata valor para moeda BRL */
const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formata data ISO para pt-BR */
const fmtDate = (iso) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

export class LoanController {
    /** Inicializa as listas internas e o handle de unsubscribe do Firestore. */
    constructor() {
        /** @type {Array} Lista de empréstimos em memória */
        this._loans = [];
        /** @type {function|null} Função de unsubscribe do Firestore */
        this._unsubscribe = null;
    }

    /** Inicializa os event listeners da UI de empréstimos */
    init() {
        this._bindFormToggle();
        this._bindFormSave();
    }

    /**
     * Inicia sincronização em tempo real com o Firestore.
     * @param {string} uid - UID do utilizador
     */
    startSync(uid) {
        if (this._unsubscribe) this._unsubscribe();
        this._unsubscribe = LoanModel.subscribe(uid, loans => {
            this._loans = loans;
            state.loans = loans;
            this._renderLoans();
        });
    }

    /** Para sincronização e limpa a UI */
    stopSync() {
        if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
        this._loans = [];
        state.loans = [];
        this._renderLoans();
    }

    /** Bind do botão que mostra/oculta o formulário de novo empréstimo */
    _bindFormToggle() {
        document.getElementById('btn-open-loan-form')?.addEventListener('click', () => {
            document.getElementById('loan-form')?.classList.toggle('hidden');
        });
        document.getElementById('loan-form-cancel')?.addEventListener('click', () => {
            document.getElementById('loan-form')?.classList.add('hidden');
            this._clearForm();
        });
    }

    /** Bind do botão de guardar novo empréstimo */
    _bindFormSave() {
        document.getElementById('loan-form-save')?.addEventListener('click', () => this._createLoan());
    }

    /** Limpa os campos do formulário de empréstimo */
    _clearForm() {
        ['loan-debtor', 'loan-amount', 'loan-interest', 'loan-start-date', 'loan-due-date', 'loan-notes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }

    /** Cria um novo empréstimo a partir dos dados do formulário */
    async _createLoan() {
        const uid     = state.currentUser?.uid;
        const debtor  = document.getElementById('loan-debtor')?.value?.trim();
        const amount  = parseFloat(document.getElementById('loan-amount')?.value);
        const rate    = parseFloat(document.getElementById('loan-interest')?.value) || 0;
        const start   = document.getElementById('loan-start-date')?.value;
        const due     = document.getElementById('loan-due-date')?.value;
        const method  = document.getElementById('loan-method')?.value || 'Dinheiro';
        const notes   = document.getElementById('loan-notes')?.value?.trim();

        if (!uid || !debtor) { ModalView.showToast('Indica o nome do devedor.', 'error'); return; }
        if (!amount || amount <= 0) { ModalView.showToast('Indica um valor válido.', 'error'); return; }

        await LoanModel.add(uid, { debtor, amount, interestRate: rate, startDate: start, dueDate: due, method, notes });
        document.getElementById('loan-form')?.classList.add('hidden');
        this._clearForm();
        ModalView.showToast(`Empréstimo de ${fmt(amount)} a ${debtor} registado!`, 'success');
    }

    /** Renderiza todos os empréstimos no container #loans-list */
    _renderLoans() {
        const container = document.getElementById('loans-list');
        if (!container) return;

        if (!this._loans.length) {
            container.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-4">Sem empréstimos registados.</p>`;
            return;
        }

        /* Calcula totais para o resumo */
        const pending = this._loans.filter(l => !l.paid);
        const totalPending = pending.reduce((sum, l) =>
            sum + LoanModel.calcTotal(l.amount, l.interestRate, l.startDate, l.dueDate), 0);

        const summary = pending.length
            ? `<div class="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 mb-4 flex justify-between items-center">
                <span class="text-xs font-bold text-amber-700">${pending.length} empréstimo(s) em aberto</span>
                <span class="text-sm font-bold text-amber-800">${fmt(totalPending)}</span>
               </div>`
            : '';

        container.innerHTML = summary + this._loans.map(loan => {
            const total   = LoanModel.calcTotal(loan.amount, loan.interestRate, loan.startDate, loan.dueDate);
            const hasInt  = loan.interestRate > 0;
            const overdue = loan.dueDate && !loan.paid && new Date(loan.dueDate) < new Date();
            return `
                <div class="flex items-start gap-3 p-3 rounded-2xl mb-2 ${loan.paid ? 'bg-emerald-50/50 opacity-70' : overdue ? 'bg-rose-50' : 'bg-slate-50'}">
                    <button data-loan-toggle="${loan.id}" data-loan-paid="${loan.paid}"
                        class="mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition
                        ${loan.paid ? 'bg-emerald-500 border-emerald-500 text-white' : overdue ? 'border-rose-400' : 'border-slate-300'}">
                        ${loan.paid ? '<svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                    </button>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-start gap-2">
                            <div>
                                <div class="text-sm font-bold text-slate-800 ${loan.paid ? 'line-through text-slate-400' : ''}">${loan.debtor}</div>
                                <div class="text-[10px] text-slate-400 mt-0.5">
                                    ${loan.method} · ${fmtDate(loan.startDate)}${loan.dueDate ? ` → ${fmtDate(loan.dueDate)}` : ''}
                                    ${overdue ? '<span class="text-rose-500 font-bold ml-1">VENCIDO</span>' : ''}
                                </div>
                                ${loan.notes ? `<div class="text-[10px] text-slate-400 mt-0.5 italic">${loan.notes}</div>` : ''}
                            </div>
                            <div class="text-right shrink-0">
                                <div class="text-sm font-bold ${loan.paid ? 'text-emerald-600' : overdue ? 'text-rose-600' : 'text-slate-900'}">${fmt(total)}</div>
                                ${hasInt ? `<div class="text-[10px] text-slate-400">${fmt(loan.amount)} + ${loan.interestRate}%/mês</div>` : ''}
                            </div>
                        </div>
                    </div>
                    <button data-loan-delete="${loan.id}"
                        class="text-slate-300 hover:text-rose-500 transition shrink-0 text-sm font-bold mt-0.5">✕</button>
                </div>
            `;
        }).join('');

        /* Bind acções */
        container.querySelectorAll('[data-loan-toggle]').forEach(btn => {
            btn.addEventListener('click', () => {
                const uid = state.currentUser?.uid;
                if (!uid) return;
                LoanModel.togglePaid(uid, btn.dataset.loanToggle, btn.dataset.loanPaid === 'true');
            });
        });
        container.querySelectorAll('[data-loan-delete]').forEach(btn => {
            btn.addEventListener('click', () => {
                const uid = state.currentUser?.uid;
                if (!uid) return;
                ModalView.openConfirmModal({
                    title: 'Apagar Empréstimo',
                    message: 'Tens a certeza que deseja remover este registo?',
                    confirmLabel: 'Sim, apagar',
                    onConfirm: () => LoanModel.delete(uid, btn.dataset.loanDelete)
                });
            });
        });
    }
}
