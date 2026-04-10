import { state } from './state.js';
import { DashboardView } from './views/DashboardView.js';
import { AuthController } from './controllers/AuthController.js';
import { TransactionController } from './controllers/TransactionController.js';
import { ClientsController } from './controllers/ClientsController.js';
import { NavigationController } from './controllers/NavigationController.js';

// --- Inicialização dos Controllers ---
const navController = new NavigationController({
    onMonthChange: () => transactionController.refreshDashboard()
});

const transactionController = new TransactionController({
    getSelectedMonth: () => navController.getSelectedMonth()
});

const clientsController = new ClientsController();

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
    // Inicializar gráfico
    const canvas = document.getElementById('projectionChart');
    if (canvas) {
        state.chart = DashboardView.initChart(canvas);
    }

    // Inicializar navegação e formulários
    navController.init();
    transactionController.init();
    clientsController.init();

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

    // Iniciar autenticação (inicia onAuthStateChanged -> sync)
    authController.init();
});
