import { auth } from '../firebase.js';
import {
    signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signOut, onAuthStateChanged
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

        if (toggleBtn) {
            toggleBtn.onclick = () => {
                authMode = authMode === 'login' ? 'register' : 'login';
                const isLogin = authMode === 'login';
                document.getElementById('auth-title').innerText = isLogin ? 'NT Finanças' : 'Criar Conta';
                document.getElementById('auth-subtitle').innerText = isLogin
                    ? 'Inicia sessão para aceder ao teu painel.'
                    : 'Cria o teu perfil para começar.';
                mainBtn.innerText = isLogin ? 'Entrar no Sistema' : 'Registar Conta';
                toggleBtn.innerText = isLogin
                    ? 'Ainda não tens conta? Regista-te agora'
                    : 'Já tens conta? Entra aqui';
            };
        }

        if (mainBtn) {
            mainBtn.onclick = async () => {
                const email = document.getElementById('auth-email')?.value?.trim();
                const password = document.getElementById('auth-password')?.value?.trim();
                if (!email || !password) return ModalView.showToast("Por favor, preenche todos os campos!");
                try {
                    if (authMode === 'login') {
                        await signInWithEmailAndPassword(auth, email, password);
                    } else {
                        await createUserWithEmailAndPassword(auth, email, password);
                        ModalView.showToast("Conta criada com sucesso!");
                    }
                } catch (err) {
                    console.error("Firebase Auth Error:", err.code);
                    if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(err.code)) {
                        ModalView.showToast("Dados incorretos. Verifica o e-mail ou a senha.");
                    } else if (err.code === 'auth/email-already-in-use') {
                        ModalView.showToast("E-mail já registado. Tenta fazer login.");
                    } else {
                        ModalView.showToast("Falha na autenticação: " + err.code);
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
                    ModalView.showToast("PIN incorreto!");
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
                this._profileName = prefs.userName || "Bruno";
            } else {
                this._profilePassword = "";
                this._profileName = "Bruno";
            }
            this._updateAvatarUI(this._profileName);
            const lockName = document.getElementById('lock-user-name');
            if (lockName) lockName.innerText = this._profileName;

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
        if (navName) navName.innerText = name || "Utilizador";
        if (lockAvatar) lockAvatar.innerText = initial;
    }

    openProfileModal() {
        ModalView.openProfileModal(this._profileName, this._profilePassword);
    }

    async saveProfile() {
        if (!state.currentUser) return;
        const name = document.getElementById('profile-name-input')?.value?.trim() || "Bruno";
        const pin = document.getElementById('profile-pass-input')?.value?.trim() || "";
        await UserModel.savePrefs(state.currentUser.uid, { userName: name, appPassword: pin });
        this._profilePassword = pin;
        this._profileName = name;
        this._updateAvatarUI(name);
        ModalView.showToast("Perfil guardado!");
        ModalView.closeProfileModal();
    }

    logout() {
        signOut(auth).then(() => window.location.reload());
    }
}
