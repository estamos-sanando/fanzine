/**
 * StoryShare · Generador de imagen 9:16 (1080x1920) para compartir el récord en redes
 * (Instagram, WhatsApp, etc.) con un código QR que lleva directo al juego.
 */
(function (global) {
  'use strict';

  // Dirección pública del juego: se usa en el QR, en el texto visible y en el mensaje a compartir.
  const SHARE_URL = 'https://www.noterindasgame.com';

  let cachedBlob = null;
  let cachedDataUrl = null;
  let currentShareData = null;

  function t(key, fallback, ...args) {
    if (global.I18n && typeof global.I18n.t === 'function') {
      const val = global.I18n.t(key, ...args);
      if (val && val !== key) return val;
    }
    return fallback || key;
  }

  function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  function drawBolts(ctx, x, y, w, h, inset) {
    const corners = [
      [x + inset, y + inset],
      [x + w - inset, y + inset],
      [x + inset, y + h - inset],
      [x + w - inset, y + h - inset]
    ];
    corners.forEach(([bx, by]) => {
      ctx.save();
      ctx.fillStyle = '#ffd752';
      ctx.strokeStyle = '#583d06';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(bx, by, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx - 5, by);
      ctx.lineTo(bx + 5, by);
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawQRCode(ctx, text, x, y, size) {
    if (typeof global.qrcode !== 'function') return;
    try {
      const qr = global.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      const count = qr.getModuleCount();
      const padding = 20;
      const drawSize = size - padding * 2;
      const cellSize = drawSize / count;

      // Fondo blanco del QR
      ctx.save();
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, x, y, size, size, 20, true, false);

      // Módulos oscuros
      ctx.fillStyle = '#060d17';
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            ctx.fillRect(
              Math.round(x + padding + c * cellSize),
              Math.round(y + padding + r * cellSize),
              Math.ceil(cellSize),
              Math.ceil(cellSize)
            );
          }
        }
      }
      ctx.restore();
    } catch (err) {
      console.warn('[StoryShare] Error dibujando QR:', err);
    }
  }

  function loadImageAsync(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async function generateStoryCanvas(data) {
    const W = 1080;
    const H = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const score = Number(data.score) || 0;
    const scoreStr = String(score).padStart(5, '0');
    const initials = (data.initials || 'JUG').toUpperCase().slice(0, 3);
    const rank = Number(data.rank) || 0;
    const charId = data.character === 'chico' ? 'chico' : 'chica';
    const playUrl = SHARE_URL;

    // 1. FONDO NOCTURNO RETRO ARCADE
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#0a1322');
    bgGrad.addColorStop(0.35, '#071824');
    bgGrad.addColorStop(0.75, '#040d16');
    bgGrad.addColorStop(1, '#02060a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Resplandor radial superior
    const radialGrad = ctx.createRadialGradient(W / 2, 320, 50, W / 2, 320, 580);
    radialGrad.addColorStop(0, 'rgba(0, 230, 118, 0.22)');
    radialGrad.addColorStop(0.5, 'rgba(0, 229, 255, 0.08)');
    radialGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = radialGrad;
    ctx.fillRect(0, 0, W, 800);

    // Estrellas titilantes de fondo
    ctx.fillStyle = '#ffffff';
    const seedStars = [
      [120, 180, 2.5], [260, 290, 1.8], [880, 160, 2.2], [960, 280, 1.5],
      [180, 480, 2.0], [920, 520, 2.8], [140, 860, 1.6], [940, 890, 2.0],
      [110, 1260, 2.2], [970, 1310, 1.8], [210, 1620, 2.0], [890, 1650, 2.4]
    ];
    seedStars.forEach(([sx, sy, sr]) => {
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    });

    // Marco exterior Arcade
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#ffd752';
    roundRect(ctx, 34, 34, W - 68, H - 68, 36, false, true);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#00e676';
    roundRect(ctx, 48, 48, W - 96, H - 96, 26, false, true);
    drawBolts(ctx, 48, 48, W - 96, H - 96, 24);

    // 2. HEADER: Badge oficial
    ctx.save();
    ctx.fillStyle = 'rgba(0, 230, 118, 0.15)';
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 2.5;
    roundRect(ctx, (W - 560) / 2, 90, 560, 58, 29, true, true);
    ctx.fillStyle = '#00e676';
    ctx.font = '900 24px monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('shareStoryCardTitle', '★ NO TE RINDAS ★'), W / 2, 119);
    ctx.restore();

    // Logo principal
    let logoImg = null;
    if (global.IMG && global.IMG.logo) logoImg = global.IMG.logo;
    else logoImg = await loadImageAsync('ASSETS/logonoterindas.webp?v=89');

    if (logoImg && logoImg.width) {
      const lw = 680;
      const lh = Math.round(logoImg.height * (lw / logoImg.width));
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 12;
      ctx.drawImage(logoImg, (W - lw) / 2, 175, lw, lh);
      ctx.restore();
    } else {
      ctx.fillStyle = '#ffb300';
      ctx.font = '900 68px monospace, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NO TE RINDAS', W / 2, 280);
    }

    // 3. TARJETA CABINA HEROE + SCORE (Y = 460 a 1180)
    const cardX = 90;
    const cardY = 460;
    const cardW = W - 180;
    const cardH = 700;

    // Sombra y fondo de la cabina
    ctx.save();
    ctx.shadowColor = 'rgba(0, 229, 255, 0.35)';
    ctx.shadowBlur = 32;
    ctx.fillStyle = 'rgba(8, 16, 28, 0.94)';
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 4;
    roundRect(ctx, cardX, cardY, cardW, cardH, 28, true, true);
    ctx.restore();
    drawBolts(ctx, cardX, cardY, cardW, cardH, 20);

    // Línea divisoria superior dorada
    ctx.fillStyle = '#ffd752';
    ctx.font = '900 28px monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t('shareStoryScoreLabel', '★ MI RÉCORD ARCADE ★'), W / 2, cardY + 55);

    // Personaje en el centro
    let heroImg = null;
    if (global.IMG && global.IMG.festejo && global.IMG.festejo[charId] && global.IMG.festejo[charId][3]) {
      heroImg = global.IMG.festejo[charId][3];
    } else if (global.IMG && global.IMG.character && global.IMG.character[charId] && global.IMG.character[charId].idle) {
      heroImg = global.IMG.character[charId].idle;
    } else {
      heroImg = await loadImageAsync(`ASSETS/${charId === 'chica' ? 'chicafestejo4' : 'chicofestejo4'}.webp`);
    }

    if (heroImg && heroImg.width) {
      ctx.save();
      // Tarima de luz bajo los pies del personaje
      const floorGrad = ctx.createRadialGradient(W / 2, cardY + 360, 20, W / 2, cardY + 360, 160);
      floorGrad.addColorStop(0, 'rgba(0, 230, 118, 0.6)');
      floorGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = floorGrad;
      ctx.beginPath();
      ctx.ellipse(W / 2, cardY + 360, 150, 42, 0, 0, Math.PI * 2);
      ctx.fill();

      // Dibujar personaje pixel art nítido
      ctx.imageSmoothingEnabled = false;
      const targetH = 260;
      const targetW = Math.round(heroImg.width * (targetH / heroImg.height));
      ctx.drawImage(heroImg, Math.round((W - targetW) / 2), cardY + 110, targetW, targetH);
      ctx.restore();
    }

    // Iniciales del jugador
    ctx.save();
    ctx.fillStyle = 'rgba(0, 229, 255, 0.15)';
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2;
    roundRect(ctx, (W - 220) / 2, cardY + 395, 220, 52, 14, true, true);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 28px monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`[ ${initials} ]`, W / 2, cardY + 421);
    ctx.restore();

    // Caja de Puntaje gigante
    const scoreBoxY = cardY + 475;
    ctx.save();
    ctx.fillStyle = '#050a12';
    ctx.strokeStyle = '#ffd752';
    ctx.lineWidth = 3;
    roundRect(ctx, cardX + 30, scoreBoxY, cardW - 60, 185, 20, true, true);

    // Resplandor del score
    ctx.shadowColor = 'rgba(255, 215, 82, 0.75)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffea60';
    ctx.font = '900 92px monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(scoreStr, W / 2, scoreBoxY + 80);

    // Rango o etiqueta de puntos
    ctx.shadowBlur = 0;
    if (rank > 0 && rank <= 100) {
      ctx.fillStyle = '#00e676';
      ctx.font = '900 26px monospace, sans-serif';
      ctx.fillText(`★ PUESTO #${rank} EN EL RANKING GLOBAL ★`, W / 2, scoreBoxY + 148);
    } else {
      ctx.fillStyle = '#8ef8d9';
      ctx.font = '900 26px monospace, sans-serif';
      ctx.fillText(`PUNTOS DE SUPERVIVENCIA`, W / 2, scoreBoxY + 148);
    }
    ctx.restore();

    // 4. TARJETA QR: ¿PODÉS SUPERARME? (Y = 1195 a 1710)
    const qrCardY = 1195;
    const qrCardH = 515;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 230, 118, 0.35)';
    ctx.shadowBlur = 28;
    ctx.fillStyle = 'rgba(6, 14, 24, 0.95)';
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 4;
    roundRect(ctx, cardX, qrCardY, cardW, qrCardH, 28, true, true);
    ctx.restore();
    drawBolts(ctx, cardX, qrCardY, cardW, qrCardH, 20);

    // Título de desafío
    ctx.fillStyle = '#00e676';
    ctx.font = '900 36px monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t('shareStoryBeatMe', '¿PODÉS SUPERAR MI MARCA?'), W / 2, qrCardY + 65);

    // QR Code centrado
    const qrSize = 270;
    const qrX = Math.round((W - qrSize) / 2);
    const qrY = qrCardY + 95;
    drawQRCode(ctx, playUrl, qrX, qrY, qrSize);

    // Instrucción para el espectador + pedido de ayuda para difundir
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 30px monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t('shareStoryScan', 'ESCANEÁ Y JUGÁ'), W / 2, qrCardY + 402);

    ctx.fillStyle = '#8ef8d9';
    ctx.font = '900 22px monospace, sans-serif';
    ctx.fillText(t('shareStoryHelp', 'AYUDAME A LLEGAR A MÁS GENTE · ¡COMPARTÍ!'), W / 2, qrCardY + 444);

    // URL visible
    const displayUrl = playUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    ctx.fillStyle = '#ffd752';
    ctx.font = '900 30px monospace, sans-serif';
    ctx.fillText(displayUrl, W / 2, qrCardY + 488);

    // 5. FOOTER: Instagram Banner @nellcstudio (Y = 1750 a 1840)
    const footY = 1755;
    const footH = 75;
    const footW = cardW;
    ctx.save();
    const instaGrad = ctx.createLinearGradient(cardX, 0, cardX + footW, 0);
    instaGrad.addColorStop(0, '#f09433');
    instaGrad.addColorStop(0.35, '#dc2743');
    instaGrad.addColorStop(0.7, '#cc2366');
    instaGrad.addColorStop(1, '#bc1888');
    ctx.fillStyle = instaGrad;
    ctx.shadowColor = 'rgba(220, 39, 67, 0.6)';
    ctx.shadowBlur = 20;
    roundRect(ctx, cardX, footY, footW, footH, 38, true, false);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 26px monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.fillText(t('shareStoryFollow', 'Seguinos en Instagram @nellcstudio'), W / 2, footY + footH / 2);
    ctx.restore();

    return canvas;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'record-no-te-rindas.png';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);
  }

  function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-visible');
    setTimeout(() => el.classList.remove('is-visible'), 3200);
  }

  const StoryShare = {
    async openModal(data) {
      currentShareData = data || {};
      const modal = document.getElementById('story-modal');
      const previewImg = document.getElementById('story-preview-img');
      const loading = document.getElementById('story-loading');

      if (!modal) return;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');

      if (loading) loading.style.display = 'flex';
      if (previewImg) previewImg.style.opacity = '0.3';

      try {
        const canvas = await generateStoryCanvas(currentShareData);
        canvas.toBlob((blob) => {
          cachedBlob = blob;
          if (cachedDataUrl) URL.revokeObjectURL(cachedDataUrl);
          cachedDataUrl = URL.createObjectURL(blob);

          if (previewImg) {
            previewImg.src = cachedDataUrl;
            previewImg.style.opacity = '1';
          }
          if (loading) loading.style.display = 'none';
        }, 'image/png');
      } catch (err) {
        console.error('[StoryShare] Error al generar placa:', err);
        if (loading) loading.style.display = 'none';
        showToast('Error al generar la imagen');
      }
    },

    closeModal() {
      const modal = document.getElementById('story-modal');
      if (!modal) return;
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    },

    async shareNative() {
      if (!cachedBlob) {
        showToast('Generando imagen, aguardá un segundo…');
        return;
      }

      const score = currentShareData ? currentShareData.score : 0;
      const file = new File([cachedBlob], 'record-no-te-rindas.png', { type: 'image/png' });
      const playUrl = SHARE_URL;
      const shareTitle = t('shareTitle', '¡Mi récord en NO TE RINDAS!');
      const shareText = t('shareText', `¡Hice ${score} puntos en NO TE RINDAS! ¿Podés superarme? Ayudame a que llegue a más gente compartiéndolo. Jugá acá: ${playUrl}`, score, playUrl);

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: shareTitle,
            text: shareText
          });
          showToast(t('shareSuccess', '¡Gracias por compartir!'));
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.warn('[StoryShare] Falló navigator.share con archivo, descargando fallback:', err);
            downloadBlob(cachedBlob, 'record-no-te-rindas.png');
            showToast(t('shareDownloaded', '¡Imagen guardada! Compartila en tus redes'));
          }
        }
      } else {
        // En desktop o navegadores sin soporte de files en navigator.share
        downloadBlob(cachedBlob, 'record-no-te-rindas.png');
        showToast(t('shareDownloaded', '¡Imagen guardada! Compartila en tus redes'));
      }
    },

    download() {
      if (!cachedBlob) return;
      downloadBlob(cachedBlob, 'record-no-te-rindas.png');
      showToast(t('shareDownloaded', '¡Imagen guardada! Compartila en tus redes'));
    },

    async copyLink() {
      const playUrl = SHARE_URL;
      try {
        await navigator.clipboard.writeText(playUrl);
        showToast(t('shareCopiedToast', '¡Enlace copiado al portapapeles!'));
      } catch (err) {
        showToast(playUrl);
      }
    },

    init() {
      const modal = document.getElementById('story-modal');
      const closeBtn = document.getElementById('story-modal-close');
      const backdrop = modal ? modal.querySelector('.story-modal__backdrop') : null;
      const shareBtn = document.getElementById('story-share-native-btn');
      const downloadBtn = document.getElementById('story-download-btn');
      const copyBtn = document.getElementById('story-copy-link-btn');

      if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal());
      if (backdrop) backdrop.addEventListener('click', () => this.closeModal());
      if (shareBtn) shareBtn.addEventListener('click', () => this.shareNative());
      if (downloadBtn) downloadBtn.addEventListener('click', () => this.download());
      if (copyBtn) copyBtn.addEventListener('click', () => this.copyLink());

      // Tecla Escape para cerrar
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) {
          this.closeModal();
        }
      });
    }
  };

  global.StoryShare = StoryShare;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => StoryShare.init());
  } else {
    StoryShare.init();
  }
})(typeof window !== 'undefined' ? window : this);
