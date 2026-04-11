import { state } from './state.js';
import { DashboardView } from './views/DashboardView.js';
import { AuthController } from './controllers/AuthController.js';
import { TransactionController } from './controllers/TransactionController.js';
import { ClientsController } from './controllers/ClientsController.js';
import { NavigationController } from './controllers/NavigationController.js';
import { SharingController } from './controllers/SharingController.js';
import { OpenFinanceController } from './controllers/OpenFinanceController.js';

// --- Inicialização dos Controllers ---
const navController = new NavigationController({
    onMonthChange: () => transactionController.refreshDashboard(),
    onModeChange: (mode) => {
        transactionController.restartSync();
        DashboardView.updateViewModeUI(mode);
    }
});

const transactionController = new TransactionController({
    getSelectedMonth: () => navController.getSelectedMonth()
});

const clientsController = new ClientsController();

const sharingController = new SharingController({
    onModeChange: (mode) => {
        transactionController.restartSync();
        DashboardView.updateViewModeUI(mode);
    }
});

const openFinanceController = new OpenFinanceController({
    onImport: (t) => transactionController.addTransaction(t)
});

const authController = new AuthController({
    onLogin: () => {
        transactionController.startSync();
        clientsController.startSync();
    },
    onLogout: () => {
        transactionController.stopSync();
        clientsController.stopSync();
    }
});

// --- Bootstrap ---
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
