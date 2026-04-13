/**
 * app.js — Ponto de entrada da aplicação NT Finanças.
 * Instancia e liga todos os controllers; inicializa os gráficos após o DOM estar pronto.
 */
import { state } from './state.js';
import { DashboardView }          from './views/DashboardView.js';
import { AuthController }         from './controllers/AuthController.js';
import { TransactionController }  from './controllers/TransactionController.js';
import { ClientsController }      from './controllers/ClientsController.js';
import { NavigationController }   from './controllers/NavigationController.js';
import { SharingController }      from './controllers/SharingController.js';
import { OpenFinanceController }  from './controllers/OpenFinanceController.js';
import { CardController }         from './controllers/CardController.js';
import { SavingsController }      from './controllers/SavingsController.js';
import { LoanController }         from './controllers/LoanController.js';
import { SubscriptionController } from './controllers/SubscriptionController.js';
import { AnalyticsController }    from './controllers/AnalyticsController.js';
import { AdminController }        from './controllers/AdminController.js';

/** Controller de assinaturas recorrentes */
const subscriptionController = new SubscriptionController();

/** Controller de navegação: gere o filtro de mês, tabs e modo pessoal/partilhado */
const navController = new NavigationController({
    onMonthChange:  () => {
        transactionController.refreshDashboard();
        // Propaga assinaturas para o mês seleccionado
        const uid = state.currentUser?.uid;
        if (uid) subscriptionController.propagateForMonth(uid, navController.getSelectedMonth());
    },
    onModeChange:   (mode) => {
        try { transactionController.restartSync();   } catch (e) { console.error(e); }
        try { savingsController.restartSync();        } catch (e) { console.error(e); }
        try { loanController.restartSync();           } catch (e) { console.error(e); }
        try { subscriptionController.restartSync();   } catch (e) { console.error(e); }
        DashboardView.updateViewModeUI(mode);
    },
    onAnalyticsTab: () => analyticsController.render(),
    onAdminTab:     () => adminController.render()
});

/** Controller de transações: CRUD, dashboard e processamento IA */
const transactionController = new TransactionController({
    getSelectedMonth: () => navController.getSelectedMonth()
});

/** Controller de clientes/fornecedores */
const clientsController = new ClientsController();

/** Controller de espaço partilhado */
const sharingController = new SharingController({
    onModeChange: (mode) => {
        navController.syncModeButtons(mode);
        try { transactionController.restartSync();   } catch (e) { console.error(e); }
        try { savingsController.restartSync();        } catch (e) { console.error(e); }
        try { loanController.restartSync();           } catch (e) { console.error(e); }
        try { subscriptionController.restartSync();   } catch (e) { console.error(e); }
        DashboardView.updateViewModeUI(mode);
    }
});

/** Controller de Open Finance (Pluggy.ai) */
const openFinanceController = new OpenFinanceController({
    onImport: (t) => transactionController.addTransaction(t)
});

/** Controller de cartões/faturas e notificações */
const cardController = new CardController();

/** Controller de cofrinhos (poupanças) */
const savingsController = new SavingsController();

/** Controller de empréstimos com cálculo de juros */
const loanController = new LoanController();

/** Controller de análise e estatísticas globais */
const analyticsController = new AnalyticsController();

/** Controller do painel de administração (apenas admins) */
const adminController = new AdminController();

/** Controller de autenticação — inicia todos os syncs ao fazer login */
const authController = new AuthController({
    onLogin: async (user) => {
        transactionController.startSync();
        clientsController.startSync();
        savingsController.startSync(user.uid);
        loanController.startSync(user.uid);
        subscriptionController.startSync(user.uid);
        await cardController.loadCards(user.uid);
        transactionController.refreshCategorySelectors();
        transactionController.refreshMethodSelectors();
        subscriptionController.refreshCategorySelect();
        adminController.onLogin(user);
        // Propaga assinaturas para o mês actual após um tick (aguarda transactions snapshot)
        setTimeout(() => {
            subscriptionController.propagateForMonth(user.uid, navController.getSelectedMonth());
        }, 2500);
    },
    onLogout: () => {
        transactionController.stopSync();
        clientsController.stopSync();
        savingsController.stopSync();
        loanController.stopSync();
        subscriptionController.stopSync();
        adminController.onLogout();
    }
});

/** Bootstrap — executado após o DOM estar completamente carregado */
window.addEventListener('DOMContentLoaded', () => {
    // Inicializar gráficos — guarda defensiva: não bloqueia o resto se Chart.js não carregar
    if (typeof Chart !== 'undefined') {
        try {
            const canvas = document.getElementById('projectionChart');
            if (canvas) state.chart = DashboardView.initChart(canvas);
            const pieCanvas = document.getElementById('pieChart');
            if (pieCanvas) state.pieChart = DashboardView.initPieChart(pieCanvas);
        } catch (e) {
            console.warn('Chart.js: falha na inicialização dos gráficos:', e);
        }
    } else {
        console.warn('Chart.js não carregado — gráficos desactivados.');
    }

    // Inicializar controllers
    navController.init();
    transactionController.init();
    clientsController.init();
    sharingController.init();
    openFinanceController.init();
    cardController.init();
    savingsController.init();
    loanController.init();
    subscriptionController.init();
    analyticsController.init();
    adminController.init();

    // Botões do modal de perfil
    const saveProfileBtn = document.querySelector('[onclick="saveProfile()"]');
    if (saveProfileBtn) {
        saveProfileBtn.removeAttribute('onclick');
        saveProfileBtn.onclick = () => authController.saveProfile();
    }

    const logoutBtn = document.querySelector('[onclick="handleLogout()"]');
    if (logoutBtn) {
        logoutBtn.removeAttribute('onclick');
        logoutBtn.onclick = () => authController.logout();
    }

    const openProfileBtn = document.getElementById('nav-avatar');
    if (openProfileBtn) {
        openProfileBtn.removeAttribute('onclick');
        openProfileBtn.onclick = () => authController.openProfileModal();
    }

    // Iniciar autenticação — SEMPRE executa, independentemente do estado dos gráficos
    authController.init();
});
