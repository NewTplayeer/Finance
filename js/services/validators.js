/**
 * validators.js — validação e formatação de CPF e CNPJ.
 * Implementa o algoritmo oficial de dígitos verificadores para ambos os documentos.
 */

/**
 * Valida um CPF (apenas dígitos, 11 caracteres).
 * @param {string} cpf
 * @returns {boolean}
 */
const validateCPF = (cpf) => {
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
    let check = (sum * 10) % 11;
    if (check >= 10) check = 0;
    if (check !== parseInt(cpf[9])) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
    check = (sum * 10) % 11;
    if (check >= 10) check = 0;
    return check === parseInt(cpf[10]);
};

/**
 * Valida um CNPJ (apenas dígitos, 14 caracteres).
 * @param {string} cnpj
 * @returns {boolean}
 */
const validateCNPJ = (cnpj) => {
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
    const calc = (n, w) => {
        let s = 0;
        for (let i = 0; i < w.length; i++) s += parseInt(n[i]) * w[i];
        const r = s % 11;
        return r < 2 ? 0 : 11 - r;
    };
    return calc(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === parseInt(cnpj[12]) &&
        calc(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === parseInt(cnpj[13]);
};

/**
 * Detecta o tipo de documento, valida e devolve os dígitos limpos e o tipo.
 * @param {string} raw - CPF ou CNPJ com ou sem formatação
 * @returns {{ valid: boolean, type?: 'CPF'|'CNPJ', digits?: string }}
 */
export const validateDoc = (raw) => {
    const d = raw.replace(/\D/g, '');
    if (d.length === 11) return validateCPF(d) ? { valid: true, type: 'CPF', digits: d } : { valid: false };
    if (d.length === 14) return validateCNPJ(d) ? { valid: true, type: 'CNPJ', digits: d } : { valid: false };
    return { valid: false };
};

/**
 * Formata dígitos de CPF ou CNPJ com a máscara padrão.
 * @param {string} digits - apenas dígitos
 * @param {'CPF'|'CNPJ'} type
 * @returns {string}
 */
export const formatDoc = (digits, type) => {
    if (type === 'CPF') return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
};
