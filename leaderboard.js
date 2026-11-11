/* =============================================================================
 * FANZINE RUNNER · Global Arcade Leaderboard SDK & Interactive Entry UI (v5)
 * - Persistencia global vía /api/scores (Supabase RLS / Redis / Cloud G-Set)
 * - Anti-Cheat: Tokens HMAC-SHA256 obligatorios por partida + enteros validados
 * - Sincronización en tiempo real multi-dispositivo:
 *     1) Supabase Realtime WebSockets (postgres_changes) cuando está activo
 *     2) Live Delta Polling ligero (?since=<updatedAt>) cada 3.5s
 *     3) BroadcastChannel instantáneo entre pestañas del mismo navegador
 * - Pantalla interactiva Arcade de 3 caracteres alfanuméricos (A-Z, 0-9)
 * ============================================================================= */
(function (global) {
  'use strict';

  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const INITIALS_RE = /^[A-Z0-9]{3}$/;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const MAX_PLAUSIBLE_SCORE = 100000;

  const STORAGE_KEYS = {
    cache: 'fanzine_lb_cache_v5',        // Caché de lectura estructurado { epoch, updatedAt, scores }
    outbox: 'fanzine_lb_outbox_v4',      // Cola idempotente de envíos pendientes de red
    initials: 'fanzine_runner_initials', // Últimas 3 iniciales elegidas por el jugador
    personal: 'fanzine_lb_personal_v4'   // Mejor marca personal local del jugador
  };

  const LEGACY_KEYS = [
    'fanzine_lb_cache_v4',
    'fanzine_runner_global_v1', 'fanzine_runner_global_v2', 'fanzine_runner_global_v3',
    'fanzine_runner_global_v4', 'fanzine_runner_global_v5', 'fanzine_runner_global_v6',
    'fanzine_runner_global_v7', 'fanzine_runner_global_v8', 'fanzine_runner_global_v9',
    'fanzine_runner_global_v10', 'fanzine_runner_global_v11', 'fanzine_runner_global_v12',
    'fanzine_runner_personal_record', 'fanzine_runner_personal_record_v1',
    'fanzine_runner_personal_record_v2', 'fanzine_runner_personal_record_v3',
    'fanzine_runner_personal_record_v4', 'fanzine_runner_personal_record_v5',
    'fanzine_runner_personal_record_v6', 'fanzine_runner_personal_record_v7',
    'fanzine_runner_personal_record_v8',
    'fanzine_runner_pending', 'fanzine_runner_pending_v1', 'fanzine_runner_pending_v2',
    'fanzine_runner_pending_v3', 'fanzine_runner_pending_v4', 'fanzine_runner_pending_v5',
    'fanzine_runner_pending_v6', 'fanzine_runner_pending_v7'
  ];

  function safeStorageGet(key, fallback) {
    try {
      const v = global.localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function safeStorageSet(key, val) {
    try { global.localStorage.setItem(key, String(val)); } catch (_) { }
  }

  function safeStorageRemove(key) {
    try { global.localStorage.removeItem(key); } catch (_) { }
  }

  function generateUUID() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    if (global.crypto && global.crypto.getRandomValues) {
      global.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return (
      hex.slice(0, 8) + '-' +
      hex.slice(8, 12) + '-' +
      hex.slice(12, 16) + '-' +
      hex.slice(16, 20) + '-' +
      hex.slice(20)
    );
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"'`=/]/g, '');
  }

  function sanitizeInitials(raw, padWithDefault = false) {
    const cleaned = escapeHtml(String(raw || ''))
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 3);
    return padWithDefault ? cleaned.padEnd(3, 'A') : cleaned;
  }

  function isValidInitials(str) {
    return typeof str === 'string' && INITIALS_RE.test(str);
  }

  function normalizeEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const initials = sanitizeInitials(raw.initials || raw.name, false);
    if (!isValidInitials(initials)) return null;
    const numScore = typeof raw.score === 'number' ? raw.score : Number(raw.score);
    const score = Math.floor(numScore);
    if (!Number.isSafeInteger(score) || score <= 0 || score > MAX_PLAUSIBLE_SCORE) return null;
    if (initials === 'TES' && score === 9999) return null;

    const created_at = raw.created_at && !Number.isNaN(Date.parse(raw.created_at))
      ? new Date(raw.created_at).toISOString()
      : new Date().toISOString();
    const id = typeof raw.id === 'string' && UUID_RE.test(raw.id)
      ? raw.id.toLowerCase()
      : `${initials.toLowerCase()}-${score}-${Date.parse(created_at) || 0}`;

    return {
      id,
      initials,
      name: initials, // alias para renderizado canvas existente
      score,
      created_at,
      pending: Boolean(raw.pending)
    };
  }

  function sortEntries(entries, max = 100) {
    const byId = new Map();
    for (const raw of entries) {
      const e = normalizeEntry(raw);
      if (!e) continue;
      const existing = byId.get(e.id);
      // Preferir versión confirmada (pending: false) sobre pendiente
      if (!existing || (existing.pending && !e.pending)) {
        byId.set(e.id, e);
      }
    }
    const list = Array.from(byId.values());
    list.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.created_at.localeCompare(b.created_at);
    });
    return list.slice(0, max);
  }

  function formatRelativeTime(isoStr) {
    if (!isoStr) return '';
    const diffSec = Math.max(0, Math.floor((Date.now() - Date.parse(isoStr)) / 1000));
    if (!Number.isFinite(diffSec)) return '';
    if (diffSec < 15) return 'ahora';
    if (diffSec < 60) return `hace ${diffSec}s`;
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `hace ${days}d`;
  }

  // ===========================================================================
  // Motor Principal de Leaderboard Global en Tiempo Real
  // ===========================================================================
  const Leaderboard = {
    apiEndpoint: '/api/scores',
    qualifyTopLimit: 100,
    liveHighlightDurationMs: 14000,

    remote: [],
    list: [],
    pending: [],
    status: 'loading', // loading | live | ok | offline
    mode: 'connecting',
    epoch: 0,
    updatedAt: 0,
    hasLoadedOnce: false,
    syncing: false,
    wsConnected: false,

    knownIds: new Set(),
    ownIds: new Set(),
    liveHighlights: new Map(), // id -> expiresAt timestamp

    activeSession: null, // { sessionToken, issuedAt, startedAt }

    // Callbacks suscribibles
    onChange: null,
    onRank: null,
    onLiveArrival: null,

    _pollTimer: null,
    _ws: null,
    _wsHeartbeat: null,
    _wsReconnectTimer: null,
    _realtimeCfgKey: '',
    _bc: null,
    _isActivelyPlayingFn: null,

    init(options = {}) {
      if (options.apiEndpoint) this.apiEndpoint = options.apiEndpoint;
      if (typeof options.isActivelyPlaying === 'function') {
        this._isActivelyPlayingFn = options.isActivelyPlaying;
      }

      // Purgar claves antiguas para evitar datos fantasma de versiones previas
      LEGACY_KEYS.forEach(safeStorageRemove);

      // Cargar caché de solo lectura (respaldo offline) y cola de salida pendiente
      try {
        const cached = JSON.parse(safeStorageGet(STORAGE_KEYS.cache, 'null'));
        if (cached && typeof cached === 'object' && !Array.isArray(cached) && Array.isArray(cached.scores)) {
          this.epoch = Number(cached.epoch) > 0 ? Math.floor(Number(cached.epoch)) : 0;
          this.updatedAt = Number(cached.updatedAt) || 0;
          this.remote = sortEntries(cached.scores, 100);
        } else if (Array.isArray(cached)) {
          this.remote = sortEntries(cached, 100);
        } else {
          this.remote = [];
        }
        for (const s of this.remote) this.knownIds.add(s.id);
      } catch (_) {
        this.remote = [];
      }

      try {
        const outbox = JSON.parse(safeStorageGet(STORAGE_KEYS.outbox, '[]'));
        this.pending = Array.isArray(outbox)
          ? outbox.filter((x) => {
            if (!x || !isValidInitials(x.initials)) return false;
            const s = Number(x.score);
            return Number.isSafeInteger(s) && s > 0 && s <= MAX_PLAUSIBLE_SCORE;
          })
          : [];
        for (const p of this.pending) {
          this.ownIds.add(p.id);
          this.knownIds.add(p.id);
        }
      } catch (_) {
        this.pending = [];
      }

      this.rebuild();
      this._setupBroadcastChannel();
      this._startLivePolling();

      global.addEventListener('online', () => {
        this.refresh(true);
        this.flush();
      });
      global.document.addEventListener('visibilitychange', () => {
        if (!global.document.hidden) this.refresh(false);
      });

      this.refresh(true);
    },

    getSavedInitials() {
      return sanitizeInitials(safeStorageGet(STORAGE_KEYS.initials, 'AAA'), true);
    },

    setSavedInitials(str) {
      const clean = sanitizeInitials(str, true);
      safeStorageSet(STORAGE_KEYS.initials, clean);
      return clean;
    },

    getPersonalRecord() {
      const val = parseInt(safeStorageGet(STORAGE_KEYS.personal, '0'), 10);
      return Number.isSafeInteger(val) && val > 0 && val <= MAX_PLAUSIBLE_SCORE ? val : 0;
    },

    updatePersonalRecord(score) {
      const current = this.getPersonalRecord();
      const n = Math.floor(Number(score) || 0);
      if (Number.isSafeInteger(n) && n > current && n <= MAX_PLAUSIBLE_SCORE) {
        safeStorageSet(STORAGE_KEYS.personal, n);
        return n;
      }
      return current;
    },

    isLiveHighlighted(id) {
      const exp = this.liveHighlights.get(id);
      if (!exp) return false;
      if (Date.now() > exp) {
        this.liveHighlights.delete(id);
        return false;
      }
      return true;
    },

    rebuild() {
      const combined = this.remote.map((r) => ({ ...r, pending: false }));
      for (const p of this.pending) {
        if (!combined.some((r) => r.id === p.id)) {
          combined.push({ ...p, pending: true });
        }
      }
      this.list = sortEntries(combined, 100);
    },

    _saveCache() {
      safeStorageSet(STORAGE_KEYS.cache, JSON.stringify({
        epoch: this.epoch || 1,
        updatedAt: this.updatedAt || 0,
        scores: this.remote.slice(0, 100)
      }));
    },

    _saveOutbox() {
      safeStorageSet(STORAGE_KEYS.outbox, JSON.stringify(this.pending));
    },

    changed() {
      if (typeof this.onChange === 'function') this.onChange(this.list);
    },

    best() {
      return this.list.length ? this.list[0].score : 0;
    },

    qualifies(score) {
      const s = Math.floor(Number(score));
      if (!Number.isFinite(s) || s <= 0) return false;
      if (this.list.length < this.qualifyTopLimit) return true;
      return s > this.list[this.qualifyTopLimit - 1].score;
    },

    isInTop5(score) {
      const s = Math.floor(Number(score));
      if (!Number.isFinite(s) || s <= 0) return false;
      if (this.list.length < 5) return true;
      return s > this.list[4].score || (this.list.length >= 5 && s >= this.list[4].score);
    },

    rankFor(score) {
      const s = Math.floor(Number(score) || 0);
      let i = 0;
      while (i < this.list.length && this.list[i].score >= s) i++;
      return i + 1;
    },

    getRankOf(score, initials, id) {
      if (id) {
        const byId = this.list.findIndex((e) => e.id === id);
        if (byId !== -1) return byId + 1;
      }
      const s = Math.floor(Number(score) || 0);
      if (s <= 0) return 0;
      const clean = initials ? sanitizeInitials(initials, false) : '';
      const exactIdx = this.list.findIndex((e) => e.score === s && (!clean || e.initials === clean));
      if (exactIdx !== -1) return exactIdx + 1;
      let count = 0;
      while (count < this.list.length && this.list[count].score > s) count++;
      return count + 1;
    },

    // Solicita un token firmado HMAC-SHA256 al iniciar una nueva carrera (con reintento automático en redes móviles inestables)
    async startSession() {
      const localStart = Date.now();
      const sessionRef = { sessionToken: null, issuedAt: localStart, startedAt: localStart };
      this.activeSession = sessionRef;

      const fetchToken = async () => {
        const delays = [0, 900, 2000];
        for (let i = 0; i < delays.length; i++) {
          if (this.activeSession !== sessionRef) return sessionRef;
          if (delays[i] > 0) {
            await new Promise((r) => setTimeout(r, delays[i]));
            if (this.activeSession !== sessionRef) return sessionRef;
          }
          try {
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), 4500);
            const res = await fetch(this.apiEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'session' }),
              cache: 'no-store',
              signal: ctl.signal
            });
            clearTimeout(t);
            if (res.ok) {
              const data = await res.json();
              if (data && data.sessionToken && this.activeSession === sessionRef) {
                sessionRef.sessionToken = data.sessionToken;
                sessionRef.issuedAt = data.issuedAt || localStart;
              }
              if (data && data.realtime) this._ensureRealtimeWebSocket(data.realtime);
              if (sessionRef.sessionToken) break;
            }
          } catch (_) { }
        }
        return sessionRef;
      };

      this._sessionPromise = fetchToken();
      return this._sessionPromise;
    },

    async _apiFetch(method, payload, queryParams = '') {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 6500);
      try {
        const url = queryParams ? `${this.apiEndpoint}?${queryParams}` : this.apiEndpoint;
        const res = await fetch(url, {
          method,
          headers: payload ? { 'Content-Type': 'application/json' } : { Accept: 'application/json' },
          body: payload ? JSON.stringify(payload) : undefined,
          cache: 'no-store',
          signal: ctl.signal
        });
        clearTimeout(timer);
        let data = null;
        try { data = await res.json(); } catch (_) { }
        if (!res.ok) {
          const err = new Error((data && data.error) || `HTTP ${res.status}`);
          err.status = res.status;
          throw err;
        }
        return data;
      } catch (err) {
        clearTimeout(timer);
        throw err;
      }
    },

    _ingestServerScores(rawScores, serverUpdatedAt, broadcast = true, serverEpoch = null) {
      const incoming = sortEntries(Array.isArray(rawScores) ? rawScores : [], 100);
      const hasEpoch = serverEpoch !== null && serverEpoch !== undefined && Number.isFinite(Number(serverEpoch)) && Number(serverEpoch) > 0;
      const incomingEpoch = hasEpoch ? Math.floor(Number(serverEpoch)) : this.epoch;

      // Ignorar respuestas obsoletas de un epoch anterior para evitar regresiones o borrados accidentales
      if (hasEpoch && this.epoch > 0 && incomingEpoch < this.epoch) {
        return;
      }

      const isExplicitEpochReset = hasEpoch && this.epoch > 0 && incomingEpoch > this.epoch;
      const isAcidDirectReset = !isExplicitEpochReset
        && (this.mode === 'supabase' || this.mode === 'redis')
        && incoming.length === 0
        && Number(serverUpdatedAt) > this.updatedAt;

      let nextRemote;
      if (isExplicitEpochReset || isAcidDirectReset) {
        // Reinicio administrativo explícito confirmado: limpiar estado global en todos los dispositivos
        this.knownIds.clear();
        this.ownIds.clear();
        nextRemote = incoming;
        this.updatedAt = Number(serverUpdatedAt) || Date.now();
      } else {
        // Mismo epoch: unión monotónica G-Set (ninguna réplica con lag ni cold-start puede borrar puntajes confirmados)
        nextRemote = sortEntries([...this.remote, ...incoming], 100);
        if (serverUpdatedAt) {
          this.updatedAt = Math.max(this.updatedAt, Number(serverUpdatedAt) || 0);
        }
      }

      if (hasEpoch && incomingEpoch > this.epoch) {
        this.epoch = incomingEpoch;
      }

      const liveNew = [];
      if (this.hasLoadedOnce && !isExplicitEpochReset && !isAcidDirectReset) {
        for (const entry of nextRemote) {
          if (!this.knownIds.has(entry.id) && !this.ownIds.has(entry.id)) {
            this.liveHighlights.set(entry.id, Date.now() + this.liveHighlightDurationMs);
            liveNew.push(entry);
          }
        }
      }

      this.knownIds.clear();
      for (const entry of nextRemote) this.knownIds.add(entry.id);
      for (const p of this.pending) this.knownIds.add(p.id);

      this.remote = nextRemote;
      this.hasLoadedOnce = true;
      this.rebuild();
      this._saveCache();
      this.changed();

      if (liveNew.length && typeof this.onLiveArrival === 'function') {
        const ranked = liveNew.map((e) => ({
          ...e,
          rank: this.getRankOf(e.score, e.initials, e.id)
        }));
        this.onLiveArrival(ranked);
      }

      if (broadcast && this._bc) {
        try {
          this._bc.postMessage({
            type: 'SYNC',
            epoch: this.epoch,
            scores: this.remote,
            updatedAt: this.updatedAt
          });
        } catch (_) { }
      }
    },

    async refresh(forceFull = false) {
      try {
        const sinceParam = !forceFull && this.hasLoadedOnce && this.updatedAt > 0
          ? `&since=${encodeURIComponent(this.updatedAt)}&epoch=${encodeURIComponent(this.epoch || 1)}&count=${encodeURIComponent(this.remote.length)}`
          : '';
        const data = await this._apiFetch('GET', null, `limit=100${sinceParam}`);

        if (data && data.mode) this.mode = data.mode;
        if (data && data.realtime) this._ensureRealtimeWebSocket(data.realtime);

        this.status = this.wsConnected ? 'live' : 'ok';

        if (data && data.unchanged) {
          if (data.epoch && Number(data.epoch) > this.epoch) {
            this.epoch = Math.floor(Number(data.epoch));
          }
          this.changed();
        } else if (data && Array.isArray(data.scores)) {
          this._ingestServerScores(data.scores, data.updatedAt, true, data.epoch);
        }

        if (this.pending.length) this.flush();
        return this.list;
      } catch (_) {
        this.status = 'offline';
        this.changed();
        return this.list;
      }
    },

    // Registra un nuevo puntaje y espera confirmación rápida del backend (con fallback resiliente)
    async submitAsync(initials, score) {
      const clean = sanitizeInitials(initials, false);
      const num = Math.floor(Number(score));
      if (!isValidInitials(clean) || !Number.isSafeInteger(num) || num <= 0 || num > MAX_PLAUSIBLE_SCORE) {
        throw new Error('Ingresá exactamente 3 caracteres válidos (A-Z, 0-9).');
      }

      this.setSavedInitials(clean);
      this.updatePersonalRecord(num);

      if (this.activeSession && !this.activeSession.sessionToken && this._sessionPromise) {
        try {
          await Promise.race([
            this._sessionPromise,
            new Promise((r) => setTimeout(r, 2500))
          ]);
        } catch (_) { }
      }

      const nowIso = new Date().toISOString();
      const durationMs = this.activeSession
        ? Math.max(0, Date.now() - this.activeSession.startedAt)
        : undefined;

      const item = {
        id: generateUUID(),
        initials: clean,
        name: clean,
        score: num,
        created_at: nowIso,
        sessionToken: this.activeSession ? this.activeSession.sessionToken : undefined,
        durationMs
      };

      // Consumir sesión activa en cliente
      this.activeSession = null;
      this._sessionPromise = null;

      this.ownIds.add(item.id);
      this.knownIds.add(item.id);
      this.liveHighlights.set(item.id, Date.now() + this.liveHighlightDurationMs);

      this.pending.push(item);
      this._saveOutbox();
      this.rebuild();
      this.changed();

      const optimisticRank = this.getRankOf(item.score, item.initials, item.id);

      try {
        await this.flush();
        const confirmedRank = this.getRankOf(item.score, item.initials, item.id) || optimisticRank;
        return { id: item.id, initials: clean, score: num, rank: confirmedRank, synced: !this.pending.some((p) => p.id === item.id) };
      } catch (_) {
        return { id: item.id, initials: clean, score: num, rank: optimisticRank, synced: false };
      }
    },

    // Método síncrono retrocompatible por si se invoca sin await
    submit(initials, score) {
      const clean = sanitizeInitials(initials, true);
      const num = Math.floor(Number(score));
      if (!Number.isSafeInteger(num) || num <= 0 || num > MAX_PLAUSIBLE_SCORE) return { id: null, rank: 0 };
      const id = generateUUID();
      const nowIso = new Date().toISOString();
      const item = {
        id,
        initials: clean,
        name: clean,
        score: num,
        created_at: nowIso,
        sessionToken: this.activeSession ? this.activeSession.sessionToken : undefined,
        durationMs: this.activeSession ? Math.max(0, Date.now() - this.activeSession.startedAt) : undefined
      };
      this.activeSession = null;
      this._sessionPromise = null;
      this.ownIds.add(id);
      this.knownIds.add(id);
      this.liveHighlights.set(id, Date.now() + this.liveHighlightDurationMs);
      this.pending.push(item);
      this._saveOutbox();
      this.rebuild();
      const rank = this.getRankOf(num, clean, id);
      this.changed();
      this.flush();
      return { id, rank };
    },

    async _obtainRecoverySessionToken() {
      try {
        const data = await this._apiFetch('POST', { action: 'session' });
        if (data && data.sessionToken) {
          await new Promise((r) => setTimeout(r, 600));
          return data.sessionToken;
        }
      } catch (_) { }
      return null;
    },

    async flush() {
      if (this.syncing || !this.pending.length) return;
      this.syncing = true;
      this.changed();

      try {
        while (this.pending.length) {
          const item = this.pending[0];
          try {
            // Si la partida comenzó sin señal móvil (sin token), adquirir sesión de recuperación al reconectar
            if (!item.sessionToken && !item._tokenRenewed) {
              const recovered = await this._obtainRecoverySessionToken();
              if (recovered) {
                item.sessionToken = recovered;
                item._tokenRenewed = true;
                this._saveOutbox();
              }
            }

            const res = await this._apiFetch('POST', {
              id: item.id,
              initials: item.initials,
              score: item.score,
              created_at: item.created_at,
              sessionToken: item.sessionToken,
              durationMs: item.durationMs,
              offlineRetry: Boolean(item._retried)
            });

            this.pending.shift();
            this._saveOutbox();

            if (res && Array.isArray(res.scores)) {
              this._ingestServerScores(res.scores, res.updatedAt, true, res.epoch);
            }
            this.status = this.wsConnected ? 'live' : 'ok';
            if (typeof this.onRank === 'function' && res && res.rank) {
              this.onRank(item.id, res.rank);
            }
            this.changed();
          } catch (err) {
            // Si el token expiró tras un redeploy o viaje sin señal, renovar por única vez y reintentar
            if (err && err.status === 403 && !item._tokenRenewed) {
              const recovered = await this._obtainRecoverySessionToken();
              if (recovered) {
                item.sessionToken = recovered;
                item._tokenRenewed = true;
                this._saveOutbox();
                continue;
              }
            }

            // En caso de rate-limit compartido (429), conservar en cola y reintentar automáticamente sin perder el puntaje
            if (err && err.status === 429) {
              item._retried = true;
              this._saveOutbox();
              setTimeout(() => this.flush(), 2500);
              break;
            }

            // Si el servidor rechaza permanentemente el payload (400/403/409), retirarlo de la cola
            if (err && (err.status === 400 || err.status === 403 || err.status === 409)) {
              this.pending.shift();
              this._saveOutbox();
              this.rebuild();
              this.changed();
              if (err.status === 409) this.refresh(true);
              continue;
            }

            item._retried = true;
            this._saveOutbox();
            this.status = 'offline';
            break;
          }
        }
      } finally {
        this.syncing = false;
        this.changed();
      }
    },

    _setupBroadcastChannel() {
      if (typeof global.BroadcastChannel !== 'function') return;
      try {
        this._bc = new global.BroadcastChannel('fanzine_lb_live_v5');
        this._bc.onmessage = (ev) => {
          const msg = ev && ev.data;
          if (msg && msg.type === 'SYNC' && Array.isArray(msg.scores)) {
            this._ingestServerScores(msg.scores, msg.updatedAt, false, msg.epoch);
          }
        };
      } catch (_) { }
    },

    _startLivePolling() {
      if (this._pollTimer) clearInterval(this._pollTimer);
      let tickCount = 0;
      this._pollTimer = setInterval(() => {
        if (global.document.hidden) return;
        tickCount++;
        const playing = this._isActivelyPlayingFn ? this._isActivelyPlayingFn() : false;
        // En menús / modal / game over: sincronización rápida cada 3.5s. En carrera activa: cada 14s.
        if (playing && tickCount % 4 !== 0) return;
        this.refresh(false);
      }, 3500);
    },

    // Suscripción nativa WebSocket a Supabase Realtime (Phoenix Channels v1.0.0, cero dependencias externas)
    _ensureRealtimeWebSocket(cfg) {
      if (!cfg || cfg.provider !== 'supabase' || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
      if (typeof global.WebSocket !== 'function') return;

      const key = `${cfg.supabaseUrl}|${cfg.table || 'leaderboard_scores'}`;
      if (this._realtimeCfgKey === key && this._ws && this._ws.readyState <= 1) return;
      this._realtimeCfgKey = key;

      this._teardownWebSocket();

      const wsBase = cfg.supabaseUrl.replace(/^http/i, 'ws');
      const wsUrl = `${wsBase}/realtime/v1/websocket?apikey=${encodeURIComponent(cfg.supabaseAnonKey)}&vsn=1.0.0`;
      const table = cfg.table || 'leaderboard_scores';

      try {
        const ws = new global.WebSocket(wsUrl);
        this._ws = ws;
        let refCounter = 1;

        ws.onopen = () => {
          this.wsConnected = true;
          this.status = 'live';
          this.changed();

          ws.send(JSON.stringify({
            topic: `realtime:public:${table}`,
            event: 'phx_join',
            payload: {
              config: {
                broadcast: { self: false },
                presence: { key: '' },
                postgres_changes: [
                  { event: '*', schema: 'public', table }
                ]
              }
            },
            ref: String(refCounter++)
          }));

          this._wsHeartbeat = setInterval(() => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({
                topic: 'phoenix',
                event: 'heartbeat',
                payload: {},
                ref: String(refCounter++)
              }));
            }
          }, 25000);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg && msg.event === 'postgres_changes' && msg.payload && msg.payload.data) {
              const change = msg.payload.data;
              if (change.type === 'DELETE') {
                this.refresh(true);
                return;
              }
              if (change.record) {
                const entry = normalizeEntry(change.record);
                if (entry) {
                  const merged = sortEntries([entry, ...this.remote], 100);
                  this._ingestServerScores(merged, Date.now(), true);
                }
              }
            }
          } catch (_) { }
        };

        const handleDisconnect = () => {
          this.wsConnected = false;
          if (this.status === 'live') this.status = 'ok';
          if (this._wsHeartbeat) { clearInterval(this._wsHeartbeat); this._wsHeartbeat = null; }
          this.changed();
          if (this._wsReconnectTimer) clearTimeout(this._wsReconnectTimer);
          this._wsReconnectTimer = setTimeout(() => {
            this._realtimeCfgKey = '';
            this._ensureRealtimeWebSocket(cfg);
          }, 6000);
        };

        ws.onerror = handleDisconnect;
        ws.onclose = handleDisconnect;
      } catch (_) { }
    },

    _teardownWebSocket() {
      if (this._wsHeartbeat) { clearInterval(this._wsHeartbeat); this._wsHeartbeat = null; }
      if (this._wsReconnectTimer) { clearTimeout(this._wsReconnectTimer); this._wsReconnectTimer = null; }
      if (this._ws) {
        try { this._ws.onclose = null; this._ws.onerror = null; this._ws.close(); } catch (_) { }
        this._ws = null;
      }
      this.wsConnected = false;
    }
  };

  // ===========================================================================
  // Componente UI: Modal Arcade Interactivo de 3 Caracteres (A-Z, 0-9)
  // ===========================================================================
  const ArcadeEntryModal = {
    isOpen: false,
    slots: ['A', 'A', 'A'],
    activeSlot: 0,
    score: 0,
    projectedRank: 1,
    submitting: false,
    onComplete: null,
    onBlip: null,
    _els: null,
    _holdTimer: null,
    _holdInterval: null,

    init(options = {}) {
      if (typeof options.onBlip === 'function') this.onBlip = options.onBlip;
      const root = global.document.getElementById('arcade-entry-modal');
      if (!root) return;

      this._els = {
        root,
        badge: global.document.getElementById('arcade-entry-badge'),
        scoreVal: global.document.getElementById('arcade-entry-score'),
        rankVal: global.document.getElementById('arcade-entry-rank'),
        slotCols: Array.from(root.querySelectorAll('.arcade-slot')),
        slotChars: Array.from(root.querySelectorAll('.arcade-slot__char')),
        hiddenInput: global.document.getElementById('arcade-hidden-input'),
        kbdBtn: global.document.getElementById('arcade-kbd-btn'),
        errorMsg: global.document.getElementById('arcade-entry-error'),
        submitBtn: global.document.getElementById('arcade-submit-btn'),
        skipBtn: global.document.getElementById('arcade-skip-btn')
      };

      // Prevenir propagación de eventos al canvas del juego
      ['pointerdown', 'touchstart', 'mousedown', 'click'].forEach((evName) => {
        root.addEventListener(evName, (e) => e.stopPropagation());
      });

      // Configurar botones ▲ / ▼ y selección directa de cada casilla
      this._els.slotCols.forEach((col, idx) => {
        const upBtn = col.querySelector('[data-dir="1"]');
        const downBtn = col.querySelector('[data-dir="-1"]');
        const charBtn = col.querySelector('.arcade-slot__char');

        const bindArrow = (btn, dir) => {
          if (!btn) return;
          const step = () => this.cycleSlot(idx, dir);
          const stopHold = () => {
            if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
            if (this._holdInterval) { clearInterval(this._holdInterval); this._holdInterval = null; }
          };

          btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.submitting) return;
            step();
            stopHold();
            this._holdTimer = setTimeout(() => {
              this._holdInterval = setInterval(step, 95);
            }, 340);
          });
          ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) =>
            btn.addEventListener(n, stopHold)
          );
        };

        bindArrow(upBtn, 1);
        bindArrow(downBtn, -1);

        if (charBtn) {
          charBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.submitting) return;
            this.selectSlot(idx);
          });
        }
      });

      // Botón opcional para abrir teclado nativo en móviles
      if (this._els.kbdBtn && this._els.hiddenInput) {
        this._els.kbdBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (this.submitting) return;
          this._els.hiddenInput.value = this.slots.join('');
          this._els.hiddenInput.focus();
          try { this._els.hiddenInput.setSelectionRange(0, 3); } catch (_) { }
        });

        this._els.hiddenInput.addEventListener('input', () => {
          if (this.submitting) return;
          const clean = sanitizeInitials(this._els.hiddenInput.value, false);
          for (let i = 0; i < 3; i++) {
            if (clean[i]) this.slots[i] = clean[i];
          }
          this.activeSlot = Math.min(clean.length, 2);
          this._playBlip();
          this.render();
        });
      }

      if (this._els.submitBtn) {
        this._els.submitBtn.addEventListener('click', (e) => {
          e.preventDefault();
          this.confirm();
        });
      }

      if (this._els.skipBtn) {
        this._els.skipBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (this.submitting) return;
          const cb = this.onComplete;
          this.close();
          if (typeof cb === 'function') cb({ skipped: true, rank: 0 });
        });
      }

      global.addEventListener('keydown', (e) => {
        if (!this.isOpen || this.submitting) return;
        // Si el foco está en el input oculto móvil, solo interceptar Enter / Escape
        if (global.document.activeElement === this._els.hiddenInput) {
          if (e.key === 'Enter') {
            e.preventDefault();
            this._els.hiddenInput.blur();
            this.confirm();
          }
          return;
        }
        this.handleKeyDown(e);
      });
    },

    _playBlip() {
      if (typeof this.onBlip === 'function') this.onBlip();
    },

    open({ score, defaultInitials, onComplete }) {
      if (!this._els) this.init();
      if (!this._els) {
        if (typeof onComplete === 'function') onComplete({ skipped: true, rank: 0 });
        return;
      }

      const initClean = sanitizeInitials(defaultInitials || Leaderboard.getSavedInitials(), true);
      this.slots = initClean.split('');
      this.activeSlot = 0;
      this.score = Math.floor(Number(score) || 0);
      this.projectedRank = Leaderboard.rankFor(this.score);
      this.submitting = false;
      this.onComplete = onComplete || null;
      this.isOpen = true;

      if (this._els.errorMsg) this._els.errorMsg.textContent = '';
      this.render();

      this._els.root.setAttribute('aria-hidden', 'false');
      this._els.root.classList.add('is-open');
    },

    close() {
      this.isOpen = false;
      this.submitting = false;
      if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
      if (this._holdInterval) { clearInterval(this._holdInterval); this._holdInterval = null; }
      if (this._els && this._els.hiddenInput) this._els.hiddenInput.blur();
      if (this._els && this._els.root) {
        this._els.root.setAttribute('aria-hidden', 'true');
        this._els.root.classList.remove('is-open');
      }
    },

    selectSlot(idx) {
      this.activeSlot = Math.max(0, Math.min(2, idx));
      this._playBlip();
      this.render();
    },

    cycleSlot(idx, dir) {
      this.activeSlot = Math.max(0, Math.min(2, idx));
      const cur = ALPHABET.indexOf(this.slots[this.activeSlot]);
      const next = (cur + dir + ALPHABET.length) % ALPHABET.length;
      this.slots[this.activeSlot] = ALPHABET[next];
      this._playBlip();
      this.render();
    },

    handleKeyDown(e) {
      const key = e.key;
      if (/^[a-zA-Z0-9]$/.test(key)) {
        e.preventDefault();
        this.slots[this.activeSlot] = key.toUpperCase();
        if (this.activeSlot < 2) this.activeSlot++;
        this._playBlip();
        this.render();
      } else if (key === 'ArrowUp') {
        e.preventDefault();
        this.cycleSlot(this.activeSlot, 1);
      } else if (key === 'ArrowDown') {
        e.preventDefault();
        this.cycleSlot(this.activeSlot, -1);
      } else if (key === 'ArrowLeft') {
        e.preventDefault();
        this.selectSlot(this.activeSlot - 1);
      } else if (key === 'ArrowRight') {
        e.preventDefault();
        this.selectSlot(this.activeSlot + 1);
      } else if (key === 'Backspace') {
        e.preventDefault();
        if (this.activeSlot > 0) this.activeSlot--;
        this._playBlip();
        this.render();
      } else if (key === 'Enter') {
        e.preventDefault();
        if (!e.repeat) this.confirm();
      }
    },

    render() {
      if (!this._els) return;
      const inTop5 = this.projectedRank <= 5;
      const inTop10 = this.projectedRank <= 10;

      if (this._els.badge) {
        const isEn = window.I18n && window.I18n.lang === 'en';
        this._els.badge.textContent = inTop5
          ? (isEn ? '★ YOU MADE THE GLOBAL TOP 5! ★' : '★ ¡CLASIFICASTE AL TOP 5 GLOBAL! ★')
          : (inTop10
            ? (isEn ? '★ NEW TOP 10 GLOBAL RECORD! ★' : '★ ¡NUEVO RÉCORD TOP 10 GLOBAL! ★')
            : (isEn ? 'ENTER YOUR INITIALS ON THE LEADERBOARD' : 'REGISTRÁ TUS INICIALES EN EL RANKING'));
        this._els.badge.classList.toggle('is-gold', inTop5);
      }

      if (this._els.scoreVal) {
        this._els.scoreVal.textContent = String(Math.max(0, this.score)).padStart(5, '0');
      }
      if (this._els.rankVal) {
        this._els.rankVal.textContent = '#' + String(this.projectedRank).padStart(2, '0');
      }

      this._els.slotCols.forEach((col, i) => {
        col.classList.toggle('is-active', i === this.activeSlot && !this.submitting);
      });
      this._els.slotChars.forEach((el, i) => {
        el.textContent = this.slots[i] || 'A';
      });

      if (this._els.submitBtn) {
        const isEn = window.I18n && window.I18n.lang === 'en';
        this._els.submitBtn.disabled = this.submitting;
        this._els.submitBtn.textContent = this.submitting
          ? (isEn ? 'SAVING…' : 'GUARDANDO…')
          : (isEn ? 'SUBMIT SCORE' : 'REGISTRAR PUNTAJE');
      }
    },

    async confirm() {
      if (this.submitting) return;
      const candidate = sanitizeInitials(this.slots.join(''), false);
      if (!isValidInitials(candidate)) {
        if (this._els && this._els.errorMsg) {
          this._els.errorMsg.textContent = 'Ingresá 3 caracteres alfanuméricos válidos (A-Z, 0-9).';
        }
        return;
      }

      this.submitting = true;
      if (this._els && this._els.errorMsg) this._els.errorMsg.textContent = '';
      this.render();

      try {
        const result = await Leaderboard.submitAsync(candidate, this.score);
        const cb = this.onComplete;
        this.close();
        if (typeof cb === 'function') cb(result);
      } catch (err) {
        this.submitting = false;
        if (this._els && this._els.errorMsg) {
          this._els.errorMsg.textContent = err.message || 'Error al registrar, intentá de nuevo.';
        }
        this.render();
      }
    }
  };

  global.Leaderboard = Leaderboard;
  global.ArcadeEntryModal = ArcadeEntryModal;
  global.LeaderboardUtils = {
    sanitizeInitials,
    isValidInitials,
    formatRelativeTime
  };
})(window);

