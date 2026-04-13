/**
 * LoanController — gere empréstimos com parcelas, retroativos, tipos de pagamento
 * e liquidação automática. Suporta modo pessoal e partilhado.
 */
import { LoanModel }        from '../models/LoanModel.js';
import { TransactionModel } from '../models/TransactionModel.js';
import { ModalView }        from '../views/ModalView.js';
import { DateUtils }        from '../utils/DateUtils.js';
import { state }            from '../state.js';

const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export class LoanController {
    constructor() {
        this._loans       = [];
        this._uid         = null;
        this._unsubscribe = null;
        this._editingId   = null;
    }

    _activeSpaceId() {
        return (state.viewMode === 'shared' && state.sharedSpaceId) ? state.sharedSpaceId : null;
    }

    init() {
        this._bindFormToggle();
        this._bindFormSave();
        this._bindRetroactiveCalc();
        this._bindEditModal();
    }

    startSync(uid) {
        this._uid = uid;
        if (this._unsubscribe) this._unsubscribe();
        this._unsubscribe = LoanModel.subscribe(uid, loans => {
            this._loans = loans;
            state.loans = loans;
            this._renderLoans();
        }, this._activeSpaceId(), (err) => {
            ModalView.showToast('Erro ao carregar empréstimos' + (err?.code ? ` (${err.code})` : '') + '.', 'error');
        });
    }

    restartSync() {
        if (this._uid) this.startSync(this._uid);
    }

    stopSync() {
        if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
        this._loans = [];
        state.loans = [];
        this._renderLoans();
    }

    // ─── Binds ──────────────────────────────────────────────────────────────

    _bindFormToggle() {
        document.getElementById('btn-open-loan-form')?.addEventListener('click', () => {
            document.getElementById('loan-form')?.classList.toggle('hidden');
        });
        document.getElementById('loan-form-cancel')?.addEventListener('click', () => {
            document.getElementById('loan-form')?.classList.add('hidden');
            this._clearForm();
        });
    }

    _bindFormSave() {
        document.getElementById('loan-form-save')?.addEventListener('click', () => this._createLoan());
    }

    _bindRetroactiveCalc() {
        const calc = () => {
            const start  = document.getElementById('loan-start-date')?.value;
            const due    = document.getElementById('loan-due-date')?.value;
            const hintEl = document.getElementById('loan-installments-hint');
            const instEl = document.getElementById('loan-installments');
            if (start && due && start <= due) {
                const n = DateUtils.monthsBetween(start, due);
                if (instEl && !instEl.value) instEl.value = n;
                if (hintEl) { hintEl.textContent = `${n} mês(es) entre as datas`; hintEl.classList.remove('hidden'); }
            } else if (hintEl) {
                hintEl.classList.add('hidden');
            }
        };
        document.getElementById('loan-start-date')?.addEventListener('change', calc);
        document.getElementById('loan-due-date')?.addEventListener('change', calc);
    }

    _bindEditModal() {
        document.getElementById('loan-edit-save')?.addEventListener('click', () => this._saveEdit());
        document.getElementById('loan-edit-cancel')?.addEventListener('click', () => {
            document.getElementById('loan-edit-modal')?.classList.add('hidden');
            this._editingId = null;
        });
    }

    // ─── Formulário ─────────────────────────────────────────────────────────

    _clearForm() {
        ['loan-debtor','loan-amount','loan-interest','loan-start-date','loan-due-date',
         'loan-installments','loan-payment-day','loan-notes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('loan-installments-hint')?.classList.add('hidden');
    }

    async _createLoan() {
        const uid         = state.currentUser?.uid;
        const debtor      = document.getElementById('loan-debtor')?.value?.trim();
        const amount      = parseFloat(document.getElementById('loan-amount')?.value);
        const rate        = parseFloat(document.getElementById('loan-interest')?.value) || 0;
        const start       = document.getElementById('loan-start-date')?.value || '';
        const due         = document.getElementById('loan-due-date')?.value   || '';
        const paymentType = document.getElementById('loan-payment-type')?.value || 'Saldo';
        const paymentDay  = parseInt(document.getElementById('loan-payment-day')?.value) || null;
        const method      = document.getElementById('loan-method')?.value || 'Dinheiro';
        const notes       = document.getElementById('loan-notes')?.value?.trim() || '';

        if (!uid || !debtor) { ModalView.showToast('Indica o nome do devedor.', 'error'); return; }
        if (!amount || amount <= 0) { ModalView.showToast('Indica um valor válido.', 'error'); return; }

        const manualInst = parseInt(document.getElementById('loan-installments')?.value);
        let installments = manualInst > 0 ? manualInst : 1;
        if (start && due && start <= due && !(manualInst > 0)) {
            installments = DateUtils.monthsBetween(start, due);
        }

        await LoanModel.add(uid, {
            debtor, amount, interestRate: rate, startDate: start, dueDate: due,
            installments, paymentDay, paymentType, method, notes
        }, this._activeSpaceId());

        document.getElementById('loan-form')?.classList.add('hidden');
        this._clearForm();
        ModalView.showToast(`Empréstimo de ${fmt(amount)} a ${debtor} registado!`, 'success');
    }

    // ─── Edit Modal ──────────────────────────────────────────────────────────

    _openEditModal(loan) {
        this._editingId = loan.id;
        document.getElementById('loan-edit-debtor').value       = loan.debtor       || '';
        document.getElementById('loan-edit-amount').value       = loan.amount       || '';
        document.getElementById('loan-edit-interest').value     = loan.interestRate || '';
        document.getElementById('loan-edit-start').value        = loan.startDate    || '';
        document.getElementById('loan-edit-due').value          = loan.dueDate      || '';
        document.getElementById('loan-edit-installments').value = loan.installments || 1;
        document.getElementById('loan-edit-payment-day').value  = loan.paymentDay   || '';
        document.getElementById('loan-edit-payment-type').value = loan.paymentType  || 'Saldo';
        document.getElementById('loan-edit-method').value       = loan.method       || 'Dinheiro';
        document.getElementById('loan-edit-notes').value        = loan.notes        || '';
        document.getElementById('loan-edit-modal')?.classList.remove('hidden');
    }

    async _saveEdit() {
        if (!this._editingId) return;
        const uid = state.currentUser?.uid;
        if (!uid) return;

        const debtor       = document.getElementById('loan-edit-debtor')?.value?.trim();
        const amount       = parseFloat(document.getElementById('loan-edit-amount')?.value);
        const rate         = parseFloat(document.getElementById('loan-edit-interest')?.value) || 0;
        const start        = document.getElementById('loan-edit-start')?.value || '';
        const due          = document.getElementById('loan-edit-due')?.value   || '';
        const installments = parseInt(document.getElementById('loan-edit-installments')?.value) || 1;
        const paymentDay   = parseInt(document.getElementById('loan-edit-payment-day')?.value)  || null;
        const paymentType  = document.getElementById('loan-edit-payment-type')?.value || 'Saldo';
        const method       = document.getElementById('loan-edit-method')?.value || 'Dinheiro';
        const notes        = document.getElementById('loan-edit-notes')?.value?.trim() || '';

        if (!debtor || !amount || amount <= 0) {
            ModalView.showToast('Preenche os campos obrigatórios.', 'error'); return;
        }

        const total        = LoanModel.calcTotal(amount, rate, start, due);
        const installValue = total / installments;

        await LoanModel.update(uid, this._editingId, {
            debtor, amount, interestRate: rate, startDate: start, dueDate: due,
            installments, installValue, paymentDay, paymentType, method, notes
        }, this._activeSpaceId());

        document.getElementById('loan-edit-modal')?.classList.add('hidden');
        this._editingId = null;
        ModalView.showToast('Empréstimo actualizado!', 'success');
    }

    // ─── Render ─────────────────────────────────────────────────────────────

    _renderLoans() {
        const container = document.getElementById('loans-list');
        if (!container) return;

        if (!this._loans.length) {
            container.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-4">Sem empréstimos registados.</p>`;
            return;
        }

        const pending      = this._loans.filter(l => !l.paid);
        const totalPending = pending.reduce((s, l) =>
            s + LoanModel.calcTotal(l.amount, l.interestRate, l.startDate, l.dueDate), 0);

        const summary = pending.length
            ? `<div class="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 mb-4 flex justify-between items-center">
                <span class="text-xs font-bold text-amber-700">${pending.length} em aberto</span>
                <span class="text-sm font-bold text-amber-800">${fmt(totalPending)}</span>
               </div>` : '';

        container.innerHTML = summary + this._loans.map(loan => {
            const total        = LoanModel.calcTotal(loan.amount, loan.interestRate, loan.startDate, loan.dueDate);
            const installments = loan.installments || 1;
            const installValue = total / installments;
            const overdue      = loan.dueDate && !loan.paid && new Date(loan.dueDate + 'T12:00:00') < new Date();
            const hasInt       = (loan.interestRate || 0) > 0;

            const typeBadge = loan.paymentType ? `<span class="px-1.5 py-0.5 text-[10px] font-bold rounded-lg ${
                loan.paymentType === 'Crédito' ? 'bg-indigo-100 text-indigo-600' :
                loan.paymentType === 'Débito'  ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'
            }">${loan.paymentType}</span>` : '';

            const installBadge = installments > 1
                ? `<span class="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-lg text-[10px] font-bold">${installments}x ${fmt(installValue)}</span>` : '';

            const payDayBadge = loan.paymentDay
                ? `<span class="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-semibold">dia ${loan.paymentDay}</span>` : '';

            return `
            <div class="flex items-start gap-3 p-3 rounded-2xl mb-2 ${loan.paid ? 'bg-emerald-50/50 opacity-70' : overdue ? 'bg-rose-50' : 'bg-slate-50'}">
                <button data-loan-toggle="${loan.id}" data-loan-paid="${loan.paid}" data-loan-type="${loan.paymentType || 'Saldo'}"
                    class="mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition hover:scale-110
                    ${loan.paid ? 'bg-emerald-500 border-emerald-500 text-white' : overdue ? 'border-rose-400' : 'border-slate-300'}">
                    ${loan.paid ? '<svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                </button>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start gap-2">
                        <div class="min-w-0 flex-1">
                            <div class="text-sm font-bold ${loan.paid ? 'line-through text-slate-400' : 'text-slate-800'}">${loan.debtor}</div>
                            <div class="text-[10px] text-slate-400 mt-0.5">
                                ${loan.method} · ${DateUtils.toBR(loan.startDate)}${loan.dueDate ? ` → ${DateUtils.toBR(loan.dueDate)}` : ''}
                                ${overdue ? '<span class="text-rose-500 font-bold ml-1">VENCIDO</span>' : ''}
                            </div>
                            ${(typeBadge || installBadge || payDayBadge)
                                ? `<div class="flex flex-wrap gap-1 mt-1.5">${typeBadge}${installBadge}${payDayBadge}</div>` : ''}
                            ${loan.notes ? `<div class="text-[10px] text-slate-400 mt-0.5 italic truncate">${loan.notes}</div>` : ''}
                        </div>
                        <div class="text-right shrink-0">
                            <div class="text-sm font-bold ${loan.paid ? 'text-emerald-600' : overdue ? 'text-rose-600' : 'text-slate-900'}">${fmt(total)}</div>
                            ${hasInt ? `<div class="text-[10px] text-slate-400">${fmt(loan.amount)} +${loan.interestRate}%/mês</div>` : ''}
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                    <button data-loan-edit="${loan.id}" class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition">✎</button>
                    <button data-loan-delete="${loan.id}" class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition font-bold">✕</button>
                </div>
            </div>`;
        }).join('');

        container.querySelectorAll('[data-loan-toggle]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const uid         = state.currentUser?.uid;
                const loanId      = btn.dataset.loanToggle;
                const currentPaid = btn.dataset.loanPaid === 'true';
                const payType     = btn.dataset.loanType;
                if (!uid) return;

                await LoanModel.togglePaid(uid, loanId, currentPaid, this._activeSpaceId());

                if (!currentPaid && payType === 'Crédito') {
                    const loan = this._loans.find(l => l.id === loanId);
                    if (loan) {
                        const total    = LoanModel.calcTotal(loan.amount, loan.interestRate, loan.startDate, loan.dueDate);
                        const monthKey = DateUtils.toMonthKey(DateUtils.today());
                        await TransactionModel.add(uid, {
                            desc: `Quitação (Crédito) — ${loan.debtor}`, amount: total,
                            category: 'Receita', method: loan.method || 'Transferência',
                            bank: '', dateKey: monthKey, date: DateUtils.today(), loanId
                        }, this._activeSpaceId());
                        ModalView.showToast(`Receita de ${fmt(total)} lançada automaticamente.`, 'success');
                    }
                }
            });
        });

        container.querySelectorAll('[data-loan-edit]').forEach(btn => {
            btn.addEventListener('click', () => {
                const loan = this._loans.find(l => l.id === btn.dataset.loanEdit);
                if (loan) this._openEditModal(loan);
            });
        });

        container.querySelectorAll('[data-loan-delete]').forEach(btn => {
            btn.addEventListener('click', () => {
                const uid = state.currentUser?.uid;
                if (!uid) return;
                ModalView.openConfirmModal({
                    title: 'Apagar Empréstimo',
                    message: 'Tens a certeza que desejas remover este registo?',
                    confirmLabel: 'Sim, apagar',
                    onConfirm: () => LoanModel.delete(uid, btn.dataset.loanDelete, this._activeSpaceId())
                });
            });
        });
    }
}
