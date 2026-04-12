/**
 * NavigationController — gere o filtro de mês, as tabs (Painel/Clientes/Análise),
 * o modo escuro, o toggle Pessoal/Partilhado e os botões de fecho de modais inline.
 */
import { currentMonthKey } from '../config.js';
import { state } from '../state.js';

export class NavigationController {
    /**
     * @param {{ onMonthChange: function, onModeChange: function, onAnalyticsTab: function }} options
     */
    constructor({ onMonthChange, onModeChange, onAnalyticsTab }) {
        this.onMonthChange  = onMonthChange;
        this.onModeChange   = onModeChange;
        this.onAnalyticsTab = onAnalyticsTab;
    }

    /** Inicializa todos os controlos de navegação */
    init() {
        this._initMonthFilter();
        this._bindTabButtons();
        this._bindModalCloseButtons();
        this._bindDarkModeToggle();
        this._bindModeToggle();
        this._restoreDarkMode();
    }

    /** Devolve o valor do filtro de mês activo no formato 'YYYY-MM' */
    getSelectedMonth() {
        return document.getElementById('month-filter')?.value || currentMonthKey;
    }

    /**
     * Popula o select de mês com os 6 meses anteriores + 24 futuros
     * e regista o listener de mudança.
     */
    _initMonthFilter() {
        const monthFilter = document.getElementById('month-filter');
        if (!monthFilter) return;

        const now = new Date();
        for (let i = -6; i <= 24; i++) {
            const d   = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const key = d.toISOString().slice(0, 7);
            const opt = document.createElement('option');
            opt.value    = key;
            opt.selected = (key === currentMonthKey);
            opt.innerText = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
            monthFilter.appendChild(opt);
        }

        monthFilter.onchange = () => {
            if (this.onMonthChange) this.onMonthChange();
        };
    }

    /** Remove os atributos onclick das tabs e regista listeners limpos */
    _bindTabButtons() {
        const tabDash      = document.getElementById('tab-dashboard');
        const tabClients   = document.getElementById('tab-clients');
        const tabAnalytics = document.getElementById('tab-analytics');

        if (tabDash) {
            tabDash.removeAttribute('onclick');
            tabDash.onclick = () => this.switchTab('dashboard');
        }
        if (tabClients) {
            tabClients.removeAttribute('onclick');
            tabClients.onclick = () => this.switchTab('clients');
        }
        if (tabAnalytics) {
            tabAnalytics.removeAttribute('onclick');
            tabAnalytics.onclick = () => this.switchTab('analytics');
        }
    }

    /**
     * Muda a tab activa, mostrando/ocultando as secções correspondentes.
     * @param {'dashboard'|'clients'|'analytics'} tab
     */
    switchTab(tab) {
        const dashboard        = document.getElementById('app-content');
        const clientsSection   = document.getElementById('clients-section');
        const analyticsSection = document.getElementById('analytics-section');
        const tabDash          = document.getElementById('tab-dashboard');
        const tabClients       = document.getElementById('tab-clients');
        const tabAnalytics     = document.getElementById('tab-analytics');

        const active   = ['bg-indigo-600', 'text-white', 'shadow-sm'];
        const inactive = ['text-slate-500', 'hover:bg-slate-100'];

        // Oculta todas as secções
        [dashboard, clientsSection, analyticsSection].forEach(s => s?.classList.add('hidden'));
        // Remove estado activo de todos os tabs
        [tabDash, tabClients, tabAnalytics].forEach(t => {
            t?.classList.remove(...active);
            t?.classList.add(...inactive);
        });

        if (tab === 'dashboard') {
            dashboard?.classList.remove('hidden');
            tabDash?.classList.add(...active);
            tabDash?.classList.remove(...inactive);
        } else if (tab === 'clients') {
            clientsSection?.classList.remove('hidden');
            tabClients?.classList.add(...active);
            tabClients?.classList.remove(...inactive);
        } else {
            analyticsSection?.classList.remove('hidden');
            tabAnalytics?.classList.add(...active);
            tabAnalytics?.classList.remove(...inactive);
            if (this.onAnalyticsTab) this.onAnalyticsTab();
        }
    }

