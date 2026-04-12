/**
 * AdminController — painel de administração da aplicação NT Finanças.
 * Visível apenas para utilizadores cujo e-mail consta em ADMIN_EMAILS (config.js).
 * Mostra métricas de uso, logs de sistema e lista completa de utilizadores.
 */
import { AdminModel } from '../models/AdminModel.js';
import { LogModel } from '../models/LogModel.js';
import { ADMIN_EMAILS } from '../config.js';
import { state } from '../state.js';
import { ModalView } from '../views/ModalView.js';

/** Formata data ISO para pt-BR legível */
const fmtDate = (iso) => iso
    ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

/** Rótulos e cores por tipo de log */
const LOG_LABELS = {
    user_registered:    { label: 'Registo',         color: 'bg-emerald-100 text-emerald-700' },
    user_login_email:   { label: 'Login e-mail',    color: 'bg-indigo-100 text-indigo-700'   },
    user_login_google:  { label: 'Login Google',    color: 'bg-blue-100 text-blue-700'       },
    user_logout:        { label: 'Logout',          color: 'bg-slate-100 text-slate-500'     },
    error:              { label: 'Erro',            color: 'bg-rose-100 text-rose-700'       },
};

export class AdminController {
    /** Inicializa o controller; regista listener do botão Actualizar */
    init() {
        document.getElementById('admin-section')?.addEventListener('refresh-admin', () => this.render());
    }

    /**
     * Verifica se o utilizador activo é admin e, se sim, mostra o tab Admin.
     * @param {import("firebase/auth").User} user
     */
    onLogin(user) {
        if (!this._isAdmin(user)) return;
        const tab = document.getElementById('tab-admin');
        if (tab) tab.classList.remove('hidden');
    }

    /** Oculta o tab Admin ao fazer logout */
    onLogout() {
        document.getElementById('tab-admin')?.classList.add('hidden');
        document.getElementById('admin-section')?.classList.add('hidden');
    }

    /**
     * Renderiza o painel de admin com métricas, logs e lista de utilizadores.
     * Chamado pelo NavigationController ao activar o tab Admin.
     */
    async render() {
        if (!this._isAdmin(state.currentUser)) return;

        // Mostra skeletons enquanto carrega
        this._showLoading();

        try {
            const [users, logs] = await Promise.all([
                AdminModel.getAllUsers(),
                LogModel.getLast(100)
            ]);

            this._renderMetrics(users, logs);
            this._renderLogs(logs);
            this._renderUsers(users);
        } catch (err) {
            console.error('AdminController.render:', err);
            ModalView.showToast('Erro ao carregar dados de admin.', 'error');
        }
    }

