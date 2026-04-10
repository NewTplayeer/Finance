const TYPE_BADGE = {
    'Cliente':    'bg-blue-50 text-blue-600 border border-blue-100',
    'Fornecedor': 'bg-amber-50 text-amber-600 border border-amber-100',
    'Ambos':      'bg-purple-50 text-purple-600 border border-purple-100'
};

export const ClientsView = {
    render(clients, search = '', { onEdit, onDelete } = {}) {
        const tbody = document.getElementById('clients-list');
        const countEl = document.getElementById('clients-count');
        if (!tbody) return;

        const filtered = clients.filter(c =>
            (c.name || '').toLowerCase().includes(search) ||
            (c.docFormatted || '').toLowerCase().includes(search) ||
            (c.doc || '').includes(search)
        );

        if (countEl) countEl.innerText = `(${filtered.length})`;

        if (!filtered.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-slate-400 italic font-medium">Nenhum cliente/fornecedor encontrado.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach(c => {
            const badge = TYPE_BADGE[c.type] || 'bg-slate-100 text-slate-500';
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50/50 transition-all';
            tr.innerHTML = `
                <td class="px-6 py-5 font-bold text-slate-800">${c.name}</td>
                <td class="px-6 py-5 font-mono text-sm text-slate-600">
                    <span class="text-[10px] font-bold uppercase text-slate-400 mr-1">${c.docType}</span>${c.docFormatted || c.doc}
                </td>
                <td class="px-6 py-5 text-center">
                    <span class="px-3 py-1 rounded-full text-[10px] font-bold uppercase ${badge}">${c.type}</span>
                </td>
                <td class="px-6 py-5 text-slate-500 text-sm">${c.email || '—'}</td>
                <td class="px-6 py-5 text-slate-500 text-sm">${c.phone || '—'}</td>
                <td class="px-6 py-5 text-center">
                    <div class="flex items-center justify-center gap-3">
                        <button data-action="edit-client" data-id="${c.id}" class="text-slate-300 hover:text-indigo-500 transition-colors" title="Editar">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                        <button data-action="delete-client" data-id="${c.id}" class="text-slate-300 hover:text-rose-500 transition-colors" title="Eliminar">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.addEventListener('click', (e) => {
            const editBtn = e.target.closest('[data-action="edit-client"]');
            const deleteBtn = e.target.closest('[data-action="delete-client"]');
            if (editBtn && onEdit) onEdit(editBtn.dataset.id);
            if (deleteBtn && onDelete) onDelete(deleteBtn.dataset.id);
        }, { once: true });
    },

    openEditModal(client) {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        set('edit-client-name', client.name || '');
        set('edit-client-doc', client.docFormatted || client.doc || '');
        set('edit-client-type', client.type || 'Cliente');
        set('edit-client-email', client.email || '');
        set('edit-client-phone', client.phone || '');
        document.getElementById('client-modal')?.classList.remove('hidden');
    },

    closeEditModal() {
        document.getElementById('client-modal')?.classList.add('hidden');
    }
};
