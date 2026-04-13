/**
 * SubscriptionController — gere assinaturas recorrentes mensais.
 *
 * Lógica de propagação:
 *  • Quando o utilizador abre um mês, verifica se cada assinatura activa
 *    tem uma transação com `subscriptionId === sub.id` para aquele mês.
 *  • Se não tiver, cria automaticamente (fire-and-forget, sem duplicatas).
 *  • O cancelamento (active: false) impede geração a partir do mês seguinte.
 */
import { SubscriptionModel } from '../models/SubscriptionModel.js';
import { TransactionModel }  from '../models/TransactionModel.js';
import { ModalView }         from '../views/ModalView.js';
import { DateUtils }         from '../utils/DateUtils.js';
import { state }             from '../state.js';
import { DEFAULT_CATEGORIES } from '../config.js';

const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export class SubscriptionController {
    constructor() {
        this._subs        = [];
        this._uid         = null;
        this._unsubscribe = null;
        this._propagating = false;
    }

    _activeSpaceId() {
        return (state.viewMode === 'shared' && state.sharedSpaceId) ? state.sharedSpaceId : null;
    }

    /** Inicializa os event listeners da UI */
    init() {
        this._bindFormToggle();
        this._bindFormSave();
    }

    /**
     * Inicia sincronização em tempo real com o Firestore.
     * @param {string} uid
     */
    startSync(uid) {
        this._uid = uid;
        if (this._unsubscribe) this._unsubscribe();
        this._unsubscribe = SubscriptionModel.subscribe(uid, subs => {
            this._subs          = subs;
            state.subscriptions = subs;
            this._renderSubs();
        }, this._activeSpaceId(), (err) => {
            ModalView.showToast('Erro ao carregar assinaturas' + (err?.code ? ` (${err.code})` : '') + '.', 'error');
        });
    }

    restartSync() {
        if (this._uid) this.startSync(this._uid);
    }

    stopSync() {
        if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
        this._subs       = [];
        state.subscriptions = [];
        this._renderSubs();
    }

    /**
     * Propaga assinaturas activas para o mês indicado.
     * Chamado pelo NavigationController quando o mês muda e após login.
     * É seguro chamar múltiplas vezes — não cria duplicatas.
     * @param {string} uid
     * @param {string} monthKey - YYYY-MM
     */
    async propagateForMonth(uid, monthKey) {
        if (!uid || !monthKey || this._propagating) return;
        const activeSubs = this._subs.filter(s => s.active);
        if (!activeSubs.length) return;

        this._propagating = true;
        try {
            for (const sub of activeSubs) {
                const subStart = sub.startDate
                    ? sub.startDate.slice(0, 7)
                    : DateUtils.currentMonth();

                // Não propaga para meses anteriores ao início da assinatura
                if (monthKey < subStart) continue;

                // Verifica se já existe transação para esta assinatura neste mês
                const alreadyExists = state.transactions.some(
                    t => t.subscriptionId === sub.id && t.monthKey === monthKey
                );
                if (alreadyExists) continue;

                const date = DateUtils.dateForDay(monthKey, sub.dayOfMonth || 1);

                const spaceId = (state.viewMode === 'shared' && state.sharedSpaceId) ? state.sharedSpaceId : null;
                await TransactionModel.add(uid, {
                    desc:           sub.desc,
                    amount:         sub.amount,
                    category:       sub.category,
                    method:         sub.method,
                    bank:           sub.bank || '',
                    dateKey:        monthKey,
                    date,
                    subscriptionId: sub.id,
                    paid:           false
                }, spaceId);
            }
        } finally {
            this._propagating = false;
        }
    }

    /** Popula o select de categorias no formulário de assinatura */
    refreshCategorySelect() {
        const sel = document.getElementById('sub-category');
        if (!sel) return;
        const all     = [...DEFAULT_CATEGORIES, ...(state.customCategories || [])];
        const current = sel.value;
        sel.innerHTML = all
            .filter(c => c !== 'Receita')
            .map(c => `<option value="${c}"${c === current ? ' selected' : ''}>${c}</option>`)
            .join('');
    }

    // ─── Privado ────────────────────────────────────────────────────────────

    _bindFormToggle() {
        document.getElementById('btn-open-sub-form')?.addEventListener('click', () => {
            this.refreshCategorySelect();
            document.getElementById('sub-form')?.classList.toggle('hidden');
        });
        document.getElementById('sub-form-cancel')?.addEventListener('click', () => {
            document.getElementById('sub-form')?.classList.add('hidden');
            this._clearForm();
        });
    }

    _bindFormSave() {
        document.getElementById('sub-form-save')?.addEventListener('click', () => this._createSub());
    }

    _clearForm() {
        ['sub-desc', 'sub-amount', 'sub-bank', 'sub-day'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }

    async _createSub() {
        const uid       = state.currentUser?.uid;
        const desc      = document.getElementById('sub-desc')?.value?.trim();
        const amount    = parseFloat(document.getElementById('sub-amount')?.value);
        const category  = document.getElementById('sub-category')?.value || 'Serviços';
        const method    = document.getElementById('sub-method')?.value  || 'Cartão';
        const bank      = document.getElementById('sub-bank')?.value?.trim() || '';
        const dayOfMonth = parseInt(document.getElementById('sub-day')?.value) || 1;
        const startDate = DateUtils.today();

        if (!uid)              { ModalView.showToast('Utilizador não autenticado.', 'error'); return; }
        if (!desc)             { ModalView.showToast('Indica uma descrição.', 'error'); return; }
        if (!amount || amount <= 0) { ModalView.showToast('Indica um valor válido.', 'error'); return; }

        await SubscriptionModel.add(uid, { desc, amount, category, method, bank, dayOfMonth, startDate }, this._activeSpaceId());
        document.getElementById('sub-form')?.classList.add('hidden');
        this._clearForm();
        ModalView.showToast(`Assinatura "${desc}" criada — ${fmt(amount)}/mês!`, 'success');
    }

    /** Renderiza a lista de assinaturas */
    _renderSubs() {
        const container = document.getElementById('subscriptions-list');
        if (!container) return;

        if (!this._subs.length) {
            container.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-4">Sem assinaturas registadas.</p>`;
            return;
        }

        const active   = this._subs.filter(s =>  s.active);
        const inactive = this._subs.filter(s => !s.active);
        const totalActive = active.reduce((s, sub) => s + sub.amount, 0);

        let html = '';
        if (active.length) {
            html += `<div class="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-2.5 mb-3 flex justify-between items-center">
                <span class="text-[10px] font-bold text-indigo-600 uppercase">${active.length} activa(s)</span>
                <span class="text-sm font-bold text-indigo-700">${fmt(totalActive)}/mês</span>
            </div>`;
        }

        html += [...active, ...inactive].map(sub => `
            <div class="flex items-center gap-2 p-3 rounded-2xl mb-2 ${sub.active ? 'bg-slate-50' : 'bg-slate-50/40 opacity-60'}">
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-bold text-slate-800 ${!sub.active ? 'line-through text-slate-400' : ''} truncate">${sub.desc}</div>
                    <div class="text-[10px] text-slate-400 mt-0.5">${sub.category} · ${sub.method}${sub.bank ? ' · ' + sub.bank : ''} · dia ${sub.dayOfMonth}</div>
                    ${!sub.active && sub.cancelledAt
                        ? `<div class="text-[9px] text-rose-400 font-semibold mt-0.5">Cancelada em ${DateUtils.toShortBR(sub.cancelledAt)}</div>`
                        : ''}
                </div>
                <div class="text-xs font-bold text-slate-700 shrink-0">${fmt(sub.amount)}</div>
                <div class="flex items-center gap-1 shrink-0">
                    ${sub.active ? `
                        <button data-sub-edit="${sub.id}" title="Editar" class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition text-sm">✎</button>
                        <button data-sub-cancel="${sub.id}" data-sub-desc="${this._esc(sub.desc)}" title="Cancelar" class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition text-base">⏸</button>
                    ` : `
                        <button data-sub-reactivate="${sub.id}" title="Reactivar" class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 transition text-base">▶</button>
                    `}
                    <button data-sub-delete="${sub.id}" title="Eliminar" class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition font-bold">✕</button>
                </div>
            </div>
        `).join('');

        container.innerHTML = html;

        /* ─ Bind acções ─ */
        container.querySelectorAll('[data-sub-cancel]').forEach(btn => {
            btn.addEventListener('click', () => {
                const uid = state.currentUser?.uid;
                if (!uid) return;
                ModalView.openConfirmModal({
                    title: 'Cancelar Assinatura',
                    message: `Cancelar <strong>"${btn.dataset.subDesc}"</strong>?<br><span class="text-xs text-slate-400">Não serão gerados novos lançamentos a partir do próximo mês. Os existentes são mantidos.</span>`,
                    confirmLabel: 'Sim, cancelar',
                    onConfirm: () => SubscriptionModel.cancel(uid, btn.dataset.subCancel, this._activeSpaceId())
                });
            });
        });

        container.querySelectorAll('[data-sub-reactivate]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const uid = state.currentUser?.uid;
                if (!uid) return;
                await SubscriptionModel.reactivate(uid, btn.dataset.subReactivate, this._activeSpaceId());
                ModalView.showToast('Assinatura reactivada!', 'success');
            });
        });

        container.querySelectorAll('[data-sub-edit]').forEach(btn => {
            btn.addEventListener('click', () => {
                const sub = this._subs.find(s => s.id === btn.dataset.subEdit);
                if (sub) this._openEditModal(sub);
            });
        });

        container.querySelectorAll('[data-sub-delete]').forEach(btn => {
            btn.addEventListener('click', () => {
                const uid = state.currentUser?.uid;
                if (!uid) return;
                ModalView.openConfirmModal({
                    title: 'Eliminar Assinatura',
                    message: 'Eliminar permanentemente? As transações geradas não são afectadas.',
                    confirmLabel: 'Sim, eliminar',
                    onConfirm: () => SubscriptionModel.delete(uid, btn.dataset.subDelete, this._activeSpaceId())
                });
            });
        });
    }

    /** Abre modal de edição inline (via ModalView.openConfirmModal) */
    _openEditModal(sub) {
        ModalView.openConfirmModal({
            title: 'Editar Assinatura',
            message: `
                <div class="space-y-3 mt-2">
                    <input type="text" id="sub-edit-desc" value="${this._esc(sub.desc || '')}" placeholder="Descrição"
                        class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300">
                    <div class="grid grid-cols-2 gap-2">
                        <input type="number" id="sub-edit-amount" value="${sub.amount || ''}" step="0.01" min="0.01" placeholder="Valor (R$)"
                            class="p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300">
                        <input type="number" id="sub-edit-day" value="${sub.dayOfMonth || 1}" min="1" max="31" placeholder="Dia do mês"
                            class="p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300">
                    </div>
                    <input type="text" id="sub-edit-bank" value="${this._esc(sub.bank || '')}" placeholder="Banco (ex: Nubank)"
                        class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300">
                </div>`,
            confirmLabel: 'Guardar',
            onConfirm: async () => {
                const uid    = state.currentUser?.uid;
                const desc   = document.getElementById('sub-edit-desc')?.value?.trim();
                const amount = parseFloat(document.getElementById('sub-edit-amount')?.value);
                const day    = parseInt(document.getElementById('sub-edit-day')?.value) || 1;
                const bank   = document.getElementById('sub-edit-bank')?.value?.trim() || '';
                if (!uid || !desc || !amount || amount <= 0) {
                    ModalView.showToast('Preenche os campos obrigatórios.', 'error'); return;
                }
                await SubscriptionModel.update(uid, sub.id, { desc, amount, dayOfMonth: day, bank }, this._activeSpaceId());
                ModalView.showToast('Assinatura actualizada!', 'success');
            }
        });
    }

    _esc(str) {
        return (str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
}
