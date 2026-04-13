/**
 * DateUtils — utilitário global de datas para NT Finanças.
 * Padrão ISO (YYYY-MM-DD) para o banco; DD/MM/YYYY para a UI.
 */
export const DateUtils = {

    /** Hoje em ISO: YYYY-MM-DD */
    today() {
        return new Date().toISOString().slice(0, 10);
    },

    /** Mês corrente: YYYY-MM */
    currentMonth() {
        return new Date().toISOString().slice(0, 7);
    },

    /**
     * Converte qualquer formato reconhecido para ISO (YYYY-MM-DD).
     * Suporta: ISO, DD/MM/YYYY, DD/MM/YY.
     * @param {string} raw
     * @returns {string}
     */
    toISO(raw) {
        if (!raw) return this.today();
        const s = String(raw).trim();
        // Já é ISO
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        // Formato BR: DD/MM/YYYY ou DD/MM/YY
        const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (br) {
            const d  = br[1].padStart(2, '0');
            const m  = br[2].padStart(2, '0');
            const yr = br[3].length === 2 ? '20' + br[3] : br[3];
            return `${yr}-${m}-${d}`;
        }
        return this.today();
    },

    /**
     * Formata ISO para DD/MM/YYYY (exibição completa).
     * @param {string} iso
     * @returns {string}
     */
    toBR(iso) {
        if (!iso) return '—';
        const parts = String(iso).slice(0, 10).split('-');
        if (parts.length !== 3) return '—';
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    },

    /**
     * Formata ISO para DD/MM (exibição curta, sem ano).
     * @param {string} iso
     * @returns {string}
     */
    toShortBR(iso) {
        if (!iso) return '—';
        const parts = String(iso).slice(0, 10).split('-');
        if (parts.length < 3) return '—';
        return `${parts[2]}/${parts[1]}`;
    },

    /**
     * Extrai a chave YYYY-MM de uma data ISO.
     * @param {string} iso
     * @returns {string}
     */
    toMonthKey(iso) {
        if (!iso) return this.currentMonth();
        return String(iso).slice(0, 7);
    },

    /**
     * Número de meses entre duas datas ISO (inclusivo em ambas as pontas).
     * Usado para calcular parcelas retroativas.
     * @param {string} startISO
     * @param {string} endISO
     * @returns {number}
     */
    monthsBetween(startISO, endISO) {
        if (!startISO || !endISO) return 1;
        const [sy, sm] = startISO.slice(0, 7).split('-').map(Number);
        const [ey, em] = endISO.slice(0, 7).split('-').map(Number);
        return Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
    },

    /**
     * Devolve um label legível de monthKey: "Jan 2025".
     * @param {string} mk - formato YYYY-MM
     * @returns {string}
     */
    monthKeyToLabel(mk) {
        if (!mk) return '';
        const [y, m] = mk.split('-').map(Number);
        const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
        return `${months[m - 1]} ${y}`;
    },

    /**
     * Formata de forma relativa: "hoje", "ontem" ou DD/MM/YYYY.
     * @param {string} iso
     * @returns {string}
     */
    toRelative(iso) {
        if (!iso) return '—';
        const t = this.today();
        const s = iso.slice(0, 10);
        if (s === t) return 'hoje';
        const yest = new Date(t);
        yest.setDate(yest.getDate() - 1);
        if (s === yest.toISOString().slice(0, 10)) return 'ontem';
        return this.toBR(s);
    },

    /**
     * Último dia do mês para um YYYY-MM.
     * @param {string} monthKey
     * @returns {number}
     */
    lastDayOfMonth(monthKey) {
        const [y, m] = monthKey.split('-').map(Number);
        return new Date(y, m, 0).getDate();
    },

    /**
     * Gera data ISO para o dia X do mês (clamp ao último dia do mês).
     * @param {string} monthKey - YYYY-MM
     * @param {number} day
     * @returns {string} YYYY-MM-DD
     */
    dateForDay(monthKey, day) {
        const last  = this.lastDayOfMonth(monthKey);
        const clamped = Math.min(Math.max(1, day), last);
        return `${monthKey}-${String(clamped).padStart(2, '0')}`;
    }
};