    /** Regista o listener do botão de toggle de modo escuro */
    _bindDarkModeToggle() {
        const btn = document.getElementById('dark-mode-toggle');
        if (!btn) return;
        btn.onclick = () => this.toggleDarkMode();
    }

    /** Alterna o modo escuro e persiste a preferência no localStorage */
    toggleDarkMode() {
        state.darkMode = !state.darkMode;
        document.documentElement.classList.toggle('dark', state.darkMode);
        localStorage.setItem('nt-dark-mode', state.darkMode ? '1' : '0');
        const btn  = document.getElementById('dark-mode-toggle');
        if (btn)  btn.title = state.darkMode ? 'Modo Claro' : 'Modo Escuro';
        const icon = document.getElementById('dark-mode-icon');
        if (icon) icon.innerText = state.darkMode ? '☀️' : '🌙';
    }

    /** Restaura o modo escuro guardado no localStorage ao iniciar */
    _restoreDarkMode() {
        const saved = localStorage.getItem('nt-dark-mode');
        if (saved === '1') {
            state.darkMode = true;
            document.documentElement.classList.add('dark');
            const icon = document.getElementById('dark-mode-icon');
            if (icon) icon.innerText = '☀️';
        }
    }

    /** Regista os listeners dos botões Pessoal / Partilhado na navbar */
    _bindModeToggle() {
        const btnPersonal = document.getElementById('btn-mode-personal');
        const btnShared   = document.getElementById('btn-mode-shared');

        if (btnPersonal) {
            btnPersonal.onclick = () => this._setMode('personal');
        }
        if (btnShared) {
            btnShared.onclick = () => {
                if (!state.sharedSpaceId) {
                    // Espaço partilhado está na sidebar — muda para o painel e faz scroll
                    this.switchTab('dashboard');
                    setTimeout(() => {
                        document.getElementById('btn-create-space')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 150);
                    return;
                }
                this._setMode('shared');
            };
        }
    }

    /**
     * Aplica o modo de visualização (pessoal/partilhado) e actualiza os botões.
     * @param {'personal'|'shared'} mode
     */
    _setMode(mode) {
        state.viewMode = mode;
        const btnPersonal = document.getElementById('btn-mode-personal');
        const btnShared   = document.getElementById('btn-mode-shared');
        const active   = ['bg-indigo-600', 'text-white'];
        const inactive = ['text-slate-500', 'hover:bg-slate-100'];

        if (mode === 'personal') {
            btnPersonal?.classList.add(...active);
            btnPersonal?.classList.remove(...inactive);
            btnShared?.classList.remove(...active);
            btnShared?.classList.add(...inactive);
        } else {
            btnShared?.classList.add(...active);
            btnShared?.classList.remove(...inactive);
            btnPersonal?.classList.remove(...active);
            btnPersonal?.classList.add(...inactive);
        }

        if (this.onModeChange) this.onModeChange(mode);
    }

    /**
     * Remove atributos onclick inline dos botões de fechar modais e
     * substitui por listeners limpos, evitando referências a funções globais.
     */
    _bindModalCloseButtons() {
        const openImportBtn = document.querySelector('[onclick="openImportModal()"]');
        if (openImportBtn) {
            openImportBtn.removeAttribute('onclick');
            openImportBtn.onclick = () => document.getElementById('import-modal')?.classList.remove('hidden');
        }

        const closeImportBtn = document.querySelector('[onclick="closeImportModal()"]');
        if (closeImportBtn) {
            closeImportBtn.removeAttribute('onclick');
            closeImportBtn.onclick = () => {
                document.getElementById('import-modal')?.classList.add('hidden');
                const textEl = document.getElementById('import-text');
                if (textEl) textEl.value = '';
            };
        }

        const closeSummaryBtn = document.querySelector('#summary-modal button[onclick]');
        if (closeSummaryBtn) {
            closeSummaryBtn.removeAttribute('onclick');
            closeSummaryBtn.onclick = () => document.getElementById('summary-modal')?.classList.add('hidden');
        }

        const closeProfileBtn = document.querySelector('[onclick="closeProfileModal()"]');
        if (closeProfileBtn) {
            closeProfileBtn.removeAttribute('onclick');
            closeProfileBtn.onclick = () => document.getElementById('profile-modal')?.classList.add('hidden');
        }
    }
}
