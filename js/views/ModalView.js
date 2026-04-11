export const ModalView = {
    showToast(msg, type = 'info') {
        const t = document.getElementById('toast');
        const tm = document.getElementById('toast-message');
        const icon = document.getElementById('toast-icon');
        if (!t || !tm) return;
        tm.innerText = msg;
        if (icon) {
            icon.className = `w-2 h-2 rounded-full animate-pulse ${type === 'error' ? 'bg-rose-500' : type === 'success' ? 'bg-emerald-500' : 'bg-indigo-500'}`;
        }
        t.classList.remove('translate-y-32', 'opacity-0');
        clearTimeout(t._hideTimer);
        t._hideTimer = setTimeout(() => t.classList.add('translate-y-32', 'opacity-0'), 6000);
    },

    openConfirmModal({ title = "Confirmar", message, onConfirm, confirmLabel = "Sim, eliminar", confirmClass = "w-full py-4 bg-rose-600 text-white font-bold rounded-2xl transition hover:bg-rose-700" }) {
        const m = document.getElementById('confirm-modal');
        const btns = document.getElementById('modal-buttons');
        const titleEl = document.getElementById('modal-title');
        const msgEl = document.getElementById('modal-message');
        if (!m || !btns) return;

        btns.innerHTML = '';
        if (titleEl) titleEl.innerText = title;
        if (msgEl) msgEl.innerText = message;

        const b1 = document.createElement('button');
        b1.innerText = confirmLabel;
        b1.className = confirmClass;
        b1.onclick = () => { onConfirm(); m.classList.add('hidden'); };

        const b2 = document.createElement('button');
        b2.innerText = "Cancelar";
        b2.className = "w-full py-4 bg-slate-100 font-bold rounded-2xl transition hover:bg-slate-200";
        b2.onclick = () => m.classList.add('hidden');

        btns.appendChild(b1);
        btns.appendChild(b2);
        m.classList.remove('hidden');
    },

    // Modal de confirmação para resultados da IA — devolve Promise<boolean>
    openAIConfirmModal(items) {
        return new Promise((resolve) => {
            const m = document.getElementById('ai-confirm-modal');
            const list = document.getElementById('ai-confirm-list');
            if (!m || !list) { resolve(true); return; }

            const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            list.innerHTML = items.map((i, idx) => `
                <div class="flex items-center justify-between p-3 bg-slate-50 dark-card rounded-xl gap-3">
                    <div class="flex-1 min-w-0">
                        <div class="font-semibold text-sm text-slate-800 truncate">${i.desc}</div>
                        <div class="text-xs text-slate-400 mt-0.5">${i.category} · ${i.method}${i.bank ? ' · ' + i.bank : ''}</div>
                    </div>
                    <div class="font-bold text-sm shrink-0 ${i.category === 'Receita' ? 'text-emerald-600' : 'text-slate-900'}">${fmt(i.amount)}</div>
                </div>
            `).join('');

            const okBtn = document.getElementById('ai-confirm-ok');
            const cancelBtn = document.getElementById('ai-confirm-cancel');

            const cleanup = () => { m.classList.add('hidden'); };

            if (okBtn) okBtn.onclick = () => { cleanup(); resolve(true); };
            if (cancelBtn) cancelBtn.onclick = () => { cleanup(); resolve(false); };

            m.classList.remove('hidden');
        });
    },

    openProfileModal(userName, pin) {
        const nameEl = document.getElementById('profile-name-input');
        const passEl = document.getElementById('profile-pass-input');
        if (nameEl) nameEl.value = userName || '';
        if (passEl) passEl.value = pin || '';
        document.getElementById('profile-modal')?.classList.remove('hidden');
    },

    closeProfileModal() {
        document.getElementById('profile-modal')?.classList.add('hidden');
    },

    openImportModal() {
        document.getElementById('import-modal')?.classList.remove('hidden');
    },

    closeImportModal() {
        const modal = document.getElementById('import-modal');
        if (modal) modal.classList.add('hidden');
        const textEl = document.getElementById('import-text');
        if (textEl) textEl.value = '';
    },

    openSummaryModal(content) {
        const contentEl = document.getElementById('summary-content');
        if (contentEl) contentEl.innerText = content;
        document.getElementById('summary-modal')?.classList.remove('hidden');
    },

    setImportLoading(loading) {
        const loader = document.getElementById('import-loader');
        const btn = document.getElementById('import-process-btn');
        if (loader) loader.classList.toggle('hidden', !loading);
        if (btn) btn.disabled = loading;
    },

    setAILoading(loading) {
        const loader = document.getElementById('ai-loader');
        const btn = document.getElementById('ai-submit');
        if (loader) loader.classList.toggle('hidden', !loading);
        if (btn) btn.disabled = loading;
    }
};
