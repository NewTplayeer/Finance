/**
 * StatementParser — parseia extratos bancários em CSV e extrai texto de PDFs.
 * CSV: parse directo sem IA (Nubank, Itaú, Bradesco, Inter, C6, Santander, etc.)
 * PDF: extracção de texto via PDF.js para posterior processamento pela IA.
 */

/* ─── Utilitários de leitura de ficheiro ─────────────────────────────────── */

/** Lê um File como texto UTF-8 (com fallback para ISO-8859-1 / Windows-1252) */
function readAsText(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload  = e => resolve(e.target.result);
        r.onerror = () => {
            // Fallback para Latin-1 (Bradesco, Itaú em alguns cenários)
            const r2 = new FileReader();
            r2.onload  = e2 => resolve(e2.target.result);
            r2.onerror = () => reject(new Error('Não foi possível ler o ficheiro.'));
            r2.readAsText(file, 'ISO-8859-1');
        };
        r.readAsText(file, 'UTF-8');
    });
}

/** Lê um File como ArrayBuffer (para PDF.js) */
function readAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload  = e => resolve(e.target.result);
        r.onerror = () => reject(new Error('Não foi possível ler o ficheiro.'));
        r.readAsArrayBuffer(file);
    });
}

/* ─── Utilitários de parse de CSV ────────────────────────────────────────── */

/** Detecta delimitador (';' ou ',') a partir das primeiras 3 linhas */
function detectDelimiter(text) {
    const sample = text.split('\n').slice(0, 3).join('\n');
    const sc = (sample.match(/;/g)  || []).length;
    const cm = (sample.match(/,/g)  || []).length;
    const tb = (sample.match(/\t/g) || []).length;
    if (tb >= sc && tb >= cm) return '\t';
    return sc >= cm ? ';' : ',';
}

/** Faz parse de uma linha CSV respeitando campos entre aspas */
function parseRow(line, delim) {
    const result = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { inQ = !inQ; continue; }
        if (c === delim && !inQ) {
            result.push(cur.trim());
            cur = '';
        } else {
            cur += c;
        }
    }
    result.push(cur.trim());
    return result;
}

/** Encontra o índice de coluna cujo header contenha alguma das keywords */
function findCol(headers, keywords) {
    const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    for (let i = 0; i < headers.length; i++) {
        const h = norm(headers[i]);
        if (keywords.some(k => h.includes(norm(k)))) return i;
    }
    return -1;
}

/* ─── Utilitários de conversão ───────────────────────────────────────────── */

/** Converte texto monetário BR ou US para número */
function parseAmount(raw) {
    if (!raw) return 0;
    let s = String(raw).trim()
        .replace(/R\$\s?/g, '')
        .replace(/\s/g, '');
    const neg = s.startsWith('-') || /^\(.*\)$/.test(s);
    s = s.replace(/^-/, '').replace(/[()]/g, '');

    // Formato BR:  1.234,56  →  1234.56
    if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(s)) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else {
        // Remove separador de milhar ambíguo
        s = s.replace(/[,]/g, '');
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : (neg ? -n : n);
}

/** Converte data em vários formatos para YYYY-MM-DD */
function parseDate(raw) {
    if (!raw) return today();
    const s = String(raw).trim();

    // ISO: 2024-01-15  ou  2024-01-15T...
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

    // BR: 15/01/2024  ou  15/01/24
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
    if (br) {
        const yr = br[3].length === 2 ? '20' + br[3] : br[3];
        return `${yr}-${br[2]}-${br[1]}`;
    }

    // Formato de alguns bancos: 15/01 (sem ano)
    const noYr = s.match(/^(\d{2})\/(\d{2})$/);
    if (noYr) {
        const yr = new Date().getFullYear();
        return `${yr}-${noYr[2]}-${noYr[1]}`;
    }

    return today();
}

const today = () => new Date().toISOString().slice(0, 10);

/* ─── Mapeamento automático de categorias ────────────────────────────────── */

const CAT_RULES = [
    [/mercado|supermercado|carrefour|extra|pao.?de.?acucar|atacadao|assai|hortifruti|feira/i, 'Alimentação'],
    [/restaurante|lanchonete|ifood|rappi|uber.?eat|mc.?donald|burger|pizza|sushi|padaria|cafe|acougue|churrasco|delivery/i, 'Alimentação'],
    [/uber|99pop|cabify|onibus|metro|gasolina|combustivel|shell|ipiranga|br.?dist|estacionamento|taxi|pedagio|brt/i, 'Transporte'],
    [/farmacia|remedio|medico|clinica|hospital|plano.?saude|drogasil|droga|laboratorio|odonto/i, 'Saúde'],
    [/netflix|spotify|amazon|prime|disney|hbo|globoplay|cinema|show|teatro|academia|smart.?fit|jogo|steam/i, 'Lazer'],
    [/aluguel|condominio|energia|agua|internet|gas|tim|claro|vivo|oi|enel|copel|sabesp|luz|reforma|moveis/i, 'Casa'],
    [/curso|livro|escola|faculdade|mensalidade|colegio|wizard|ccaa|unip|descomplica/i, 'Educação'],
    [/roupa|calcado|zara|renner|riachuelo|c.?a|hering|forever|shein|centauro/i, 'Vestuário'],
    [/salario|pagamento|deposito|transferencia.?recebida|receita|renda/i, 'Receita'],
];

