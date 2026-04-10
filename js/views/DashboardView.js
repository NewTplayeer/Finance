const formatCurrency = (v) => v.toLocaleString('pt-pt', { style: 'currency', currency: 'BRL' });

export const DashboardView = {
    updateCards({ balance, income, cardDebt, pending, finalBalance }) {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        set('total-balance', formatCurrency(balance));
        set('total-income', formatCurrency(income));
        set('total-card', formatCurrency(cardDebt));
        set('total-pending', formatCurrency(pending));

        const elEst = document.getElementById('total-estimated-final');
        if (elEst) {
            elEst.innerText = formatCurrency(finalBalance);
            elEst.className = `text-2xl font-bold ${finalBalance < 0 ? 'text-rose-300' : 'text-white'}`;
        }
    },

    renderTransactionList(list, { onTogglePaid, onDelete }) {
        const tbody = document.getElementById('transaction-list');
        if (!tbody) return;

        if (!list.length) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-10 text-center text-slate-400 italic font-medium">Sem movimentos este mês.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        list.sort((a, b) => a.paid - b.paid).forEach(t => {
            const isInc = t.category === 'Receita';
            const tr = document.createElement('tr');
            tr.className = `transition-all ${isInc ? 'income-row' : (t.paid ? 'paid-row' : 'hover:bg-slate-50/50')}`;
            tr.innerHTML = `
                <td class="px-8 py-5">
                    <button data-action="toggle-paid" data-id="${t.id}" class="w-6 h-6 rounded-full border-2 ${t.paid ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200'} flex items-center justify-center transition-all">
                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>
                    </button>
                </td>
                <td class="px-8 py-5">
                    <div class="text-sm font-bold ${(!isInc && t.paid) ? 'text-slate-400 line-through' : 'text-slate-800'}">${t.desc}</div>
                    <div class="bank-badge mt-1">${t.bank || 'GERAL'}</div>
                </td>
                <td class="px-8 py-5 text-center uppercase text-[10px] font-bold text-slate-500">${t.method}</td>
                <td class="px-8 py-5 text-right font-bold ${isInc ? 'text-emerald-600' : 'text-slate-900'}">${isInc ? '+' : ''} ${formatCurrency(t.amount)}</td>
                <td class="px-8 py-5 text-center">
                    <button data-action="delete-transaction" data-id="${t.id}" class="text-slate-300 hover:text-rose-500 transition-colors">
                        <svg class="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.addEventListener('click', (e) => {
            const toggleBtn = e.target.closest('[data-action="toggle-paid"]');
            const deleteBtn = e.target.closest('[data-action="delete-transaction"]');
            if (toggleBtn && onTogglePaid) onTogglePaid(toggleBtn.dataset.id);
            if (deleteBtn && onDelete) onDelete(deleteBtn.dataset.id);
        }, { once: true });
    },

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

    updateChart(chart, monthOptions, transactions, currentMonthKey) {
        if (!chart) return;
        const months = monthOptions.filter(v => v >= currentMonthKey).slice(0, 6);
        const vals = months.map(m => transactions.filter(t => t.monthKey === m && t.method === 'Cartão').reduce((a, b) => a + b.amount, 0));
        chart.data.labels = months.map(m => m.split('-')[1] + '/' + m.split('-')[0].slice(2));
        chart.data.datasets[0].data = vals;
        chart.update();
    },

    setMonthDisplay(text) {
        const el = document.getElementById('display-month');
        if (el) el.innerText = text;
    },

    generateSummary(transactions, monthLabel) {
        const income = transactions.filter(t => t.category === 'Receita').reduce((a, b) => a + b.amount, 0);
        const expenses = transactions.filter(t => t.category !== 'Receita').reduce((a, b) => a + b.amount, 0);
        const categories = {};
        transactions.filter(t => t.category !== 'Receita').forEach(t => {
            categories[t.category] = (categories[t.category] || 0) + t.amount;
        });

        let summary = `📊 RESUMO FINANCEIRO - ${monthLabel.toUpperCase()}\n`;
        summary += `${'─'.repeat(35)}\n\n`;
        summary += `💰 RECEITAS:   ${formatCurrency(income)}\n`;
        summary += `💸 DESPESAS:   ${formatCurrency(expenses)}\n`;
        summary += `📈 SALDO:      ${formatCurrency(income - expenses)}\n\n`;
        summary += `📂 POR CATEGORIA:\n`;
        Object.entries(categories).sort((a, b) => b[1] - a[1]).forEach(([cat, val]) => {
            summary += `  • ${cat}: ${formatCurrency(val)}\n`;
        });
        return summary;
    },

    setOllamaStatus(online) {
        const syncInd = document.getElementById('sync-indicator');
        const syncTxt = document.getElementById('sync-status-text');
        if (!syncInd || !syncTxt) return;

        if (online) {
            syncInd.className = "w-2 h-2 bg-emerald-500 rounded-full animate-pulse";
            syncTxt.innerText = "Ollama Online";
            syncTxt.parentElement.className = "flex items-center gap-2 text-[10px] font-bold text-emerald-500 uppercase bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100";
        } else {
            syncInd.className = "w-2 h-2 bg-rose-500 rounded-full";
            syncTxt.innerText = "Ollama Offline";
            syncTxt.parentElement.className = "flex items-center gap-2 text-[10px] font-bold text-rose-500 uppercase bg-rose-50 px-3 py-1.5 rounded-full border border-rose-100";
        }
    }
};
