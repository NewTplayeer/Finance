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
        const uid = state.currentUser?.uid;
        try {
            transactionController.restartSync({
                onFirstLoad: () => {
                    if (uid) {
                        subscriptionController._propagatedMonths.clear();
                        subscriptionController.propagateForMonth(uid, navController.getSelectedMonth());
                    }
                }
            });
        } catch (e) { console.error(e); }
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
        const uid = state.currentUser?.uid;
        try {
            transactionController.restartSync({
                onFirstLoad: () => {
                    if (uid) {
                        subscriptionController._propagatedMonths.clear();
                        subscriptionController.propagateForMonth(uid, navController.getSelectedMonth());
                    }
                }
            });
        } catch (e) { console.error(e); }
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
const loanController = new LoanController({
    getSelectedMonth: () => navController.getSelectedMonth()
});

/** Controller de análise e estatísticas globais */
const analyticsController = new AnalyticsController();

/** Controller do painel de administração (apenas admins) */
const adminController = new AdminController();

/** Controller de autenticação — inicia todos os syncs ao fazer login */
const authController = new AuthController({
    onLogin: async (user) => {
        // Inicia sync das transações; propaga assinaturas apenas após o primeiro snapshot
        // do Firestore (garante que state.transactions está preenchido antes de verificar duplicatas)
        transactionController.startSync({
            onFirstLoad: () => {
                subscriptionController.propagateForMonth(user.uid, navController.getSelectedMonth());
            }
        });
        clientsController.startSync();
        savingsController.startSync(user.uid);
        loanController.startSync(user.uid);
        subscriptionController.startSync(user.uid);
        await cardController.loadCards(user.uid);
        transactionController.refreshCategorySelectors();
        transactionController.refreshMethodSelectors();
        subscriptionController.refreshCategorySelect();
        adminController.onLogin(user);
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

    // ── Modal unificado Categorias & Métodos ──────────────────────────────
    const openCatMethodsModal = (tab = 'categories') => {
        transactionController.refreshCategorySelectors();  // renders categories list
        authController._renderMethodsList();                // renders methods list
        // Switch para o tab correcto
        const panelCat     = document.getElementById('cat-methods-panel-cat');
        const panelMethods = document.getElementById('cat-methods-panel-methods');
        const tabCat       = document.getElementById('cat-methods-tab-cat');
        const tabMethods   = document.getElementById('cat-methods-tab-methods');
        if (tab === 'methods') {
            panelCat?.classList.add('hidden');
            panelMethods?.classList.remove('hidden');
            tabMethods?.classList.add('bg-white', 'text-slate-900', 'shadow-sm');
            tabMethods?.classList.remove('text-slate-500');
            tabCat?.classList.remove('bg-white', 'text-slate-900', 'shadow-sm');
            tabCat?.classList.add('text-slate-500');
        } else {
            panelMethods?.classList.add('hidden');
            panelCat?.classList.remove('hidden');
            tabCat?.classList.add('bg-white', 'text-slate-900', 'shadow-sm');
            tabCat?.classList.remove('text-slate-500');
            tabMethods?.classList.remove('bg-white', 'text-slate-900', 'shadow-sm');
            tabMethods?.classList.add('text-slate-500');
        }
        document.getElementById('cat-methods-modal')?.classList.remove('hidden');
    };

    document.getElementById('btn-close-cat-methods-modal')?.addEventListener('click', () => {
        document.getElementById('cat-methods-modal')?.classList.add('hidden');
    });
    document.getElementById('cat-methods-tab-cat')?.addEventListener('click', () => openCatMethodsModal('categories'));
    document.getElementById('cat-methods-tab-methods')?.addEventListener('click', () => openCatMethodsModal('methods'));

    // Botão "+" junto ao select de categoria no formulário → abre modal
    const inlineCatBtn = document.getElementById('btn-new-category-inline');
    if (inlineCatBtn) {
        inlineCatBtn.removeAttribute('onclick');
        inlineCatBtn.addEventListener('click', () => openCatMethodsModal('categories'));
    }

    // Botão de acesso ao modal de cat/métodos no modal de perfil
    document.getElementById('btn-open-cat-methods-from-profile')?.addEventListener('click', () => {
        document.getElementById('profile-modal')?.classList.add('hidden');
        openCatMethodsModal('methods');
    });

    // ── Modal PDF ─────────────────────────────────────────────────────────
    document.getElementById('btn-open-pdf-panel')?.addEventListener('click', () => {
        document.getElementById('pdf-modal')?.classList.remove('hidden');
    });
    document.getElementById('btn-close-pdf-modal')?.addEventListener('click', () => {
        document.getElementById('pdf-modal')?.classList.add('hidden');
    });

    // ── Mudar mês → re-renderiza empréstimos (para actualizar pago/em aberto por mês) ──
    const origOnMonthChange = navController.onMonthChange;
    navController.onMonthChange = () => {
        if (origOnMonthChange) origOnMonthChange();
        loanController._renderLoans();
    };

    // Iniciar autenticação — SEMPRE executa, independentemente do estado dos gráficos
    authController.init();
});
