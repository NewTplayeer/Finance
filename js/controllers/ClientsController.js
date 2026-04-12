/**
 * ClientsController — gere o CRUD de clientes e fornecedores.
 * Faz consulta automática de CNPJ via CnpjService e valida CPF/CNPJ antes de guardar.
 */
import { ClientModel } from '../models/ClientModel.js';
import { ClientsView } from '../views/ClientsView.js';
import { ModalView } from '../views/ModalView.js';
import { validateDoc, formatDoc } from '../services/validators.js';
import { CnpjService } from '../services/CnpjService.js';
import { state } from '../state.js';

export class ClientsController {
    /** Inicializa todos os event listeners da secção de clientes */
    init() {
        this._bindForm();
        this._bindEditModal();
        this._bindSearch();
        this._bindCnpjLookup();
    }

    /** Inicia a sincronização em tempo real com o Firestore */
    startSync() {
        const uid = state.currentUser?.uid;
        if (!uid) return;

        if (state.unsubscribeClients) state.unsubscribeClients();

        state.unsubscribeClients = ClientModel.subscribe(uid, (data) => {
            state.clients = data;
            this.renderClients();
        });
    }

    /** Para a sincronização activa */
    stopSync() {
        if (state.unsubscribeClients) { state.unsubscribeClients(); state.unsubscribeClients = null; }
    }

    /** Re-renderiza a tabela de clientes aplicando o filtro de pesquisa actual */
    renderClients() {
        const search = document.getElementById('clients-search')?.value?.toLowerCase().trim() || '';
        ClientsView.render(state.clients, search, {
            onEdit:   (id) => this.openEditModal(id),
            onDelete: (id) => this.confirmDelete(id)
        });
    }

    /**
     * Abre o modal de edição pré-preenchido com os dados do cliente.
     * @param {string} id - ID do cliente a editar
     */
    openEditModal(id) {
        const client = state.clients.find(c => c.id === id);
        if (!client) return;
        state.editingClientId = id;
        ClientsView.openEditModal(client);
    }

    /** Lê os campos do modal de edição, valida e guarda as alterações no Firestore */
    async saveEdit() {
        if (!state.editingClientId || !state.currentUser) return;

        const name   = document.getElementById('edit-client-name')?.value?.trim();
        const rawDoc = document.getElementById('edit-client-doc')?.value?.trim();
        const type   = document.getElementById('edit-client-type')?.value;
        const email  = document.getElementById('edit-client-email')?.value?.trim();
        const phone  = document.getElementById('edit-client-phone')?.value?.trim();

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

    /**
     * Abre confirmação antes de apagar um cliente.
     * @param {string} id
     */
    confirmDelete(id) {
        const client = state.clients.find(c => c.id === id);
        ModalView.openConfirmModal({
            title:        "Eliminar Cliente",
            message:      `Tens a certeza que desejas eliminar "${client?.name || 'este cliente'}"? Esta ação é irreversível.`,
            confirmLabel: "Sim, eliminar",
            onConfirm:    () => this._delete(id)
        });
    }

    /**
     * Apaga um cliente do Firestore.
     * @param {string} id
     */
    async _delete(id) {
        const uid = state.currentUser?.uid;
        if (uid) {
            await ClientModel.delete(uid, id);
            ModalView.showToast("Cliente eliminado.", 'success');
        }
    }

    /** Regista o submit do formulário de novo cliente com validação de documento */
    _bindForm() {
        const form = document.getElementById('client-form');
        if (!form) return;
        form.onsubmit = async (e) => {
            e.preventDefault();
            if (!state.currentUser) return;

            const name   = document.getElementById('client-name')?.value?.trim();
            const rawDoc = document.getElementById('client-doc')?.value?.trim();
            const type   = document.getElementById('client-type')?.value;
            const email  = document.getElementById('client-email')?.value?.trim();
            const phone  = document.getElementById('client-phone')?.value?.trim();
            const notes  = document.getElementById('client-notes')?.value?.trim();

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

    /** Remove onclick inline dos botões do modal de edição e regista listeners limpos */
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

    /** Regista o listener do campo de pesquisa para filtrar a lista em tempo real */
    _bindSearch() {
        const searchEl = document.getElementById('clients-search');
        if (searchEl) searchEl.oninput = () => this.renderClients();
    }

    /**
     * Monitoriza o campo de documento; quando detecta um CNPJ de 14 dígitos, consulta
     * a API ReceitaWS e preenche automaticamente nome, telefone, e-mail e tipo.
     */
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
                    const nameEl  = document.getElementById('client-name');
                    const phoneEl = document.getElementById('client-phone');
                    const emailEl = document.getElementById('client-email');
                    const typeEl  = document.getElementById('client-type');

                    if (nameEl  && !nameEl.value)  nameEl.value  = result.name;
                    if (phoneEl && !phoneEl.value) phoneEl.value = result.phone;
                    if (emailEl && !emailEl.value) emailEl.value = result.email;
                    if (typeEl) typeEl.value = result.type;

                    ModalView.showToast(`CNPJ encontrado: ${result.name}`, 'success');
                }
            }, 600);
        };
    }
}
