import { state } from './state.js';
import { DashboardView } from './views/DashboardView.js';
import { AuthController } from './controllers/AuthController.js';
import { TransactionController } from './controllers/TransactionController.js';
import { ClientsController } from './controllers/ClientsController.js';
import { NavigationController } from './controllers/NavigationController.js';
import { SharingController } from './controllers/SharingController.js';

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
    // Inicializar gráficos
    const canvas = document.getElementById('projectionChart');
    if (canvas) {
        state.chart = DashboardView.initChart(canvas);
    }
    const pieCanvas = document.getElementById('pieChart');
    if (pieCanvas) {
        state.pieChart = DashboardView.initPieChart(pieCanvas);
    }

    // Inicializar controllers
    navController.init();
    transactionController.init();
    clientsController.init();
    sharingController.init();

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

    // Iniciar autenticação
    authController.init();
});
