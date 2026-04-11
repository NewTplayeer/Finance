import { auth } from '../firebase.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged
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
        const mainBtn   = document.getElementById('auth-main-btn');
        const toggleBtn = document.getElementById('auth-toggle-btn');
        const nameGroup = document.getElementById('register-name-group');

        if (toggleBtn) {
            toggleBtn.onclick = () => {
                authMode = authMode === 'login' ? 'register' : 'login';
                const isLogin = authMode === 'login';

                const title    = document.getElementById('auth-title');
                const subtitle = document.getElementById('auth-subtitle');
                if (title)    title.innerText    = isLogin ? 'NT Finanças' : 'Criar Conta';
                if (subtitle) subtitle.innerText = isLogin
                    ? 'Inicia sessão para aceder ao teu painel.'
                    : 'Preenche os teus dados para começar.';
                if (mainBtn)  mainBtn.innerText  = isLogin ? 'Entrar no Sistema' : 'Criar Minha Conta';
                toggleBtn.innerText = isLogin
                    ? 'Ainda não tens conta? Regista-te agora'
                    : 'Já tens conta? Entra aqui';
                if (nameGroup) nameGroup.classList.toggle('hidden', isLogin);
            };
        }

        if (mainBtn) {
            mainBtn.onclick = async () => {
                const email    = document.getElementById('auth-email')?.value?.trim();
                const password = document.getElementById('auth-password')?.value?.trim();
                const name     = document.getElementById('auth-name')?.value?.trim();

                if (!email || !password) {
                    return ModalView.showToast('Por favor, preenche o e-mail e a palavra-passe.');
                }
                if (authMode === 'register' && !name) {
                    return ModalView.showToast('Por favor, indica o teu nome.');
                }

                // Feedback visual — desativa botão durante operação
                mainBtn.disabled = true;
                const original = mainBtn.innerText;
                mainBtn.innerText = 'A processar...';

                try {
                    if (authMode === 'login') {
                        await signInWithEmailAndPassword(auth, email, password);
                    } else {
                        const cred = await createUserWithEmailAndPassword(auth, email, password);
                        await UserModel.savePrefs(cred.user.uid, {
                            userName: name,
                            appPassword: '',
                            createdAt: new Date().toISOString()
                        });
                        ModalView.showToast(`Bem-vindo, ${name}! Conta criada com sucesso!`);
                    }
                } catch (err) {
                    console.error('Firebase Auth Error:', err.code, err.message);
                    const msgs = {
                        'auth/invalid-credential'  : 'E-mail ou palavra-passe incorretos.',
                        'auth/user-not-found'       : 'Utilizador não encontrado.',
                        'auth/wrong-password'       : 'Palavra-passe incorreta.',
                        'auth/email-already-in-use' : 'E-mail já registado. Tenta fazer login.',
                        'auth/weak-password'        : 'A senha precisa de pelo menos 6 caracteres.',
                        'auth/invalid-email'        : 'Endereço de e-mail inválido.',
                        'auth/too-many-requests'    : 'Muitas tentativas. Aguarda uns minutos.'
                    };
                    ModalView.showToast(msgs[err.code] || 'Erro: ' + (err.code || err.message));
                } finally {
                    mainBtn.disabled = false;
                    mainBtn.innerText = original;
                }
            };
        }

        // Submeter com Enter no campo de password
        document.getElementById('auth-password')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') mainBtn?.click();
        });
    }

    _bindLockScreen() {
        const unlockBtn = document.getElementById('unlock-btn');
        if (unlockBtn) {
            unlockBtn.onclick = () => {
                const inputEl = document.getElementById('lock-password-input');
                if (inputEl?.value === this._profilePassword) {
                    this._showMainApp();
                } else {
                    ModalView.showToast('PIN incorreto!');
                    if (inputEl) inputEl.value = '';
                }
            };
        }

        document.getElementById('lock-password-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('unlock-btn')?.click();
        });

        const forgotBtn = document.getElementById('forgot-pin-btn');
        if (forgotBtn) {
            forgotBtn.onclick = async () => {
                if (!state.currentUser) return;
                await UserModel.savePrefs(state.currentUser.uid, { appPassword: '' });
                this._profilePassword = '';
                ModalView.showToast('PIN removido.');
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
            this._profilePassword = prefs?.appPassword || '';
            this._profileName     = prefs?.userName    || '';
            state.sharedSpaceId   = prefs?.sharedSpaceId || null;
            state.budgets         = prefs?.budgets || {};
            state.userName        = this._profileName;

            this._updateAvatarUI(this._profileName);

            const lockName = document.getElementById('lock-user-name');
            if (lockName) lockName.innerText = this._profileName || 'Olá!';

            if (this._profilePassword) {
                document.getElementById('app-lock-screen')?.classList.remove('hidden');
                document.getElementById('main-interface')?.classList.add('hidden');
                setTimeout(() => document.getElementById('lock-password-input')?.focus(), 100);
            } else {
                this._showMainApp();
            }
        } catch (err) {
            console.error('Erro ao carregar perfil:', err);
            this._showMainApp();
        }
    }

    _showMainApp() {
        document.getElementById('app-lock-screen')?.classList.add('hidden');
        document.getElementById('main-interface')?.classList.remove('hidden');
        document.getElementById('app-content')?.classList.remove('opacity-0', 'pointer-events-none');
    }

    _updateAvatarUI(name) {
        const initial = (name || 'U').charAt(0).toUpperCase();
        const avatar  = document.getElementById('nav-avatar');
        const navName = document.getElementById('nav-user-name');
        const lockAv  = document.getElementById('lock-avatar-circle');
        const greet   = document.getElementById('welcome-greeting');

        if (avatar)  avatar.innerText  = initial;
        if (navName) navName.innerText = name ? `Olá, ${name.split(' ')[0]}` : 'Utilizador';
        if (lockAv)  lockAv.innerText  = initial;
        if (greet)   greet.innerText   = name ? `Bem-vindo de volta, ${name.split(' ')[0]}! 👋` : '';
    }

    openProfileModal() {
        const nameEl = document.getElementById('profile-name-input');
        const passEl = document.getElementById('profile-pass-input');
        if (nameEl) nameEl.value = this._profileName || '';
        if (passEl) passEl.value = this._profilePassword || '';

        // Preenche metas
        const budgets = state.budgets || {};
        document.querySelectorAll('[data-budget-cat]').forEach(inp => {
            inp.value = budgets[inp.dataset.budgetCat] || '';
        });

        // Estado do espaço partilhado
        this._updateSharedSpaceUI();

        document.getElementById('profile-modal')?.classList.remove('hidden');
    }

    _updateSharedSpaceUI() {
        const spaceInfo  = document.getElementById('shared-space-info');
        const spaceCode  = document.getElementById('shared-space-code');
        const createBtn  = document.getElementById('btn-create-space');
        const joinSect   = document.getElementById('join-space-section');

        if (state.sharedSpaceId) {
            spaceInfo?.classList.remove('hidden');
            if (spaceCode) spaceCode.innerText = state.sharedSpaceId;
            createBtn?.classList.add('hidden');
            joinSect?.classList.add('hidden');
        } else {
            spaceInfo?.classList.add('hidden');
            createBtn?.classList.remove('hidden');
            joinSect?.classList.remove('hidden');
        }
    }

    async saveProfile() {
        if (!state.currentUser) return;

        const name = document.getElementById('profile-name-input')?.value?.trim() || this._profileName || 'Utilizador';
        const pin  = document.getElementById('profile-pass-input')?.value?.trim() || '';

        const budgets = {};
        document.querySelectorAll('[data-budget-cat]').forEach(inp => {
            const val = parseFloat(inp.value);
            if (val > 0) budgets[inp.dataset.budgetCat] = val;
        });

        await UserModel.savePrefs(state.currentUser.uid, { userName: name, appPassword: pin, budgets });

        this._profilePassword = pin;
        this._profileName     = name;
        state.userName        = name;
        state.budgets         = budgets;
        this._updateAvatarUI(name);
        ModalView.showToast('Perfil guardado com sucesso!');
        document.getElementById('profile-modal')?.classList.add('hidden');
    }

    logout() {
        signOut(auth).then(() => window.location.reload());
    }
}
