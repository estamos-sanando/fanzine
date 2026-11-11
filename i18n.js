/* ============================================================================
 * i18n.js · Sistema de Internacionalización (Español / Inglés)
 * NO TE RINDAS / DON'T GIVE UP
 * ============================================================================ */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'fanzine_lang';
  let currentLang = 'es';

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'es') {
      currentLang = saved;
    }
  } catch (_) {}

  const translations = {
    es: {
      // General / Start
      gameTitle: 'NO TE RINDAS',
      chooseChar: 'ELEGÍ TU PERSONAJE',
      loading: 'Cargando…',
      startBtn: 'COMENZAR',
      charChica: 'Chica',
      charChico: 'Chico',
      jumpHint: '<b>Tocá</b> o barra espaciadora para saltar (máx. 3) · ¡ojo con el <b class="highlight-tero">tero</b> en el cielo!',
      globalRankingTop5: 'RANKING GLOBAL · TOP 5',
      yourBestScore: 'TU MEJOR MARCA',
      viewFullRanking: 'VER RANKING COMPLETO',
      shareScoreBtn: '📸 Compartir Score',
      skipTutorial: 'Saltar tutorial »',
      fullscreen: 'Pantalla completa',

      // Settings
      settings: 'Configuración',
      music: 'Música',
      muteMusic: 'Silenciar música',
      unmuteMusic: 'Activar música',
      language: 'Idioma',
      instagramLabel: 'Seguime en Instagram',

      // Rotate modal
      rotateTitle: 'Girá tu pantalla para jugar a NO TE RINDAS',
      rotateBadge: '↺ Modo Horizontal',

      // Full ranking modal
      fullLeaderboardTitle: 'LEADERBOARD ARCADE GLOBAL',
      fullScoresLoading: 'Cargando mejores marcas…',
      fullScoresCount: (n) => `${n} mejores marcas registradas`,
      noScoresYet: 'Ranking global listo · ¡Marcá el primer récord!',
      yourRank: (r) => r > 0 ? `Tu mejor marca: Puesto #${r}` : 'Aún sin marca registrada',
      colPos: 'POS',
      colIni: 'INICIALES',
      colScore: 'SCORE',
      close: 'Cerrar',

      // Arcade Entry Modal
      newRecord: '¡NUEVO RÉCORD!',
      qualifyTop5: '★ ¡CLASIFICASTE AL TOP 5 GLOBAL! ★',
      qualifyTop10: '★ ¡NUEVO RÉCORD TOP 10 GLOBAL! ★',
      qualifyDefault: 'REGISTRÁ TUS INICIALES EN EL RANKING',
      yourScoreLabel: 'TU PUNTAJE',
      globalRankLabel: 'PUESTO GLOBAL',
      enterInitialsInst: 'Ingresá <b>3 caracteres</b> (A-Z o 0-9) con teclado, flechas o toque:',
      submitScore: 'REGISTRAR PUNTAJE',
      savingScore: 'GUARDANDO…',
      useKeyboard: 'Usar teclado',
      skip: 'Omitir',
      entryErrorAlpha: 'Solo letras (A-Z) y números (0-9)',

      // Game Over & Actions
      playAgain: '▶ Jugar de nuevo',
      shareScore: '📸 Compartir',
      globalRanking: 'Ranking Global',
      menu: '↩ Menú',
      gameOver: 'PARTIDA FINALIZADA',
      enteredTop5: '★ ¡ENTRASTE AL TOP 5! ★',
      beatPersonalRecord: '★ ¡SUPERASTE TU RÉCORD! ★',
      scoreSavedRank: (r) => `PUNTAJE REGISTRADO • PUESTO #${r}`,
      points: 'PUNTOS',
      yourRecord: 'TU RÉCORD',
      top5Global: '— TOP 5 GLOBAL —',
      extremeMode: '★ MODO EXTREMO: 20.000 PTS ★',
      extremeHud: '★ EXTREMO',
      bonus: '★ BONUS',
      noGlobalScoresYet: '¡Aún sin marcas globales registradas!',

      // Share Story (Instagram)
      shareModalTitle: 'HISTORIA DE INSTAGRAM',
      shareModalSubtitle: 'Tu placa 9:16 con QR lista para compartir o guardar',
      shareBtnAction: 'Compartir en Historia',
      shareBtnDownload: 'Guardar Imagen',
      shareBtnCopyLink: 'Copiar Enlace',
      shareCopiedToast: '¡Enlace copiado al portapapeles!',
      shareGenerating: 'Generando historia…',
      shareStoryCardTitle: '★ NO TE RINDAS ★',
      shareStoryBeatMe: '¿PODÉS SUPERAR MI MARCA?',
      shareStoryScan: 'ESCANEÁ CON TU CÁMARA PARA JUGAR',
      shareStoryScoreLabel: '★ MI RÉCORD ARCADE ★',
      shareStoryFollow: '📸 Seguinos en Instagram @nellcstudio',
      shareTitle: '¡Mi récord en NO TE RINDAS!',
      shareSuccess: '¡Historia compartida con éxito!',

      // Tutorial dialogs
      tutorialTitle: 'TUTORIAL · ¡APRENDÉ A JUGAR!',
      tutDialog1: 'Un toque / Barra espaciadora: Salto simple (esquiva manuales)',
      tutDialog2: 'Doble toque / Doble espacio: Doble salto (esquiva el caballo)',
      tutDialog3: 'Hasta 3 saltos seguidos: ¡Saltá alto para esquivar la Virgen!',
      tutDialog4: '¡Ojo en el cielo! Esquivá los teros (no saltes sin parar)',

      // Status
      offlineNotice: 'Sin conexión · tu récord se guardará al reconectar',
      offlineCopy: 'Modo sin conexión · mostrando ranking guardado',
      connecting: 'Conectando al servidor…',
      loadingScores: 'Cargando ranking…'
    },
    en: {
      // General / Start
      gameTitle: "DON'T GIVE UP",
      chooseChar: 'CHOOSE YOUR CHARACTER',
      loading: 'Loading…',
      startBtn: 'START',
      charChica: 'Girl',
      charChico: 'Boy',
      jumpHint: '<b>Tap</b> or spacebar to jump (max 3) · watch out for the <b class="highlight-tero">tero</b> bird in the sky!',
      globalRankingTop5: 'GLOBAL LEADERBOARD · TOP 5',
      yourBestScore: 'YOUR BEST SCORE',
      viewFullRanking: 'VIEW FULL RANKING',
      shareScoreBtn: '📸 Share Score',
      skipTutorial: 'Skip tutorial »',
      fullscreen: 'Fullscreen',

      // Settings
      settings: 'Settings',
      music: 'Music',
      muteMusic: 'Mute music',
      unmuteMusic: 'Unmute music',
      language: 'Language',
      instagramLabel: 'Follow on Instagram',

      // Rotate modal
      rotateTitle: "Rotate your screen to play DON'T GIVE UP",
      rotateBadge: '↺ Landscape Mode',

      // Full ranking modal
      fullLeaderboardTitle: 'GLOBAL ARCADE LEADERBOARD',
      fullScoresLoading: 'Loading top scores…',
      fullScoresCount: (n) => `${n} top scores recorded`,
      noScoresYet: 'Global leaderboard ready · Set the first record!',
      yourRank: (r) => r > 0 ? `Your best score: Rank #${r}` : 'No score recorded yet',
      colPos: 'POS',
      colIni: 'INITIALS',
      colScore: 'SCORE',
      close: 'Close',

      // Arcade Entry Modal
      newRecord: 'NEW RECORD!',
      qualifyTop5: '★ YOU MADE THE GLOBAL TOP 5! ★',
      qualifyTop10: '★ NEW TOP 10 GLOBAL RECORD! ★',
      qualifyDefault: 'ENTER YOUR INITIALS ON THE LEADERBOARD',
      yourScoreLabel: 'YOUR SCORE',
      globalRankLabel: 'GLOBAL RANK',
      enterInitialsInst: 'Enter <b>3 characters</b> (A-Z or 0-9) using keyboard, arrows, or tap:',
      submitScore: 'SUBMIT SCORE',
      savingScore: 'SAVING…',
      useKeyboard: 'Use keyboard',
      skip: 'Skip',
      entryErrorAlpha: 'Only letters (A-Z) and numbers (0-9)',

      // Game Over & Actions
      playAgain: '▶ Play Again',
      shareScore: '📸 Share',
      globalRanking: 'Global Ranking',
      menu: '↩ Menu',
      gameOver: 'GAME OVER',
      enteredTop5: '★ YOU MADE THE TOP 5! ★',
      beatPersonalRecord: '★ NEW PERSONAL RECORD! ★',
      scoreSavedRank: (r) => `SCORE SAVED • RANK #${r}`,
      points: 'SCORE',
      yourRecord: 'YOUR RECORD',
      top5Global: '— GLOBAL TOP 5 —',
      extremeMode: '★ EXTREME MODE: 20,000 PTS ★',
      extremeHud: '★ EXTREME',
      bonus: '★ BONUS',
      noGlobalScoresYet: 'No global scores recorded yet!',

      // Share Story (Instagram)
      shareModalTitle: 'INSTAGRAM STORY',
      shareModalSubtitle: 'Your 9:16 card with QR ready to share or save',
      shareBtnAction: 'Share to Story',
      shareBtnDownload: 'Save Image',
      shareBtnCopyLink: 'Copy Link',
      shareCopiedToast: 'Link copied to clipboard!',
      shareGenerating: 'Generating story…',
      shareStoryCardTitle: '★ DON\'T GIVE UP ★',
      shareStoryBeatMe: 'CAN YOU BEAT MY RECORD?',
      shareStoryScan: 'SCAN WITH YOUR CAMERA TO PLAY',
      shareStoryScoreLabel: '★ MY ARCADE HIGH SCORE ★',
      shareStoryFollow: '📸 Follow on Instagram @nellcstudio',
      shareTitle: 'My record in NO TE RINDAS!',
      shareSuccess: 'Story shared successfully!',

      // Tutorial dialogs
      tutorialTitle: 'TUTORIAL · LEARN TO PLAY!',
      tutDialog1: 'Single tap / Spacebar: Single jump (dodge manuals)',
      tutDialog2: 'Double tap / Double space: Double jump (dodge horse)',
      tutDialog3: 'Up to 3 jumps in a row: Jump high to dodge statue!',
      tutDialog4: 'Eyes on the sky! Dodge the teros (do not jump non-stop)',

      // Status
      offlineNotice: 'Offline · your score will be saved when reconnected',
      offlineCopy: 'Offline mode · showing saved ranking',
      connecting: 'Connecting to server…',
      loadingScores: 'Loading leaderboard…'
    }
  };

  const listeners = [];

  const I18n = {
    get lang() {
      return currentLang;
    },
    set lang(newLang) {
      if (newLang !== 'en' && newLang !== 'es') return;
      if (currentLang === newLang) return;
      currentLang = newLang;
      try {
        localStorage.setItem(STORAGE_KEY, newLang);
      } catch (_) {}
      document.documentElement.lang = newLang;
      this.updateDOM();
      listeners.forEach((fn) => {
        try { fn(newLang); } catch (_) {}
      });
    },
    t(key, ...args) {
      const dict = translations[currentLang] || translations.es;
      const val = dict[key] !== undefined ? dict[key] : (translations.es[key] !== undefined ? translations.es[key] : key);
      if (typeof val === 'function') {
        return val(...args);
      }
      return val;
    },
    onChange(fn) {
      if (typeof fn === 'function') listeners.push(fn);
    },
    updateDOM() {
      // 1. Textos data-i18n
      document.querySelectorAll('[data-i18n]').forEach((el) => {
        const k = el.getAttribute('data-i18n');
        if (k) el.textContent = this.t(k);
      });
      // 2. HTML data-i18n-html
      document.querySelectorAll('[data-i18n-html]').forEach((el) => {
        const k = el.getAttribute('data-i18n-html');
        if (k) el.innerHTML = this.t(k);
      });
      // 3. Atributos data-i18n-aria
      document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
        const k = el.getAttribute('data-i18n-aria');
        if (k) el.setAttribute('aria-label', this.t(k));
      });
      // 4. Selector de idioma en menú de configuración
      const btnEs = document.getElementById('lang-btn-es');
      const btnEn = document.getElementById('lang-btn-en');
      if (btnEs) {
        btnEs.classList.toggle('is-active', currentLang === 'es');
        btnEs.setAttribute('aria-pressed', String(currentLang === 'es'));
      }
      if (btnEn) {
        btnEn.classList.toggle('is-active', currentLang === 'en');
        btnEn.setAttribute('aria-pressed', String(currentLang === 'en'));
      }
    }
  };

  global.I18n = I18n;
})(typeof window !== 'undefined' ? window : this);

