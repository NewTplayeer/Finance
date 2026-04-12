/**
 * CardController — gere os cartões bancários com datas de fatura e notificações automáticas.
 * Persiste os cartões no Firestore via CardModel e usa a Notifications API do browser.
 */
import { CardModel } from '../models/CardModel.js';
import { state } from '../state.js';
import { ModalView } from '../views/ModalView.js';

/**
 * Calcula o dia efectivo de fechamento/vencimento para um mês específico.
 * Se o dia configurado cair em sábado (6) ou domingo (0), prorroga para a segunda-feira seguinte.
 * Caso o dia não exista no mês (ex: dia 31 em Junho), usa o último dia do mês antes de ajustar.
 *
 * @param {number} year       - Ano (ex: 2026)
 * @param {number} month      - Mês 0-indexed (0 = Janeiro … 11 = Dezembro)
 * @param {number} configDay  - Dia configurado pelo utilizador (1–31)
 * @returns {{ day: number, postponed: boolean, weekday: string }}
 */
function effectiveDay(year, month, configDay) {
    // Clamp ao último dia do mês (ex: 31 de Junho → 30)
    const lastDay = new Date(year, month + 1, 0).getDate();
    const clamped = Math.min(configDay, lastDay);
    const d = new Date(year, month, clamped);

    const wd = d.getDay(); // 0 = Dom, 6 = Sáb
    if (wd === 6) d.setDate(d.getDate() + 2); // Sáb → Seg
    if (wd === 0) d.setDate(d.getDate() + 1); // Dom → Seg

    const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return {
        day:       d.getDate(),
        postponed: d.getDate() !== clamped,
        weekday:   DAYS[d.getDay()]
    };
}

export class CardController {
    /** Inicializa os event listeners da UI de cartões */
    init() {
        this._bindUI();
    }

    /**
     * Carrega os cartões do Firestore e agenda verificação de notificações.
     * @param {string} uid - UID do utilizador autenticado
     */
    async loadCards(uid) {
        state.cards = await CardModel.getCards(uid);
        this._renderCardsList();
        this._scheduleNotificationCheck();
    }

    /** Regista os listeners dos botões Adicionar e Activar Notificações */
    _bindUI() {
        document.getElementById('btn-add-card')?.addEventListener('click', () => this._addCard());
        document.getElementById('btn-enable-notifications')?.addEventListener('click', () => this.requestNotificationPermission());
        this.syncNotificationBtn();
    }

    /** Lê os campos do formulário e adiciona um novo cartão ao estado e ao Firestore */
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

