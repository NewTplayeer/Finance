import { ClientModel } from '../models/ClientModel.js';
import { ClientsView } from '../views/ClientsView.js';
import { ModalView } from '../views/ModalView.js';
import { validateDoc, formatDoc } from '../services/validators.js';
import { CnpjService } from '../services/CnpjService.js';
import { state } from '../state.js';

export class ClientsController {
    init() {
        this._bindForm();
        this._bindEditModal();
        this._bindSearch();
        this._bindCnpjLookup();
    }

    startSync() {
        const uid = state.currentUser?.uid;
        if (!uid) return;

        if (state.unsubscribeClients) state.unsubscribeClients();

        state.unsubscribeClients = ClientModel.subscribe(uid, (data) => {
            state.clients = data;
            this.renderClients();
        });
    }

    stopSync() {
        if (state.unsubscribeClients) { state.unsubscribeClients(); state.unsubscribeClients = null; }
    }

    renderClients() {
        const search = document.getElementById('clients-search')?.value?.toLowerCase().trim() || '';
        ClientsView.render(state.clients, search, {
            onEdit: (id) => this.openEditModal(id),
            onDelete: (id) => this.confirmDelete(id)
        });
    }

    openEditModal(id) {
        const client = state.clients.find(c => c.id === id);
        if (!client) return;
        state.editingClientId = id;
        ClientsView.openEditModal(client);
    }

    async saveEdit() {
        if (!state.editingClientId || !state.currentUser) return;

        const name = document.getElementById('edit-client-name')?.value?.trim();
        const rawDoc = document.getElementById('edit-client-doc')?.value?.trim();
        const type = document.getElementById('edit-client-type')?.value;
        const email = document.getElementById('edit-client-email')?.value?.trim();
        const phone = document.getElementById('edit-client-phone')?.value?.trim();

        if (!name || !rawDoc) return ModalView.showToast("Nome e documento são obrigatórios.", 'error');

        const result = validateDoc(rawDoc);
        if (!result.valid) return ModalView.showToast("CPF ou CNPJ inválido. Verifica o número.", 'error');

        await ClientModel.update(state.currentUser.uid, state.editingClientId, {
            name, doc: result.digits, docType: result.type,
            docFormatted: formatDoc(result.digits, result.type),
            type, email, phone
        });

        ModalView.showToast("Cliente atualizado com sucesso!", 'success');
        ClientsView.closeEditModal();
        state.editingClientId = null;
    }

    confirmDelete(id) {
        const client = state.clients.find(c => c.id === id);
        ModalView.openConfirmModal({
            title: "Eliminar Cliente",
            message: `Tens a certeza que desejas eliminar "${client?.name || 'este cliente'}"? Esta ação é irreversível.`,
            confirmLabel: "Sim, eliminar",
            onConfirm: () => this._delete(id)
        });
    }

    async _delete(id) {
        const uid = state.currentUser?.uid;
        if (uid) {
            await ClientModel.delete(uid, id);
            ModalView.showToast("Cliente eliminado.", 'success');
        }
    }

    _bindForm() {
        const form = document.getElementById('client-form');
        if (!form) return;
        form.onsubmit = async (e) => {
            e.preventDefault();
            if (!state.currentUser) return;

            const name = document.getElementById('client-name')?.value?.trim();
            const rawDoc = document.getElementById('client-doc')?.value?.trim();
            const type = document.getElementById('client-type')?.value;
            const email = document.getElementById('client-email')?.value?.trim();
            const phone = document.getElementById('client-phone')?.value?.trim();
            const notes = document.getElementById('client-notes')?.value?.trim();

            if (!name || !rawDoc) return ModalView.showToast("Preenche todos os campos obrigatórios.", 'error');

            const result = validateDoc(rawDoc);
            if (!result.valid) return ModalView.showToast("CPF ou CNPJ inválido.", 'error');

            const dup = state.clients.find(c => c.doc === result.digits);
            if (dup) return ModalView.showToast(`Documento já cadastrado para: ${dup.name}`);

            await ClientModel.add(state.currentUser.uid, {
                name, doc: result.digits, docType: result.type,
                docFormatted: formatDoc(result.digits, result.type),
                type, email, phone, notes: notes || ""
            });

            form.reset();
            ModalView.showToast("Cliente guardado com sucesso!", 'success');
        };
    }

    _bindEditModal() {
        const saveBtn = document.querySelector('[onclick="saveEditClient()"]');
        if (saveBtn) {
            saveBtn.removeAttribute('onclick');
            saveBtn.onclick = () => this.saveEdit();
        }
        const cancelBtn = document.querySelector('#client-modal button:last-child');
        if (cancelBtn && !cancelBtn.onclick) {
            cancelBtn.onclick = () => ClientsView.closeEditModal();
        }
    }

    _bindSearch() {
        const searchEl = document.getElementById('clients-search');
        if (searchEl) searchEl.oninput = () => this.renderClients();
    }

    // Auto-preenche campos ao detectar CNPJ válido
    _bindCnpjLookup() {
        const docInput = document.getElementById('client-doc');
        if (!docInput) return;

        let lookupTimer = null;
        docInput.oninput = () => {
            clearTimeout(lookupTimer);
            const raw = docInput.value.replace(/\D/g, '');
            if (raw.length !== 14) return;

            const indicator = document.getElementById('cnpj-lookup-indicator');
            if (indicator) { indicator.classList.remove('hidden'); indicator.innerText = 'Consultando CNPJ...'; }

            lookupTimer = setTimeout(async () => {
                const result = await CnpjService.lookup(raw);
                if (indicator) indicator.classList.add('hidden');

                if (result) {
                    const nameEl = document.getElementById('client-name');
                    const phoneEl = document.getElementById('client-phone');
                    const emailEl = document.getElementById('client-email');
                    const typeEl = document.getElementById('client-type');

                    if (nameEl && !nameEl.value) nameEl.value = result.name;
                    if (phoneEl && !phoneEl.value) phoneEl.value = result.phone;
                    if (emailEl && !emailEl.value) emailEl.value = result.email;
                    if (typeEl) typeEl.value = result.type;

                    ModalView.showToast(`CNPJ encontrado: ${result.name}`, 'success');
                }
            }, 600);
        };
    }
}
