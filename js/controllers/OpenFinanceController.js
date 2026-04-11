import { OpenFinanceService } from '../services/OpenFinanceService.js';
import { ModalView } from '../views/ModalView.js';
import { pluggyConfig } from '../config.js';

const PLUGGY_CONNECT_SDK = 'https://cdn.pluggy.ai/pluggy-connect/v2.1.10/pluggy-connect.min.js';

export class OpenFinanceController {
    constructor({ onImport }) {
        this.onImport = onImport;
        this._itemId   = null;
        this._accounts = [];
    }

    init() {
        document.getElementById('btn-open-finance')?.addEventListener('click', () => this.openModal());
        document.getElementById('openfinance-connect-btn')?.addEventListener('click', () => this._connectBank());
        document.getElementById('openfinance-import-btn')?.addEventListener('click', () => this._importSelected());
        document.getElementById('openfinance-disconnect-btn')?.addEventListener('click', () => this._disconnect());
        document.getElementById('openfinance-modal-close')?.addEventListener('click', () => this.closeModal());

        // Inicializa datas do período (mês corrente)
        const now = new Date();
        const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
        const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
        const fromEl = document.getElementById('openfinance-date-from');
        const toEl   = document.getElementById('openfinance-date-to');
        if (fromEl) fromEl.value = `${y}-${m}-01`;
        if (toEl)   toEl.value   = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    }

    openModal() {
        document.getElementById('openfinance-modal')?.classList.remove('hidden');
        this._syncUI();
        this._checkConfig();
    }

    closeModal() {
        document.getElementById('openfinance-modal')?.classList.add('hidden');
    }

    _checkConfig() {
        const warning = document.getElementById('openfinance-config-warning');
        if (!warning) return;
        const missing = !pluggyConfig.clientId || !pluggyConfig.clientSecret;
        warning.classList.toggle('hidden', !missing);
    }

    _syncUI() {
        const stepConnect  = document.getElementById('openfinance-step-connect');
        const stepAccounts = document.getElementById('openfinance-step-accounts');

        if (this._itemId && this._accounts.length) {
            stepConnect?.classList.add('hidden');
            stepAccounts?.classList.remove('hidden');
            this._renderAccounts();
        } else {
            stepConnect?.classList.remove('hidden');
            stepAccounts?.classList.add('hidden');
        }
    }

    _renderAccounts() {
        const list = document.getElementById('openfinance-accounts-list');
        if (!list) return;
        list.innerHTML = this._accounts.map(acc => {
            const balance = (acc.balance || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const typeLabel = { BANK: 'Conta Corrente', SAVINGS: 'Poupança', CREDIT: 'Cartão de Crédito' }[acc.type] || acc.type;
            return `
                <label class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-indigo-50 transition-colors border border-transparent hover:border-indigo-100">
                    <input type="checkbox" value="${acc.id}" data-bank="${acc.name}" class="openfinance-acc-check w-4 h-4 accent-indigo-600" checked>
                    <div class="flex-1 min-w-0">
                        <div class="font-semibold text-sm text-slate-800 truncate">${acc.name}</div>
                        <div class="text-xs text-slate-400">${typeLabel}</div>
                    </div>
                    <span class="text-sm font-bold text-slate-700 shrink-0">${balance}</span>
                </label>`;
        }).join('');
    }

    async _connectBank() {
        const btn    = document.getElementById('openfinance-connect-btn');
        const status = document.getElementById('openfinance-status');

        const setStatus = (msg) => { if (status) status.innerText = msg; };

        try {
            if (btn) { btn.disabled = true; btn.innerText = 'A conectar...'; }
            setStatus('A autenticar com Pluggy...');

            const connectToken = await OpenFinanceService.getConnectToken();
            setStatus('A abrir janela segura do banco...');

            await this._loadPluggySDK();

            new window.PluggyConnect({
                connectToken,
                onSuccess: async ({ item }) => {
                    this._itemId = item.id;
                    setStatus('Banco ligado! A carregar contas...');
                    this._accounts = await OpenFinanceService.getAccounts(item.id);
                    this._syncUI();
                    setStatus(`${this._accounts.length} conta(s) ligada(s). Seleciona e importa.`);
                },
                onError: ({ error }) => {
                    ModalView.showToast('Erro na conexão: ' + error, 'error');
                    setStatus('Erro ao conectar. Tenta novamente.');
                },
                onClose: () => {
                    if (!this._itemId) setStatus('');
                }
            }).init();

        } catch (e) {
            ModalView.showToast(e.message, 'error');
            setStatus('');
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = 'Conectar Banco'; }
        }
    }

    _loadPluggySDK() {
        return new Promise((resolve, reject) => {
            if (window.PluggyConnect) { resolve(); return; }
            const s = document.createElement('script');
            s.src = PLUGGY_CONNECT_SDK;
            s.onload  = resolve;
            s.onerror = () => reject(new Error('Não foi possível carregar o SDK do Pluggy.'));
            document.head.appendChild(s);
        });
    }

    _disconnect() {
        this._itemId   = null;
        this._accounts = [];
        this._syncUI();
        const status = document.getElementById('openfinance-status');
        if (status) status.innerText = '';
    }

    async _importSelected() {
        const checked = [...document.querySelectorAll('.openfinance-acc-check:checked')];
        if (!checked.length) { ModalView.showToast('Seleciona pelo menos uma conta.', 'error'); return; }

        const from = document.getElementById('openfinance-date-from')?.value;
        const to   = document.getElementById('openfinance-date-to')?.value;
        if (!from || !to) { ModalView.showToast('Define o período de importação.', 'error'); return; }
        if (from > to)    { ModalView.showToast('A data inicial não pode ser posterior à final.', 'error'); return; }

        const btn    = document.getElementById('openfinance-import-btn');
        const status = document.getElementById('openfinance-status');

        try {
            if (btn) { btn.disabled = true; btn.innerText = 'A importar...'; }
            if (status) status.innerText = 'A buscar transações...';

            let all = [];
            for (const el of checked) {
                const txns = await OpenFinanceService.getTransactions(el.value, from, to);
                all = [...all, ...txns.map(t => OpenFinanceService.normalize(t, el.dataset.bank || ''))];
            }

            if (!all.length) {
                ModalView.showToast('Nenhuma transação encontrada no período.', 'error');
                return;
            }

            if (status) status.innerText = `${all.length} transação(ões) encontrada(s).`;

            // Preview das primeiras 15; se mais, indica o total real
            const preview = all.slice(0, 15);
            if (all.length > 15) {
                preview.push({ desc: `... e mais ${all.length - 15} transação(ões)`, amount: 0, category: 'Outros', method: 'Dinheiro/Pix', bank: '' });
            }

            const confirmed = await ModalView.openAIConfirmModal(preview);
            if (!confirmed) { ModalView.showToast('Importação cancelada.'); return; }

            for (const t of all) {
                if (t.amount > 0) await this.onImport(t);
            }

            ModalView.showToast(`${all.length} transação(ões) importada(s) com sucesso!`, 'success');
            this.closeModal();
        } catch (e) {
            ModalView.showToast(e.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = 'Importar Transações'; }
            if (status) status.innerText = '';
        }
    }
}
