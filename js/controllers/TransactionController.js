import { TransactionModel } from '../models/TransactionModel.js';
import { AIService } from '../services/AIService.js';
import { DashboardView } from '../views/DashboardView.js';
import { ModalView } from '../views/ModalView.js';
import { UserModel } from '../models/UserModel.js';
import { state } from '../state.js';
import { currentMonthKey, DEFAULT_CATEGORIES } from '../config.js';

export class TransactionController {
    constructor({ getSelectedMonth }) {
        this.getSelectedMonth = getSelectedMonth;
    }

    init() {
        this._bindManualForm();
        this._bindAIInput();
        this._bindImportModal();
        this._bindSummaryActions();
        this._bindEditModal();
        this._bindInlineCategoryAdd();
    }

    // Popula todos os <select> de categoria com as categorias padrão + personalizadas
    refreshCategorySelectors() {
        const allCats = [...DEFAULT_CATEGORIES, ...state.customCategories];
        ['category', 'edit-category'].forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            const current = sel.value;
            sel.innerHTML = allCats.map(c =>
                `<option value="${c}"${c === current ? ' selected' : ''}>${c}</option>`
            ).join('');
            if (current && allCats.includes(current)) sel.value = current;
        });
    }

    _bindInlineCategoryAdd() {
        const toggleBtn = document.getElementById('btn-new-category-inline');
        const row       = document.getElementById('new-cat-row');
        const input     = document.getElementById('new-cat-input');
        const confirmBtn = document.getElementById('new-cat-confirm');
        const cancelBtn  = document.getElementById('new-cat-cancel');
        if (!toggleBtn || !row) return;

        toggleBtn.addEventListener('click', () => {
            const isHidden = row.classList.toggle('hidden');
            if (!isHidden) setTimeout(() => input?.focus(), 50);
        });

        const doAdd = async () => {
            const name = input?.value?.trim();
            if (!name) { ModalView.showToast('Escreve o nome da categoria.', 'error'); return; }
            const all = [...DEFAULT_CATEGORIES, ...state.customCategories];
            if (all.some(c => c.toLowerCase() === name.toLowerCase())) {
                ModalView.showToast('Essa categoria já existe.', 'error');
                return;
            }
            state.customCategories = [...state.customCategories, name];
            const uid = state.currentUser?.uid;
            if (uid) await UserModel.savePrefs(uid, { customCategories: state.customCategories });
            this.refreshCategorySelectors();
            document.getElementById('category').value = name;
            row.classList.add('hidden');
            input.value = '';
            ModalView.showToast(`Categoria "${name}" adicionada!`, 'success');
        };

        confirmBtn?.addEventListener('click', doAdd);
        input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
        cancelBtn?.addEventListener('click', () => {
            row.classList.add('hidden');
            if (input) input.value = '';
        });
    }

    // Devolve o spaceId activo (null se modo pessoal)
    _activeSpaceId() {
        return (state.viewMode === 'shared' && state.sharedSpaceId) ? state.sharedSpaceId : null;
    }

    startSync() {
        const uid = state.currentUser?.uid;
        if (!uid) return;

        if (state.unsubscribeTrans) state.unsubscribeTrans();

        state.unsubscribeTrans = TransactionModel.subscribe(uid, (data) => {
            state.transactions = data;
            this.refreshDashboard();
        }, this._activeSpaceId());
    }

    stopSync() {
        if (state.unsubscribeTrans) { state.unsubscribeTrans(); state.unsubscribeTrans = null; }
    }

    // Reinicia sync quando muda de modo (pessoal/partilhado)
    restartSync() {
        this.stopSync();
        this.startSync();
    }

    refreshDashboard() {
        const monthKey = this.getSelectedMonth();
        const filtered = state.transactions.filter(t => t.monthKey === monthKey);

        const income = filtered.filter(t => t.category === 'Receita').reduce((a, b) => a + b.amount, 0);
        const cardDebt = filtered.filter(t => t.method === 'Cartão').reduce((a, b) => a + b.amount, 0);
        const instantExit = filtered.filter(t => (t.method !== 'Cartão' && (t.method !== 'Boleto' || t.paid)) && t.category !== 'Receita').reduce((a, b) => a + b.amount, 0);
        const pending = filtered.filter(t => t.category !== 'Receita' && !t.paid).reduce((a, b) => a + b.amount, 0);

        DashboardView.updateCards({
            balance: income - instantExit,
            income,
            cardDebt,
            pending,
            finalBalance: income - instantExit - pending
        });

        DashboardView.renderTransactionList(filtered, {
            onTogglePaid: (id) => this.togglePaid(id),
            onDelete: (id) => this.confirmDelete(id),
            onEdit: (id) => this.editTransaction(id)
        });

        const monthFilter = document.getElementById('month-filter');
        if (monthFilter) {
            DashboardView.setMonthDisplay(monthFilter.options[monthFilter.selectedIndex]?.text || "");
            const monthOptions = Array.from(monthFilter.options).map(o => o.value);
            DashboardView.updateChart(state.chart, monthOptions, state.transactions, currentMonthKey);
        }

        // Actualiza gráfico de pizza e barras de meta
        DashboardView.updatePieChart(state.pieChart, filtered);
        DashboardView.renderBudgetBars(filtered, state.budgets);

        // Actualiza selector de clientes no formulário
        this._refreshClientSelector();
    }

    _refreshClientSelector() {
        const sel = document.getElementById('client-id-select');
        if (!sel) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">Sem cliente vinculado</option>';
        state.clients.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.innerText = `${c.name} (${c.docFormatted || c.doc})`;
            sel.appendChild(opt);
        });
        if (current) sel.value = current;
    }

    async togglePaid(id) {
        const uid = state.currentUser?.uid;
        if (!uid) return;
        const item = state.transactions.find(t => t.id === id);
        if (item) await TransactionModel.togglePaid(uid, item, this._activeSpaceId());
    }

    confirmDelete(id) {
        ModalView.openConfirmModal({
            title: "Confirmar",
            message: "Desejas apagar este registo?",
            confirmLabel: "Sim, eliminar",
            onConfirm: () => this.delete(id)
        });
    }

    async delete(id) {
        const uid = state.currentUser?.uid;
        if (uid) await TransactionModel.delete(uid, id, this._activeSpaceId());
    }

    async clearAll() {
        const uid = state.currentUser?.uid;
        if (uid) await TransactionModel.clearAll(uid, state.transactions, this._activeSpaceId());
    }

    async addTransaction(data) {
        const uid = state.currentUser?.uid;
        if (!uid) { ModalView.showToast("Erro: utilizador não autenticado.", 'error'); return; }
        try {
            await TransactionModel.add(uid, data, this._activeSpaceId());
        } catch (e) {
            console.error("Erro ao guardar transação:", e);
            ModalView.showToast("Erro ao guardar: " + (e.message || e.code || "verifique a consola."), 'error');
        }
    }

    _bindManualForm() {
        const form = document.getElementById('finance-form');
        if (!form) return;
        form.onsubmit = async (e) => {
            e.preventDefault();
            const desc         = document.getElementById('desc')?.value?.trim();
            const amount       = parseFloat(document.getElementById('amount')?.value) || 0;
            const category     = document.getElementById('category')?.value;
            const method       = document.getElementById('method')?.value;
            const bank         = document.getElementById('bank-input')?.value?.trim();
            const rawInstall   = document.getElementById('installments')?.value;
            const installments = Math.max(1, parseInt(rawInstall, 10) || 1);
            const clientId     = document.getElementById('client-id-select')?.value || "";

            if (!desc || amount <= 0) {
                ModalView.showToast("Preenche a descrição e o valor.", 'error');
                return;
            }

            const dateKey = this.getSelectedMonth();
            await this.addTransaction({ desc, amount, category, method, bank, installments, clientId, dateKey });
            form.reset();

            if (installments > 1) {
                // Mostra em que meses as parcelas foram distribuídas
                const [y, m] = dateKey.split('-').map(Number);
                const meses = Array.from({ length: installments }, (_, i) => {
                    const d = new Date(y, m - 1 + i, 1);
                    return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
                });
                const preview = meses.length > 3
                    ? `${meses.slice(0, 3).join(', ')}… (+${meses.length - 3})`
                    : meses.join(', ');
                ModalView.showToast(`${installments} parcelas guardadas: ${preview}`, 'success');
            } else {
                ModalView.showToast("Transação guardada!", 'success');
            }
        };

        const clearBtn = document.querySelector('[onclick="openConfirmModal(\'clearAll\')"]');
        if (clearBtn) {
            clearBtn.removeAttribute('onclick');
            clearBtn.onclick = () => ModalView.openConfirmModal({
                title: "Limpar Tudo",
                message: "Tens a certeza que desejas eliminar todos os registos deste mês?",
                confirmLabel: "Sim, limpar tudo",
                onConfirm: () => this.clearAll()
            });
        }
    }

    _bindAIInput() {
        const aiBtn = document.getElementById('ai-submit');
        if (!aiBtn) return;
        aiBtn.onclick = async () => {
            const inputEl = document.getElementById('ai-input');
            if (!inputEl?.value?.trim()) return;
            await this._processAI(inputEl.value.trim(), false);
        };

        // Permite submeter com Enter
        document.getElementById('ai-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                document.getElementById('ai-submit')?.click();
            }
        });
    }

    _bindImportModal() {
        const importBtn = document.getElementById('import-process-btn');
        if (!importBtn) return;
        importBtn.onclick = async () => {
            const text = document.getElementById('import-text')?.value?.trim();
            if (text) await this._processAI(text, true);
        };
    }

    editTransaction(id) {
        const t = state.transactions.find(tx => tx.id === id);
        if (!t) return;

        this._editingId = id;
        this.refreshCategorySelectors();

        document.getElementById('edit-desc').value     = t.desc    || '';
        document.getElementById('edit-amount').value   = t.amount  || '';
        document.getElementById('edit-category').value = t.category || 'Outros';
        document.getElementById('edit-method').value   = t.method  || 'Dinheiro/Pix';
        document.getElementById('edit-bank').value     = t.bank    || '';
        document.getElementById('edit-transaction-modal')?.classList.remove('hidden');
    }

    _bindEditModal() {
        document.getElementById('edit-save-btn')?.addEventListener('click', () => this._saveEdit());
        document.getElementById('edit-cancel-btn')?.addEventListener('click', () => {
            document.getElementById('edit-transaction-modal')?.classList.add('hidden');
        });
    }

    async _saveEdit() {
        if (!this._editingId) return;
        const uid = state.currentUser?.uid;
        if (!uid) return;

        const desc     = document.getElementById('edit-desc')?.value?.trim();
        const amount   = parseFloat(document.getElementById('edit-amount')?.value);
        const category = document.getElementById('edit-category')?.value;
        const method   = document.getElementById('edit-method')?.value;
        const bank     = document.getElementById('edit-bank')?.value?.trim();

        if (!desc || amount <= 0) {
            ModalView.showToast('Preenche a descrição e o valor.', 'error');
            return;
        }

        await TransactionModel.update(uid, this._editingId, { desc, amount, category, method, bank }, this._activeSpaceId());
        this._editingId = null;
        document.getElementById('edit-transaction-modal')?.classList.add('hidden');
        ModalView.showToast('Registo actualizado!', 'success');
    }

    _bindSummaryActions() {
        const summaryBtn = document.querySelector('[onclick="generateMonthSummary()"]');
        if (summaryBtn) {
            summaryBtn.removeAttribute('onclick');
            summaryBtn.onclick = () => {
                const monthFilter = document.getElementById('month-filter');
                const monthLabel = monthFilter?.options[monthFilter.selectedIndex]?.text || "";
                const monthKey = this.getSelectedMonth();
                const filtered = state.transactions.filter(t => t.monthKey === monthKey);
                const content = DashboardView.generateSummary(filtered, monthLabel);
                ModalView.openSummaryModal(content);
            };
        }

        const copyBtn = document.querySelector('[onclick="copySummaryToClipboard()"]');
        if (copyBtn) {
            copyBtn.removeAttribute('onclick');
            copyBtn.onclick = () => {
                const contentEl = document.getElementById('summary-content');
                if (contentEl) {
                    navigator.clipboard.writeText(contentEl.innerText)
                        .then(() => ModalView.showToast("Copiado com sucesso!", 'success'));
                }
            };
        }
    }

    async _processAI(text, isImport) {
        if (isImport) ModalView.setImportLoading(true);
        else ModalView.setAILoading(true);

        await AIService.process(text, {
            onSuccess: async (data) => {
                const items = data.items || [];
                if (items.length === 0) {
                    ModalView.showToast("IA não conseguiu extrair dados. Tenta ser mais específico.", 'error');
                    DashboardView.setOllamaStatus(true);
                    return;
                }

                // Mostra modal de confirmação antes de guardar
                const confirmed = await ModalView.openAIConfirmModal(items);
                if (!confirmed) {
                    ModalView.showToast("Operação cancelada.");
                    return;
                }

                const selectedMonth = this.getSelectedMonth();
                for (const i of items) {
                    await this.addTransaction({
                        desc: i.desc,
                        amount: i.amount,
                        category: i.category,
                        method: i.method,
                        dateKey: selectedMonth,  // ← usa o mês seleccionado, não o mês actual
                        bank: i.bank
                    });
                }

                ModalView.showToast(`${items.length} item(s) adicionado(s)!`, 'success');
                if (isImport) ModalView.closeImportModal();
                else { const el = document.getElementById('ai-input'); if (el) el.value = ''; }
                DashboardView.setOllamaStatus(true);
            },
            onError: () => {
                ModalView.showToast("Erro: Ollama offline. Corre '$env:OLLAMA_ORIGINS=\"*\"; ollama serve' no terminal.", 'error');
                DashboardView.setOllamaStatus(false);
            },
            onEnd: () => {
                if (isImport) ModalView.setImportLoading(false);
                else ModalView.setAILoading(false);
            }
        });
    }
}