    /** Mostra indicadores de carregamento em todas as secções */
    _showLoading() {
        const loading = `<p class="text-xs text-slate-400 italic text-center py-6">A carregar…</p>`;
        ['admin-stats', 'admin-logs-list', 'admin-users-list'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = loading;
        });
    }

    /**
     * Renderiza os cards de métricas calculados a partir dos utilizadores e logs.
     * @param {Array} users
     * @param {Array} logs
     */
    _renderMetrics(users, logs) {
        const el = document.getElementById('admin-stats');
        if (!el) return;

        const today    = new Date().toISOString().slice(0, 10);
        const last7    = new Date(Date.now() - 7 * 864e5).toISOString();
        const last30   = new Date(Date.now() - 30 * 864e5).toISOString();

        const registeredToday  = users.filter(u => (u.createdAt  || '').startsWith(today)).length;
        const activeLastWeek   = users.filter(u => (u.lastLogin  || '') >= last7).length;
        const activeLastMonth  = users.filter(u => (u.lastLogin  || '') >= last30).length;
        const loginsToday      = logs.filter(l => l.type !== 'user_logout' && l.type !== 'error' && (l.timestamp || '').startsWith(today)).length;
        const errorsTotal      = logs.filter(l => l.type === 'error').length;

        el.innerHTML = `
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
                ${this._statCard('Utilizadores', users.length,          'text-indigo-700',  'bg-indigo-50 border-indigo-100')}
                ${this._statCard('Registos Hoje', registeredToday,      'text-emerald-700', 'bg-emerald-50 border-emerald-100')}
                ${this._statCard('Activos 7 dias', activeLastWeek,      'text-violet-700',  'bg-violet-50 border-violet-100')}
                ${this._statCard('Activos 30 dias', activeLastMonth,    'text-amber-700',   'bg-amber-50 border-amber-100')}
                ${this._statCard('Logins Hoje', loginsToday,            'text-blue-700',    'bg-blue-50 border-blue-100')}
            </div>
            ${errorsTotal > 0 ? `
                <div class="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3">
                    <span class="text-rose-500 font-bold text-lg">⚠️</span>
                    <span class="text-sm text-rose-700 font-semibold">${errorsTotal} erro(s) registado(s) nos logs do sistema.</span>
                </div>
            ` : ''}
        `;
    }

    /**
     * Renderiza a tabela de logs de sistema.
     * @param {Array} logs
     */
    _renderLogs(logs) {
        const el = document.getElementById('admin-logs-list');
        if (!el) return;

        if (!logs.length) {
            el.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-4">Sem logs registados.</p>`;
            return;
        }

        el.innerHTML = `
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="text-[10px] text-slate-400 uppercase font-bold border-b border-slate-100">
                            <th class="py-2 px-3 text-left">Tipo</th>
                            <th class="py-2 px-3 text-left">Utilizador</th>
                            <th class="py-2 px-3 text-left hidden sm:table-cell">E-mail</th>
                            <th class="py-2 px-3 text-left">Data/Hora</th>
                            <th class="py-2 px-3 text-left hidden lg:table-cell">Mensagem</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-50">
                        ${logs.map(log => {
                            const meta = LOG_LABELS[log.type] || { label: log.type, color: 'bg-slate-100 text-slate-500' };
                            return `
                                <tr class="hover:bg-slate-50/50 transition-colors">
                                    <td class="py-2 px-3">
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${meta.color}">${meta.label}</span>
                                    </td>
                                    <td class="py-2 px-3 font-medium text-slate-700 text-xs">${log.name || '—'}</td>
                                    <td class="py-2 px-3 text-slate-400 text-xs hidden sm:table-cell">${log.email || '—'}</td>
                                    <td class="py-2 px-3 text-slate-400 text-xs">${fmtDate(log.timestamp)}</td>
                                    <td class="py-2 px-3 text-slate-300 text-[10px] hidden lg:table-cell">${log.message || ''}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Renderiza a tabela de utilizadores registados.
     * @param {Array} users
     */
    _renderUsers(users) {
        const el = document.getElementById('admin-users-list');
        if (!el) return;

        if (!users.length) {
            el.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-4">Nenhum utilizador registado.</p>`;
            return;
        }

        el.innerHTML = `
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="text-[10px] text-slate-400 uppercase font-bold border-b border-slate-100">
                            <th class="py-3 px-4 text-left">Nome</th>
                            <th class="py-3 px-4 text-left">E-mail</th>
                            <th class="py-3 px-4 text-left hidden sm:table-cell">CPF/Doc</th>
                            <th class="py-3 px-4 text-left hidden md:table-cell">Registado em</th>
                            <th class="py-3 px-4 text-left">Último acesso</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-50">
                        ${users
                            .sort((a, b) => (b.lastLogin || '').localeCompare(a.lastLogin || ''))
                            .map(u => `
                                <tr class="hover:bg-slate-50/50 transition-colors">
                                    <td class="py-3 px-4 font-semibold text-slate-800">${u.name || '—'}</td>
                                    <td class="py-3 px-4 text-slate-600 text-xs">${u.email || '—'}</td>
                                    <td class="py-3 px-4 text-slate-400 text-xs hidden sm:table-cell">${u.cpf ? u.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '—'}</td>
                                    <td class="py-3 px-4 text-slate-400 text-xs hidden md:table-cell">${fmtDate(u.createdAt)}</td>
                                    <td class="py-3 px-4 text-slate-400 text-xs">${fmtDate(u.lastLogin)}</td>
                                </tr>
                            `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * @param {string} label
     * @param {number|string} value
     * @param {string} valueClass
     * @param {string} cardClass
     * @returns {string}
     */
    _statCard(label, value, valueClass, cardClass) {
        return `
            <div class="p-5 rounded-3xl border ${cardClass} dark-card">
                <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">${label}</div>
                <div class="text-2xl font-bold ${valueClass}">${value}</div>
            </div>
        `;
    }

    /**
     * @param {import("firebase/auth").User|null} user
     * @returns {boolean}
     */
    _isAdmin(user) {
        return !!(user?.email && ADMIN_EMAILS.includes(user.email));
    }
}
