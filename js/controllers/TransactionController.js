/**
 * TransactionController — gere o CRUD de transações, o dashboard e o processamento IA.
 * É o controller central da aplicação.
 */
import { TransactionModel } from '../models/TransactionModel.js';
import { AIService } from '../services/AIService.js';
import { StatementParser } from '../services/StatementParser.js';
import { DashboardView } from '../views/DashboardView.js';
import { ModalView } from '../views/ModalView.js';
import { UserModel } from '../models/UserModel.js';
import { ReportService } from '../services/ReportService.js';
import { state } from '../state.js';
import { currentMonthKey, DEFAULT_CATEGORIES, DEFAULT_METHODS } from '../config.js';

export class TransactionController {
    /**
     * @param {{ getSelectedMonth: function }} options
     */
    constructor({ getSelectedMonth }) {
        this.getSelectedMonth = getSelectedMonth;
    }

    /** Inicializa todos os event listeners do controller */
    init() {
        this._currentSort = 'newest';
        this._bindManualForm();
        this._bindAIInput();
        this._bindImportModal();
        this._bindSummaryActions();
        this._bindEditModal();
        this._bindInlineCategoryAdd();
        this._bindCategoriesManager();
        this._bindSortButtons();
        this._bindPdfReport();
        this.refreshMethodSelectors();
        // Pré-preenche campo de data com hoje
        const dateEl = document.getElementById('transaction-date');
        if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
    }

