/**
 * AICommandService — interpreta comandos em linguagem natural e executa operações
 * CRUD em transações, empréstimos, assinaturas e cofrinhos via Google Gemini.
 */
import { geminiConfig }       from '../config.js';
import { state }              from '../state.js';
import { LoanModel }          from '../models/LoanModel.js';
import { SavingsModel }       from '../models/SavingsModel.js';
import { SubscriptionModel }  from '../models/SubscriptionModel.js';
import { TransactionModel }   from '../models/TransactionModel.js';
import { ModalView }          from '../views/ModalView.js';
import { DashboardView }      from '../views/DashboardView.js';
import { DateUtils }          from '../utils/DateUtils.js';

const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const AICommandService = {
    /**
     * Ponto de entrada: interpreta o texto e executa a operação correspondente.
     * @param {string} text - comando em linguagem natural
     * @param {string} currentMonth - mês activo no formato YYYY-MM
     */
    async handle(text, currentMonth) {
        const uid     = state.currentUser?.uid;
        const spaceId = (state.viewMode === 'shared' && state.sharedSpaceId) ? state.sharedSpaceId : null;

        if (!text || !uid) return;

        ModalView.setAILoading(true);
        try {
            const intent = await this._parseIntent(text);
            if (!intent?.action || !intent?.entity) {
                ModalView.showToast('IA não compreendeu o comando. Tenta reformulá-lo.', 'error');
                DashboardView.setAIStatus(false);
                return;
            }
            await this._execute(intent, uid, spaceId, currentMonth);
        } catch (e) {
            console.error('[AICommand]', e);
            this._handleError(e);
            DashboardView.setAIStatus(false);
        } finally {
            ModalView.setAILoading(false);
        }
    },

    // ─── Parsing ─────────────────────────────────────────────────────────────

    async _parseIntent(text) {
        if (!geminiConfig.apiKey) {
            throw Object.assign(new Error('Chave Gemini não configurada.'), { code: 'NO_KEY' });
        }

        const loans = (state.loans         || []).map(l => ({ id: l.id, debtor: l.debtor, amount: l.amount }));
        const subs  = (state.subscriptions || []).map(s => ({ id: s.id, desc: s.desc, amount: s.amount, active: s.active }));
        const jars  = (state.savings        || []).map(j => ({ id: j.id, name: j.name, saved: j.saved, goal: j.goal }));
        const today = new Date().toISOString().slice(0, 10);

        const prompt = `Você é um assistente financeiro. Analise o comando em português e retorne APENAS JSON válido, sem texto extra, sem markdown.

ENTIDADES E CAMPOS:
- transaction: desc, amount(>0), category(Receita/Alimentação/Transporte/Saúde/Lazer/Casa/Educação/Vestuário/Serviços/Outros), method(Dinheiro/Pix/Cartão Débito/Cartão/Boleto), bank
- loan: debtor, amount, interestRate(%), startDate(YYYY-MM-DD), dueDate(YYYY-MM-DD), installments, paymentType(Saldo/Parcela), paymentDay(1-31), method(Dinheiro/Pix/Cartão/Boleto), notes
- subscription: desc, amount, category, method(Dinheiro/Pix/Cartão Débito/Cartão/Boleto), bank, dayOfMonth(1-31)
- savings: name, emoji, goal(meta em R$), yieldRate(%anual)

REGISTOS EXISTENTES (para identificar alvos em edições/deleções):
Empréstimos: ${JSON.stringify(loans)}
Assinaturas: ${JSON.stringify(subs)}
Cofrinhos: ${JSON.stringify(jars)}

FORMATOS DE RESPOSTA:
- Criar 1 registo: {"action":"create","entity":"ENTIDADE","data":{...campos}}
- Criar várias transações: {"action":"create","entity":"transaction","items":[{...},{...}]}
- Editar: {"action":"edit","entity":"ENTIDADE","targetId":"ID_EXATO","data":{...campos alterados}}
- Apagar permanentemente: {"action":"delete","entity":"ENTIDADE","targetId":"ID_EXATO"}
- Cancelar assinatura (soft-delete): {"action":"cancel","entity":"subscription","targetId":"ID_EXATO"}
- Depositar em cofrinho: {"action":"deposit","entity":"savings","targetId":"ID_EXATO","data":{"amount":X}}
- Levantar/sacar de cofrinho: {"action":"withdraw","entity":"savings","targetId":"ID_EXATO","data":{"amount":X}}

REGRAS DE CLASSIFICAÇÃO:
- Gastos ou receitas do dia a dia → entity "transaction"
- Menções a empréstimo, devedor, juros, credor → entity "loan"
- Recorrente/mensal/assinatura/netflix/spotify/plano → entity "subscription"
- Cofrinho/poupança/guardar/economizar/meta → entity "savings"
- Para editar ou apagar, usa o ID exato do registo existente com nome/descrição mais próximo ao pedido
- Data atual: ${today}

Comando: "${text}"`;

        const modelName = geminiConfig.model || 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiConfig.apiKey}`;

        let response;
        try {
            response = await fetch(url, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    contents:         [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
                })
            });
        } catch (fetchErr) {
            throw Object.assign(new Error(fetchErr.message || 'Falha de rede'), { code: 'NETWORK' });
        }

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            throw Object.assign(new Error(errBody?.error?.message || `HTTP ${response.status}`), {
                code:      response.status,
                apiStatus: errBody?.error?.status || ''
            });
        }

        const res = await response.json();
        const raw = res.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (!raw) {
            const reason = res.candidates?.[0]?.finishReason || 'UNKNOWN';
            throw Object.assign(new Error(`Gemini bloqueou (${reason}).`), { code: 'BLOCKED' });
        }

        let intent;
        try {
            intent = JSON.parse(raw);
        } catch {
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) intent = JSON.parse(match[0]);
            else throw new Error('Resposta da IA não é JSON válido');
        }

        return intent;
    },

    // ─── Execução ────────────────────────────────────────────────────────────

    async _execute(intent, uid, spaceId, currentMonth) {
        const { action, entity, data = {}, items, targetId } = intent;

        switch (entity) {
            case 'transaction':
                await this._handleTransaction(action, data, items, targetId, uid, spaceId, currentMonth);
                break;
            case 'loan':
                await this._handleLoan(action, data, targetId, uid, spaceId);
                break;
            case 'subscription':
                await this._handleSubscription(action, data, targetId, uid, spaceId);
                break;
            case 'savings':
                await this._handleSavings(action, data, targetId, uid, spaceId);
                break;
            default:
                ModalView.showToast('IA não reconheceu o tipo de registo.', 'error');
        }
    },

    // ─── Transações ──────────────────────────────────────────────────────────

    async _handleTransaction(action, data, items, targetId, uid, spaceId, currentMonth) {
        if (action === 'create') {
            const list = Array.isArray(items) ? items : [data];
            const normalised = list.map(i => ({
                desc:     i.desc     || 'Sem descrição',
                amount:   parseFloat(i.amount)   || 0,
                category: i.category || 'Outros',
                method:   i.method   || 'Dinheiro/Pix',
                bank:     i.bank     || ''
            })).filter(i => i.amount > 0);

            if (!normalised.length) {
                ModalView.showToast('IA não conseguiu extrair dados. Tenta ser mais específico.', 'error');
                DashboardView.setAIStatus(true);
                return;
            }

            const confirmed = await ModalView.openAIConfirmModal(normalised);
            if (!confirmed) { ModalView.showToast('Operação cancelada.'); return; }

            for (const i of normalised) {
                await TransactionModel.add(uid, { ...i, dateKey: currentMonth }, spaceId);
            }
            ModalView.showToast(`${normalised.length} transação(ões) adicionada(s)!`, 'success');
            DashboardView.setAIStatus(true);
            const input = document.getElementById('ai-input');
            if (input) input.value = '';
            return;
        }

        if (action === 'edit' && targetId) {
            const tx = (state.transactions || []).find(t => t.id === targetId);
            if (!tx) { ModalView.showToast('Transação não encontrada.', 'error'); return; }
            const confirmed = await this._confirmAction(
                `Editar transação "${tx.desc}"`, this._formatFields(data)
            );
            if (!confirmed) { ModalView.showToast('Operação cancelada.'); return; }
            await TransactionModel.update(uid, targetId, data, spaceId);
            ModalView.showToast('Transação actualizada!', 'success');
            DashboardView.setAIStatus(true);
            return;
        }

        if (action === 'delete' && targetId) {
            const tx = (state.transactions || []).find(t => t.id === targetId);
            if (!tx) { ModalView.showToast('Transação não encontrada.', 'error'); return; }
            const confirmed = await this._confirmAction(`Apagar transação "${tx.desc}"?`, '');
            if (!confirmed) { ModalView.showToast('Operação cancelada.'); return; }
            await TransactionModel.delete(uid, targetId, spaceId);
            ModalView.showToast('Transação apagada!', 'success');
            DashboardView.setAIStatus(true);
        }
    },

    // ─── Empréstimos ─────────────────────────────────────────────────────────

    async _handleLoan(action, data, targetId, uid, spaceId) {
        if (action === 'create') {
            if (!data.debtor || !data.amount) {
                ModalView.showToast('IA precisa do nome do devedor e do valor.', 'error'); return;
            }
            const installments = data.installments ||
                (data.startDate && data.dueDate ? DateUtils.monthsBetween(data.startDate, data.dueDate) : 1);
            const confirmed = await this._confirmAction(
                `Criar empréstimo — ${data.debtor}`,
                `Valor: ${fmt(data.amount)} | Parcelas: ${installments} | Juros: ${data.interestRate || 0}%`
            );
            if (!confirmed) { ModalView.showToast('Operação cancelada.'); return; }
            await LoanModel.add(uid, {
                debtor:       data.debtor,
                amount:       parseFloat(data.amount),
                interestRate: parseFloat(data.interestRate) || 0,
                startDate:    data.startDate   || '',
                dueDate:      data.dueDate     || '',
                installments: Math.max(1, parseInt(installments) || 1),
                paymentDay:   data.paymentDay  || null,
                paymentType:  data.paymentType || 'Saldo',
                method:       data.method      || 'Dinheiro',
                notes:        data.notes       || ''
            }, spaceId);
            ModalView.showToast(`Empréstimo de ${fmt(data.amount)} a ${data.debtor} criado!`, 'success');
            return;
        }

        if (action === 'edit' && targetId) {
            const loan = (state.loans || []).find(l => l.id === targetId);
            if (!loan) { ModalView.showToast('Empréstimo não encontrado.', 'error'); return; }
            const confirmed = await this._confirmAction(
                `Editar empréstimo — ${loan.debtor}`, this._formatFields(data)
            );
            if (!confirmed) { ModalView.showToast('Operação cancelada.'); return; }
            await LoanModel.update(uid, targetId, data, spaceId);
            ModalView.showToast(`Empréstimo de ${loan.debtor} actualizado!`, 'success');
            return;
        }

        if (action === 'delete' && targetId) {
            const loan = (state.loans || []).find(l => l.id === targetId);
            if (!loan) { ModalView.showToast('Empréstimo não encontrado.', 'error'); return; }
            const confirmed = await this._confirmAction(
                `Apagar empréstimo de ${loan.debtor} (${fmt(loan.amount)})?`, ''
            );
            if (!confirmed) { ModalView.showToast('Operação cancelada.'); return; }
            await LoanModel.delete(uid, targetId, spaceId);
            ModalView.showToast(`Empréstimo de ${loan.debtor} apagado!`, 'success');
        }
    },

    // ─── Assinaturas ─────────────────────────────────────────────────────────

    async _handleSubscription(action, data, targetId, uid, spaceId) {
        if (action === 'create') {
            if (!data.desc || !data.amount) {
                ModalView.showToast('IA precisa da descrição e do valor.', 'error'); return;
            }
            const confirmed = await this._confirmAction(
                `Criar assinatura — ${data.desc}`,
                `Valor: ${fmt(data.amount)}/mês | Dia: ${data.dayOfMonth || 1}`
            );
            if (!confirmed) { ModalView.showToast('Operação cancelada.'); return; }
            await SubscriptionModel.add(uid, {
                desc:       data.desc,
                amount:     parseFloat(data.amount),
                category:   data.category   || 'Serviços',
                method:     data.method     || 'Cartão',
                bank:       data.bank       || '',
                dayOfMonth: data.dayOfMonth || 1,
                startDate:  new Date().toISOString().slice(0, 10)
            }, spaceId);
            ModalView.showToast(`Assinatura "${data.desc}" criada — ${fmt(data.amount)}/mês!`, 'success');
            return;
        }

        if (action === 'edit' && targetId) {
            const sub = (state.subscriptions || []).find(s => s.id === targetId);
            if (!sub) { ModalView.showToast('Assinatura não encontrada.', 'error'); return; }
            const confirmed = await this._confirmAction(
                `Editar assinatura — ${sub.desc}`, this._formatFields(data)
            );
            if (!confirmed) { ModalView.showToast('Operação cancelada.'); return; }
            await SubscriptionModel.update(uid, targetId, data, spaceId);
            ModalView.showToast(`Assinatura "${sub.desc}" actualizada!`, 'success');
            return;
        }

        if (action === 'cancel' && targetId) {
            const sub = (state.subscriptions || []).find(s => s.id === targetId);
            if (!sub) { ModalView.showToast('Assinatura não encontrada.', 'error'); return; }
            const confirmed = await this._confirmAction(`Cancelar assinatura "${sub.desc}"?`, '');
            if (!confirmed) { ModalView.showToast('Operação cancelada.'); return; }
            await SubscriptionModel.cancel(uid, targetId, spaceId);
            ModalView.showToast(`Assinatura "${sub.desc}" cancelada.`);
            return;
        }

        if (action === 'delete' && targetId) {
            const sub = (state.subscriptions || []).find(s => s.id === targetId);
            if (!sub) { ModalView.showToast('Assinatura não encontrada.', 'error'); return; }
            const confirmed = await this._confirmAction(
                `Apagar assinatura "${sub.desc}" permanentemente?`, ''
            );
            if (!confirmed) { ModalView.showToast('Operação cancelada.'); return; }
            await SubscriptionModel.delete(uid, targetId, spaceId);
            ModalView.showToast(`Assinatura "${sub.desc}" apagada!`, 'success');
        }
    },

    // ─── Cofrinhos ───────────────────────────────────────────────────────────

    async _handleSavings(action, data, targetId, uid, spaceId) {
        if (action === 'create') {
            if (!data.name) { ModalView.showToast('IA precisa do nome do cofrinho.', 'error'); return; }
            const confirmed = await this._confirmAction(
                `Criar cofrinho — ${data.emoji || '🐷'} ${data.name}`,
                `Meta: ${fmt(data.goal || 0)} | Rendimento: ${data.yieldRate || 0}% a.a.`
            );
            if (!confirmed) { ModalView.showToast('Operação cancelada.'); return; }
            await SavingsModel.add(uid, {
                name:      data.name,
                emoji:     data.emoji     || '🐷',
                goal:      parseFloat(data.goal)      || 0,
                yieldRate: parseFloat(data.yieldRate) || 0
            }, spaceId);
            ModalView.showToast(`Cofrinho "${data.name}" criado!`, 'success');
            return;
        }

        if (action === 'edit' && targetId) {
            const jar = (state.savings || []).find(j => j.id === targetId);
            if (!jar) { ModalView.showToast('Cofrinho não encontrado.', 'error'); return; }
            const confirmed = await this._confirmAction(
                `Editar cofrinho — ${jar.name}`, this._formatFields(data)
            );
            if (!confirmed) { ModalView.showToast('Operação cancelada.'); return; }
            await SavingsModel.update(uid, targetId, data, spaceId);
            ModalView.showToast(`Cofrinho "${jar.name}" actualizado!`, 'success');
            return;
        }

        if (action === 'delete' && targetId) {
            const jar = (state.savings || []).find(j => j.id === targetId);
            if (!jar) { ModalView.showToast('Cofrinho não encontrado.', 'error'); return; }
            const confirmed = await this._confirmAction(`Apagar cofrinho "${jar.name}"?`, '');
            if (!confirmed) { ModalView.showToast('Operação cancelada.'); return; }
            await SavingsModel.delete(uid, targetId, spaceId);
            ModalView.showToast(`Cofrinho "${jar.name}" apagado!`, 'success');
            return;
        }

        if (action === 'deposit' || action === 'withdraw') {
            if (!targetId) { ModalView.showToast('Cofrinho não identificado.', 'error'); return; }
            const jar = (state.savings || []).find(j => j.id === targetId);
            if (!jar) { ModalView.showToast('Cofrinho não encontrado.', 'error'); return; }
            const amount = parseFloat(data?.amount);
            if (!amount || amount <= 0) { ModalView.showToast('Valor inválido.', 'error'); return; }
            const label = action === 'deposit' ? 'Depositar' : 'Levantar';
            const confirmed = await this._confirmAction(`${label} ${fmt(amount)} — ${jar.name}`, '');
            if (!confirmed) { ModalView.showToast('Operação cancelada.'); return; }
            if (action === 'deposit') {
                await SavingsModel.deposit(uid, targetId, amount, spaceId);
                ModalView.showToast(`${fmt(amount)} depositado em "${jar.name}"!`, 'success');
            } else {
                if (amount > jar.saved) {
                    ModalView.showToast('Saldo insuficiente no cofrinho.', 'error'); return;
                }
                await SavingsModel.withdraw(uid, targetId, amount, spaceId);
                ModalView.showToast(`${fmt(amount)} levantado de "${jar.name}".`);
            }
        }
    },

    // ─── Utilitários ─────────────────────────────────────────────────────────

    _confirmAction(title, details) {
        return new Promise(resolve => {
            ModalView.openConfirmModal({
                title,
                message:      details
                    ? `<p class="text-xs text-slate-500 mt-2 whitespace-pre-line">${details}</p>`
                    : '',
                confirmLabel: 'Confirmar',
                onConfirm:    () => resolve(true),
                onCancel:     () => resolve(false)
            });
        });
    },

    _formatFields(data) {
        const labels = {
            debtor: 'Devedor', amount: 'Valor', interestRate: 'Juros (%)',
            startDate: 'Início', dueDate: 'Vencimento', installments: 'Parcelas',
            paymentDay: 'Dia pag.', paymentType: 'Tipo pag.', method: 'Método',
            notes: 'Notas', desc: 'Descrição', category: 'Categoria',
            bank: 'Banco', dayOfMonth: 'Dia do mês', name: 'Nome',
            emoji: 'Emoji', goal: 'Meta', yieldRate: 'Rendimento (%)'
        };
        return Object.entries(data)
            .map(([k, v]) => {
                const lbl = labels[k] || k;
                const val = (k === 'amount' || k === 'goal') ? fmt(parseFloat(v) || 0) : v;
                return `${lbl}: ${val}`;
            })
            .join('\n');
    },

    _handleError(err) {
        const code = err?.code;
        let msg;
        if      (code === 'NO_KEY')                                      msg = 'Chave Gemini não configurada. Edita js/config.js.';
        else if (code === 400 || err?.apiStatus === 'INVALID_ARGUMENT')  msg = 'Chave da API Gemini inválida.';
        else if (code === 403 || err?.apiStatus === 'PERMISSION_DENIED') msg = 'Acesso negado pela API Gemini.';
        else if (code === 429 || err?.apiStatus === 'RESOURCE_EXHAUSTED') msg = 'Limite Gemini atingido. Aguarda e tenta novamente.';
        else if (code === 'BLOCKED')                                      msg = 'Gemini bloqueou a resposta. Reformula o comando.';
        else if (code === 'NETWORK')                                      msg = 'Sem acesso à API Gemini. Verifica a ligação.';
        else                                                              msg = `Erro IA: ${err?.message || 'desconhecido'}`;
        ModalView.showToast(msg, 'error');
    }
};
