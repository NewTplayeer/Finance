export const ModalView = {
    showToast(msg) {
        const t = document.getElementById('toast');
        const tm = document.getElementById('toast-message');
        if (!t || !tm) return;
        tm.innerText = msg;
        t.classList.remove('translate-y-32', 'opacity-0');
        setTimeout(() => t.classList.add('translate-y-32', 'opacity-0'), 7000);
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
