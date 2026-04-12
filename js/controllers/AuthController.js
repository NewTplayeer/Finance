/**
 * AuthController — gere autenticação Firebase (email/pass, Google), ecrã de PIN,
 * perfil do utilizador, metas de gastos e métodos de pagamento personalizados.
 */
import { auth } from '../firebase.js';
import { DEFAULT_CATEGORIES, DEFAULT_METHODS } from '../config.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    sendPasswordResetEmail,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { UserModel } from '../models/UserModel.js';
import { state } from '../state.js';
import { ModalView } from '../views/ModalView.js';

export class AuthController {
    /**
     * @param {{ onLogin: function, onLogout: function }} options
     */
    constructor({ onLogin, onLogout }) {
        this.onLogin  = onLogin;
        this.onLogout = onLogout;
        this._profilePassword = "";
        this._profileName     = "";
        this._googleProvider  = new GoogleAuthProvider();
    }

    /** Inicializa autenticação, listeners e formulários */
    async init() {
        // Garante persistência local mesmo após fechar o browser
        try { await setPersistence(auth, browserLocalPersistence); } catch (_) {}

        this._bindAuthForm();
        this._bindGoogleLogin();
        this._bindForgotPassword();
        this._bindLockScreen();
        this._bindProfileModal();
        this._bindSidebarBudgetForm();

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

    /** Regista os listeners do formulário de login/registo */
    _bindAuthForm() {
        let authMode = 'login';
        const mainBtn   = document.getElementById('auth-main-btn');
        const toggleBtn = document.getElementById('auth-toggle-btn');
        const nameGroup = document.getElementById('register-name-group');
        const lgpdGroup = document.getElementById('register-lgpd-group');

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
                if (lgpdGroup) lgpdGroup.classList.toggle('hidden', isLogin);
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
                if (authMode === 'register') {
                    if (!name) return ModalView.showToast('Por favor, indica o teu nome.');
                    const lgpdChk = document.getElementById('lgpd-consent-check');
                    if (lgpdChk && !lgpdChk.checked) {
                        return ModalView.showToast('Aceita os termos de privacidade (LGPD) para continuar.', 'error');
                    }
                }

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
                            lgpdConsent: true,
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
                    mainBtn.disabled  = false;
                    mainBtn.innerText = original;
                }
            };
        }

        document.getElementById('auth-password')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') mainBtn?.click();
        });
    }

    /** Regista o listener do botão de login com Google */
    _bindGoogleLogin() {
        const btn = document.getElementById('auth-google-btn');
        if (!btn) return;
        btn.onclick = async () => {
            btn.disabled  = true;
            btn.innerText = 'A autenticar...';
            try {
                const result = await signInWithPopup(auth, this._googleProvider);
                const user   = result.user;
                const prefs  = await UserModel.getPrefs(user.uid);
                if (!prefs?.userName) {
                    const name = user.displayName || user.email?.split('@')[0] || 'Utilizador';
                    await UserModel.savePrefs(user.uid, {
                        userName: name,
                        appPassword: '',
                        lgpdConsent: true,
                        createdAt: new Date().toISOString()
                    });
                    ModalView.showToast(`Bem-vindo, ${name}!`, 'success');
                }
            } catch (err) {
                if (err.code !== 'auth/popup-closed-by-user') {
                    ModalView.showToast('Erro no login com Google: ' + (err.message || err.code), 'error');
                }
            } finally {
                btn.disabled  = false;
                btn.innerText = 'Continuar com Google';
            }
        };
    }

    /** Regista o listener do link "Esqueci a palavra-passe" */
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

    /** Regista os listeners do ecrã de bloqueio por PIN */
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

    /** Regista o listener do botão de avatar que abre o perfil */
    _bindProfileModal() {
        const openBtn = document.getElementById('nav-avatar');
        if (openBtn) openBtn.onclick = () => this.openProfileModal();
    }

    /**
     * Regista os listeners do formulário de metas na sidebar (sempre visível).
     * Chamado uma única vez a partir de init().
     */
    _bindSidebarBudgetForm() {
        const addBudgetBtn = document.getElementById('btn-add-budget');
        if (addBudgetBtn) {
            addBudgetBtn.addEventListener('click', () => this._addBudgetGoal());
        }
        document.getElementById('budget-amount-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._addBudgetGoal();
        });
    }

    /**
     * Carrega as preferências do utilizador do Firestore e actualiza o estado global.
     * @param {string} uid
     */
    async _loadProfile(uid) {
        try {
            const prefs = await UserModel.getPrefs(uid);
            this._profilePassword  = prefs?.appPassword      || '';
            this._profileName      = prefs?.userName         || '';
            state.sharedSpaceId    = prefs?.sharedSpaceId    || null;
            state.budgets          = prefs?.budgets          || {};
            state.customCategories = prefs?.customCategories || [];
            state.customMethods    = prefs?.customMethods    || [];
            state.userName         = this._profileName;

            this._updateAvatarUI(this._profileName);

            const lockName = document.getElementById('lock-user-name');
            if (lockName) lockName.innerText = this._profileName || 'Olá!';

            // Inicializa widgets da sidebar que dependem do perfil
            this._renderBudgetGoals();
            this._updateSharedSpaceUI();

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

    /** Mostra a interface principal e oculta o ecrã de bloqueio */
    _showMainApp() {
        document.getElementById('app-lock-screen')?.classList.add('hidden');
        document.getElementById('main-interface')?.classList.remove('hidden');
        document.getElementById('app-content')?.classList.remove('opacity-0', 'pointer-events-none');
    }

    /**
     * Actualiza o avatar, nome e saudação na navbar.
     * @param {string} name
     */
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

    /** Abre o modal de perfil e preenche todos os campos com os dados actuais */
    openProfileModal() {
        const nameEl = document.getElementById('profile-name-input');
        const passEl = document.getElementById('profile-pass-input');
        if (nameEl) nameEl.value = this._profileName || '';
        if (passEl) passEl.value = this._profilePassword || '';

        this._updateSharedSpaceUI();
        this._renderBudgetGoals();
        this._renderMethodsList();

        // Evita registar o listener de métodos múltiplas vezes
        const addMethodBtn = document.getElementById('btn-add-method');
        if (addMethodBtn && !addMethodBtn._bound) {
            addMethodBtn._bound = true;
            addMethodBtn.addEventListener('click', () => this._addMethod());
            document.getElementById('new-method-input')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this._addMethod();
            });
        }

        document.getElementById('profile-modal')?.classList.remove('hidden');
    }

    /** Actualiza a secção de espaço partilhado no modal de perfil */
    _updateSharedSpaceUI() {
        const spaceInfo = document.getElementById('shared-space-info');
        const spaceCode = document.getElementById('shared-space-code');
        const createBtn = document.getElementById('btn-create-space');
        const joinSect  = document.getElementById('join-space-section');

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

    /** Guarda as alterações do perfil no Firestore */
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
            userName:         name,
            appPassword:      pin,
            budgets:          state.budgets,
            customCategories: state.customCategories,
            customMethods:    state.customMethods
        });

        this._profilePassword = pin;
        this._profileName     = name;
        state.userName        = name;
        this._updateAvatarUI(name);
        ModalView.showToast('Perfil guardado com sucesso!');
        document.getElementById('profile-modal')?.classList.add('hidden');
    }

    /** Renderiza a lista dinâmica de metas de gastos no modal de perfil */
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
                btn.addEventListener('click', async () => {
                    delete state.budgets[btn.dataset.budgetDelete];
                    this._renderBudgetGoals();
                    const uid = state.currentUser?.uid;
                    if (uid) {
                        try { await UserModel.savePrefs(uid, { budgets: state.budgets }); } catch (_) {}
                    }
                });
            });

            // Auto-guarda quando o utilizador edita um valor de meta inline na sidebar
            container.querySelectorAll('[data-budget-edit]').forEach(inp => {
                inp.addEventListener('change', async () => {
                    const cat = inp.dataset.budgetEdit;
                    const val = parseFloat(inp.value);
                    if (val > 0) state.budgets[cat] = val;
                    else delete state.budgets[cat];
                    const uid = state.currentUser?.uid;
                    if (uid) {
                        try { await UserModel.savePrefs(uid, { budgets: state.budgets }); } catch (_) {}
                    }
                });
            });
        }

        // Popula o select com categorias ainda sem meta (exceto Receita)
        const sel  = document.getElementById('budget-cat-select');
        if (!sel) return;
        const all  = [...DEFAULT_CATEGORIES, ...state.customCategories].filter(c => c !== 'Receita');
        const used = Object.keys(state.budgets || {});
        const free = all.filter(c => !used.includes(c));
        sel.innerHTML = free.length
            ? free.map(c => `<option value="${c}">${c}</option>`).join('')
            : `<option value="" disabled selected>Todas as categorias já têm meta</option>`;
    }

    /**
     * Adiciona uma nova meta a partir dos campos do formulário de metas.
     * Auto-guarda no Firestore para que a sidebar funcione sem abrir o modal de perfil.
     */
    async _addBudgetGoal() {
        const cat = document.getElementById('budget-cat-select')?.value;
        const val = parseFloat(document.getElementById('budget-amount-input')?.value);
        if (!cat) { ModalView.showToast('Seleciona uma categoria.', 'error'); return; }
        if (!val || val <= 0) { ModalView.showToast('Define um valor maior que zero.', 'error'); return; }
        state.budgets = { ...state.budgets, [cat]: val };
        const input = document.getElementById('budget-amount-input');
        if (input) input.value = '';
        this._renderBudgetGoals();
        const uid = state.currentUser?.uid;
        if (uid) {
            try { await UserModel.savePrefs(uid, { budgets: state.budgets }); } catch (_) {}
        }
    }

    /** Renderiza a lista de métodos de pagamento personalizados no modal de perfil */
    _renderMethodsList() {
        const container = document.getElementById('methods-list');
        if (!container) return;

        if (!state.customMethods.length) {
            container.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-2">Sem métodos personalizados.</p>`;
            return;
        }

        container.innerHTML = state.customMethods.map((m, i) => `
            <div class="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2 mb-2">
                <span class="text-sm font-medium text-slate-700">${m}</span>
                <button data-method-delete="${i}" class="text-slate-300 hover:text-rose-500 transition-colors font-bold px-1">✕</button>
            </div>
        `).join('');

        container.querySelectorAll('[data-method-delete]').forEach(btn => {
            btn.addEventListener('click', () => {
                state.customMethods.splice(parseInt(btn.dataset.methodDelete, 10), 1);
                this._renderMethodsList();
            });
        });
    }

    /**
     * Adiciona um novo método de pagamento personalizado a partir do campo de texto.
     * Chamada pelo botão "+ Método" ou tecla Enter.
     */
    _addMethod() {
        const input = document.getElementById('new-method-input');
        const name  = input?.value?.trim();
        if (!name) { ModalView.showToast('Escreve o nome do método.', 'error'); return; }
        const all = [...DEFAULT_METHODS, ...state.customMethods];
        if (all.some(m => m.toLowerCase() === name.toLowerCase())) {
            ModalView.showToast('Este método já existe.', 'error');
            return;
        }
        state.customMethods = [...state.customMethods, name];
        if (input) input.value = '';
        this._renderMethodsList();
        ModalView.showToast(`Método "${name}" adicionado!`, 'success');
    }

    /** Termina a sessão e recarrega a página */
    logout() {
        signOut(auth).then(() => window.location.reload());
    }
}
