export const CnpjService = {
    async lookup(cnpj) {
        const digits = cnpj.replace(/\D/g, '');
        if (digits.length !== 14) return null;

        try {
            const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
                signal: AbortSignal.timeout(8000)
            });
            if (!response.ok) return null;
            const data = await response.json();

            const rawPhone = data.ddd_telefone_1 || data.ddd_telefone_2 || '';
            const phone = rawPhone.replace(/\D/g, '');
            const formatted = phone.length === 10
                ? `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`
                : phone.length === 11
                    ? `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`
                    : rawPhone;

            return {
                name: data.nome_fantasia || data.razao_social || '',
                razaoSocial: data.razao_social || '',
                phone: formatted,
                email: data.email || '',
                type: 'Fornecedor'
            };
        } catch (e) {
            console.warn("BrasilAPI CNPJ lookup falhou:", e.message);
            return null;
        }
    }
};
