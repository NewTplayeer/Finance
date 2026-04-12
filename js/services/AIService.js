/**
 * AIService — envia texto para o modelo Ollama local e interpreta a resposta como
 * uma lista de transações financeiras em JSON.
 */
import { ollamaConfig } from '../config.js';

export const AIService = {
    /**
     * Processa um texto livre e extrai transações financeiras via Ollama.
     * @param {string} text - texto a interpretar (ex: extrato, frase natural)
     * @param {{ onSuccess, onError, onStart, onEnd }} callbacks
     *   - onSuccess(data): chamado com { items: [...] } quando a IA responde com sucesso
     *   - onError(err): chamado quando o Ollama não está disponível ou retorna erro
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

        try {
            const response = await fetch(ollamaConfig.baseUrl, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    model:    ollamaConfig.model,
                    messages: [{ role: 'user', content: prompt }],
                    stream:   false,
                    format:   'json'
                })
            });

            if (!response.ok) throw new Error("Ollama não respondeu (status " + response.status + ")");

            const res = await response.json();
            const raw = res.message?.content || res.response || '';

            /* Tenta fazer parse do JSON; se falhar, extrai o primeiro bloco {...} */
            let data;
            try {
                data = JSON.parse(raw);
            } catch {
                const match = raw.match(/\{[\s\S]*\}/);
                if (match) data = JSON.parse(match[0]);
                else throw new Error("Resposta da IA não é JSON válido");
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
                desc:     i.desc     || i.descricao || i.item || i.description || i.nome || "Sem descrição",
                amount:   parseFloat(i.amount || i.total || i.valor || i.value || i.preco || 0),
                category: i.category || i.categoria || "Outros",
                method:   i.method   || i.metodo    || i.pagamento || "Dinheiro/Pix",
                bank:     i.bank     || i.banco     || ""
            })).filter(i => i.amount > 0 || i.desc !== "Sem descrição");

            if (onSuccess) onSuccess(data);
        } catch (e) {
            console.error("Erro na ligação ao Ollama:", e);
            if (onError) onError(e);
        } finally {
            if (onEnd) onEnd();
        }
    }
};
