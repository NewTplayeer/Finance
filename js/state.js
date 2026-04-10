// Estado global partilhado entre controllers e views
export const state = {
    currentUser: null,
    transactions: [],
    clients: [],
    chart: null,
    profilePassword: "",
    authMode: 'login',
    editingClientId: null,
    unsubscribeTrans: null,
    unsubscribeSettings: null,
    unsubscribeClients: null,
};
