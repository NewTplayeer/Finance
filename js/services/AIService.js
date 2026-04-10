import { ollamaConfig } from '../config.js';

export const AIService = {
    async process(text, { onSuccess, onError, onStart, onEnd } = {}) {
        if (!text) return;
        if (onStart) onStart();

        const prompt = `Extrai dados financeiros e retorna apenas JSON válido. Identifica Banco, Item, Valor. Categoria "Receita" se for ganho. Texto: "${text}"`;

        try {
            const response = await fetch(ollamaConfig.baseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: ollamaConfig.model,
                    messages: [{ role: 'user', content: prompt }],
                    stream: false,
                    format: 'json'
                })
            });

            if (!response.ok) throw new Error("O servidor local Ollama não respondeu.");

            const res = await response.json();
            const data = JSON.parse(res.message.content);

            if (onSuccess) onSuccess(data);
        } catch (e) {
            console.error("Erro na ligação ao Ollama:", e);
            if (onError) onError(e);
        } finally {
            if (onEnd) onEnd();
        }
    }
};
