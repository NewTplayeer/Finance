import { auth } from '../firebase.js';
import {
    signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { UserModel } from '../models/UserModel.js';
import { state } from '../state.js';
import { ModalView } from '../views/ModalView.js';

export class AuthController {
    constructor({ onLogin, onLogout }) {
        this.onLogin = onLogin;
        this.onLogout = onLogout;
        this._profilePassword = "";
        this._profileName = "";
    }

    init() {
        this._bindAuthForm();
        this._bindLockScreen();
        this._bindProfileModal();

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                state.currentUser = user;
                document.getElementById('auth-screen')?.classList.add('hidden');
                const idEl = document.getElementById('user-id-display');
                if (idEl) idEl.innerText = `ID: ${user.uid.slice(0, 8)}`;
                await this._loadProfile(user.uid);
                if (this.onLogin) this.onLogin(user);
            } else {
                state.currentUser = null;
                document.getElementById('auth-screen')?.classList.remove('hidden');
                document.getElementById('main-interface')?.classList.add('hidden');
                if (this.onLogout) this.onLogout();
            }
        });
    }

    _bindAuthForm() {
        let authMode = 'login';
        const mainBtn = document.getElementById('auth-main-btn');
        const toggleBtn = document.getElementById('auth-toggle-btn');
        const nameGroup = document.getElementById('register-name-group');

        if (toggleBtn) {
            toggleBtn.onclick = () => {
                authMode = authMode === 'login' ? 'register' : 'login';
                const isLogin = authMode === 'login';
                document.getElementById('auth-title').innerText = isLogin ? 'NT Finanças' : 'Criar Conta';
                document.getElementById('auth-subtitle').innerText = isLogin
                    ? 'Inicia sessão para aceder ao teu painel.'
                    : 'Preenche os teus dados para começar.';
                mainBtn.innerText = isLogin ? 'Entrar no Sistema' : 'Criar Minha Conta';
                toggleBtn.innerText = isLogin
                    ? 'Ainda não tens conta? Regista-te agora'
                    : 'Já tens conta? Entra aqui';
                if (nameGroup) nameGroup.classList.toggle('hidden', isLogin);
            };
        }

        if (mainBtn) {
            mainBtn.onclick = async () => {
                const email = document.getElementById('auth-email')?.value?.trim();
                const password = document.getElementById('auth-password')?.value?.trim();
                const name = document.getElementById('auth-name')?.value?.trim();

                if (!email || !password) return ModalView.showToast("Por favor, preenche todos os campos!");
                if (authMode === 'register' && !name) return ModalView.showToast("Por favor, indica o teu nome!");

                try {
                    if (authMode === 'login') {
                        await signInWithEmailAndPassword(auth, email, password);
                    } else {
                        const cred = await createUserWithEmailAndPassword(auth, email, password);
                        // Guarda o nome imediatamente nas preferências
                        await UserModel.savePrefs(cred.user.uid, {
                            userName: name,
                            appPassword: "",
                            createdAt: new Date().toISOString()
                        });
                        ModalView.showToast(`Bem-vindo, ${name}! Conta criada com sucesso!`, 'success');
                    }
                } catch (err) {
                    console.error("Firebase Auth Error:", err.code);
                    if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(err.code)) {
                        ModalView.showToast("Dados incorretos. Verifica o e-mail ou a senha.", 'error');
                    } else if (err.code === 'auth/email-already-in-use') {
                        ModalView.showToast("E-mail já registado. Tenta fazer login.", 'error');
                    } else if (err.code === 'auth/weak-password') {
                        ModalView.showToast("A senha deve ter pelo menos 6 caracteres.", 'error');
                    } else {
                        ModalView.showToast("Falha na autenticação: " + err.code, 'error');
                    }
                }
            };
        }
    }

    _bindLockScreen() {
        const unlockBtn = document.getElementById('unlock-btn');
        if (unlockBtn) {
            unlockBtn.onclick = () => {
                const inputEl = document.getElementById('lock-password-input');
                if (inputEl?.value === this._profilePassword) {
                    this._showMainApp();
                } else {
                    ModalView.showToast("PIN incorreto!", 'error');
                    if (inputEl) inputEl.value = "";
                }
            };
        }

        const forgotBtn = document.getElementById('forgot-pin-btn');
        if (forgotBtn) {
            forgotBtn.onclick = async () => {
                if (!state.currentUser) return;
                await UserModel.savePrefs(state.currentUser.uid, { userName: this._profileName, appPassword: "" });
                this._profilePassword = "";
                ModalView.showToast("PIN removido. Podes definir um novo no teu perfil.");
                this._showMainApp();
            };
        }

        // Desbloqueia com Enter
        document.getElementById('lock-password-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('unlock-btn')?.click();
        });
    }

    _bindProfileModal() {
        const openBtn = document.getElementById('nav-avatar');
        if (openBtn) openBtn.onclick = () => this.openProfileModal();
    }

    async _loadProfile(uid) {
        try {
            const prefs = await UserModel.getPrefs(uid);
            if (prefs) {
                this._profilePassword = prefs.appPassword || "";
                this._profileName = prefs.userName || "";
                state.sharedSpaceId = prefs.sharedSpaceId || null;
                state.budgets = prefs.budgets || {};
            } else {
                this._profilePassword = "";
                this._profileName = "";
            }
            state.userName = this._profileName;
            this._updateAvatarUI(this._profileName);
            const lockName = document.getElementById('lock-user-name');
            if (lockName) lockName.innerText = this._profileName || "Olá!";

            if (this._profilePassword) {
                document.getElementById('app-lock-screen')?.classList.remove('hidden');
                document.getElementById('main-interface')?.classList.add('hidden');
                document.getElementById('lock-password-input')?.focus();
            } else {
                this._showMainApp();
            }
        } catch (err) {
            console.error("Erro ao carregar preferências:", err);
            this._showMainApp();
        }
    }

    _showMainApp() {
        document.getElementById('app-lock-screen')?.classList.add('hidden');
        const mainInterface = document.getElementById('main-interface');
        if (mainInterface) mainInterface.classList.remove('hidden');
        const appContent = document.getElementById('app-content');
        if (appContent) appContent.classList.remove('opacity-0', 'pointer-events-none');
    }

    _updateAvatarUI(name) {
        const initial = (name || "U").charAt(0).toUpperCase();
        const avatar = document.getElementById('nav-avatar');
        const navName = document.getElementById('nav-user-name');
        const lockAvatar = document.getElementById('lock-avatar-circle');
        if (avatar) avatar.innerText = initial;
        if (navName) navName.innerText = name ? `Olá, ${name.split(' ')[0]}` : "Utilizador";
        if (lockAvatar) lockAvatar.innerText = initial;

        // Mostra saudação personalizada
        const greet = document.getElementById('welcome-greeting');
        if (greet && name) greet.innerText = `Bem-vindo de volta, ${name.split(' ')[0]}!`;
    }

    openProfileModal() {
        ModalView.openProfileModal(this._profileName, this._profilePassword);
        this._updateSharedSpaceUI();

        // Preenche campos de metas
        const budgets = state.budgets || {};
        document.querySelectorAll('[data-budget-cat]').forEach(input => {
            const cat = input.dataset.budgetCat;
            input.value = budgets[cat] ? budgets[cat] : '';
        });

        // Preenche código do espaço partilhado se existir
        if (state.sharedSpaceId) {
            const codeEl = document.getElementById('shared-space-code');
            if (codeEl) codeEl.innerText = state.sharedSpaceId;
        }
    }

    _updateSharedSpaceUI() {
        const spaceInfoEl = document.getElementById('shared-space-info');
        const spaceCodeEl = document.getElementById('shared-space-code');
        const createBtn = document.getElementById('btn-create-space');
        const joinSection = document.getElementById('join-space-section');

        if (state.sharedSpaceId) {
            if (spaceInfoEl) spaceInfoEl.classList.remove('hidden');
            if (spaceCodeEl) spaceCodeEl.innerText = state.sharedSpaceId;
            if (createBtn) createBtn.classList.add('hidden');
            if (joinSection) joinSection.classList.add('hidden');
        } else {
            if (spaceInfoEl) spaceInfoEl.classList.add('hidden');
            if (createBtn) createBtn.classList.remove('hidden');
            if (joinSection) joinSection.classList.remove('hidden');
        }
    }

    async saveProfile() {
        if (!state.currentUser) return;
        const name = document.getElementById('profile-name-input')?.value?.trim() || this._profileName || "Utilizador";
        const pin = document.getElementById('profile-pass-input')?.value?.trim() || "";

        // Recolhe metas de gastos
        const budgets = {};
        document.querySelectorAll('[data-budget-cat]').forEach(input => {
            const cat = input.dataset.budgetCat;
            const val = parseFloat(input.value);
            if (val > 0) budgets[cat] = val;
        });

        await UserModel.savePrefs(state.currentUser.uid, {
            userName: name,
            appPassword: pin,
            budgets
        });

        state.budgets = budgets;
        this._profilePassword = pin;
        this._profileName = name;
        state.userName = name;
        this._updateAvatarUI(name);
        ModalView.showToast("Perfil guardado!", 'success');
        ModalView.closeProfileModal();
    }

    logout() {
        signOut(auth).then(() => window.location.reload());
    }
}
