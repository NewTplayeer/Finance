/** Escapa caracteres HTML especiais para prevenir XSS em innerHTML. */
export const esc = (str) =>
    (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
