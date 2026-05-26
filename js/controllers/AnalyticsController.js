/**
 * AnalyticsController — renderiza o painel de análise com estatísticas globais,
 * gráficos de tendência mensal (bar+line), evolução do saldo (área), gastos por
 * dia da semana (bar), doughnut de categorias, top estabelecimentos, cofrinhos e empréstimos.
 */
import { state } from '../state.js';
import { LoanModel } from '../models/LoanModel.js';

const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const CAT_COLORS = [
    '#6366f1','#f43f5e','#f59e0b','#10b981',
    '#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#64748b'
];

export class AnalyticsController {
    constructor() {
        this._charts = {};
    }

    init() {}

    render() {
        this._renderGlobalStats();
        this._renderMonthlyTrend();
        this._renderBalanceEvolution();
        this._renderWeekdaySpending();
        this._renderCategoryBreakdown();
        this._renderTopPlaces();
        this._renderSavingsSummary();
        this._renderLoansSummary();
    }

    _destroyChart(key) {
        if (this._charts[key]) {
            this._charts[key].destroy();
            this._charts[key] = null;
        }
    }

    /** Últimos 12 meses em formato YYYY-MM, do mais antigo ao mais recente */
    _getMonths12() {
        const now = new Date();
        const months = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push(d.toISOString().slice(0, 7));
        }
        return months;
    }

    /** Cards de métricas globais com taxa de poupança e delta vs mês anterior */
    _renderGlobalStats() {
        const all     = state.transactions;
        const income  = all.filter(t => t.category === 'Receita').reduce((s, t) => s + t.amount, 0);
        const expense = all.filter(t => t.category !== 'Receita').reduce((s, t) => s + t.amount, 0);
        const balance = income - expense;

        const el = document.getElementById('analytics-global-stats');
        if (!el) return;

        const now      = new Date();
        const curMo    = now.toISOString().slice(0, 7);
        const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMo   = prevDate.toISOString().slice(0, 7);

        const thisTxns    = all.filter(t => t.monthKey === curMo);
        const prevTxns    = all.filter(t => t.monthKey === prevMo);
        const thisIncome  = thisTxns.filter(t => t.category === 'Receita').reduce((s, t) => s + t.amount, 0);
        const thisExpense = thisTxns.filter(t => t.category !== 'Receita').reduce((s, t) => s + t.amount, 0);
        const prevExpense = prevTxns.filter(t => t.category !== 'Receita').reduce((s, t) => s + t.amount, 0);

        const savingsRate = thisIncome > 0 ? ((thisIncome - thisExpense) / thisIncome * 100) : null;
        const expChg      = prevExpense > 0 ? ((thisExpense - prevExpense) / prevExpense * 100) : null;

        const savingsTotal = (state.savings || []).reduce((s, j) => s + (j.saved || 0), 0);
        const loansTotal   = (state.loans   || [])
            .filter(l => !(l.paidMonths || []).includes(curMo))
            .reduce((s, l) => s + LoanModel.calcTotal(l.amount, l.interestRate, l.startDate, l.dueDate), 0);

        const deltaHtml = (val) => val === null ? '' :
            `<span class="text-[10px] font-bold ${val >= 0 ? 'text-rose-500' : 'text-emerald-500'} mt-1 block">${val >= 0 ? '▲' : '▼'} ${Math.abs(val).toFixed(1)}% vs mês ant.</span>`;

        const rateColor = savingsRate === null ? 'text-slate-400'
            : savingsRate >= 20 ? 'text-emerald-600'
            : savingsRate >= 0  ? 'text-amber-600'
            : 'text-rose-600';

        el.innerHTML = `
            <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
                ${this._statCard('Total Receitas',        fmt(income),  'text-emerald-600', 'bg-emerald-50 border-emerald-100')}
                ${this._statCard('Total Despesas',        fmt(expense), 'text-rose-600',    'bg-rose-50 border-rose-100', deltaHtml(expChg))}
                ${this._statCard('Saldo Acumulado',       fmt(balance), balance >= 0 ? 'text-indigo-700' : 'text-rose-700', balance >= 0 ? 'bg-indigo-50 border-indigo-100' : 'bg-rose-50 border-rose-100')}
                ${this._statCard('Taxa de Poupança',      savingsRate !== null ? savingsRate.toFixed(1) + '%' : '—', rateColor, 'bg-slate-50 border-slate-200',
                    '<span class="text-[10px] text-slate-400 mt-1 block">mês actual</span>')}
                ${this._statCard('Em Cofrinhos',          fmt(savingsTotal), 'text-amber-700',  'bg-amber-50 border-amber-100')}
                ${this._statCard('Empréstimos em Aberto', fmt(loansTotal),   'text-violet-700', 'bg-violet-50 border-violet-100')}
            </div>
        `;
    }

    _statCard(label, value, valueClass, cardClass, extra = '') {
        return `
            <div class="p-5 rounded-3xl border ${cardClass} dark-card">
                <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">${label}</div>
                <div class="text-lg font-bold ${valueClass} leading-tight">${value}</div>
                ${extra}
            </div>
        `;
    }

    /** Gráfico misto: barras (receita/despesa) + linha (saldo) por mês */
    _renderMonthlyTrend() {
        const el = document.getElementById('analytics-monthly-trend');
        if (!el) return;

        const months = this._getMonths12();
        const rows   = months.map(key => {
            const txns    = state.transactions.filter(t => t.monthKey === key);
            const income  = txns.filter(t => t.category === 'Receita').reduce((s, t) => s + t.amount, 0);
            const expense = txns.filter(t => t.category !== 'Receita').reduce((s, t) => s + t.amount, 0);
            return { key, income, expense, balance: income - expense };
        });

        const hasData = rows.some(r => r.income > 0 || r.expense > 0);
        if (!hasData) {
            el.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-10">Sem dados suficientes para o gráfico.</p>`;
            return;
        }

        this._destroyChart('trendChart');
        el.innerHTML = `<canvas id="analytics-trend-chart"></canvas>`;

        const labels = rows.map(r =>
            new Date(r.key + '-15').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
        );

        this._charts.trendChart = new Chart(
            document.getElementById('analytics-trend-chart').getContext('2d'),
            {
                data: {
                    labels,
                    datasets: [
                        {
                            type: 'bar',
                            label: 'Receitas',
                            data: rows.map(r => r.income),
                            backgroundColor: '#10b98122',
                            borderColor: '#10b981',
                            borderWidth: 2,
                            borderRadius: 6,
                            order: 2
                        },
                        {
                            type: 'bar',
                            label: 'Despesas',
                            data: rows.map(r => r.expense),
                            backgroundColor: '#f43f5e22',
                            borderColor: '#f43f5e',
                            borderWidth: 2,
                            borderRadius: 6,
                            order: 2
                        },
                        {
                            type: 'line',
                            label: 'Saldo',
                            data: rows.map(r => r.balance),
                            borderColor: '#6366f1',
                            backgroundColor: 'transparent',
                            borderWidth: 2.5,
                            pointBackgroundColor: rows.map(r => r.balance >= 0 ? '#6366f1' : '#f43f5e'),
                            pointRadius: 4,
                            tension: 0.3,
                            order: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { font: { size: 10 }, padding: 12, usePointStyle: true }
                        },
                        tooltip: {
                            callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.raw)}` }
                        }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                        y: {
                            beginAtZero: false,
                            grid: { color: '#f1f5f9' },
                            ticks: {
                                font: { size: 10 },
                                callback: v => 'R$' + (Math.abs(v) >= 1000
                                    ? (v / 1000).toFixed(0) + 'k'
                                    : v.toFixed(0))
                            }
                        }
                    }
                }
            }
        );
    }

    /** Gráfico de área: saldo acumulado mês a mês */
    _renderBalanceEvolution() {
        this._destroyChart('balanceChart');
        const canvas = document.getElementById('analytics-balance-chart');
        if (!canvas) return;

        const months = this._getMonths12();
        let cum = 0;
        const points = months.map(key => {
            const txns = state.transactions.filter(t => t.monthKey === key);
            cum += txns.filter(t => t.category === 'Receita').reduce((s, t) => s + t.amount, 0)
                 - txns.filter(t => t.category !== 'Receita').reduce((s, t) => s + t.amount, 0);
            return { key, value: cum };
        });

        const ctx  = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 220);
        grad.addColorStop(0, '#6366f130');
        grad.addColorStop(1, '#6366f105');

        this._charts.balanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: points.map(p =>
                    new Date(p.key + '-15').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
                ),
                datasets: [{
                    label: 'Saldo Acumulado',
                    data: points.map(p => p.value),
                    borderColor: '#6366f1',
                    backgroundColor: grad,
                    borderWidth: 2.5,
                    pointBackgroundColor: points.map(p => p.value >= 0 ? '#6366f1' : '#f43f5e'),
                    pointRadius: 4,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: { label: ctx => `Saldo: ${fmt(ctx.raw)}` }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                    y: {
                        grid: { color: '#f1f5f9' },
                        ticks: {
                            font: { size: 10 },
                            callback: v => 'R$' + (Math.abs(v) >= 1000
                                ? (v / 1000).toFixed(0) + 'k'
                                : v.toFixed(0))
                        }
                    }
                }
            }
        });
    }

    /** Barras por dia da semana — destaca o dia com mais gasto em vermelho */
    _renderWeekdaySpending() {
        this._destroyChart('weekdayChart');
        const canvas = document.getElementById('analytics-weekday-chart');
        if (!canvas) return;

        const days   = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const totals = [0, 0, 0, 0, 0, 0, 0];

        state.transactions
            .filter(t => t.category !== 'Receita' && t.date)
            .forEach(t => {
                const dow = new Date(t.date + 'T12:00:00').getDay();
                totals[dow] += t.amount;
            });

        const max = Math.max(...totals) || 1;

        this._charts.weekdayChart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: days,
                datasets: [{
                    label: 'Gastos',
                    data: totals,
                    backgroundColor: totals.map(v => v === max && max > 0 ? '#f43f5ecc' : '#6366f122'),
                    borderColor:     totals.map(v => v === max && max > 0 ? '#f43f5e'   : '#6366f166'),
                    borderWidth: 2,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: { label: ctx => `Total: ${fmt(ctx.raw)}` }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        ticks: {
                            font: { size: 10 },
                            callback: v => 'R$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v.toFixed(0))
                        }
                    }
                }
            }
        });
    }

    /** Doughnut de categorias + barras de progresso */
    _renderCategoryBreakdown() {
        this._destroyChart('categoryChart');
        const canvas = document.getElementById('analytics-category-chart');
        const el     = document.getElementById('analytics-categories');

        const expenses = state.transactions.filter(t => t.category !== 'Receita');
        if (!expenses.length) {
            if (el) el.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-4">Sem despesas registadas.</p>`;
            return;
        }

        const cats = {};
        expenses.forEach(t => { cats[t.category] = (cats[t.category] || 0) + t.amount; });
        const total  = Object.values(cats).reduce((s, v) => s + v, 0);
        const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);

        if (canvas) {
            this._charts.categoryChart = new Chart(canvas.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: sorted.map(([k]) => k),
                    datasets: [{
                        data: sorted.map(([, v]) => v),
                        backgroundColor: CAT_COLORS,
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { font: { size: 10 }, padding: 8, usePointStyle: true }
                        },
                        tooltip: {
                            callbacks: {
                                label: ctx => `${ctx.label}: ${fmt(ctx.raw)} (${(ctx.raw / total * 100).toFixed(1)}%)`
                            }
                        }
                    },
                    cutout: '62%'
                }
            });
        }

        if (el) {
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
    }

    /** Top 8 estabelecimentos por valor total gasto (usa campo place das transações) */
    _renderTopPlaces() {
        const el = document.getElementById('analytics-top-places');
        if (!el) return;

        const places = {};
        state.transactions
            .filter(t => t.category !== 'Receita' && t.place && t.place.trim())
            .forEach(t => {
                const key = t.place.trim();
                places[key] = (places[key] || 0) + t.amount;
            });

        const sorted = Object.entries(places).sort((a, b) => b[1] - a[1]).slice(0, 8);

        if (!sorted.length) {
            el.innerHTML = `
                <p class="text-xs text-slate-400 italic text-center py-4">
                    Sem dados de estabelecimentos.<br>
                    <span class="text-[10px]">Preenche o campo "Local" nas transações.</span>
                </p>`;
            return;
        }

        const max    = sorted[0][1];
        const colors = ['bg-rose-500','bg-amber-400','bg-indigo-500','bg-emerald-500',
                        'bg-blue-400','bg-purple-400','bg-pink-400','bg-teal-400'];

        el.innerHTML = sorted.map(([place, val], i) => {
            const pct = (val / max) * 100;
            return `
                <div class="mb-3">
                    <div class="flex justify-between text-xs font-semibold mb-1">
                        <span class="text-slate-700 flex items-center gap-1.5">
                            <span class="text-slate-400 font-mono text-[10px]">${i + 1}.</span>${place}
                        </span>
                        <span class="text-slate-500 font-bold shrink-0 ml-2">${fmt(val)}</span>
                    </div>
                    <div class="w-full bg-slate-100 rounded-full h-2">
                        <div class="${colors[i]} h-2 rounded-full transition-all duration-500" style="width:${pct.toFixed(1)}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

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
                            <div class="text-sm font-semibold ${isPaid ? 'text-slate-400 line-through' : 'text-slate-800'} truncate">${l.debtor}</div>
                            <div class="text-[10px] text-slate-400">${l.method}${overdue ? ' · <span class="text-rose-500 font-bold">VENCIDO</span>' : ''}</div>
                        </div>
                        <span class="text-sm font-bold ${isPaid ? 'text-emerald-600' : overdue ? 'text-rose-600' : 'text-slate-700'} shrink-0">${fmt(total)}</span>
                    </div>
                `;
            }).join('')}
        `;
    }
}
