import { CardModel } from '../models/CardModel.js';
import { state } from '../state.js';
import { ModalView } from '../views/ModalView.js';

export class CardController {
    init() {
        this._bindUI();
    }

    async loadCards(uid) {
        state.cards = await CardModel.getCards(uid);
        this._renderCardsList();
        this._scheduleNotificationCheck();
    }

    _bindUI() {
        document.getElementById('btn-add-card')?.addEventListener('click', () => this._addCard());
        document.getElementById('btn-enable-notifications')?.addEventListener('click', () => this.requestNotificationPermission());
        this.syncNotificationBtn();
    }

    _addCard() {
        const bankName   = document.getElementById('card-bank-name')?.value?.trim();
        const closingDay = parseInt(document.getElementById('card-closing-day')?.value, 10);
        const dueDay     = parseInt(document.getElementById('card-due-day')?.value, 10);

        if (!bankName || !closingDay || !dueDay) {
            ModalView.showToast('Preenche nome do banco, dia de fechamento e dia de vencimento.', 'error');
            return;
        }
        if (closingDay < 1 || closingDay > 31 || dueDay < 1 || dueDay > 31) {
            ModalView.showToast('Dia inválido — deve estar entre 1 e 31.', 'error');
            return;
        }
        if (state.cards.some(c => c.bankName.toLowerCase() === bankName.toLowerCase())) {
            ModalView.showToast('Já existe um cartão com esse nome.', 'error');
            return;
        }

        state.cards = [...state.cards, { bankName, closingDay, dueDay }];
        this._persist();
        this._renderCardsList();

        document.getElementById('card-bank-name').value = '';
        document.getElementById('card-closing-day').value = '';
        document.getElementById('card-due-day').value = '';
        ModalView.showToast(`Cartão ${bankName} adicionado.`, 'success');
    }

    _removeCard(index) {
        const name = state.cards[index]?.bankName || '';
        state.cards = state.cards.filter((_, i) => i !== index);
        this._persist();
        this._renderCardsList();
        ModalView.showToast(`Cartão ${name} removido.`);
    }

    async _persist() {
        const uid = state.currentUser?.uid;
        if (uid) await CardModel.saveCards(uid, state.cards);
    }

    _renderCardsList() {
        const container = document.getElementById('cards-list');
        if (!container) return;

        if (!state.cards.length) {
            container.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-2">Sem cartões cadastrados.</p>`;
            return;
        }

        container.innerHTML = state.cards.map((card, i) => `
            <div class="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3 mb-2">
                <div>
                    <span class="text-sm font-bold text-slate-800">${card.bankName}</span>
                    <div class="flex gap-4 mt-0.5">
                        <span class="text-[10px] text-slate-400">Fecha: dia <strong class="text-slate-600">${card.closingDay}</strong></span>
                        <span class="text-[10px] text-slate-400">Vence: dia <strong class="text-slate-600">${card.dueDay}</strong></span>
                    </div>
                </div>
                <button data-card-remove="${i}" class="text-slate-300 hover:text-rose-500 transition-colors text-sm font-bold px-2">✕</button>
            </div>
        `).join('');

        container.querySelectorAll('[data-card-remove]').forEach(btn => {
            btn.addEventListener('click', () => this._removeCard(parseInt(btn.dataset.cardRemove, 10)));
        });
    }

    _scheduleNotificationCheck() {
        this._checkNotifications();
        // Verifica a cada hora
        setInterval(() => this._checkNotifications(), 60 * 60 * 1000);
    }

    _checkNotifications() {
        if (!state.cards.length) return;
        if (!('Notification' in window) || Notification.permission !== 'granted') return;

        const now         = new Date();
        const today       = now.getDate();
        const monthKey    = now.toISOString().slice(0, 7);
        const tomorrow    = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDay = tomorrow.getDate();

        state.cards.forEach(card => {
            const keyClose = `notif_close_${card.bankName}_${monthKey}`;
            const keyDue   = `notif_due_${card.bankName}_${monthKey}`;

            // Notificação de fechamento: dispara no dia de fechamento
            if (today === card.closingDay && !localStorage.getItem(keyClose)) {
                new Notification('NT Finanças — Fatura fechando hoje!', {
                    body: `A fatura do ${card.bankName} fecha hoje (dia ${card.closingDay}). Verifique os seus gastos.`,
                    icon: 'NT.png'
                });
                localStorage.setItem(keyClose, '1');
            }

            // Notificação de vencimento: dispara 1 dia antes
            if (tomorrowDay === card.dueDay && !localStorage.getItem(keyDue)) {
                new Notification('NT Finanças — Fatura vence amanhã!', {
                    body: `A fatura do ${card.bankName} vence amanhã (dia ${card.dueDay}). Não se esqueça de pagar!`,
                    icon: 'NT.png'
                });
                localStorage.setItem(keyDue, '1');
            }
        });
    }

    async requestNotificationPermission() {
        if (!('Notification' in window)) {
            ModalView.showToast('Notificações não suportadas neste browser.', 'error');
            return;
        }
        const perm = await Notification.requestPermission();
        this.syncNotificationBtn();
        if (perm === 'granted') {
            ModalView.showToast('Notificações activadas!', 'success');
            this._checkNotifications();
        } else {
            ModalView.showToast('Permissão negada. Activa nas definições do browser.', 'error');
        }
    }

    syncNotificationBtn() {
        const btn = document.getElementById('btn-enable-notifications');
        if (!btn || !('Notification' in window)) return;
        const perm = Notification.permission;
        if (perm === 'granted') {
            btn.innerHTML = '🔔 Notificações Activas';
            btn.disabled = true;
            btn.className = 'w-full py-3 bg-emerald-50 text-emerald-700 font-bold rounded-2xl border border-emerald-200 text-xs';
        } else {
            btn.innerHTML = '🔕 Activar Notificações de Faturas';
            btn.disabled = false;
            btn.className = 'w-full py-3 bg-indigo-50 text-indigo-600 font-bold rounded-2xl border border-indigo-200 hover:bg-indigo-100 transition text-xs';
        }
    }
}
