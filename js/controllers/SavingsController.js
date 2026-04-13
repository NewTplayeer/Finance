/**
 * SavingsController — gere cofrinhos com rendimento CDI, edição de metas
 * e suporte a modo pessoal / espaço partilhado.
 */
import { SavingsModel } from '../models/SavingsModel.js';
import { ModalView }    from '../views/ModalView.js';
import { state }        from '../state.js';

const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Rendimento CDI: rendimento mensal = saved × ((1 + rate/100)^(1/12) - 1) */
function calcYield(saved, rateAnual) {
    if (!saved || !rateAnual || rateAnual <= 0) return { daily: 0, monthly: 0 };
    const monthly = saved * (Math.pow(1 + rateAnual / 100, 1 / 12) - 1);
    const daily   = saved * (rateAnual / 100) / 365;
    return { daily, monthly };
}

export class SavingsController {
    constructor() {
        this._jars        = [];
        this._uid         = null;
        this._unsubscribe = null;
    }

    init() {
        this._bindFormToggle();
        this._bindFormSave();
    }

    /** Devolve o spaceId activo (null se modo pessoal) */
    _activeSpaceId() {
        return (state.viewMode === 'shared' && state.sharedSpaceId) ? state.sharedSpaceId : null;
    }

    /** Inicia sincronização (chama-se no login e ao mudar de modo) */
    startSync(uid) {
        this._uid = uid;
        if (this._unsubscribe) this._unsubscribe();

        const spaceId = this._activeSpaceId();
        console.log('[Savings] startSync uid:', uid, 'spaceId:', spaceId);

        this._unsubscribe = SavingsModel.subscribe(
            uid,
            jars => {
                this._jars    = jars;
                state.savings = jars;
                this._renderJars();
            },
            spaceId,
            (err) => {
                ModalView.showToast(
                    'Erro ao carregar cofrinhos' + (err?.code ? ` (${err.code})` : '') + '.',
                    'error'
                );
            }
        );
    }

    /** Reinicia o sync quando muda de modo pessoal ↔ partilhado */
    restartSync() {
        if (this._uid) this.startSync(this._uid);
    }

    stopSync() {
        if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
        this._jars    = [];
        state.savings = [];
        this._renderJars();
    }

    // ─── Binds ───────────────────────────────────────────────────────────────

    _bindFormToggle() {
        document.getElementById('btn-open-savings-form')?.addEventListener('click', () => {
            document.getElementById('savings-form')?.classList.toggle('hidden');
        });
        document.getElementById('savings-form-cancel')?.addEventListener('click', () => {
            document.getElementById('savings-form')?.classList.add('hidden');
            this._clearForm();
        });
    }

    _bindFormSave() {
        document.getElementById('savings-form-save')?.addEventListener('click', () => this._createJar());
    }

