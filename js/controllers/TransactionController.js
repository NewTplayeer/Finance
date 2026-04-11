import { TransactionModel } from '../models/TransactionModel.js';
import { AIService } from '../services/AIService.js';
import { DashboardView } from '../views/DashboardView.js';
import { ModalView } from '../views/ModalView.js';
import { state } from '../state.js';
import { currentMonthKey } from '../config.js';

export class TransactionController {
    constructor({ getSelectedMonth }) {
        this.getSelectedMonth = getSelectedMonth;
    }

    init() {
        this._bindManualForm();
        this._bindAIInput();
        this._bindImportModal();
        this._bindSummaryActions();
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
            onDelete: (id) => this.confirmDelete(id)
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
            const desc = document.getElementById('desc')?.value?.trim();
            const amount = parseFloat(document.getElementById('amount')?.value || 0);
            const category = document.getElementById('category')?.value;
            const method = document.getElementById('method')?.value;
            const bank = document.getElementById('bank-input')?.value?.trim();
            const installments = parseInt(document.getElementById('installments')?.value || 1);
            const clientId = document.getElementById('client-id-select')?.value || "";

            if (!desc || !amount || amount <= 0) {
                ModalView.showToast("Preenche a descrição e o valor.", 'error');
                return;
            }

            await this.addTransaction({
                desc, amount, category, method, bank,
                installments: installments > 1 ? installments : 1,
                clientId,
                dateKey: this.getSelectedMonth()
            });
            form.reset();
            ModalView.showToast("Transação guardada!", 'success');
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
