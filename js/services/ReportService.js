/**
 * ReportService — geração de relatórios PDF usando jsPDF.
 * Requer que a CDN do jsPDF esteja carregada no HTML.
 */

/** Formata valor BRL */
const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const ReportService = {
    /**
     * Gera e descarrega um relatório PDF das transações no período indicado.
     * @param {Array} transactions - todas as transações do utilizador
     * @param {{ from: string, to: string }} period - período no formato 'YYYY-MM-DD'
     * @param {string} userName - nome do utilizador para o cabeçalho
     */
    generate(transactions, { from, to }, userName = '') {
        if (typeof window.jspdf === 'undefined') {
            alert('jsPDF não carregado. Verifica a ligação à internet.');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        /* ── Cabeçalho ── */
        doc.setFillColor(99, 102, 241);       // indigo-500
        doc.rect(0, 0, 210, 28, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('NT Finanças', 14, 12);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Relatório de ${this._fmtDate(from)} a ${this._fmtDate(to)}`, 14, 20);
        if (userName) doc.text(userName, 196, 20, { align: 'right' });

        let y = 36;
        doc.setTextColor(30, 30, 30);

        /* ── Filtra transações pelo período ── */
        const filtered = transactions.filter(t => {
            if (!t.monthKey) return false;
            const m = t.monthKey;           // 'YYYY-MM'
            const mFrom = from ? from.slice(0, 7) : '0000-00';
            const mTo   = to   ? to.slice(0, 7)   : '9999-99';
            return m >= mFrom && m <= mTo;
        });

        /* ── Resumo ── */
        const income   = filtered.filter(t => t.category === 'Receita').reduce((s, t) => s + t.amount, 0);
        const expenses = filtered.filter(t => t.category !== 'Receita').reduce((s, t) => s + t.amount, 0);
        const balance  = income - expenses;

        doc.setFillColor(248, 250, 252);     // slate-50
        doc.roundedRect(14, y, 182, 28, 3, 3, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text('RECEITAS', 22, y + 8);
        doc.text('DESPESAS', 84, y + 8);
        doc.text('SALDO', 150, y + 8);
        doc.setFontSize(11);
        doc.setTextColor(16, 185, 129);   doc.text(fmt(income),   22, y + 20);
        doc.setTextColor(239, 68, 68);    doc.text(fmt(expenses), 84, y + 20);
        doc.setTextColor(balance >= 0 ? 99 : 239, balance >= 0 ? 102 : 68, balance >= 0 ? 241 : 68);
        doc.text(fmt(balance), 150, y + 20);
        y += 36;

        /* ── Por categoria ── */
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('GASTOS POR CATEGORIA', 14, y);
        y += 5;

        const cats = {};
        filtered.filter(t => t.category !== 'Receita').forEach(t => {
            cats[t.category] = (cats[t.category] || 0) + t.amount;
        });
        const sortedCats = Object.entries(cats).sort((a, b) => b[1] - a[1]);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        sortedCats.forEach(([cat, val]) => {
            if (y > 260) { doc.addPage(); y = 20; }
            doc.setTextColor(51, 65, 85);
            doc.text(`• ${cat}`, 18, y);
            doc.setTextColor(100, 116, 139);
            doc.text(fmt(val), 196, y, { align: 'right' });
            y += 6;
        });
        y += 6;

        /* ── Tabela de transações ── */
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.text('TRANSAÇÕES', 14, y);
        y += 4;

        /* Cabeçalho da tabela */
        doc.setFillColor(241, 245, 249);
        doc.rect(14, y, 182, 8, 'F');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text('DESCRIÇÃO', 16, y + 5.5);
        doc.text('CATEGORIA', 90, y + 5.5);
        doc.text('MÉTODO', 132, y + 5.5);
        doc.text('VALOR', 196, y + 5.5, { align: 'right' });
        y += 10;

        /* Linhas da tabela */
        doc.setFont('helvetica', 'normal');
        filtered.forEach((t, i) => {
            if (y > 272) { doc.addPage(); y = 20; }
            if (i % 2 === 0) {
                doc.setFillColor(250, 251, 252);
                doc.rect(14, y - 3, 182, 7, 'F');
            }
            doc.setTextColor(30, 41, 59);
            const desc = t.desc?.length > 35 ? t.desc.slice(0, 33) + '…' : (t.desc || '');
            doc.text(desc, 16, y + 1.5);
            doc.setTextColor(100, 116, 139);
            doc.text(t.category || '', 90, y + 1.5);
            doc.text(t.method   || '', 132, y + 1.5);
            const isInc = t.category === 'Receita';
            doc.setTextColor(isInc ? 16 : 239, isInc ? 185 : 68, isInc ? 129 : 68);
            doc.text(fmt(t.amount), 196, y + 1.5, { align: 'right' });
            y += 7;
        });

        /* ── Rodapé ── */
        const pages = doc.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.text(`NT Finanças · Relatório gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 290);
            doc.text(`Página ${i} de ${pages}`, 196, 290, { align: 'right' });
        }

        /* ── Download ── */
        const filename = `ntfinancas_${from || 'inicio'}_${to || 'fim'}.pdf`;
        doc.save(filename);
    },

    /**
     * Formata data ISO (YYYY-MM-DD) para dd/mm/yyyy.
     * @param {string} iso
     * @returns {string}
     */
    _fmtDate(iso) {
        if (!iso) return '—';
        const [y, m, d] = iso.split('-');
        return `${d || '01'}/${m}/${y}`;
    }
};