    /**
     * Popula os <select> de método com os métodos padrão + personalizados.
     * Chama-se após login e sempre que um método é adicionado/removido.
     */
    refreshMethodSelectors() {
        const allMethods = [...DEFAULT_METHODS, ...state.customMethods];
        ['method', 'edit-method'].forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            const current = sel.value;
            sel.innerHTML = allMethods.map(m =>
                `<option value="${m}"${m === current ? ' selected' : ''}>${m}</option>`
            ).join('');
            if (current && allMethods.includes(current)) sel.value = current;
        });
    }

    /**
     * Popula todos os <select> de categoria com as categorias padrão + personalizadas.
     * Chama-se após login e sempre que uma nova categoria é adicionada/editada/removida.
     */
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
        this._renderCategoriesManager();
    }

    /** Regista os listeners do botão "+" inline para adicionar nova categoria no formulário */
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

    /** Devolve o spaceId activo (null se modo pessoal) */
    _activeSpaceId() {
        return (state.viewMode === 'shared' && state.sharedSpaceId) ? state.sharedSpaceId : null;
    }

    /** Inicia a sincronização em tempo real com o Firestore */
    startSync() {
        const uid = state.currentUser?.uid;
        if (!uid) return;

        if (state.unsubscribeTrans) state.unsubscribeTrans();

        state.unsubscribeTrans = TransactionModel.subscribe(uid, (data) => {
            state.transactions = data;
            this.refreshDashboard();
        }, this._activeSpaceId());
    }

    /** Para a sincronização activa */
    stopSync() {
        if (state.unsubscribeTrans) { state.unsubscribeTrans(); state.unsubscribeTrans = null; }
    }

    /** Reinicia o sync quando muda de modo (pessoal/partilhado) */
    restartSync() {
        this.stopSync();
        this.startSync();
    }

    /** Actualiza todos os widgets do dashboard com os dados do mês seleccionado */
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
            onDelete:     (id) => this.confirmDelete(id),
            onEdit:       (id) => this.editTransaction(id)
        }, this._currentSort || 'newest');

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

    /** Actualiza o select de clientes no formulário manual */
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

    /**
     * Alterna o estado pago/pendente de uma transação.
     * @param {string} id - ID da transação
     */
    async togglePaid(id) {
        const uid = state.currentUser?.uid;
        if (!uid) return;
        const item = state.transactions.find(t => t.id === id);
        if (item) await TransactionModel.togglePaid(uid, item, this._activeSpaceId());
    }

    /**
     * Abre o modal de confirmação para apagar uma transação.
     * @param {string} id
     */
    confirmDelete(id) {
        ModalView.openConfirmModal({
            title: "Confirmar",
            message: "Desejas apagar este registo?",
            confirmLabel: "Sim, eliminar",
            onConfirm: () => this.delete(id)
        });
    }

    /**
     * Apaga uma transação pelo ID.
     * @param {string} id
     */
    async delete(id) {
        const uid = state.currentUser?.uid;
        if (uid) await TransactionModel.delete(uid, id, this._activeSpaceId());
    }

    /** Apaga todas as transações do utilizador (ou espaço partilhado activo) */
    async clearAll() {
        const uid = state.currentUser?.uid;
        if (uid) await TransactionModel.clearAll(uid, state.transactions, this._activeSpaceId());
    }

    /**
     * Adiciona uma transação ao Firestore.
     * @param {Object} data - campos da transação (desc, amount, category, method, bank, place, etc.)
     */
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

    /** Regista o submit do formulário manual de transações */
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
            const place        = document.getElementById('place-input')?.value?.trim() || '';
            const rawInstall   = document.getElementById('installments')?.value;
            const installments = Math.max(1, parseInt(rawInstall, 10) || 1);
            const clientId     = document.getElementById('client-id-select')?.value || "";
            const date         = document.getElementById('transaction-date')?.value
                                 || new Date().toISOString().slice(0, 10);

            if (!desc || amount <= 0) {
                ModalView.showToast("Preenche a descrição e o valor.", 'error');
                return;
            }

            const dateKey = this.getSelectedMonth();
            await this.addTransaction({ desc, amount, category, method, bank, place, installments, clientId, dateKey, date });
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

    /** Regista o listener do botão de processamento IA no painel principal */
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

    /** Regista todos os listeners do modal de importação (texto, CSV e PDF) */
    _bindImportModal() {
        let _csvItems    = [];   // transações parseadas do CSV aguardando confirmação
        let _pdfFile     = null; // ficheiro PDF seleccionado

        /* ── Lógica de tabs ─────────────────────────────────────────── */
        const switchImportTab = (tab) => {
            ['text', 'csv', 'pdf'].forEach(t => {
                document.getElementById(`import-tab-${t}`)?.classList.toggle('hidden', t !== tab);
            });
            // Alterna botões de acção
            document.querySelectorAll('.import-action-btn').forEach(btn => {
                btn.classList.toggle('hidden', btn.dataset.forTab !== tab);
            });
            // Estilo dos botões de tab
            document.querySelectorAll('.import-tab-btn').forEach(btn => {
                const active = btn.dataset.importTab === tab;
                btn.classList.toggle('bg-white',      active);
                btn.classList.toggle('text-slate-900', active);
                btn.classList.toggle('shadow-sm',      active);
                btn.classList.toggle('text-slate-500', !active);
                btn.classList.toggle('hover:bg-slate-50', !active);
            });
        };

        document.querySelectorAll('.import-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => switchImportTab(btn.dataset.importTab));
        });

        /* ── Tab Texto: processar com IA ────────────────────────────── */
        const textBtn = document.getElementById('import-process-btn');
        if (textBtn) {
            textBtn.onclick = async () => {
                const text = document.getElementById('import-text')?.value?.trim();
                if (text) await this._processAI(text, true);
            };
        }

        /* ── Tab CSV ────────────────────────────────────────────────── */
        const csvInput    = document.getElementById('csv-file-input');
        const csvImportBtn = document.getElementById('csv-import-btn');
        const csvClearBtn  = document.getElementById('csv-clear-btn');
        const csvPreview   = document.getElementById('csv-preview');
        const csvPreviewList = document.getElementById('csv-preview-list');
        const csvCount     = document.getElementById('csv-count');
        const fmt          = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const renderCSVPreview = (items) => {
            _csvItems = items;
            if (!csvPreview || !csvPreviewList || !csvCount) return;
            csvCount.textContent = items.length;
            csvPreviewList.innerHTML = items.map(i => `
                <div class="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl gap-2">
                    <div class="flex-1 min-w-0">
                        <div class="text-xs font-semibold text-slate-800 truncate">${i.desc}</div>
                        <div class="text-[10px] text-slate-400">${i.date} · ${i.category}${i.bank ? ' · ' + i.bank : ''}</div>
                    </div>
                    <div class="text-xs font-bold text-slate-900 shrink-0">${fmt(i.amount)}</div>
                </div>
            `).join('');
            csvPreview.classList.remove('hidden');
            if (csvImportBtn) {
                csvImportBtn.textContent = `Importar ${items.length} transação(ões)`;
                csvImportBtn.classList.remove('hidden');
            }
        };

        const clearCSV = () => {
            _csvItems = [];
            if (csvInput)    csvInput.value    = '';
            if (csvPreview)  csvPreview.classList.add('hidden');
            if (csvImportBtn) csvImportBtn.classList.add('hidden');
        };

        const handleCSVFile = async (file) => {
            if (!file) return;
            const bank = document.getElementById('csv-bank-name')?.value?.trim() || '';
            try {
                const items = await StatementParser.parseCSV(file, bank);
                renderCSVPreview(items);
            } catch (err) {
                ModalView.showToast(err.message || 'Erro ao processar CSV.', 'error');
            }
        };

        csvInput?.addEventListener('change', () => handleCSVFile(csvInput.files?.[0]));
        csvClearBtn?.addEventListener('click', clearCSV);

        // Drag & drop na zona CSV
        const csvDropzone = document.getElementById('csv-dropzone');
        csvDropzone?.addEventListener('dragover',  (e) => { e.preventDefault(); csvDropzone.classList.add('border-indigo-400', 'bg-indigo-50/50'); });
        csvDropzone?.addEventListener('dragleave', ()  => csvDropzone.classList.remove('border-indigo-400', 'bg-indigo-50/50'));
        csvDropzone?.addEventListener('drop', (e) => {
            e.preventDefault();
            csvDropzone.classList.remove('border-indigo-400', 'bg-indigo-50/50');
            const file = e.dataTransfer?.files?.[0];
            if (file) handleCSVFile(file);
        });

        // Importar items CSV
        csvImportBtn?.addEventListener('click', async () => {
            if (!_csvItems.length) { ModalView.showToast('Selecciona um ficheiro CSV primeiro.', 'error'); return; }
            const confirmed = await ModalView.openAIConfirmModal(_csvItems);
            if (!confirmed) return;
            const month = this.getSelectedMonth();
            let count = 0;
            for (const item of _csvItems) {
                await this.addTransaction({
                    desc:     item.desc,
                    amount:   item.amount,
                    category: item.category,
                    method:   item.method,
                    bank:     item.bank,
                    date:     item.date,
                    dateKey:  item.date ? item.date.slice(0, 7) : month
                });
                count++;
            }
            ModalView.showToast(`${count} transação(ões) importada(s)!`, 'success');
            clearCSV();
            ModalView.closeImportModal();
        });

        /* ── Tab PDF ────────────────────────────────────────────────── */
        const pdfInput   = document.getElementById('pdf-file-input');
        const pdfInfo    = document.getElementById('pdf-file-info');
        const pdfName    = document.getElementById('pdf-file-name');
        const pdfSize    = document.getElementById('pdf-file-size');
        const pdfClear   = document.getElementById('pdf-clear-btn');
        const pdfLoader  = document.getElementById('pdf-loader');
        const pdfProcBtn = document.getElementById('pdf-process-btn');

        const showPDFFile = (file) => {
            _pdfFile = file;
            if (pdfInfo)  pdfInfo.classList.remove('hidden');
            if (pdfName)  pdfName.textContent = file.name;
            if (pdfSize)  pdfSize.textContent = (file.size / 1024).toFixed(0) + ' KB';
        };

        const clearPDF = () => {
            _pdfFile = null;
            if (pdfInput) pdfInput.value = '';
            if (pdfInfo)  pdfInfo.classList.add('hidden');
        };

        pdfInput?.addEventListener('change', () => { if (pdfInput.files?.[0]) showPDFFile(pdfInput.files[0]); });
        pdfClear?.addEventListener('click', clearPDF);

        // Drag & drop na zona PDF
        const pdfDropzone = document.getElementById('pdf-dropzone');
        pdfDropzone?.addEventListener('dragover',  (e) => { e.preventDefault(); pdfDropzone.classList.add('border-rose-400', 'bg-rose-50/30'); });
        pdfDropzone?.addEventListener('dragleave', ()  => pdfDropzone.classList.remove('border-rose-400', 'bg-rose-50/30'));
        pdfDropzone?.addEventListener('drop', (e) => {
            e.preventDefault();
            pdfDropzone.classList.remove('border-rose-400', 'bg-rose-50/30');
            const file = e.dataTransfer?.files?.[0];
            if (file?.type === 'application/pdf') showPDFFile(file);
            else ModalView.showToast('Por favor selecciona um ficheiro .PDF.', 'error');
        });

        // Extrair texto do PDF e enviar para a IA
        pdfProcBtn?.addEventListener('click', async () => {
            if (!_pdfFile) { ModalView.showToast('Selecciona um ficheiro PDF primeiro.', 'error'); return; }
            if (pdfLoader)  pdfLoader.classList.remove('hidden');
            if (pdfProcBtn) pdfProcBtn.disabled = true;
            try {
                ModalView.showToast('A extrair texto do PDF…', 'info');
                const text = await StatementParser.extractPDFText(_pdfFile);
                // Preenche o textarea da aba texto e processa com IA
                const textArea = document.getElementById('import-text');
                if (textArea) textArea.value = text;
                await this._processAI(text, true);
            } catch (err) {
                ModalView.showToast(err.message || 'Erro ao processar PDF.', 'error');
            } finally {
                if (pdfLoader)  pdfLoader.classList.add('hidden');
                if (pdfProcBtn) pdfProcBtn.disabled = false;
            }
        });
    }

    /**
     * Abre o modal de edição pré-preenchido com os dados da transação.
     * @param {string} id - ID da transação a editar
     */
    editTransaction(id) {
        const t = state.transactions.find(tx => tx.id === id);
        if (!t) return;

        this._editingId = id;
        this.refreshCategorySelectors();

        document.getElementById('edit-desc').value     = t.desc     || '';
        document.getElementById('edit-amount').value   = t.amount   || '';
        document.getElementById('edit-category').value = t.category || 'Outros';
        document.getElementById('edit-method').value   = t.method   || 'Dinheiro/Pix';
        document.getElementById('edit-bank').value     = t.bank     || '';
        const editPlace = document.getElementById('edit-place');
        if (editPlace) editPlace.value = t.place || '';
        const editDate = document.getElementById('edit-date');
        if (editDate) editDate.value = t.date
            || (t.createdAt ? t.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
        document.getElementById('edit-transaction-modal')?.classList.remove('hidden');
    }

    /** Regista os listeners dos botões Guardar e Cancelar do modal de edição */
    _bindEditModal() {
        document.getElementById('edit-save-btn')?.addEventListener('click', () => this._saveEdit());
        document.getElementById('edit-cancel-btn')?.addEventListener('click', () => {
            document.getElementById('edit-transaction-modal')?.classList.add('hidden');
        });
    }

    /** Guarda as alterações do modal de edição no Firestore */
    async _saveEdit() {
        if (!this._editingId) return;
        const uid = state.currentUser?.uid;
        if (!uid) return;

        const desc     = document.getElementById('edit-desc')?.value?.trim();
        const amount   = parseFloat(document.getElementById('edit-amount')?.value);
        const category = document.getElementById('edit-category')?.value;
        const method   = document.getElementById('edit-method')?.value;
        const bank     = document.getElementById('edit-bank')?.value?.trim();
        const place    = document.getElementById('edit-place')?.value?.trim() || '';
        const date     = document.getElementById('edit-date')?.value || '';

        if (!desc || amount <= 0) {
            ModalView.showToast('Preenche a descrição e o valor.', 'error');
            return;
        }

        await TransactionModel.update(uid, this._editingId, { desc, amount, category, method, bank, place, date }, this._activeSpaceId());
        this._editingId = null;
        document.getElementById('edit-transaction-modal')?.classList.add('hidden');
        ModalView.showToast('Registo actualizado!', 'success');
    }

    /** Regista os listeners dos botões de ordenação do histórico */
    _bindSortButtons() {
        const activeCls   = ['bg-indigo-600', 'text-white', 'shadow-sm'];
        const inactiveCls = ['bg-slate-100',  'text-slate-500', 'hover:bg-slate-200'];

        const syncStyles = () => {
            document.querySelectorAll('.sort-btn').forEach(btn => {
                const isActive = btn.dataset.sort === this._currentSort;
                btn.classList.remove(...activeCls, ...inactiveCls);
                btn.classList.add(...(isActive ? activeCls : inactiveCls));
            });
        };

        syncStyles();

        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._currentSort = btn.dataset.sort;
                syncStyles();
                this.refreshDashboard();
            });
        });
    }

    /** Regista o listener do botão de gerar relatório PDF com filtro de datas */
    _bindPdfReport() {
        const btn = document.getElementById('btn-generate-pdf');
        if (!btn) return;
        btn.addEventListener('click', () => {
            const from = document.getElementById('pdf-date-from')?.value || '';
            const to   = document.getElementById('pdf-date-to')?.value   || '';
            ReportService.generate(state.transactions, { from, to }, state.userName || '');
        });
    }

    /** Regista os listeners dos botões "Resumo Mês" e "Copiar" */
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

    /**
     * Envia texto para o AIService e processa a resposta.
     * @param {string} text - texto a interpretar
     * @param {boolean} isImport - true se veio do modal de importação de extrato
     */
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

    /**
     * Regista os listeners do painel de gestão de categorias no dashboard.
     * Permite adicionar, editar (inline) e excluir categorias personalizadas.
     */
    _bindCategoriesManager() {
        const addBtn   = document.getElementById('btn-add-category-manager');
        const addInput = document.getElementById('new-category-manager-input');
        if (!addBtn || !addInput) return;

        const doAdd = async () => {
            const name = addInput.value.trim();
            if (!name) { ModalView.showToast('Escreve o nome da categoria.', 'error'); return; }
            const all = [...DEFAULT_CATEGORIES, ...state.customCategories];
            if (all.some(c => c.toLowerCase() === name.toLowerCase())) {
                ModalView.showToast('Essa categoria já existe.', 'error'); return;
            }
            state.customCategories = [...state.customCategories, name];
            const uid = state.currentUser?.uid;
            if (uid) await UserModel.savePrefs(uid, { customCategories: state.customCategories });
            addInput.value = '';
            this.refreshCategorySelectors();
            ModalView.showToast(`Categoria "${name}" adicionada!`, 'success');
        };

        addBtn.addEventListener('click', doAdd);
        addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
    }

    /** Renderiza o painel de gestão de categorias no dashboard. */
    _renderCategoriesManager() {
        const container = document.getElementById('categories-manager-list');
        if (!container) return;

        const allCats = [...DEFAULT_CATEGORIES, ...state.customCategories];

        container.innerHTML = allCats.map(cat => {
            const isDefault = DEFAULT_CATEGORIES.includes(cat);
            if (isDefault) {
                return `
                    <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50">
                        <span class="flex-1 text-sm text-slate-600 font-medium truncate">${cat}</span>
                        <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wide border border-slate-200 rounded-md px-1.5 py-0.5">Padrão</span>
                    </div>`;
            }
            return `
                <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50/60 border border-indigo-100 group" data-cat-name="${this._esc(cat)}">
                    <span class="flex-1 text-sm text-slate-800 font-medium truncate cat-label">${cat}</span>
                    <input type="text" value="${this._esc(cat)}" class="cat-edit-input hidden flex-1 p-1 text-sm bg-white border border-indigo-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300">
                    <button class="cat-edit-btn shrink-0 text-slate-400 hover:text-indigo-600 transition text-xs font-bold px-1.5 py-1 rounded-lg hover:bg-indigo-100" title="Editar">✎</button>
                    <button class="cat-save-btn hidden shrink-0 text-xs font-bold px-2 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">OK</button>
                    <button class="cat-delete-btn shrink-0 text-slate-300 hover:text-rose-500 transition font-bold text-sm px-1" title="Excluir">✕</button>
                </div>`;
        }).join('');

        /* ---- Bind de edição inline ---- */
        container.querySelectorAll('[data-cat-name]').forEach(row => {
            const oldName   = row.dataset.catName;
            const label     = row.querySelector('.cat-label');
            const input     = row.querySelector('.cat-edit-input');
            const editBtn   = row.querySelector('.cat-edit-btn');
            const saveBtn   = row.querySelector('.cat-save-btn');
            const deleteBtn = row.querySelector('.cat-delete-btn');

            editBtn.addEventListener('click', () => {
                label.classList.add('hidden');
                input.classList.remove('hidden');
                saveBtn.classList.remove('hidden');
                editBtn.classList.add('hidden');
                input.focus();
                input.select();
            });

            const doSave = async () => {
                const newName = input.value.trim();
                if (!newName) { ModalView.showToast('O nome não pode estar vazio.', 'error'); return; }
                if (newName.toLowerCase() === oldName.toLowerCase()) {
                    // Sem mudança — cancela edição
                    label.classList.remove('hidden');
                    input.classList.add('hidden');
                    saveBtn.classList.add('hidden');
                    editBtn.classList.remove('hidden');
                    return;
                }
                const all = [...DEFAULT_CATEGORIES, ...state.customCategories];
                if (all.some(c => c.toLowerCase() === newName.toLowerCase() && c !== oldName)) {
                    ModalView.showToast('Já existe uma categoria com esse nome.', 'error'); return;
                }
                state.customCategories = state.customCategories.map(c => c === oldName ? newName : c);
                const uid = state.currentUser?.uid;
                if (uid) await UserModel.savePrefs(uid, { customCategories: state.customCategories });
                this.refreshCategorySelectors();
                ModalView.showToast(`Categoria renomeada para "${newName}".`, 'success');
            };

            saveBtn.addEventListener('click', doSave);
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSave(); });

            deleteBtn.addEventListener('click', () => {
                ModalView.openConfirmModal({
                    title: 'Excluir Categoria',
                    message: `Tens a certeza que queres excluir <strong>"${oldName}"</strong>?<br><span class="text-xs text-slate-400">Transações existentes com esta categoria não serão afectadas.</span>`,
                    confirmLabel: 'Sim, excluir',
                    onConfirm: async () => {
                        state.customCategories = state.customCategories.filter(c => c !== oldName);
                        const uid = state.currentUser?.uid;
                        if (uid) await UserModel.savePrefs(uid, { customCategories: state.customCategories });
                        this.refreshCategorySelectors();
                        ModalView.showToast(`Categoria "${oldName}" removida.`, 'success');
                    }
                });
            });
        });
    }

    /**
     * Escapa caracteres HTML para uso seguro em atributos.
     * @param {string} str
     * @returns {string}
     */
    _esc(str) {
        return (str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
}
