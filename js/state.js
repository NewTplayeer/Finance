// Estado global partilhado entre controllers e views
export const state = {
    currentUser: null,
    transactions: [],
    clients: [],
    chart: null,
    pieChart: null,
    profilePassword: "",
    authMode: 'login',
    editingClientId: null,
    unsubscribeTrans: null,
    unsubscribeSettings: null,
    unsubscribeClients: null,
    viewMode: 'personal',    // 'personal' | 'shared'
    sharedSpaceId: null,
    userName: '',
    budgets: {},             // { categoria: metaValor }
    darkMode: false,
};
