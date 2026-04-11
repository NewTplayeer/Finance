import { currentMonthKey } from '../config.js';
import { state } from '../state.js';

export class NavigationController {
    constructor({ onMonthChange, onModeChange }) {
        this.onMonthChange = onMonthChange;
        this.onModeChange = onModeChange;
    }

    init() {
        this._initMonthFilter();
        this._bindTabButtons();
        this._bindModalCloseButtons();
        this._bindDarkModeToggle();
        this._bindModeToggle();
        this._restoreDarkMode();
    }

    getSelectedMonth() {
        return document.getElementById('month-filter')?.value || currentMonthKey;
    }

    _initMonthFilter() {
        const monthFilter = document.getElementById('month-filter');
        if (!monthFilter) return;

        const now = new Date();
        for (let i = -6; i <= 24; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const key = d.toISOString().slice(0, 7);
            const opt = document.createElement('option');
            opt.value = key;
            opt.selected = (key === currentMonthKey);
            opt.innerText = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
            monthFilter.appendChild(opt);
        }

        monthFilter.onchange = () => {
            if (this.onMonthChange) this.onMonthChange();
        };
    }

    _bindTabButtons() {
        const tabDash = document.getElementById('tab-dashboard');
        const tabClients = document.getElementById('tab-clients');

        if (tabDash) {
            tabDash.removeAttribute('onclick');
            tabDash.onclick = () => this.switchTab('dashboard');
        }
        if (tabClients) {
            tabClients.removeAttribute('onclick');
            tabClients.onclick = () => this.switchTab('clients');
        }
    }

    switchTab(tab) {
        const dashboard = document.getElementById('app-content');
        const clientsSection = document.getElementById('clients-section');
        const tabDash = document.getElementById('tab-dashboard');
        const tabClients = document.getElementById('tab-clients');
        const active = ['bg-indigo-600', 'text-white', 'shadow-sm'];
        const inactive = ['text-slate-500', 'hover:bg-slate-100'];

        if (tab === 'dashboard') {
            dashboard?.classList.remove('hidden');
            clientsSection?.classList.add('hidden');
            tabDash?.classList.add(...active);
            tabDash?.classList.remove(...inactive);
            tabClients?.classList.remove(...active);
            tabClients?.classList.add(...inactive);
        } else {
            dashboard?.classList.add('hidden');
            clientsSection?.classList.remove('hidden');
            tabDash?.classList.remove(...active);
            tabDash?.classList.add(...inactive);
            tabClients?.classList.add(...active);
            tabClients?.classList.remove(...inactive);
        }
    }

    _bindDarkModeToggle() {
        const btn = document.getElementById('dark-mode-toggle');
        if (!btn) return;
        btn.onclick = () => this.toggleDarkMode();
    }

    toggleDarkMode() {
        state.darkMode = !state.darkMode;
        document.documentElement.classList.toggle('dark', state.darkMode);
        localStorage.setItem('nt-dark-mode', state.darkMode ? '1' : '0');
        const btn = document.getElementById('dark-mode-toggle');
        if (btn) btn.title = state.darkMode ? 'Modo Claro' : 'Modo Escuro';
        const icon = document.getElementById('dark-mode-icon');
        if (icon) icon.innerText = state.darkMode ? '☀️' : '🌙';
    }

    _restoreDarkMode() {
        const saved = localStorage.getItem('nt-dark-mode');
        if (saved === '1') {
            state.darkMode = true;
            document.documentElement.classList.add('dark');
            const icon = document.getElementById('dark-mode-icon');
            if (icon) icon.innerText = '☀️';
        }
    }

    _bindModeToggle() {
        const btnPersonal = document.getElementById('btn-mode-personal');
        const btnShared = document.getElementById('btn-mode-shared');

        if (btnPersonal) {
            btnPersonal.onclick = () => this._setMode('personal');
        }
        if (btnShared) {
            btnShared.onclick = () => {
                if (!state.sharedSpaceId) {
                    // Mostra modal do perfil para configurar espaço partilhado
                    document.getElementById('nav-avatar')?.click();
                    setTimeout(() => {
                        document.getElementById('shared-space-tab')?.scrollIntoView({ behavior: 'smooth' });
                    }, 300);
                    return;
                }
                this._setMode('shared');
            };
        }
    }

    _setMode(mode) {
        state.viewMode = mode;
        const btnPersonal = document.getElementById('btn-mode-personal');
        const btnShared = document.getElementById('btn-mode-shared');
        const active = ['bg-indigo-600', 'text-white'];
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
