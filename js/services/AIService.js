/**
 * AIService — envia texto para o Google Gemini e interpreta a resposta como
 * uma lista de transações financeiras em JSON.
 *
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 * Documentação: https://ai.google.dev/api/generate-content
 */
import { geminiConfig } from '../config.js?v=2';

export const AIService = {
    /**
     * Processa um texto livre e extrai transações financeiras via Gemini.
     * @param {string} text - texto a interpretar (ex: extrato, frase natural)
     * @param {{ onSuccess, onError, onStart, onEnd }} callbacks
     *   - onSuccess(data): chamado com { items: [...] } quando a IA responde com sucesso
     *   - onError(err): chamado quando a API não está disponível ou retorna erro
     *   - onStart(): chamado antes do fetch (útil para mostrar loaders)
     *   - onEnd(): chamado sempre no final, independentemente do resultado
     */
    async process(text, { onSuccess, onError, onStart, onEnd } = {}) {
        if (!text) return;
        if (onStart) onStart();

        const prompt = `Analisa o texto financeiro abaixo e retorna APENAS JSON válido, sem texto extra, sem markdown.

FORMATO OBRIGATÓRIO — sempre um objeto com array "items":
{"items":[{"desc":"nome do item","amount":0.00,"category":"Categoria","method":"Método","bank":"Banco"}]}

REGRAS:
- "desc": nome claro do item ou serviço
- "amount": número positivo (ex: 150.00). NUNCA string.
- "category": EXATAMENTE um dos seguintes valores:
  "Receita" → se for salário, pagamento recebido, renda
  "Alimentação" → mercado, supermercado, restaurante, delivery, ifood, lanche, açougue
  "Transporte" → uber, 99pop, gasolina, combustível, estacionamento, ônibus, metrô, táxi
  "Saúde" → farmácia, remédio, médico, consulta, plano de saúde, hospital
  "Lazer" → cinema, netflix, spotify, jogo, show, bar, academia, viagem
  "Casa" → aluguel, condomínio, luz, energia, água, internet, gás, reforma, móveis
  "Educação" → curso, livro, escola, faculdade, mensalidade
  "Vestuário" → roupa, calçado, loja de roupas
  "Serviços" → contador, advogado, salão, barbearia, freelancer
  "Outros" → qualquer outra coisa
- "method": EXATAMENTE um de: "Dinheiro/Pix", "Cartão Débito", "Cartão", "Boleto"
  Crédito → "Cartão" | Débito → "Cartão Débito" | Pix/dinheiro → "Dinheiro/Pix"
- "bank": nome do banco (Nubank, Inter, Itaú, Bradesco, C6, etc.) ou "" se não mencionado

Texto: "${text}"`;

        if (!geminiConfig.apiKey || geminiConfig.apiKey === 'AIzaSyDrqiGccJlt5bjVC9vIkl2IducGQa8RSMY') {
            if (onEnd) onEnd();
            const err = Object.assign(new Error('Chave da API Gemini não configurada.'), { code: 'NO_KEY' });
            if (onError) onError(err);
            return;
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

        try {
            let response;
            try {
                response = await fetch(url, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            responseMimeType: 'application/json',
                            temperature: 0.1
                        }
                    })
                });
            } catch (fetchErr) {
                // Falha de rede (sem ligação, DNS, CORS, etc.)
                const err = Object.assign(new Error(fetchErr.message || 'Falha de rede'), { code: 'NETWORK' });
                throw err;
            }

            if (!response.ok) {
                const errBody = await response.json().catch(() => ({}));
                const apiMsg  = errBody?.error?.message || '';
                const status  = response.status;
                const err     = Object.assign(
                    new Error(apiMsg || `HTTP ${status}`),
                    { code: status, apiStatus: errBody?.error?.status || '' }
                );
                throw err;
            }

            const res = await response.json();
            const raw = res.candidates?.[0]?.content?.parts?.[0]?.text || '';

            if (!raw) {
                // Pode acontecer quando o prompt é bloqueado por safety filters
                const reason = res.candidates?.[0]?.finishReason || 'UNKNOWN';
                throw Object.assign(new Error(`Gemini bloqueou a resposta (${reason}).`), { code: 'BLOCKED' });
            }

            /* Tenta fazer parse do JSON; se falhar, extrai o primeiro bloco {...} */
            let data;
            try {
                data = JSON.parse(raw);
            } catch {
                const match = raw.match(/\{[\s\S]*\}/);
                if (match) data = JSON.parse(match[0]);
                else throw new Error('Resposta da IA não é JSON válido');
            }

            /* Normaliza para garantir { items: [...] } independentemente do formato da resposta */
            if (!data.items) {
                if (Array.isArray(data)) {
                    data = { items: data };
                } else if (data.transacoes) {
                    data = { items: data.transacoes };
                } else if (data.transactions) {
                    data = { items: data.transactions };
                } else {
                    const arrVal = Object.values(data).find(v => Array.isArray(v));
                    if (arrVal) {
                        data = { items: arrVal };
                    } else if (data.desc || data.descricao || data.item || data.amount || data.valor) {
                        data = { items: [data] };
                    } else {
                        data = { items: [] };
                    }
                }
            }

            /* Normaliza os campos de cada item para o formato interno da aplicação */
            data.items = (data.items || []).map(i => ({
                desc:     i.desc     || i.descricao || i.item || i.description || i.nome || 'Sem descrição',
                amount:   parseFloat(i.amount || i.total || i.valor || i.value || i.preco || 0),
                category: i.category || i.categoria || 'Outros',
                method:   i.method   || i.metodo    || i.pagamento || 'Dinheiro/Pix',
                bank:     i.bank     || i.banco     || ''
            })).filter(i => i.amount > 0 || i.desc !== 'Sem descrição');

            if (onSuccess) onSuccess(data);
        } catch (e) {
            console.error('Erro na ligação ao Gemini:', e);
            if (onError) onError(e);
        } finally {
            if (onEnd) onEnd();
        }
    }
};