        document.getElementById('card-bank-name').value    = '';
        document.getElementById('card-closing-day').value  = '';
        document.getElementById('card-due-day').value      = '';
        ModalView.showToast(`Cartão ${bankName} adicionado.`, 'success');
    }

    /**
     * Remove um cartão pelo índice no array e persiste a alteração.
     * @param {number} index - índice do cartão em state.cards
     */
    _removeCard(index) {
        const name   = state.cards[index]?.bankName || '';
        state.cards  = state.cards.filter((_, i) => i !== index);
        this._persist();
        this._renderCardsList();
        ModalView.showToast(`Cartão ${name} removido.`);
    }

    /** Guarda o array de cartões no Firestore */
    async _persist() {
        const uid = state.currentUser?.uid;
        if (uid) await CardModel.saveCards(uid, state.cards);
    }

    /** Renderiza a lista de cartões no container #cards-list do modal de perfil */
    _renderCardsList() {
        const container = document.getElementById('cards-list');
        if (!container) return;

        if (!state.cards.length) {
            container.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-2">Sem cartões cadastrados.</p>`;
            return;
        }

        const now = new Date();
        const y   = now.getFullYear();
        const m   = now.getMonth();

        container.innerHTML = state.cards.map((card, i) => {
            const closing = effectiveDay(y, m, card.closingDay);
            const due     = effectiveDay(y, m, card.dueDay);

            const closingLabel = closing.postponed
                ? `<strong class="text-amber-600">${closing.day}</strong> <span class="text-amber-500">(${closing.weekday} — prorrogado)</span>`
                : `<strong class="text-slate-600">${closing.day}</strong> <span class="text-slate-400">(${closing.weekday})</span>`;

            const dueLabel = due.postponed
                ? `<strong class="text-amber-600">${due.day}</strong> <span class="text-amber-500">(${due.weekday} — prorrogado)</span>`
                : `<strong class="text-slate-600">${due.day}</strong> <span class="text-slate-400">(${due.weekday})</span>`;

            return `
                <div class="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3 mb-2">
                    <div>
                        <span class="text-sm font-bold text-slate-800">${card.bankName}</span>
                        <div class="flex gap-4 mt-0.5 flex-wrap">
                            <span class="text-[10px] text-slate-400">Fecha: dia ${closingLabel}</span>
                            <span class="text-[10px] text-slate-400">Vence: dia ${dueLabel}</span>
                        </div>
                        ${(closing.postponed || due.postponed) ? `<div class="text-[9px] text-amber-500 mt-1">Configurado: fecha dia ${card.closingDay} · vence dia ${card.dueDay}</div>` : ''}
                    </div>
                    <button data-card-remove="${i}" class="text-slate-300 hover:text-rose-500 transition-colors text-sm font-bold px-2">✕</button>
                </div>
            `;
        }).join('');

        container.querySelectorAll('[data-card-remove]').forEach(btn => {
            btn.addEventListener('click', () => this._removeCard(parseInt(btn.dataset.cardRemove, 10)));
        });
    }

    /**
     * Executa a verificação imediatamente e agenda re-verificação a cada hora.
     * Usa setInterval para não bloquear o event loop.
     */
    _scheduleNotificationCheck() {
        this._checkNotifications();
        setInterval(() => this._checkNotifications(), 60 * 60 * 1000);
    }

    /**
     * Verifica se hoje é dia de fechamento ou dia anterior ao vencimento de algum cartão
     * e dispara notificações do browser (com deduplicação por mês via localStorage).
     */
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

            // Usa o dia efectivo (prorrogado se cair em fim-de-semana)
            const effClose = effectiveDay(now.getFullYear(), now.getMonth(), card.closingDay);
            const effDue   = effectiveDay(now.getFullYear(), now.getMonth(), card.dueDay);

            if (today === effClose.day && !localStorage.getItem(keyClose)) {
                const note = effClose.postponed ? ` (prorrogado do dia ${card.closingDay})` : '';
                new Notification('NT Finanças — Fatura fechando hoje!', {
                    body: `A fatura do ${card.bankName} fecha hoje (dia ${effClose.day}${note}). Verifique os seus gastos.`,
                    icon: 'NT.png'
                });
                localStorage.setItem(keyClose, '1');
            }

            if (tomorrowDay === effDue.day && !localStorage.getItem(keyDue)) {
                const note = effDue.postponed ? ` (prorrogado do dia ${card.dueDay})` : '';
                new Notification('NT Finanças — Fatura vence amanhã!', {
                    body: `A fatura do ${card.bankName} vence amanhã (dia ${effDue.day}${note}). Não se esqueça de pagar!`,
                    icon: 'NT.png'
                });
                localStorage.setItem(keyDue, '1');
            }
        });
    }

    /** Solicita permissão de notificações ao browser e actualiza o botão */
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

    /** Actualiza o estilo e texto do botão de notificações conforme o estado actual da permissão */
    syncNotificationBtn() {
        const btn = document.getElementById('btn-enable-notifications');
        if (!btn || !('Notification' in window)) return;
        const perm = Notification.permission;
        if (perm === 'granted') {
            btn.innerHTML  = '🔔 Notificações Activas';
            btn.disabled   = true;
            btn.className  = 'w-full py-3 bg-emerald-50 text-emerald-700 font-bold rounded-2xl border border-emerald-200 text-xs';
        } else {
            btn.innerHTML  = '🔕 Activar Notificações de Faturas';
            btn.disabled   = false;
            btn.className  = 'w-full py-3 bg-indigo-50 text-indigo-600 font-bold rounded-2xl border border-indigo-200 hover:bg-indigo-100 transition text-xs';
        }
    }
}
