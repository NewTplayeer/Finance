/**
 * AnalyticsController — renderiza o painel de análise com estatísticas globais.
 * Lê de state.transactions, state.savings e state.loans — sem acesso directo ao Firestore.
 */
import { state } from '../state.js';
import { LoanModel } from '../models/LoanModel.js';

/** Formata valor BRL */
const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export class AnalyticsController {
    /** Inicializa o controller (sem side effects — render é chamado ao mudar para o tab) */
    init() {
        // Nada a fazer no arranque; render() é chamado ao activar o tab
    }

    /**
     * Renderiza todo o painel de análise com os dados actuais do state.
     * Chamado por NavigationController quando o tab "Análise" fica activo.
     */
    render() {
        this._renderGlobalStats();
        this._renderCategoryBreakdown();
        this._renderMonthlyTrend();
        this._renderSavingsSummary();
        this._renderLoansSummary();
    }

    /** Renderiza os cards de totais globais (todos os meses) */
    _renderGlobalStats() {
        const all     = state.transactions;
        const income  = all.filter(t => t.category === 'Receita').reduce((s, t) => s + t.amount, 0);
        const expense = all.filter(t => t.category !== 'Receita').reduce((s, t) => s + t.amount, 0);
        const balance = income - expense;

        const el = document.getElementById('analytics-global-stats');
        if (!el) return;

        const currentMonth = new Date().toISOString().slice(0, 7);
        const savingsTotal = (state.savings || []).reduce((s, j) => s + (j.saved || 0), 0);
        const loansTotal   = (state.loans   || []).filter(l => !(l.paidMonths || []).includes(currentMonth))
            .reduce((s, l) => s + LoanModel.calcTotal(l.amount, l.interestRate, l.startDate, l.dueDate), 0);

        el.innerHTML = `
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                ${this._statCard('Total Receitas', fmt(income),  'text-emerald-600', 'bg-emerald-50 border-emerald-100')}
                ${this._statCard('Total Despesas', fmt(expense), 'text-rose-600',    'bg-rose-50 border-rose-100')}
                ${this._statCard('Saldo Acumulado', fmt(balance), balance >= 0 ? 'text-indigo-700' : 'text-rose-700', balance >= 0 ? 'bg-indigo-50 border-indigo-100' : 'bg-rose-50 border-rose-100')}
                ${this._statCard('Em Cofrinhos', fmt(savingsTotal), 'text-amber-700', 'bg-amber-50 border-amber-100')}
                ${this._statCard('Empréstimos em Aberto', fmt(loansTotal), 'text-violet-700', 'bg-violet-50 border-violet-100')}
            </div>
        `;
    }

    /**
     * Retorna o HTML de um card de estatística.
     * @param {string} label
     * @param {string} value
     * @param {string} valueClass - classe de cor do valor
     * @param {string} cardClass  - classes de fundo e borda
     */
    _statCard(label, value, valueClass, cardClass) {
        return `
            <div class="p-5 rounded-3xl border ${cardClass} dark-card">
                <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">${label}</div>
                <div class="text-lg font-bold ${valueClass} leading-tight">${value}</div>
            </div>
        `;
    }

    /** Renderiza a distribuição de despesas por categoria (todos os meses) */
    _renderCategoryBreakdown() {
        const el = document.getElementById('analytics-categories');
        if (!el) return;

        const expenses = state.transactions.filter(t => t.category !== 'Receita');
        if (!expenses.length) {
            el.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-4">Sem despesas registadas.</p>`;
            return;
        }

        const cats = {};
        expenses.forEach(t => { cats[t.category] = (cats[t.category] || 0) + t.amount; });
        const total  = Object.values(cats).reduce((s, v) => s + v, 0);
        const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);

        el.innerHTML = sorted.map(([cat, val]) => {
            const pct   = total > 0 ? (val / total) * 100 : 0;
            const color = pct >= 30 ? 'bg-rose-500' : pct >= 15 ? 'bg-amber-400' : 'bg-indigo-500';
            return `
                <div class="mb-3">
                    <div class="flex justify-between text-xs font-semibold mb-1">
                        <span class="text-slate-600">${cat}</span>
                        <span class="text-slate-500">${fmt(val)} <span class="text-slate-400 font-normal">(${pct.toFixed(1)}%)</span></span>
                    </div>
                    <div class="w-full bg-slate-100 rounded-full h-2">
                        <div class="${color} h-2 rounded-full transition-all duration-500" style="width:${pct.toFixed(1)}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /** Renderiza tendência mensal dos últimos 12 meses (receitas vs. despesas) */
    _renderMonthlyTrend() {
        const el = document.getElementById('analytics-monthly-trend');
        if (!el) return;

        // Gera os últimos 12 meses (do mais antigo para o mais recente)
        const now    = new Date();
        const months = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push(d.toISOString().slice(0, 7));
        }

        const rows = months.map(key => {
            const txns    = state.transactions.filter(t => t.monthKey === key);
            const income  = txns.filter(t => t.category === 'Receita').reduce((s, t) => s + t.amount, 0);
            const expense = txns.filter(t => t.category !== 'Receita').reduce((s, t) => s + t.amount, 0);
            const balance = income - expense;
            if (!income && !expense) return null;  // salta meses sem dados

            const label = new Date(key + '-15').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
            return { label, income, expense, balance };
        }).filter(Boolean);

        if (!rows.length) {
            el.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-4">Sem dados suficientes.</p>`;
            return;
        }

        el.innerHTML = `
            <div class="overflow-x-auto">
                <table class="w-full text-xs">
                    <thead>
                        <tr class="text-[10px] text-slate-400 uppercase font-bold border-b border-slate-100">
                            <th class="py-2 text-left">Mês</th>
                            <th class="py-2 text-right text-emerald-600">Receitas</th>
                            <th class="py-2 text-right text-rose-500">Despesas</th>
                            <th class="py-2 text-right">Saldo</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-50">
                        ${rows.map(r => `
                            <tr class="hover:bg-slate-50/50 transition-colors">
                                <td class="py-2 font-semibold text-slate-700 capitalize">${r.label}</td>
                                <td class="py-2 text-right text-emerald-600 font-medium">${fmt(r.income)}</td>
                                <td class="py-2 text-right text-rose-500 font-medium">${fmt(r.expense)}</td>
                                <td class="py-2 text-right font-bold ${r.balance >= 0 ? 'text-indigo-600' : 'text-rose-600'}">${fmt(r.balance)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    /** Renderiza resumo de todos os cofrinhos */
    _renderSavingsSummary() {
        const el = document.getElementById('analytics-savings');
        if (!el) return;

        const jars = state.savings || [];
        if (!jars.length) {
            el.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-4">Sem cofrinhos criados.</p>`;
            return;
        }

        const total     = jars.reduce((s, j) => s + (j.saved || 0), 0);
        const totalGoal = jars.reduce((s, j) => s + (j.goal || 0), 0);

        el.innerHTML = `
            <div class="mb-4 flex justify-between items-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                <span>${jars.length} cofrinho(s)</span>
                <span class="text-amber-600">${fmt(total)}${totalGoal > 0 ? ` / ${fmt(totalGoal)}` : ''}</span>
            </div>
            ${jars.map(j => {
                const pct = j.goal > 0 ? Math.min((j.saved / j.goal) * 100, 100) : null;
                return `
                    <div class="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                        <span class="text-xl">${j.emoji || '🐷'}</span>
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-semibold text-slate-800 truncate">${j.name}</div>
                            ${pct !== null ? `
                                <div class="w-full bg-slate-100 rounded-full h-1.5 mt-1">
                                    <div class="${pct >= 100 ? 'bg-emerald-500' : 'bg-amber-400'} h-1.5 rounded-full" style="width:${pct.toFixed(0)}%"></div>
                                </div>
                            ` : ''}
                        </div>
                        <span class="text-sm font-bold text-slate-700 shrink-0">${fmt(j.saved)}</span>
                    </div>
                `;
            }).join('')}
        `;
    }

    /** Renderiza resumo de todos os empréstimos */
    _renderLoansSummary() {
        const el = document.getElementById('analytics-loans');
        if (!el) return;

        const loans = state.loans || [];
        if (!loans.length) {
            el.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-4">Sem empréstimos registados.</p>`;
            return;
        }

        const thisMonth    = new Date().toISOString().slice(0, 7);
        const pending      = loans.filter(l => !(l.paidMonths || []).includes(thisMonth));
        const settled      = loans.filter(l =>  (l.paidMonths || []).includes(thisMonth));
        const totalPending = pending.reduce((s, l) =>
            s + LoanModel.calcTotal(l.amount, l.interestRate, l.startDate, l.dueDate), 0);

        el.innerHTML = `
            <div class="mb-4 flex flex-wrap gap-4 text-xs">
                <span class="font-bold text-amber-700">${pending.length} em aberto · ${fmt(totalPending)}</span>
                <span class="text-slate-400">${settled.length} pago(s) este mês</span>
            </div>
            ${loans.map(l => {
                const total   = LoanModel.calcTotal(l.amount, l.interestRate, l.startDate, l.dueDate);
                const isPaid  = (l.paidMonths || []).includes(thisMonth);
                const overdue = l.dueDate && !isPaid && new Date(l.dueDate) < new Date();
                return `
                    <div class="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                        <div class="w-2 h-2 rounded-full shrink-0 ${isPaid ? 'bg-emerald-400' : overdue ? 'bg-rose-500' : 'bg-amber-400'}"></div>
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-semibold text-slate-800 ${isPaid ? 'line-through text-slate-400' : ''} truncate">${l.debtor}</div>
                            <div class="text-[10px] text-slate-400">${l.method}${overdue ? ' · <span class="text-rose-500 font-bold">VENCIDO</span>' : ''}</div>
                        </div>
                        <span class="text-sm font-bold ${isPaid ? 'text-emerald-600' : overdue ? 'text-rose-600' : 'text-slate-700'} shrink-0">${fmt(total)}</span>
                    </div>
                `;
            }).join('')}
        `;
    }
}
