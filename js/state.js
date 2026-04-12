/**
 * state.js — Estado global reactivo partilhado entre todos os controllers e views.
 * É o único ponto de verdade para os dados em memória da aplicação.
 */
export const state = {
    /** Utilizador Firebase autenticado (ou null) */
    currentUser: null,
    /** Lista de transações do mês/período activo */
    transactions: [],
    /** Lista de clientes/fornecedores */
    clients: [],
    /** Instância do gráfico de barras (Chart.js) */
    chart: null,
    /** Instância do gráfico de pizza (Chart.js) */
    pieChart: null,
    /** ID do cliente a ser editado (null se não estiver em edição) */
    editingClientId: null,
    /** Unsubscribe do listener de transações */
    unsubscribeTrans: null,
    /** Unsubscribe do listener de preferências */
    unsubscribeSettings: null,
    /** Unsubscribe do listener de clientes */
    unsubscribeClients: null,
    /** Modo de visualização: 'personal' | 'shared' */
    viewMode: 'personal',
    /** ID do espaço partilhado activo (null se modo pessoal) */
    sharedSpaceId: null,
    /** Nome de exibição do utilizador */
    userName: '',
    /** Metas de gastos por categoria: { categoria: valorMeta } */
    budgets: {},
    /** Categorias criadas pelo utilizador (além das padrão) */
    customCategories: [],
    /** Formas de pagamento criadas pelo utilizador (além das padrão) */
    customMethods: [],
    /** Cartões bancários com datas de fatura: [{ bankName, closingDay, dueDay }] */
    cards: [],
    /** Modo escuro activo */
    darkMode: false,
    /** Lista de cofrinhos em memória (sincronizada por SavingsController) */
    savings: [],
    /** Lista de empréstimos em memória (sincronizada por LoanController) */
    loans: [],
};
