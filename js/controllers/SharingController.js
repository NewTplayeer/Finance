/**
 * SharingController — gere a criação, entrada e saída de espaços partilhados.
 * Usa SharedSpaceModel para operações no Firestore e UserModel para guardar o spaceId no perfil.
 */
import { SharedSpaceModel } from '../models/SharedSpaceModel.js';
import { UserModel } from '../models/UserModel.js';
import { ModalView } from '../views/ModalView.js';
import { state } from '../state.js';

export class SharingController {
    /**
     * @param {{ onModeChange: function }} options
     */
    constructor({ onModeChange }) {
        this.onModeChange = onModeChange;
    }

    /** Regista todos os listeners dos botões de espaço partilhado no modal de perfil */
    init() {
        this._bindProfileButtons();
    }

    /** Regista os listeners dos botões Criar, Entrar, Sair e Copiar código */
    _bindProfileButtons() {
        const createBtn = document.getElementById('btn-create-space');
        if (createBtn) createBtn.onclick = () => this.createSpace();

        const joinBtn = document.getElementById('btn-join-space');
        if (joinBtn) joinBtn.onclick = () => this.joinSpace();

        const leaveBtn = document.getElementById('btn-leave-space');
        if (leaveBtn) leaveBtn.onclick = () => this.leaveSpace();

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

    /** Cria um novo espaço partilhado e associa ao utilizador actual */
    async createSpace() {
        const uid      = state.currentUser?.uid;
        if (!uid) return;
        const userName = state.userName || "Utilizador";

        try {
            const spaceId = await SharedSpaceModel.create(uid, userName);
            console.log('[Sharing] Espaço criado:', spaceId);
            await UserModel.savePrefs(uid, { sharedSpaceId: spaceId });
            state.sharedSpaceId = spaceId;

            const codeEl = document.getElementById('shared-space-code');
            if (codeEl) codeEl.innerText = spaceId;
            document.getElementById('shared-space-info')?.classList.remove('hidden');
            document.getElementById('btn-create-space')?.classList.add('hidden');
            document.getElementById('join-space-section')?.classList.add('hidden');

            // Fecha o modal e muda automaticamente para o modo partilhado
            document.getElementById('profile-modal')?.classList.add('hidden');
            this._switchToShared();

            ModalView.showToast(`Espaço criado! Código: ${spaceId} · Já estás em modo Partilhado`, 'success');
        } catch (e) {
            console.error('[Sharing] Erro ao criar espaço:', e);
            ModalView.showToast('Erro ao criar espaço: ' + (e.code || e.message), 'error');
        }
    }

    /** Entra num espaço partilhado existente com o código introduzido */
    async joinSpace() {
        const code = document.getElementById('join-space-code-input')?.value?.trim().toUpperCase();
        if (!code || code.length < 4) {
            ModalView.showToast('Introduz um código válido (mínimo 4 caracteres).', 'error');
            return;
        }

        const uid      = state.currentUser?.uid;
        if (!uid) return;
        const userName = state.userName || 'Utilizador';

        try {
            console.log('[Sharing] A entrar no espaço:', code, 'uid:', uid);
            const spaceId = await SharedSpaceModel.join(uid, code, userName);
            console.log('[Sharing] Entrou no espaço:', spaceId);

            await UserModel.savePrefs(uid, { sharedSpaceId: spaceId });
            state.sharedSpaceId = spaceId;

            const codeEl = document.getElementById('shared-space-code');
            if (codeEl) codeEl.innerText = spaceId;
            document.getElementById('shared-space-info')?.classList.remove('hidden');
            document.getElementById('btn-create-space')?.classList.add('hidden');
            document.getElementById('join-space-section')?.classList.add('hidden');

            // Fecha o modal e muda automaticamente para o modo partilhado
            document.getElementById('profile-modal')?.classList.add('hidden');
            this._switchToShared();

            ModalView.showToast('Entrou no espaço partilhado! Já estás em modo Partilhado.', 'success');
        } catch (e) {
            console.error('[Sharing] Erro ao entrar no espaço:', e);
            const msg = e.code === 'permission-denied'
                ? 'Sem permissão. Verifica as regras do Firestore (ver consola).'
                : (e.message || 'Erro desconhecido.');
            ModalView.showToast(msg, 'error');
        }
    }

    /** Muda state.viewMode para 'shared' e notifica os controllers */
    _switchToShared() {
        state.viewMode = 'shared';
        console.log('[Sharing] Modo alterado para shared. spaceId:', state.sharedSpaceId);
        if (this.onModeChange) this.onModeChange('shared');
    }

    /** Abre confirmação e remove o utilizador do espaço partilhado activo */
    async leaveSpace() {
        ModalView.openConfirmModal({
            title: 'Sair do Espaço Partilhado',
            message: 'Tens a certeza? As tuas transações partilhadas permanecerão. Para voltar, precisas do mesmo código.',
            confirmLabel: 'Sim, sair',
            onConfirm: async () => {
                const uid = state.currentUser?.uid;
                if (!uid) return;
                await UserModel.savePrefs(uid, { sharedSpaceId: null });
                state.sharedSpaceId = null;
                state.viewMode      = 'personal';

                document.getElementById('shared-space-info')?.classList.add('hidden');
                document.getElementById('btn-create-space')?.classList.remove('hidden');
                document.getElementById('join-space-section')?.classList.remove('hidden');

                if (this.onModeChange) this.onModeChange('personal');
                ModalView.showToast('Saíste do espaço partilhado.', 'success');
            }
        });
    }
}