    _clearForm() {
        ['savings-name', 'savings-emoji', 'savings-goal', 'savings-yield'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }

    // ─── CRUD ────────────────────────────────────────────────────────────────

    async _createJar() {
        const uid       = state.currentUser?.uid;
        const name      = document.getElementById('savings-name')?.value?.trim();
        const emoji     = document.getElementById('savings-emoji')?.value?.trim() || '🐷';
        const goal      = parseFloat(document.getElementById('savings-goal')?.value)  || 0;
        const yieldRate = parseFloat(document.getElementById('savings-yield')?.value) || 0;

        if (!uid || !name) { ModalView.showToast('Dá um nome ao cofrinho.', 'error'); return; }

        await SavingsModel.add(uid, { name, emoji, goal, yieldRate }, this._activeSpaceId());
        document.getElementById('savings-form')?.classList.add('hidden');
        this._clearForm();
        ModalView.showToast(`Cofrinho "${name}" criado!`, 'success');
    }

    async _openTransactionModal(id, action, name) {
        const label = action === 'deposit' ? 'Depositar' : 'Levantar';
        const amount = await new Promise(resolve => {
            ModalView.openConfirmModal({
                title:        `${label} — ${name}`,
                message:      `<input type="number" id="jar-amount-input" step="0.01" min="0.01"
                    placeholder="Valor (R$)"
                    class="w-full mt-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-300">`,
                confirmLabel: label,
                onConfirm:    () => resolve(parseFloat(document.getElementById('jar-amount-input')?.value)),
                onCancel:     () => resolve(null)
            });
        });

        if (!amount || amount <= 0) return;
        const uid     = state.currentUser?.uid;
        const spaceId = this._activeSpaceId();
        if (!uid) return;

        if (action === 'deposit') {
            await SavingsModel.deposit(uid, id, amount, spaceId);
            ModalView.showToast(`${fmt(amount)} depositado em "${name}"!`, 'success');
        } else {
            const jar = this._jars.find(j => j.id === id);
            if (jar && amount > jar.saved) {
                ModalView.showToast('Saldo insuficiente no cofrinho.', 'error'); return;
            }
            await SavingsModel.withdraw(uid, id, amount, spaceId);
            ModalView.showToast(`${fmt(amount)} levantado de "${name}".`);
        }
    }

    _openEditModal(jar) {
        ModalView.openConfirmModal({
            title: 'Editar Cofrinho',
            message: `
                <div class="space-y-3 mt-2">
                    <div class="flex gap-2">
                        <input type="text" id="jar-edit-emoji" value="${this._esc(jar.emoji || '🐷')}" maxlength="4"
                            class="w-16 p-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-lg outline-none focus:ring-2 focus:ring-indigo-300">
                        <input type="text" id="jar-edit-name" value="${this._esc(jar.name || '')}" placeholder="Nome"
                            class="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300">
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="text-[10px] text-slate-400 block mb-1">Meta (R$)</label>
                            <input type="number" id="jar-edit-goal" value="${jar.goal || ''}" step="0.01" min="0" placeholder="Meta"
                                class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300">
                        </div>
                        <div>
                            <label class="text-[10px] text-slate-400 block mb-1">Rendimento % a.a.</label>
                            <input type="number" id="jar-edit-yield" value="${jar.yieldRate || ''}" step="0.01" min="0" placeholder="Ex: 10.5 (CDI)"
                                class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300">
                        </div>
                    </div>
                </div>`,
            confirmLabel: 'Guardar',
            onConfirm: async () => {
                const uid       = state.currentUser?.uid;
                const name      = document.getElementById('jar-edit-name')?.value?.trim();
                const emoji     = document.getElementById('jar-edit-emoji')?.value?.trim() || '🐷';
                const goal      = parseFloat(document.getElementById('jar-edit-goal')?.value)  || 0;
                const yieldRate = parseFloat(document.getElementById('jar-edit-yield')?.value) || 0;
                if (!uid || !name) { ModalView.showToast('O nome é obrigatório.', 'error'); return; }
                await SavingsModel.update(uid, jar.id, { name, emoji, goal, yieldRate }, this._activeSpaceId());
                ModalView.showToast('Cofrinho actualizado!', 'success');
            }
        });
    }

    // ─── Render ──────────────────────────────────────────────────────────────

    _renderJars() {
        const container = document.getElementById('savings-list');
        if (!container) return;

        if (!this._jars.length) {
            const modeLabel = this._activeSpaceId() ? ' partilhados' : '';
            container.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-4">Sem cofrinhos${modeLabel}. Cria o primeiro!</p>`;
            return;
        }

        container.innerHTML = this._jars.map(jar => {
            const pct      = jar.goal > 0 ? Math.min((jar.saved / jar.goal) * 100, 100) : 0;
            const barColor = pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-indigo-500' : 'bg-amber-400';
            const { daily, monthly } = calcYield(jar.saved, jar.yieldRate);
            const hasYield = (jar.yieldRate || 0) > 0;

            return `
            <div class="bg-slate-50 rounded-2xl p-4 mb-3">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-2xl">${jar.emoji || '🐷'}</span>
                        <div>
                            <div class="text-sm font-bold text-slate-800">${jar.name}</div>
                            <div class="text-[11px] text-slate-400">
                                ${fmt(jar.saved)}${jar.goal > 0 ? ` / ${fmt(jar.goal)}` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="flex gap-1.5">
                        <button data-jar-deposit="${jar.id}" data-jar-name="${this._esc(jar.name)}"
                            class="px-2.5 py-1.5 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-xl hover:bg-emerald-100 transition">+</button>
                        <button data-jar-withdraw="${jar.id}" data-jar-name="${this._esc(jar.name)}"
                            class="px-2.5 py-1.5 bg-amber-50 text-amber-600 text-xs font-bold rounded-xl hover:bg-amber-100 transition">-</button>
                        <button data-jar-edit="${jar.id}" title="Editar"
                            class="px-2 py-1.5 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-xl transition text-sm">✎</button>
                        <button data-jar-delete="${jar.id}"
                            class="px-2 py-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition text-sm font-bold">✕</button>
                    </div>
                </div>

                ${jar.goal > 0 ? `
                <div class="w-full bg-slate-200 rounded-full h-1.5 mt-1">
                    <div class="${barColor} h-1.5 rounded-full transition-all duration-500" style="width:${pct}%"></div>
                </div>
                <div class="text-[10px] text-right text-slate-400 mt-0.5">${pct.toFixed(0)}%</div>
                ` : ''}

                ${hasYield ? `
                <div class="mt-2 pt-2 border-t border-slate-100">
                    <div class="flex justify-between items-center text-[10px]">
                        <span class="text-slate-400 font-medium">Rendimento CDI ${jar.yieldRate}% a.a.</span>
                        <div class="text-right">
                            <span class="text-emerald-600 font-bold">+${fmt(monthly)}/mês</span>
                            <span class="text-slate-300 mx-1">·</span>
                            <span class="text-emerald-500 font-semibold">+${fmt(daily)}/dia</span>
                        </div>
                    </div>
                </div>` : ''}
            </div>`;
        }).join('');

        container.querySelectorAll('[data-jar-deposit]').forEach(btn => {
            btn.addEventListener('click', () => this._openTransactionModal(btn.dataset.jarDeposit, 'deposit', btn.dataset.jarName));
        });
        container.querySelectorAll('[data-jar-withdraw]').forEach(btn => {
            btn.addEventListener('click', () => this._openTransactionModal(btn.dataset.jarWithdraw, 'withdraw', btn.dataset.jarName));
        });
        container.querySelectorAll('[data-jar-edit]').forEach(btn => {
            btn.addEventListener('click', () => {
                const jar = this._jars.find(j => j.id === btn.dataset.jarEdit);
                if (jar) this._openEditModal(jar);
            });
        });
        container.querySelectorAll('[data-jar-delete]').forEach(btn => {
            btn.addEventListener('click', () => {
                const uid = state.currentUser?.uid;
                if (!uid) return;
                ModalView.openConfirmModal({
                    title: 'Apagar Cofrinho',
                    message: 'Tens a certeza? O saldo será perdido.',
                    confirmLabel: 'Sim, apagar',
                    onConfirm: () => SavingsModel.delete(uid, btn.dataset.jarDelete, this._activeSpaceId())
                });
            });
        });
    }

    _esc(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}
