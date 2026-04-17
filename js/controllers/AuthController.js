/**
 * AuthController — gere autenticação Firebase (email/pass, Google), ecrã de PIN,
 * perfil do utilizador, metas de gastos e métodos de pagamento personalizados.
 */
import { auth } from '../firebase.js';
import { DEFAULT_CATEGORIES, DEFAULT_METHODS } from '../config.js';
import { TransactionModel } from '../models/TransactionModel.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    sendPasswordResetEmail,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { UserModel } from '../models/UserModel.js';
import { AdminModel } from '../models/AdminModel.js';
import { LogModel } from '../models/LogModel.js';
import { state } from '../state.js';
import { ModalView } from '../views/ModalView.js';
import { ExportUtils } from '../utils/ExportUtils.js';

/** Formata input de CPF enquanto o utilizador digita: 000.000.000-00 */
const maskCpf = (v) => v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');

/** Formata input de telefone enquanto o utilizador digita: (11) 99999-9999 */
const maskPhone = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2)  return d.replace(/(\d{0,2})/, '($1');
    if (d.length <= 7)  return d.replace(/(\d{2})(\d+)/, '($1) $2');
    if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d+)/, '($1) $2-$3');
    return d.replace(/(\d{2})(\d{5})(\d+)/, '($1) $2-$3');
};

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

        // Lida com o resultado do redirect do Google (mobile / popup bloqueado)
        try {
            const result = await getRedirectResult(auth);
            if (result?.user) {
                const user  = result.user;
                const prefs = await UserModel.getPrefs(user.uid);
                if (!prefs?.userName) {
                    const name = user.displayName || user.email?.split('@')[0] || 'Utilizador';
                    await UserModel.savePrefs(user.uid, {
                        userName: name, appPassword: '', lgpdConsent: true,
                        createdAt: new Date().toISOString()
                    });
                }
                this._skipNextLoginLog = true;
                await LogModel.write('user_login_google', user.uid, {
                    email: user.email || '', name: user.displayName || ''
                });
            }
        } catch (_) {}

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
                // Regista/actualiza o utilizador no painel de admin
                try {
                    await AdminModel.saveUser(user.uid, {
                        name:  state.userName || user.displayName || '',
                        email: user.email || ''
                    });
                } catch (_) {}
                if (this.onLogin) this.onLogin(user);
                // Log de login — evita duplicação quando o log já foi escrito
                // por registo, Google popup ou Google redirect
                if (!this._skipNextLoginLog) {
                    const method = user.providerData?.[0]?.providerId === 'google.com'
                        ? 'user_login_google' : 'user_login_email';
                    LogModel.write(method, user.uid, {
                        email: user.email || '',
                        name:  state.userName || user.displayName || ''
                    });
                }
                this._skipNextLoginLog = false;
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

        // Máscaras de CPF e telefone
        document.getElementById('auth-cpf')?.addEventListener('input', (e) => {
            e.target.value = maskCpf(e.target.value);
        });
        document.getElementById('auth-phone')?.addEventListener('input', (e) => {
            e.target.value = maskPhone(e.target.value);
        });

        // Botão "Ver Termos" abre modal com termos completos
        document.getElementById('btn-open-terms')?.addEventListener('click', () => {
            const termsText = document.querySelector('#register-lgpd-group .terms-text')?.innerHTML
                || 'Consulte os Termos de Uso e Política de Privacidade no formulário de registo.';
            ModalView.openConfirmModal({
                title: 'Termos de Uso e Política de Privacidade',
                message: `<div class="text-xs text-slate-600 leading-relaxed max-h-80 overflow-y-auto pr-1">${termsText}</div>`,
                confirmLabel: 'Fechar',
                confirmClass: 'w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl transition hover:bg-indigo-700',
                onConfirm: () => {},
                onCancel: null
            });
        });

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
                        const cpf       = document.getElementById('auth-cpf')?.value?.trim() || '';
                        const phone     = document.getElementById('auth-phone')?.value?.trim() || '';
                        const birthdate = document.getElementById('auth-birthdate')?.value || '';

                        const cred = await createUserWithEmailAndPassword(auth, email, password);
                        this._skipNextLoginLog = true;
                        await UserModel.savePrefs(cred.user.uid, {
                            userName: name,
                            appPassword: '',
                            lgpdConsent: true,
                            lgpdConsentAt: new Date().toISOString(),
                            cpf,
                            phone,
                            birthdate,
                            createdAt: new Date().toISOString()
                        });
                        // Regista o novo utilizador na coleção de admin
                        try {
                            await AdminModel.registerUser(cred.user.uid, { name, email, cpf });
                        } catch (_) {}
                        // Log de registo
                        LogModel.write('user_registered', cred.user.uid, { email, name });
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
                this._skipNextLoginLog = true;
                LogModel.write('user_login_google', user.uid, {
                    email: user.email || '', name: user.displayName || ''
                });
            } catch (err) {
                if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-cancelled') {
                    // Fallback para redirect em ambientes que bloqueiam popups (mobile/Safari)
                    try {
                        await signInWithRedirect(auth, this._googleProvider);
                    } catch (_) {}
                } else if (err.code !== 'auth/popup-closed-by-user') {
                    ModalView.showToast('Erro no login com Google: ' + (err.message || err.code), 'error');
                    btn.disabled  = false;
                    btn.innerText = 'Continuar com Google';
                }
                // Se redirect iniciado, o btn fica disabled (página vai recarregar)
                return;
            }
            btn.disabled  = false;
            btn.innerText = 'Continuar com Google';
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

        const exportBtn = document.getElementById('btn-export-json');
        if (exportBtn) exportBtn.onclick = () => ExportUtils.exportDatabaseToJson();
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
            state.sharedSpaceId      = prefs?.sharedSpaceId      || null;
            state.budgets            = prefs?.budgets            || {};
            state.customCategories   = prefs?.customCategories   || [];
            state.customMethods      = prefs?.customMethods      || [];
            state.customMethodsOrder = prefs?.customMethodsOrder || [];
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

        document.getElementById('profile-modal')?.classList.remove('hidden');
    }

    /**
     * Expõe renderização da lista de métodos — usado pelo modal unificado de Categorias & Métodos.
     * Garante que o listener de adicionar método está registado.
     */
    _renderMethodsList() {
        this.__renderMethodsListInternal();
        const addMethodBtn = document.getElementById('btn-add-method');
        if (addMethodBtn && !addMethodBtn._bound) {
            addMethodBtn._bound = true;
            addMethodBtn.addEventListener('click', () => this._addMethod());
            document.getElementById('new-method-input')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this._addMethod();
            });
        }
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
            userName:          name,
            appPassword:       pin,
            budgets:           state.budgets,
            customCategories:  state.customCategories,
            customMethods:     state.customMethods,
            customMethodsOrder: state.customMethodsOrder
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

    /**
     * Renderiza a lista completa de métodos de pagamento (padrão + personalizados).
     * Com ordenação (↑↓), edição inline, edição em massa e exclusão com validação.
     */
    __renderMethodsListInternal() {
        const container = document.getElementById('methods-list');
        if (!container) return;

        // Ordem preferida: state.customMethodsOrder define posições de TODOS os métodos
        const allMethods = [...DEFAULT_METHODS, ...state.customMethods];
        const order      = state.customMethodsOrder || [];

        // Aplica ordem preferida
        const ordered = [...allMethods].sort((a, b) => {
            const ia = order.indexOf(a);
            const ib = order.indexOf(b);
            if (ia === -1 && ib === -1) return allMethods.indexOf(a) - allMethods.indexOf(b);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });

        if (!ordered.length) {
            container.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-2">Sem métodos.</p>`;
            return;
        }

        container.innerHTML = ordered.map((m, i) => {
            const isDefault = DEFAULT_METHODS.includes(m);
            return `
            <div class="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5 mb-2 group" data-method-name="${this._escAttr(m)}">
                <div class="flex flex-col gap-0.5 shrink-0">
                    <button data-method-up="${i}" title="Subir" class="text-slate-300 hover:text-slate-600 transition leading-none text-xs ${i === 0 ? 'invisible' : ''}">▲</button>
                    <button data-method-down="${i}" title="Descer" class="text-slate-300 hover:text-slate-600 transition leading-none text-xs ${i === ordered.length - 1 ? 'invisible' : ''}">▼</button>
                </div>
                <span class="method-label flex-1 text-sm font-medium text-slate-700 truncate">${m}</span>
                <input type="text" class="method-edit-input hidden flex-1 p-1.5 text-sm bg-white border border-indigo-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300" value="${this._escAttr(m)}">
                ${isDefault
                    ? `<span class="text-[9px] font-bold text-slate-400 uppercase border border-slate-200 rounded px-1.5 py-0.5 shrink-0">Padrão</span>`
                    : `
                    <button class="method-edit-btn shrink-0 text-slate-300 hover:text-indigo-500 transition text-sm px-1" title="Editar">✎</button>
                    <button class="method-save-btn hidden shrink-0 px-2 py-1 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition">OK</button>
                    <button data-method-delete="${this._escAttr(m)}" class="shrink-0 text-slate-300 hover:text-rose-500 transition font-bold text-sm px-1" title="Excluir">✕</button>`
                }
            </div>`;
        }).join('');

        /* ─ Reordenar ─ */
        const reorder = (fromIdx, toIdx) => {
            if (toIdx < 0 || toIdx >= ordered.length) return;
            const newOrder = [...ordered];
            [newOrder[fromIdx], newOrder[toIdx]] = [newOrder[toIdx], newOrder[fromIdx]];
            state.customMethodsOrder = newOrder;
            this._saveMethodsOrder();
            this._renderMethodsList();
        };

        container.querySelectorAll('[data-method-up]').forEach(btn => {
            btn.addEventListener('click', () => reorder(parseInt(btn.dataset.methodUp), parseInt(btn.dataset.methodUp) - 1));
        });
        container.querySelectorAll('[data-method-down]').forEach(btn => {
            btn.addEventListener('click', () => reorder(parseInt(btn.dataset.methodDown), parseInt(btn.dataset.methodDown) + 1));
        });

        /* ─ Edição inline ─ */
        container.querySelectorAll('[data-method-name]').forEach(row => {
            const oldName   = row.dataset.methodName;
            if (DEFAULT_METHODS.includes(oldName)) return; // padrões não são editáveis
            const label     = row.querySelector('.method-label');
            const input     = row.querySelector('.method-edit-input');
            const editBtn   = row.querySelector('.method-edit-btn');
            const saveBtn   = row.querySelector('.method-save-btn');
            if (!editBtn || !saveBtn) return;

            editBtn.addEventListener('click', () => {
                label.classList.add('hidden');
                editBtn.classList.add('hidden');
                input.classList.remove('hidden');
                saveBtn.classList.remove('hidden');
                input.focus(); input.select();
            });

            const doSave = async () => {
                const newName = input.value.trim();
                if (!newName) { ModalView.showToast('O nome não pode estar vazio.', 'error'); return; }
                if (newName.toLowerCase() === oldName.toLowerCase()) {
                    // Sem mudança
                    label.classList.remove('hidden');
                    editBtn.classList.remove('hidden');
                    input.classList.add('hidden');
                    saveBtn.classList.add('hidden');
                    return;
                }
                const all = [...DEFAULT_METHODS, ...state.customMethods];
                if (all.some(m => m.toLowerCase() === newName.toLowerCase() && m !== oldName)) {
                    ModalView.showToast('Já existe um método com esse nome.', 'error'); return;
                }
                // Conta transações afectadas
                const affected = state.transactions.filter(t => t.method === oldName).length;
                const proceed  = await this._confirmMethodRename(oldName, newName, affected);
                if (!proceed) return;

                // Actualiza estado
                state.customMethods = state.customMethods.map(m => m === oldName ? newName : m);
                if (state.customMethodsOrder) {
                    state.customMethodsOrder = state.customMethodsOrder.map(m => m === oldName ? newName : m);
                }
                // Actualiza transações históricas (batch)
                if (affected > 0 && proceed === 'all') {
                    await this._bulkUpdateMethod(oldName, newName);
                }
                const uid = state.currentUser?.uid;
                if (uid) await UserModel.savePrefs(uid, {
                    customMethods:      state.customMethods,
                    customMethodsOrder: state.customMethodsOrder
                });
                this._renderMethodsList();
                ModalView.showToast(`Método renomeado para "${newName}".`, 'success');
            };

            saveBtn.addEventListener('click', doSave);
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSave(); });
        });

        /* ─ Exclusão com validação ─ */
        container.querySelectorAll('[data-method-delete]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const name     = btn.dataset.methodDelete;
                const affected = state.transactions.filter(t => t.method === name).length;

                if (affected > 0) {
                    // Migração obrigatória
                    await this._confirmMethodMigration(name, affected);
                } else {
                    ModalView.openConfirmModal({
                        title:        'Excluir Método',
                        message:      `Excluir o método <strong>"${name}"</strong>? Nenhuma transação está vinculada.`,
                        confirmLabel: 'Sim, excluir',
                        onConfirm:    async () => {
                            state.customMethods      = state.customMethods.filter(m => m !== name);
                            state.customMethodsOrder = (state.customMethodsOrder || []).filter(m => m !== name);
                            const uid = state.currentUser?.uid;
                            if (uid) await UserModel.savePrefs(uid, {
                                customMethods:      state.customMethods,
                                customMethodsOrder: state.customMethodsOrder
                            });
                            this._renderMethodsList();
                            ModalView.showToast(`Método "${name}" removido.`, 'success');
                        }
                    });
                }
            });
        });
    }

    /**
     * Mostra confirm modal para renomeação, retorna 'all' | 'new' | false.
     */
    async _confirmMethodRename(oldName, newName, affected) {
        return new Promise(resolve => {
            ModalView.openConfirmModal({
                title:   'Renomear Método',
                message: `<strong>"${oldName}"</strong> → <strong>"${newName}"</strong><br>
                    <span class="text-xs text-slate-500">${affected} transação(ões) vinculada(s).</span><br><br>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" id="method-rename-all" checked class="w-4 h-4 accent-indigo-600">
                        <span class="text-sm text-slate-700">Actualizar também os registos históricos</span>
                    </label>`,
                confirmLabel: 'Confirmar',
                onConfirm: () => resolve(document.getElementById('method-rename-all')?.checked ? 'all' : 'new'),
                onCancel:  () => resolve(false)
            });
        });
    }

    /**
     * Mostra dialog de migração quando há transações vinculadas ao método a excluir.
     */
    async _confirmMethodMigration(deleteName, affected) {
        const otherMethods = [...DEFAULT_METHODS, ...state.customMethods]
            .filter(m => m !== deleteName);
        const opts = otherMethods.map(m => `<option value="${this._escAttr(m)}">${m}</option>`).join('');

        return new Promise(resolve => {
            ModalView.openConfirmModal({
                title:   'Migrar Registos',
                message: `O método <strong>"${deleteName}"</strong> tem <strong>${affected} registo(s)</strong> vinculados.<br>
                    Migra-os para outro método antes de excluir:
                    <select id="method-migrate-select" class="w-full mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300">
                        ${opts}
                    </select>`,
                confirmLabel: 'Migrar e Excluir',
                onConfirm: async () => {
                    const targetMethod = document.getElementById('method-migrate-select')?.value;
                    if (!targetMethod) { ModalView.showToast('Selecciona o método de destino.', 'error'); return; }
                    await this._bulkUpdateMethod(deleteName, targetMethod);
                    state.customMethods      = state.customMethods.filter(m => m !== deleteName);
                    state.customMethodsOrder = (state.customMethodsOrder || []).filter(m => m !== deleteName);
                    const uid = state.currentUser?.uid;
                    if (uid) await UserModel.savePrefs(uid, {
                        customMethods:      state.customMethods,
                        customMethodsOrder: state.customMethodsOrder
                    });
                    this._renderMethodsList();
                    ModalView.showToast(`Registos migrados e "${deleteName}" removido.`, 'success');
                    resolve(true);
                },
                onCancel: () => resolve(false)
            });
        });
    }

    /** Actualiza em batch todos os registos que usam oldMethod para newMethod */
    async _bulkUpdateMethod(oldMethod, newMethod) {
        const uid      = state.currentUser?.uid;
        if (!uid) return;
        const spaceId  = (state.viewMode === 'shared' && state.sharedSpaceId) ? state.sharedSpaceId : null;
        const toUpdate = state.transactions.filter(t => t.method === oldMethod);
        for (const t of toUpdate) {
            try {
                await TransactionModel.update(uid, t.id, {
                    desc: t.desc, amount: t.amount, category: t.category,
                    method: newMethod, bank: t.bank || '', place: t.place || ''
                }, spaceId);
            } catch (_) {}
        }
    }

    /** Guarda a ordem preferida de métodos */
    async _saveMethodsOrder() {
        const uid = state.currentUser?.uid;
        if (!uid) return;
        try { await UserModel.savePrefs(uid, { customMethodsOrder: state.customMethodsOrder }); } catch (_) {}
    }

    /**
     * Adiciona um novo método de pagamento personalizado.
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

    _escAttr(str) {
        return (str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    /** Termina a sessão e recarrega a página */
    async logout() {
        const user = state.currentUser;
        if (user) {
            await LogModel.write('user_logout', user.uid, {
                email: user.email || '',
                name:  state.userName || user.displayName || ''
            });
        }
        await signOut(auth);
        window.location.reload();
    }
}