function guessCategory(desc) {
    const d = (desc || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (const [re, cat] of CAT_RULES) {
        if (re.test(d)) return cat;
    }
    return 'Outros';
}

/* ─── API pública ────────────────────────────────────────────────────────── */

export const StatementParser = {
    /**
     * Faz parse de um ficheiro CSV de extrato bancário.
     * Suporta Nubank, Itaú, Bradesco, Inter, C6, Santander e formatos genéricos.
     *
     * @param {File} file
     * @param {string} [bankOverride] - nome do banco para etiquetar (opcional)
     * @returns {Promise<Array<{desc,amount,date,category,method,bank}>>}
     */
    async parseCSV(file, bankOverride = '') {
        const text  = await readAsText(file);
        const delim = detectDelimiter(text);
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

        if (lines.length < 2) throw new Error('Ficheiro CSV vazio ou inválido.');

        const rawHeaders = parseRow(lines[0], delim);
        const headers    = rawHeaders.map(h => h);   // mantém original p/ debug
        const headersLC  = rawHeaders.map(h => h.toLowerCase());

        // ── Detectar colunas ────────────────────────────────────────────────
        const dateIdx = findCol(headersLC, [
            'data', 'date', 'data lancamento', 'dt.lanc', 'dt lanc', 'vencimento',
            'data compra', 'data transacao', 'data mov'
        ]);
        const descIdx = findCol(headersLC, [
            'descricao', 'historico', 'estabelecimento', 'title', 'lancamento',
            'memo', 'description', 'descr', 'comerciante', 'categoria/descricao',
            'lançamento', 'descricao do lancamento'
        ]);
        const amtIdx = findCol(headersLC, [
            'valor', 'amount', 'value', 'debito', 'credito', 'montante',
            'valor lancamento', 'val.'
        ]);
        const catIdx = findCol(headersLC, ['categoria', 'category']);
        const bankIdx = findCol(headersLC, ['banco', 'bank', 'instituicao', 'origem']);

        // Fallback posicional
        const dIdx = dateIdx !== -1 ? dateIdx : 0;
        const nIdx = descIdx !== -1 ? descIdx : Math.min(1, rawHeaders.length - 1);
        const vIdx = amtIdx  !== -1 ? amtIdx  : rawHeaders.length - 1;

        // ── Parsear linhas ──────────────────────────────────────────────────
        const items = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = parseRow(lines[i], delim);
            if (cols.length < 2) continue;

            const rawAmt = cols[vIdx] || '';
            const amount = parseAmount(rawAmt);
            if (amount === 0) continue;            // ignora linhas sem valor

            const desc   = (cols[nIdx] || '').trim().replace(/^["']+|["']+$/g, '');
            if (!desc) continue;

            const date   = parseDate(cols[dIdx] || '');
            const catRaw = catIdx  !== -1 ? (cols[catIdx]  || '') : '';
            const bank   = bankOverride || (bankIdx !== -1 ? (cols[bankIdx] || '') : '');

            items.push({
                desc,
                amount:   Math.abs(amount),
                date,
                category: guessCategory(catRaw || desc),
                method:   'Cartão',
                bank:     bank.trim()
            });
        }

        if (!items.length) {
            throw new Error(
                'Nenhuma transação reconhecida. Verifica se o ficheiro é um extrato válido ou tenta outro banco.'
            );
        }
        return items;
    },

    /**
     * Extrai todo o texto de um ficheiro PDF usando PDF.js (carregado via CDN).
     * @param {File} file
     * @returns {Promise<string>}
     */
    async extractPDFText(file) {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error(
                'PDF.js não está disponível. Verifica a tua ligação à internet e tenta novamente.'
            );
        }

        // Aponta para o worker do PDF.js (mesmo CDN que o script principal)
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const buffer = await readAsArrayBuffer(file);
        const pdf    = await pdfjsLib.getDocument({ data: buffer }).promise;

        let fullText = '';
        for (let p = 1; p <= pdf.numPages; p++) {
            const page    = await pdf.getPage(p);
            const content = await page.getTextContent();
            // Agrupa itens de texto por linha usando 'y' aproximada
            const byLine  = {};
            content.items.forEach(it => {
                const y = Math.round(it.transform[5]);
                byLine[y] = (byLine[y] || '') + it.str + ' ';
            });
            // Ordena linhas de cima para baixo (y decrescente em PDF)
            const lines = Object.entries(byLine)
                .sort((a, b) => b[0] - a[0])
                .map(([, txt]) => txt.trim())
                .filter(Boolean);
            fullText += lines.join('\n') + '\n\n';
        }

        if (!fullText.trim()) {
            throw new Error(
                'O PDF não contém texto extraível. Pode ser um PDF digitalizado (imagem). '
                + 'Nesse caso, usa a aba "Colar Texto" e digita o conteúdo manualmente.'
            );
        }

        return fullText.trim();
    }
};
