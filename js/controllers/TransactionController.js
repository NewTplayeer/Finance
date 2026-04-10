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

    startSync() {
        const uid = state.currentUser?.uid;
        if (!uid) return;

        if (state.unsubscribeTrans) state.unsubscribeTrans();

        state.unsubscribeTrans = TransactionModel.subscribe(uid, (data) => {
            state.transactions = data;
            this.refreshDashboard();
        });
    }

    stopSync() {
        if (state.unsubscribeTrans) { state.unsubscribeTrans(); state.unsubscribeTrans = null; }
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
    }

    async togglePaid(id) {
        const uid = state.currentUser?.uid;
        if (!uid) return;
        const item = state.transactions.find(t => t.id === id);
        if (item) await TransactionModel.togglePaid(uid, item);
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
        if (uid) await TransactionModel.delete(uid, id);
    }

    async clearAll() {
        const uid = state.currentUser?.uid;
        if (uid) await TransactionModel.clearAll(uid, state.transactions);
    }

    async addTransaction(data) {
        const uid = state.currentUser?.uid;
        if (uid) await TransactionModel.add(uid, data);
    }

    _bindManualForm() {
        const form = document.getElementById('finance-form');
        if (!form) return;
        form.onsubmit = async (e) => {
            e.preventDefault();
            const desc = document.getElementById('desc')?.value;
            const amount = parseFloat(document.getElementById('amount')?.value || 0);
            const category = document.getElementById('category')?.value;
            const method = document.getElementById('method')?.value;
            const bank = document.getElementById('bank-input')?.value;
            if (desc && amount) {
                await this.addTransaction({ desc, amount, category, method, bank, dateKey: this.getSelectedMonth() });
                form.reset();
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
            if (!inputEl?.value) return;
            await this._processAI(inputEl.value, false);
        };
    }

    _bindImportModal() {
        const importBtn = document.getElementById('import-process-btn');
        if (!importBtn) return;
        importBtn.onclick = async () => {
            const text = document.getElementById('import-text')?.value;
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
                    navigator.clipboard.writeText(contentEl.innerText).then(() => ModalView.showToast("Copiado com sucesso!"));
                }
            };
        }
    }

    async _processAI(text, isImport) {
        if (isImport) ModalView.setImportLoading(true);
        else ModalView.setAILoading(true);

        await AIService.process(text, {
            onSuccess: async (data) => {
                if (data.items) {
                    for (const i of data.items) {
                        await this.addTransaction({
                            desc: i.desc,
                            amount: parseFloat(i.total || i.valor || i.amount || 0),
                            category: i.category || "Outros",
                            method: i.method || "Dinheiro/Pix",
                            dateKey: currentMonthKey,
                            bank: i.bank || ""
                        });
                    }
                }
                ModalView.showToast("Processado com sucesso!");
                if (isImport) ModalView.closeImportModal();
                else { const el = document.getElementById('ai-input'); if (el) el.value = ''; }
                DashboardView.setOllamaStatus(true);
            },
            onError: () => {
                ModalView.showToast("Erro de Ligação: Corre '$env:OLLAMA_ORIGINS=\"*\"; ollama serve' no terminal.");
                DashboardView.setOllamaStatus(false);
            },
            onEnd: () => {
                if (isImport) ModalView.setImportLoading(false);
                else ModalView.setAILoading(false);
            }
        });
    }
}
