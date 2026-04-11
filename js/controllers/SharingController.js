import { SharedSpaceModel } from '../models/SharedSpaceModel.js';
import { UserModel } from '../models/UserModel.js';
import { ModalView } from '../views/ModalView.js';
import { DashboardView } from '../views/DashboardView.js';
import { state } from '../state.js';

export class SharingController {
    constructor({ onModeChange }) {
        this.onModeChange = onModeChange;
    }

    init() {
        this._bindProfileButtons();
    }

    _bindProfileButtons() {
        // Botão "Criar Espaço Partilhado"
        const createBtn = document.getElementById('btn-create-space');
        if (createBtn) {
            createBtn.onclick = () => this.createSpace();
        }

        // Botão "Entrar com Código"
        const joinBtn = document.getElementById('btn-join-space');
        if (joinBtn) {
            joinBtn.onclick = () => this.joinSpace();
        }

        // Botão "Sair do Espaço"
        const leaveBtn = document.getElementById('btn-leave-space');
        if (leaveBtn) {
            leaveBtn.onclick = () => this.leaveSpace();
        }

        // Copiar código
        const copyBtn = document.getElementById('btn-copy-space-code');
        if (copyBtn) {
            copyBtn.onclick = () => {
                const code = document.getElementById('shared-space-code')?.innerText;
                if (code) {
                    navigator.clipboard.writeText(code)
                        .then(() => ModalView.showToast("Código copiado!", 'success'));
                }
            };
        }
    }

    async createSpace() {
        const uid = state.currentUser?.uid;
        if (!uid) return;
        const userName = state.userName || "Utilizador";

        try {
            const spaceId = await SharedSpaceModel.create(uid, userName);
            await UserModel.savePrefs(uid, { sharedSpaceId: spaceId });
            state.sharedSpaceId = spaceId;

            // Actualiza UI
            document.getElementById('shared-space-code')?.parentElement?.classList.remove('hidden');
            const codeEl = document.getElementById('shared-space-code');
            if (codeEl) codeEl.innerText = spaceId;
            document.getElementById('shared-space-info')?.classList.remove('hidden');
            document.getElementById('btn-create-space')?.classList.add('hidden');
            document.getElementById('join-space-section')?.classList.add('hidden');

            ModalView.showToast(`Espaço criado! Partilha o código: ${spaceId}`, 'success');
        } catch (e) {
            ModalView.showToast("Erro ao criar espaço: " + e.message, 'error');
        }
    }

    async joinSpace() {
        const code = document.getElementById('join-space-code-input')?.value?.trim().toUpperCase();
        if (!code || code.length < 4) {
            ModalView.showToast("Introduz um código válido.", 'error');
            return;
        }

        const uid = state.currentUser?.uid;
        if (!uid) return;
        const userName = state.userName || "Utilizador";

        try {
            const spaceId = await SharedSpaceModel.join(uid, code, userName);
            await UserModel.savePrefs(uid, { sharedSpaceId: spaceId });
            state.sharedSpaceId = spaceId;

            // Actualiza UI
            const codeEl = document.getElementById('shared-space-code');
            if (codeEl) codeEl.innerText = spaceId;
            document.getElementById('shared-space-info')?.classList.remove('hidden');
            document.getElementById('btn-create-space')?.classList.add('hidden');
            document.getElementById('join-space-section')?.classList.add('hidden');

            ModalView.showToast("Entrou no espaço partilhado!", 'success');

            // Actualiza botão de modo partilhado
            DashboardView.updateViewModeUI('personal');
        } catch (e) {
            ModalView.showToast(e.message, 'error');
        }
    }

    async leaveSpace() {
        ModalView.openConfirmModal({
            title: "Sair do Espaço Partilhado",
            message: "Tens a certeza? As tuas transações partilhadas permanecerão. Para voltar, precisas do mesmo código.",
            confirmLabel: "Sim, sair",
            onConfirm: async () => {
                const uid = state.currentUser?.uid;
                if (!uid) return;
                await UserModel.savePrefs(uid, { sharedSpaceId: null });
                state.sharedSpaceId = null;
                state.viewMode = 'personal';

                // Actualiza UI
                document.getElementById('shared-space-info')?.classList.add('hidden');
                document.getElementById('btn-create-space')?.classList.remove('hidden');
                document.getElementById('join-space-section')?.classList.remove('hidden');

                if (this.onModeChange) this.onModeChange('personal');
                ModalView.showToast("Saíste do espaço partilhado.", 'success');
            }
        });
    }
}
