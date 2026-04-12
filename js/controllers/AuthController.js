import { auth } from '../firebase.js';
import { DEFAULT_CATEGORIES } from '../config.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    sendPasswordResetEmail
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
        this._googleProvider = new GoogleAuthProvider();
    }

    init() {
        this._bindAuthForm();
        this._bindGoogleLogin();
        this._bindForgotPassword();
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

    _bindGoogleLogin() {
        const btn = document.getElementById('auth-google-btn');
        if (!btn) return;
        btn.onclick = async () => {
            btn.disabled = true;
            btn.innerText = 'A autenticar...';
            try {
                const result = await signInWithPopup(auth, this._googleProvider);
                const user = result.user;
                // Se é a primeira vez, guarda o perfil
                const prefs = await UserModel.getPrefs(user.uid);
                if (!prefs?.userName) {
                    const name = user.displayName || user.email?.split('@')[0] || 'Utilizador';
                    await UserModel.savePrefs(user.uid, {
                        userName: name,
                        appPassword: '',
                        createdAt: new Date().toISOString()
                    });
                    ModalView.showToast(`Bem-vindo, ${name}!`, 'success');
                }
            } catch (err) {
                if (err.code !== 'auth/popup-closed-by-user') {
                    ModalView.showToast('Erro no login com Google: ' + (err.message || err.code), 'error');
                }
            } finally {
                btn.disabled = false;
                btn.innerText = 'Continuar com Google';
            }
        };
    }

    _bindForgotPassword() {
        const link = document.getElementById('auth-forgot-password');
        if (!link) return;
        link.onclick = async () => {
            const email = document.getElementById('auth-email')?.value?.trim();
            if (!email) {
                ModalView.showToast('Escreve o teu e-mail no campo acima primeiro.', 'error');
                return;
            }
            try {
                await sendPasswordResetEmail(auth, email);
                ModalView.showToast('E-mail de recuperação enviado! Verifica a caixa de entrada.', 'success');
            } catch (err) {
                const msgs = {
                    'auth/user-not-found' : 'Não existe conta com este e-mail.',
                    'auth/invalid-email'  : 'E-mail inválido.',
                };
                ModalView.showToast(msgs[err.code] || 'Erro: ' + err.message, 'error');
            }
        };
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
            this._profilePassword  = prefs?.appPassword      || '';
            this._profileName      = prefs?.userName         || '';
            state.sharedSpaceId    = prefs?.sharedSpaceId    || null;
            state.budgets          = prefs?.budgets          || {};
            state.customCategories = prefs?.customCategories || [];
            state.userName         = this._profileName;

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

        // Metas de gastos dinâmicas
        this._renderBudgetGoals();
        if (!document.getElementById('btn-add-budget')._bound) {
            document.getElementById('btn-add-budget')._bound = true;
            document.getElementById('btn-add-budget').addEventListener('click', () => this._addBudgetGoal());
            document.getElementById('budget-amount-input')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this._addBudgetGoal();
            });
        }

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

        // Lê edições inline das metas (inputs com data-budget-edit)
        document.querySelectorAll('[data-budget-edit]').forEach(inp => {
            const cat = inp.dataset.budgetEdit;
            const val = parseFloat(inp.value);
            if (val > 0) state.budgets[cat] = val;
            else delete state.budgets[cat];
        });

        await UserModel.savePrefs(state.currentUser.uid, {
            userName: name,
            appPassword: pin,
            budgets: state.budgets,
            customCategories: state.customCategories
        });

        this._profilePassword = pin;
        this._profileName     = name;
        state.userName        = name;
        this._updateAvatarUI(name);
        ModalView.showToast('Perfil guardado com sucesso!');
        document.getElementById('profile-modal')?.classList.add('hidden');
    }

    _renderBudgetGoals() {
        const container = document.getElementById('budget-goals-list');
        if (!container) return;

        const entries = Object.entries(state.budgets || {});
        if (!entries.length) {
            container.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-2">Sem metas. Adiciona abaixo.</p>`;
        } else {
            container.innerHTML = entries.map(([cat, val]) => `
                <div class="flex items-center gap-2 mb-2">
                    <span class="flex-1 text-sm font-medium text-slate-700 truncate">${cat}</span>
                    <input type="number" data-budget-edit="${cat}" value="${val}" min="1"
                        class="w-28 p-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-right outline-none focus:ring-2 focus:ring-indigo-300">
                    <span class="text-[10px] text-slate-400 shrink-0">R$/mês</span>
                    <button data-budget-delete="${cat}" class="text-slate-300 hover:text-rose-500 transition-colors font-bold px-1 shrink-0">✕</button>
                </div>
            `).join('');

            container.querySelectorAll('[data-budget-delete]').forEach(btn => {
                btn.addEventListener('click', () => {
                    delete state.budgets[btn.dataset.budgetDelete];
                    this._renderBudgetGoals();
                });
            });
        }

        // Popula o select com categorias ainda sem meta (exceto Receita)
        const sel = document.getElementById('budget-cat-select');
        if (!sel) return;
        const all  = [...DEFAULT_CATEGORIES, ...state.customCategories].filter(c => c !== 'Receita');
        const used = Object.keys(state.budgets || {});
        const free = all.filter(c => !used.includes(c));
        sel.innerHTML = free.length
            ? free.map(c => `<option value="${c}">${c}</option>`).join('')
            : `<option value="" disabled selected>Todas as categorias já têm meta</option>`;
    }

    _addBudgetGoal() {
        const cat = document.getElementById('budget-cat-select')?.value;
        const val = parseFloat(document.getElementById('budget-amount-input')?.value);
        if (!cat) { ModalView.showToast('Seleciona uma categoria.', 'error'); return; }
        if (!val || val <= 0) { ModalView.showToast('Define um valor maior que zero.', 'error'); return; }
        state.budgets = { ...state.budgets, [cat]: val };
        document.getElementById('budget-amount-input').value = '';
        this._renderBudgetGoals();
    }


    logout() {
        signOut(auth).then(() => window.location.reload());
    }
}
