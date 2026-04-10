import { currentMonthKey } from '../config.js';

export class NavigationController {
    constructor({ onMonthChange }) {
        this.onMonthChange = onMonthChange;
    }

    init() {
        this._initMonthFilter();
        this._bindTabButtons();
        this._bindModalCloseButtons();
    }

    getSelectedMonth() {
        return document.getElementById('month-filter')?.value || currentMonthKey;
    }

    _initMonthFilter() {
        const monthFilter = document.getElementById('month-filter');
        if (!monthFilter) return;

        const now = new Date();
        for (let i = -2; i <= 24; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const key = d.toISOString().slice(0, 7);
            const opt = document.createElement('option');
            opt.value = key;
            opt.selected = (key === currentMonthKey);
            opt.innerText = d.toLocaleDateString('pt-pt', { month: 'long', year: 'numeric' });
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

    _bindModalCloseButtons() {
        // Import modal
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

        // Summary modal close
        const closeSummaryBtn = document.querySelector('#summary-modal button[onclick]');
        if (closeSummaryBtn) {
            closeSummaryBtn.removeAttribute('onclick');
            closeSummaryBtn.onclick = () => document.getElementById('summary-modal')?.classList.add('hidden');
        }

        // Profile modal buttons (save & logout will be wired by AuthController)
        const closeProfileBtn = document.querySelector('[onclick="closeProfileModal()"]');
        if (closeProfileBtn) {
            closeProfileBtn.removeAttribute('onclick');
            closeProfileBtn.onclick = () => document.getElementById('profile-modal')?.classList.add('hidden');
        }
    }
}
