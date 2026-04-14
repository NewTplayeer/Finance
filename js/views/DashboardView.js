/**
 * DashboardView — renderização do painel principal (cards, tabela, gráficos, metas).
 * Todas as funções são puras: recebem dados e actualizam o DOM.
 */

/** Formata valor para moeda BRL */
const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formata data ISO (YYYY-MM-DD) para dd/mm */
const fmtDate = (iso) => {
    if (!iso) return '—';
    const [, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}`;
};

/**
 * Devolve a data de referência da transação para ordenação.
 * Usa t.date se existir, caso contrário extrai de createdAt, e por último usa o monthKey.
 * @param {Object} t
 * @returns {string} YYYY-MM-DD
 */
const getTransDate = (t) =>
    t.date
    || (t.createdAt ? t.createdAt.slice(0, 10) : null)
    || (t.monthKey ? `${t.monthKey}-01` : '1970-01-01');

export const DashboardView = {
    /**
     * Actualiza os cards de métricas no topo do dashboard.
     * @param {{ balance, income, cardDebt, pending, finalBalance }} values
     */
    updateCards({ balance, income, cardDebt, pending, finalBalance }) {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        set('total-balance', fmt(balance));
        set('total-income', fmt(income));
        set('total-card', fmt(cardDebt));
        set('total-pending', fmt(pending));

        const elEst = document.getElementById('total-estimated-final');
        if (elEst) {
            elEst.innerText  = fmt(finalBalance);
            elEst.className  = `text-2xl font-bold ${finalBalance < 0 ? 'text-rose-300' : 'text-white'}`;
        }
    },

    /**
     * Renderiza a tabela de transações, substituindo o tbody para evitar duplicação de listeners.
     * @param {Array} list - transações a mostrar
     * @param {{ onTogglePaid, onDelete, onEdit }} callbacks
     * @param {'newest'|'oldest'|'highest'|'lowest'} sortBy - critério de ordenação
     */
    renderTransactionList(list, { onTogglePaid, onDelete, onEdit }, sortBy = 'newest') {
        const oldTbody = document.getElementById('transaction-list');
        if (!oldTbody) return;

        /* Substitui tbody para remover todos os event listeners anteriores */
        const tbody = oldTbody.cloneNode(false);
        oldTbody.parentNode.replaceChild(tbody, oldTbody);

        if (!list.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="p-10 text-center text-slate-400 italic font-medium">Sem movimentos este mês.</td></tr>`;
            return;
        }

        /* Ordenação — 'presorted' mantém a ordem já aplicada pelo controller */
        const sorted = [...list];
        if      (sortBy === 'presorted') { /* já ordenado */ }
        else if (sortBy === 'oldest')  sorted.sort((a, b) => getTransDate(a).localeCompare(getTransDate(b)));
        else if (sortBy === 'highest') sorted.sort((a, b) => b.amount - a.amount);
        else if (sortBy === 'lowest')  sorted.sort((a, b) => a.amount - b.amount);
        else /* newest */              sorted.sort((a, b) => getTransDate(b).localeCompare(getTransDate(a)));

        tbody.innerHTML = '';
        sorted.forEach(t => {
            const isInc  = t.category === 'Receita';
            const tDate  = getTransDate(t);
            const tr     = document.createElement('tr');
            tr.className = `transition-all ${isInc ? 'income-row' : (t.paid ? 'paid-row' : 'hover:bg-slate-50/50')}`;
            tr.innerHTML = `
                <td class="px-4 sm:px-8 py-4 sm:py-5">
                    <button data-action="toggle-paid" data-id="${t.id}"
                        title="${t.paid ? 'Marcar como pendente' : 'Marcar como pago'}"
                        class="w-6 h-6 rounded-full border-2 ${t.paid ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200'} flex items-center justify-center transition-all hover:scale-110">
                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>
                    </button>
                </td>
                <td class="px-4 sm:px-8 py-4 sm:py-5">
                    <div class="text-sm font-bold ${(!isInc && t.paid) ? 'text-slate-400 line-through' : 'text-slate-800'}">${t.desc}</div>
                    <div class="flex flex-wrap items-center gap-1.5 mt-1">
                        <span class="bank-badge">${t.bank || 'GERAL'}</span>
                        ${t.place ? `<span class="bank-badge bg-slate-100 text-slate-500">📍 ${t.place}</span>` : ''}
                        ${t.clientId ? `<span class="bank-badge bg-indigo-50 text-indigo-500">Cliente</span>` : ''}
                    </div>
                </td>
                <td class="hidden md:table-cell px-6 py-5 text-center text-xs font-semibold text-slate-500">${fmtDate(tDate)}</td>
                <td class="hidden sm:table-cell px-8 py-5 text-center uppercase text-[10px] font-bold text-slate-500">${t.method}</td>
                <td class="px-4 sm:px-8 py-4 sm:py-5 text-right font-bold ${isInc ? 'text-emerald-600' : 'text-slate-900'}">${isInc ? '+' : ''} ${fmt(t.amount)}</td>
                <td class="px-4 sm:px-8 py-4 sm:py-5 text-center">
                    <div class="flex items-center justify-center gap-2 sm:gap-3">
                        <button data-action="edit-transaction" data-id="${t.id}" title="Editar"
                            class="text-slate-300 hover:text-indigo-500 transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                        <button data-action="delete-transaction" data-id="${t.id}" title="Eliminar"
                            class="text-slate-300 hover:text-rose-500 transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        /* Listener único via delegação — sem duplicatas graças ao tbody substituído */
        tbody.addEventListener('click', (e) => {
            const toggleBtn = e.target.closest('[data-action="toggle-paid"]');
            const deleteBtn = e.target.closest('[data-action="delete-transaction"]');
            const editBtn   = e.target.closest('[data-action="edit-transaction"]');
            if (toggleBtn && onTogglePaid) onTogglePaid(toggleBtn.dataset.id);
            if (deleteBtn && onDelete)     onDelete(deleteBtn.dataset.id);
            if (editBtn   && onEdit)       onEdit(editBtn.dataset.id);
        });
    },

    /**
     * Inicializa o gráfico de barras (fluxo de cartão).
     * @param {HTMLCanvasElement} canvas
     * @returns {Chart}
     */
    initChart(canvas) {
        const ctx = canvas.getContext('2d');
        return new Chart(ctx, {
            type: 'bar',
            data: { labels: [], datasets: [{ label: 'Cartão R$', data: [], backgroundColor: '#6366f1', borderRadius: 12 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } }
            }
        });
    },

    /**
     * Inicializa o gráfico de pizza (gastos por categoria).
     * @param {HTMLCanvasElement} canvas
     * @returns {Chart}
     */
    initPieChart(canvas) {
        const ctx = canvas.getContext('2d');
        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: ['#6366f1','#f43f5e','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8 } } },
                cutout: '60%'
            }
        });
    },

    /**
     * Actualiza os dados do gráfico de barras com o fluxo de cartão dos próximos meses.
     * @param {Chart} chart
     * @param {Array} monthOptions - lista de meses disponíveis
     * @param {Array} transactions - todas as transações
     * @param {string} currentMonthKey - mês actual no formato 'YYYY-MM'
     */
    updateChart(chart, monthOptions, transactions, currentMonthKey) {
        if (!chart) return;
        const months = monthOptions.filter(v => v >= currentMonthKey).slice(0, 6);
        const vals   = months.map(m => transactions.filter(t => t.monthKey === m && t.method === 'Cartão').reduce((a, b) => a + b.amount, 0));
        chart.data.labels              = months.map(m => m.split('-')[1] + '/' + m.split('-')[0].slice(2));
        chart.data.datasets[0].data    = vals;
        chart.update();
    },

    /**
     * Actualiza o gráfico de pizza com os gastos por categoria do mês.
     * @param {Chart} pieChart
     * @param {Array} transactions - transações filtradas pelo mês
     */
    updatePieChart(pieChart, transactions) {
        if (!pieChart) return;
        const expenses = transactions.filter(t => t.category !== 'Receita');
        const cats     = {};
        expenses.forEach(t => { cats[t.category] = (cats[t.category] || 0) + t.amount; });
        const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
        pieChart.data.labels            = sorted.map(([k]) => k);
        pieChart.data.datasets[0].data  = sorted.map(([, v]) => v);
        pieChart.update();
    },

    /**
     * Renderiza as barras de progresso das metas de gastos.
     * @param {Array} transactions - transações do mês
     * @param {Object} budgets - metas: { categoria: metaValor }
     */
    renderBudgetBars(transactions, budgets) {
        const container = document.getElementById('budget-bars');
        if (!container) return;
        if (!budgets || !Object.keys(budgets).length) {
            container.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-2">Sem metas. Adiciona uma abaixo.</p>`;
            return;
        }

        const cats = {};
        transactions.filter(t => t.category !== 'Receita').forEach(t => {
            cats[t.category] = (cats[t.category] || 0) + t.amount;
        });

        container.innerHTML = Object.entries(budgets).map(([cat, meta]) => {
            const gasto = cats[cat] || 0;
            const pct   = Math.min((gasto / meta) * 100, 100);
            const color = pct >= 100 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-400' : 'bg-emerald-500';
            return `
                <div class="mb-3">
                    <div class="flex justify-between text-xs font-semibold mb-1">
                        <span class="text-slate-600">${cat}</span>
                        <span class="${pct >= 100 ? 'text-rose-600' : pct >= 75 ? 'text-amber-600' : 'text-emerald-600'}">
                            ${fmt(gasto)} / ${fmt(meta)}
                        </span>
                    </div>
                    <div class="w-full bg-slate-100 rounded-full h-2.5">
                        <div class="${color} h-2.5 rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    },

    /** Actualiza o texto do mês exibido no cabeçalho do histórico */
    setMonthDisplay(text) {
        const el = document.getElementById('display-month');
        if (el) el.innerText = text;
    },

    /**
     * Gera o texto do resumo mensal (para copiar ou imprimir).
     * @param {Array} transactions
     * @param {string} monthLabel
     * @returns {string}
     */
    generateSummary(transactions, monthLabel) {
        const income    = transactions.filter(t => t.category === 'Receita').reduce((a, b) => a + b.amount, 0);
        const expenses  = transactions.filter(t => t.category !== 'Receita').reduce((a, b) => a + b.amount, 0);
        const categories = {};
        transactions.filter(t => t.category !== 'Receita').forEach(t => {
            categories[t.category] = (categories[t.category] || 0) + t.amount;
        });

        let summary  = `📊 RESUMO FINANCEIRO - ${monthLabel.toUpperCase()}\n`;
        summary += `${'─'.repeat(35)}\n\n`;
        summary += `💰 RECEITAS:   ${fmt(income)}\n`;
        summary += `💸 DESPESAS:   ${fmt(expenses)}\n`;
        summary += `📈 SALDO:      ${fmt(income - expenses)}\n\n`;
        summary += `📂 POR CATEGORIA:\n`;
        Object.entries(categories).sort((a, b) => b[1] - a[1]).forEach(([cat, val]) => {
            summary += `  • ${cat}: ${fmt(val)}\n`;
        });
        return summary;
    },

    /**
     * Actualiza o indicador de estado da IA (Gemini) na navbar.
     * @param {boolean} online
     */
    setAIStatus(online) {
        const syncInd = document.getElementById('sync-indicator');
        const syncTxt = document.getElementById('sync-status-text');
        if (!syncInd || !syncTxt) return;

        if (online) {
            syncInd.className = 'w-2 h-2 bg-emerald-500 rounded-full animate-pulse';
            syncTxt.innerText = 'Gemini Online';
            syncTxt.parentElement.className = 'flex items-center gap-2 text-[10px] font-bold text-emerald-500 uppercase bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100';
        } else {
            syncInd.className = 'w-2 h-2 bg-rose-500 rounded-full';
            syncTxt.innerText = 'Gemini Offline';
            syncTxt.parentElement.className = 'flex items-center gap-2 text-[10px] font-bold text-rose-500 uppercase bg-rose-50 px-3 py-1.5 rounded-full border border-rose-100';
        }
    },

    /** @deprecated Use setAIStatus */
    setOllamaStatus(online) { this.setAIStatus(online); },

    /**
     * Actualiza o badge de modo (Pessoal/Partilhado) na navbar.
     * @param {'personal'|'shared'} mode
     */
    updateViewModeUI(mode) {
        const badge = document.getElementById('view-mode-badge');
        if (badge) {
            badge.innerText = mode === 'shared' ? '🤝 Partilhado' : '👤 Pessoal';
            badge.className = `text-[10px] font-bold px-3 py-1 rounded-full border ${mode === 'shared' ? 'bg-violet-50 text-violet-600 border-violet-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`;
        }

        const membersBadge = document.getElementById('shared-members-badge');
        if (!membersBadge) return;

        if (mode !== 'shared') {
            membersBadge.classList.add('hidden');
            membersBadge.classList.remove('flex');
            return;
        }

        // Carrega membros do espaço partilhado e mostra badge
        import('../models/SharedSpaceModel.js').then(async ({ SharedSpaceModel }) => {
            const { state } = await import('../state.js');
            if (!state.sharedSpaceId) return;
            const space = await SharedSpaceModel.get(state.sharedSpaceId).catch(() => null);
            if (!space) return;
            const names = Object.values(space.memberNames || {});
            const label = names.map(n => n.split(' ')[0]).join(' & ');
            membersBadge.innerHTML = `👥 ${names.length} · ${label}`;
            membersBadge.classList.remove('hidden');
            membersBadge.classList.add('flex');
        }).catch(() => {});
    }
};
