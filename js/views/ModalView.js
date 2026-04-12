/**
 * ModalView — funções puras de UI para modais, toasts e indicadores de carregamento.
 * Não guarda estado próprio; opera directamente no DOM.
 */
export const ModalView = {
    /**
     * Mostra um toast de notificação no canto inferior direito.
     * Auto-fecha após 6 segundos.
     * @param {string} msg - mensagem a exibir
     * @param {'info'|'success'|'error'} type - controla a cor do indicador
     */
    showToast(msg, type = 'info') {
        const t    = document.getElementById('toast');
        const tm   = document.getElementById('toast-message');
        const icon = document.getElementById('toast-icon');
        if (!t || !tm) return;
        tm.innerText = msg;
        if (icon) {
            icon.className = `w-2 h-2 rounded-full animate-pulse ${
                type === 'error'   ? 'bg-rose-500'    :
                type === 'success' ? 'bg-emerald-500' : 'bg-indigo-500'
            }`;
        }
        t.classList.remove('translate-y-32', 'opacity-0');
        clearTimeout(t._hideTimer);
        t._hideTimer = setTimeout(() => t.classList.add('translate-y-32', 'opacity-0'), 6000);
    },

    /**
     * Abre o modal de confirmação genérico com título, mensagem e botões configuráveis.
     * @param {{ title, message, onConfirm, onCancel, confirmLabel, confirmClass }} options
     */
    openConfirmModal({
        title        = "Confirmar",
        message,
        onConfirm,
        onCancel,
        confirmLabel = "Sim, eliminar",
        confirmClass = "w-full py-4 bg-rose-600 text-white font-bold rounded-2xl transition hover:bg-rose-700"
    }) {
        const m       = document.getElementById('confirm-modal');
        const btns    = document.getElementById('modal-buttons');
        const titleEl = document.getElementById('modal-title');
        const msgEl   = document.getElementById('modal-message');
        if (!m || !btns) return;

        btns.innerHTML = '';
        if (titleEl) titleEl.innerText  = title;
        if (msgEl)   msgEl.innerHTML    = message;   // innerHTML permite HTML como inputs

        const b1       = document.createElement('button');
        b1.innerText   = confirmLabel;
        b1.className   = confirmClass;
        b1.onclick     = () => { onConfirm?.(); m.classList.add('hidden'); };

        const b2       = document.createElement('button');
        b2.innerText   = "Cancelar";
        b2.className   = "w-full py-4 bg-slate-100 font-bold rounded-2xl transition hover:bg-slate-200";
        b2.onclick     = () => { onCancel?.(); m.classList.add('hidden'); };

        btns.appendChild(b1);
        btns.appendChild(b2);
        m.classList.remove('hidden');
    },

    /**
     * Abre o modal de confirmação dos itens interpretados pela IA.
     * Devolve uma Promise<boolean> que resolve com true se o utilizador confirmar.
     * @param {Array} items - lista de transações propostas pela IA
     * @returns {Promise<boolean>}
     */
    openAIConfirmModal(items) {
        return new Promise((resolve) => {
            const m    = document.getElementById('ai-confirm-modal');
            const list = document.getElementById('ai-confirm-list');
            if (!m || !list) { resolve(true); return; }

            const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            list.innerHTML = items.map((i) => `
                <div class="flex items-center justify-between p-3 bg-slate-50 dark-card rounded-xl gap-3">
                    <div class="flex-1 min-w-0">
                        <div class="font-semibold text-sm text-slate-800 truncate">${i.desc}</div>
                        <div class="text-xs text-slate-400 mt-0.5">${i.category} · ${i.method}${i.bank ? ' · ' + i.bank : ''}</div>
                    </div>
                    <div class="font-bold text-sm shrink-0 ${i.category === 'Receita' ? 'text-emerald-600' : 'text-slate-900'}">${fmt(i.amount)}</div>
                </div>
            `).join('');

            const okBtn     = document.getElementById('ai-confirm-ok');
            const cancelBtn = document.getElementById('ai-confirm-cancel');
            const cleanup   = () => m.classList.add('hidden');

            if (okBtn)     okBtn.onclick     = () => { cleanup(); resolve(true); };
            if (cancelBtn) cancelBtn.onclick = () => { cleanup(); resolve(false); };

            m.classList.remove('hidden');
        });
    },

    /**
     * Abre o modal de perfil pré-preenchido com os dados do utilizador.
     * @param {string} userName
     * @param {string} pin
     */
    openProfileModal(userName, pin) {
        const nameEl = document.getElementById('profile-name-input');
        const passEl = document.getElementById('profile-pass-input');
        if (nameEl) nameEl.value = userName || '';
        if (passEl) passEl.value = pin      || '';
        document.getElementById('profile-modal')?.classList.remove('hidden');
    },

    /** Fecha o modal de perfil */
    closeProfileModal() {
        document.getElementById('profile-modal')?.classList.add('hidden');
    },

    /** Abre o modal de importação de extrato */
    openImportModal() {
        document.getElementById('import-modal')?.classList.remove('hidden');
    },

    /** Fecha o modal de importação e limpa o textarea */
    closeImportModal() {
        const modal  = document.getElementById('import-modal');
        if (modal) modal.classList.add('hidden');
        const textEl = document.getElementById('import-text');
        if (textEl) textEl.value = '';
    },

    /**
     * Abre o modal de resumo mensal com o conteúdo gerado.
     * @param {string} content - texto pré-formatado do resumo
     */
    openSummaryModal(content) {
        const contentEl = document.getElementById('summary-content');
        if (contentEl) contentEl.innerText = content;
        document.getElementById('summary-modal')?.classList.remove('hidden');
    },

    /**
     * Activa/desactiva o indicador de carregamento no botão de importação.
     * @param {boolean} loading
     */
    setImportLoading(loading) {
        const loader = document.getElementById('import-loader');
        const btn    = document.getElementById('import-process-btn');
        if (loader) loader.classList.toggle('hidden', !loading);
        if (btn)    btn.disabled = loading;
    },

    /**
     * Activa/desactiva o indicador de carregamento no botão de processamento IA.
     * @param {boolean} loading
     */
    setAILoading(loading) {
        const loader = document.getElementById('ai-loader');
        const btn    = document.getElementById('ai-submit');
        if (loader) loader.classList.toggle('hidden', !loading);
        if (btn)    btn.disabled = loading;
    }
};
