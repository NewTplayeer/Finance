/** Configuração do projecto Firebase */
export const firebaseConfig = {
    apiKey: "AIzaSyBI_D6tIFU5KzjY0WlgEvNPi3wFLqrvu0c",
    authDomain: "finance-41b6c.firebaseapp.com",
    projectId: "finance-41b6c",
    storageBucket: "finance-41b6c.firebasestorage.app",
    messagingSenderId: "949889931944",
    appId: "1:949889931944:web:51a0b62bda350b2be7c09d",
    measurementId: "G-FTCB5773XL"
};

/**
 * Google Gemini API — obtém a tua chave em https://aistudio.google.com/apikey
 * Restringe a chave ao teu domínio em: https://console.cloud.google.com/apis/credentials
 */
export const geminiConfig = {
    apiKey: "AIzaSyDrqiGccJlt5bjVC9vIkl2IducGQa8RSMY",
    model:  "gemini-2.0-flash"
};

export const APP_ID = 'bruno-financas-v3-auth';

export const currentMonthKey = new Date().toISOString().slice(0, 7);

/** Categorias padrão da aplicação (usadas nos selects e no AIService) */
export const DEFAULT_CATEGORIES = [
    'Receita', 'Alimentação', 'Transporte', 'Saúde',
    'Lazer', 'Casa', 'Educação', 'Vestuário', 'Serviços', 'Outros'
];

/** Formas de pagamento padrão (usadas nos selects de método) */
export const DEFAULT_METHODS = [
    'Dinheiro/Pix', 'Cartão Débito', 'Cartão Crédito', 'Boleto'
];

/**
 * E-mails com acesso ao painel de administração.
 * Adiciona o teu e-mail aqui para aceder ao painel Admin.
 */
export const ADMIN_EMAILS = [
    'brunotavaresdefreitas@gmail.com'
];

// Open Finance (Pluggy.ai) — regista em https://pluggy.ai e adiciona as tuas credenciais
export const pluggyConfig = {
    clientId:     '329a3f3a-ce45-49f2-b9c4-252ac6824718',   // ex: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
    clientSecret: '47befe74-2e56-45e0-8a38-2447574cc79e'    // ex: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
};

// API: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjoiNmE5NTgyY2U0YjNlMWVkNDdjYmRjMTE3MWM1ZmQzZmE6MmQwZmY2NGIwYTRlNDRhNjVjMjMyZGFjY2FiOGUxNGJlYWFjMWNjYjY0MjJkMjM3OGM4ZDkxOTc0N2E1ZTJlNTc4ODNhNDViMzVlMzRlMjkxNWZiODFmMDNiMzgwZDZmYjdkNTU1ZWE1NTg1N2FkMWFhZTA4Yzc1NjQ0OThmNDUxZDEwNzhkYzIyZjIxMGRjZGRkOTRkM2I4OWRhZGY3NyIsImlhdCI6MTc3NTkxMTU0NCwiZXhwIjoxNzc1OTE4NzQ0fQ.HYKSZXdNM5_3Y1Yo_9KDVO_AGXFmWDu_AwsMoDYVuIHe4EJMVhmGIAYq0InrX7dHavX2kzVLnIY4vtsGaGl2ycb2ppEzDY9vtVs_2T3TVzIHf49Lq7nmXQsFLid2MnvxpQKmqVZnLS-_fkKdx-_muV8GdN289AFZwG1Oqg1U8ktOWLbzL6hJn9Ovx_UNldWMcXOEAQeyXBHmrTlMo4bzjJdN_oyjOM0snpoy6SKFFORVoGKMshJxj-SVLCBpDNWoM-iqJ8Ir6ZI8Bu7Kjf0o34dUVlCd7nCyqbxvimsERUIF_LYCAteNc_EOX2hqLqElWMamdjcSNmL61iht1859Cg