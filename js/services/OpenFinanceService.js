import { pluggyConfig } from '../config.js';

const BASE = 'https://api.pluggy.ai';

// Mapeamento de categorias Pluggy → app
const CAT_MAP = {
    'FOOD_AND_BEVERAGE':        'Alimentação',
    'GROCERIES':                'Alimentação',
    'RESTAURANTS':              'Alimentação',
    'TRANSPORT':                'Transporte',
    'AUTOMOTIVE':               'Transporte',
    'HEALTH_AND_WELLNESS':      'Saúde',
    'PHARMACY':                 'Saúde',
    'ENTERTAINMENT':            'Lazer',
    'TRAVEL':                   'Lazer',
    'HOME_AND_GARDEN':          'Casa',
    'UTILITIES':                'Casa',
    'EDUCATION':                'Educação',
    'CLOTHING_AND_ACCESSORIES': 'Vestuário',
    'SERVICES':                 'Serviços',
    'INCOME':                   'Receita',
    'SALARY':                   'Receita',
};

const METHOD_MAP = {
    'DEBIT':    'Cartão Débito',
    'CREDIT':   'Cartão',
    'PIX':      'Dinheiro/Pix',
    'TED':      'Dinheiro/Pix',
    'DOC':      'Dinheiro/Pix',
    'BOLETO':   'Boleto',
};

export const OpenFinanceService = {
    _apiKey: null,

    async _authenticate() {
        if (this._apiKey) return this._apiKey;
        if (!pluggyConfig.clientId || !pluggyConfig.clientSecret) {
            throw new Error('Credenciais Pluggy não configuradas. Adiciona clientId e clientSecret em js/config.js.');
        }
        const res = await fetch(`${BASE}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: pluggyConfig.clientId, clientSecret: pluggyConfig.clientSecret })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error('Autenticação Pluggy falhou: ' + (err.message || res.status));
        }
        const data = await res.json();
        this._apiKey = data.apiKey;
        return this._apiKey;
    },

    async getConnectToken() {
        const apiKey = await this._authenticate();
        const res = await fetch(`${BASE}/connect_token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
            body: JSON.stringify({})
        });
        if (!res.ok) throw new Error('Erro ao gerar token de conexão Pluggy.');
        const data = await res.json();
        return data.accessToken;
    },

    async getAccounts(itemId) {
        const apiKey = await this._authenticate();
        const res = await fetch(`${BASE}/accounts?itemId=${itemId}`, {
            headers: { 'X-API-KEY': apiKey }
        });
        if (!res.ok) throw new Error('Erro ao listar contas.');
        const data = await res.json();
        return data.results || [];
    },

    async getTransactions(accountId, from, to) {
        const apiKey = await this._authenticate();
        const params = new URLSearchParams({ accountId, from, to, pageSize: '500' });
        const res = await fetch(`${BASE}/transactions?${params}`, {
            headers: { 'X-API-KEY': apiKey }
        });
        if (!res.ok) throw new Error('Erro ao buscar transações.');
        const data = await res.json();
        return data.results || [];
    },

    // Converte transação Pluggy para o formato interno da app
    normalize(t, bankName = '') {
        const isCredit = t.type === 'CREDIT' || t.creditData != null;
        const category = isCredit ? 'Receita' : (CAT_MAP[t.category] || 'Outros');
        const method   = METHOD_MAP[t.paymentData?.paymentMethod] || 'Dinheiro/Pix';
        const amount   = Math.abs(parseFloat(t.amount) || 0);
        const monthKey = (t.date || new Date().toISOString()).slice(0, 7);

        return {
            desc:     t.description || t.descriptionRaw || 'Transação',
            amount,
            category,
            method,
            bank:     bankName,
            monthKey,
            paid:     true,
            clientId: ''
        };
    }
};
