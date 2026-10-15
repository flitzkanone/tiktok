// ==UserScript==
// @name         TikTok Likes, Gespeicherte und Reposts entfernen - by flitzkanone
// @namespace    local.tiktok.controls
// @version      1.7.0
// @description  Likes, gespeicherte Beiträge oder eigene Reposts entfernen und zum nächsten Beitrag wechseln.
// @match        https://www.tiktok.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  if (window.top !== window.self) return;

  const modes = {
    likes: {
      title: 'Likes entfernen', tab: 'Geliked',
      tabs: '[data-e2e="liked-tab"],[data-e2e="likes-tab"]',
      tabText: /^(geliked|liked|gefällt mir|gelikte beiträge|liked videos)(?:\s+\d[\d.,KkMm]*)?$/i,
      items: '[data-e2e="user-liked-item"]'
    },
    saved: {
      title: 'Gespeicherte entfernen', tab: 'Gespeichert',
      tabs: '[data-e2e="favorites-tab"],[data-e2e="favourites-tab"],[data-e2e="favorite-tab"],[data-e2e="collections-tab"]',
      tabText: /^(gespeichert|gespeicherte|favoriten|favorites|favourites|saved)(?:\s+\d[\d.,KkMm]*)?$/i,
      items: '[data-e2e="user-favorite-item"],[data-e2e="user-favorites-item"],[data-e2e="user-collect-item"]'
    },
    reposts: {
      title: 'Reposts zurücknehmen', tab: 'Reposts',
      tabs: '[data-e2e="repost-tab"],[data-e2e="reposts-tab"]',
      tabText: /^(reposts?|erneut veröffentlicht|erneut veröffentlichte beiträge|reposted)(?:\s+\d[\d.,KkMm]*)?$/i,
      items: '[data-e2e="user-repost-item"],[data-e2e="user-reposted-item"]'
    }
  };

  const host = document.createElement('div');
  host.id = 'tt-cleanup-root';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none';
  const ui = host.attachShadow({ mode: 'open' });

  const icon = (paths, size = 18) => '<svg width="' + size + '" height="' + size +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  const spark = icon('<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>');
  const grip = icon('<circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>', 16);

  ui.innerHTML = `
    <style>
      :host {color-scheme:dark;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f5f5f7}
      *,*::before,*::after {box-sizing:border-box}
      [hidden] {display:none!important}
      button,input,select {font:inherit}
      button {cursor:pointer}
      button:focus-visible,input:focus-visible,select:focus-visible {
        outline:2px solid #25f4ee;outline-offset:3px
      }
      button:disabled,select:disabled,input:disabled {opacity:.45;cursor:not-allowed}
      svg {flex-shrink:0}
      #launcher {
        pointer-events:auto;position:fixed;top:14px;right:24px;height:38px;
        display:flex;align-items:center;gap:9px;padding:0 14px;border-radius:12px;
        border:1px solid #ffffff24;background:#19191ded;color:#f5f5f7;
        box-shadow:0 4px 18px #0003;backdrop-filter:blur(16px);
        font-size:13px;font-weight:650;transition:background .15s,border-color .15s
      }
      #launcher:hover {background:#28282e;border-color:#ffffff45}
      #launcher>.launch-icon {color:#25f4ee;display:flex}
      #launcher[aria-expanded="true"] {border-color:#fe2c5566}
      .dot {width:6px;height:6px;border-radius:50%;background:#777782;flex-shrink:0}
      #launcher[data-running="true"] .dot,.status-card[data-running="true"] .dot {
        background:#25f4ee;box-shadow:0 0 0 4px #25f4ee12
      }
      #panel {
        pointer-events:auto;position:fixed;left:24px;top:84px;
        width:min(340px,calc(100vw - 24px));max-height:calc(100dvh - 24px);
        overflow:auto;overscroll-behavior:contain;
        border:1px solid #ffffff1c;border-radius:20px;background:#161619;
        box-shadow:0 24px 70px #0007,0 4px 16px #0004;
        scrollbar-width:thin;scrollbar-color:#44444c transparent
      }
      #panel::before {
        content:"";display:block;height:3px;
        background:linear-gradient(90deg,#25f4ee,#25f4ee 20%,#fe2c55 85%);
      }
      .topbar {display:flex;align-items:center;gap:4px;padding:15px 14px 12px}
      #drag {
        display:flex;align-items:center;gap:9px;flex:1;min-width:0;
        padding:4px 2px;background:none;border:0;color:inherit;
        text-align:left;cursor:grab;touch-action:none;user-select:none
      }
      #drag>.grip {color:#666671;display:flex}
      #panel[data-dragging="true"] #drag {cursor:grabbing}
      .eyebrow {display:block;color:#8b8b97;font-size:10px;font-weight:700;letter-spacing:1.5px}
      .title {display:block;font-size:19px;line-height:1.35;font-weight:750;letter-spacing:-.5px}
      .icon-button {
        display:grid;place-items:center;width:30px;height:30px;padding:0;flex-shrink:0;
        background:none;color:#92929d;border:0;border-radius:8px
      }
      .icon-button:hover {background:#ffffff0d;color:#fff}
      .body {padding:4px 20px 18px}
      .intro {margin:0 0 20px;color:#9696a2;font-size:12px;line-height:1.6}
      label {display:block;margin-bottom:8px;color:#e1e1e7;font-size:12px;font-weight:650}
      .select-wrap {position:relative}
      .select-wrap>svg {position:absolute;right:13px;top:16px;pointer-events:none;color:#8d8d99}
      select {
        appearance:none;display:block;width:100%;height:46px;padding:0 36px 0 13px;
        border:1px solid #ffffff19;border-radius:11px;background:#222227;color:#f4f4f7;
        font-size:13px;cursor:pointer
      }
      option {background:#222227;color:#f4f4f7}
      .delay-row {display:flex;align-items:center;justify-content:space-between;gap:12px;margin:20px 0}
      .delay-row label {margin-bottom:2px}
      .muted {color:#8b8b97;font-size:11px}
      .number-wrap {
        display:flex;align-items:center;gap:6px;flex-shrink:0;
        border:1px solid #ffffff19;border-radius:10px;background:#222227;padding:6px 10px
      }
      #delay {width:48px;padding:3px 0;border:0;background:none;color:#fff;font-weight:650;text-align:center}
      .number-wrap span {font-size:11px;color:#a0a0ad}
      .status-card {border:1px solid #ffffff0c;background:#ffffff04;border-radius:12px;padding:12px;margin:0 0 18px}
      .status-heading {display:flex;align-items:center;gap:8px;margin-bottom:6px;color:#acacb8;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase}
      #status {margin:0;min-height:36px;color:#dadbe3;font-size:12px;line-height:1.5;overflow-wrap:anywhere}
      .actions {display:grid;grid-template-columns:1fr 100px;gap:9px}
      .actions button {display:flex;align-items:center;justify-content:center;gap:8px;height:43px;border-radius:11px;font-size:13px;font-weight:700}
      #start {background:#fe2c55;color:#fff;border:1px solid transparent}
      #start:hover:not(:disabled) {background:#ff4168}
      #stop {background:#242429;color:#ededf2;border:1px solid #ffffff12}
      #stop:hover {background:#303037}
      .footer {display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:15px;color:#777782;font-size:10px}
      kbd {padding:1px 5px;border:1px solid #ffffff1c;border-radius:4px;font:10px inherit;color:#a0a0ad}
      @media(max-width:480px) {
        #launcher {right:12px;top:12px}
        .topbar {padding-top:12px}
      }
      @media(prefers-reduced-motion:reduce) {* {transition:none!important}}
    </style>
    <button id="launcher" type="button" aria-controls="panel" aria-expanded="true"
      title="Aufräumen ein-/ausblenden · Alt+Shift+K">
      <span class="launch-icon">` + spark + `</span>
      <span>Aufräumen</span><span class="dot" aria-hidden="true"></span>
    </button>
    <section id="panel" role="region" aria-label="TikTok aufräumen">
      <div class="topbar">
        <button id="drag" type="button"
          aria-label="Menü verschieben: ziehen oder Pfeiltasten verwenden. Pos1 setzt die Position zurück."
          title="Ziehen zum Verschieben · Doppelklick zum Zurücksetzen">
          <span class="grip">` + grip + `</span>
          <span><span class="eyebrow">TIKTOK CLEANUP</span><span class="title">Aufräumen</span></span>
        </button>
        <button id="reset-position" class="icon-button" type="button"
          aria-label="Menüposition zurücksetzen" title="Position zurücksetzen">` +
          icon('<path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7"/>', 16) + `</button>
        <button id="hide" class="icon-button" type="button"
          aria-label="Menü ausblenden" title="Ausblenden – der Vorgang läuft weiter">` +
          icon('<path d="M5 12h14"/>', 18) + `</button>
      </div>
      <div class="body">
        <p class="intro">Wähle aus, was du entfernen möchtest.</p>
        <label for="mode">Aktion</label>
        <div class="select-wrap">
          <select id="mode">
            <option value="likes">Likes entfernen</option>
            <option value="saved">Gespeicherte entfernen</option>
            <option value="reposts">Reposts zurücknehmen</option>
          </select>
          ` + icon('<path d="m8 10 4 4 4-4"/>', 16) + `
        </div>
        <div class="delay-row">
          <div><label for="delay">Pause zwischen Beiträgen</label><span class="muted">3–120 Sekunden</span></div>
          <div class="number-wrap"><input id="delay" type="number" min="3" max="120" value="5"><span>Sek.</span></div>
        </div>
        <div id="status-card" class="status-card">
          <div class="status-heading"><span class="dot" aria-hidden="true"></span><span id="run-label">Bereit</span></div>
          <p id="status" role="status" aria-live="polite" aria-atomic="true">Wähle eine Aktion und drücke Start.</p>
        </div>
        <div class="actions">
          <button id="start" type="button">` + icon('<path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none"/>', 16) + `Start</button>
          <button id="stop" type="button">` + icon('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>', 14) + `Stopp</button>
        </div>
        <div class="footer"><span>Ausblenden lässt den Vorgang weiterlaufen.</span><span><kbd>Esc</kbd> stoppt</span></div>
      </div>
    </section>
  `;

  document.body.appendChild(host);
  const get = id => ui.getElementById(id);

  // Nur die Darstellung speichern, niemals einen laufenden Auftrag automatisch starten.
  const uiStorageKey = 'flitzkanone.tiktok-cleanup.ui.v1';
  let uiState = { x: null, y: null, hidden: false };
  try {
    const saved = JSON.parse(localStorage.getItem(uiStorageKey) || 'null');
    if (saved && typeof saved === 'object') {
      uiState = {
        x: Number.isFinite(saved.x) ? saved.x : null,
        y: Number.isFinite(saved.y) ? saved.y : null,
        hidden: saved.hidden === true
      };
    }
  } catch { /* Blockierter Speicher verhindert nicht die Bedienung. */ }

  const panel = get('panel');
  const dragHandle = get('drag');
  let dragState = null;

  function persistUI() {
    try { localStorage.setItem(uiStorageKey, JSON.stringify(uiState)); }
    catch { /* Ohne Speicher bleibt die Position für diesen Seitenaufruf erhalten. */ }
  }

  function placePanel(reset = false) {
    const width = panel.offsetWidth || Math.min(340, Math.max(0, innerWidth - 24));
    const height = panel.offsetHeight || Math.min(430, Math.max(0, innerHeight - 24));
    const maxX = Math.max(12, innerWidth - width - 12);
    const maxY = Math.max(12, innerHeight - height - 12);
    const x = reset || uiState.x === null ? innerWidth - width - 24 : uiState.x;
    const y = reset || uiState.y === null ? 84 : uiState.y;
    uiState.x = Math.max(12, Math.min(maxX, x));
    uiState.y = Math.max(12, Math.min(maxY, y));
    panel.style.left = uiState.x + 'px';
    panel.style.top = uiState.y + 'px';
  }

  function showPanel(open, focus = true) {
    uiState.hidden = !open;
    panel.hidden = !open;
    get('launcher').setAttribute('aria-expanded', String(open));
    if (open) placePanel();
    persistUI();
    if (focus) (open ? dragHandle : get('launcher')).focus({ preventScroll: true });
  }

  function setRunningUI(active) {
    get('launcher').setAttribute('data-running', String(active));
    get('launcher').setAttribute('aria-label', active
      ? 'Aufräumen – Vorgang läuft. Menü ein- oder ausblenden.'
      : 'Aufräumen – Menü ein- oder ausblenden.');
    get('status-card').setAttribute('data-running', String(active));
    get('run-label').textContent = active ? 'Läuft' : 'Gestoppt';
  }

  get('launcher').onclick = () => showPanel(panel.hidden);
  get('hide').onclick = () => showPanel(false);
  get('reset-position').onclick = () => { placePanel(true); persistUI(); };
  dragHandle.addEventListener('dblclick', () => { placePanel(true); persistUI(); });

  dragHandle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || dragState) return;
    placePanel();
    dragState = {
      id: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      x: uiState.x, y: uiState.y
    };
    dragHandle.setPointerCapture(event.pointerId);
    panel.setAttribute('data-dragging', 'true');
    event.preventDefault();
  });

  dragHandle.addEventListener('pointermove', event => {
    if (!dragState || event.pointerId !== dragState.id) return;
    uiState.x = dragState.x + event.clientX - dragState.clientX;
    uiState.y = dragState.y + event.clientY - dragState.clientY;
    placePanel();
  });

  function finishDrag(event) {
    if (!dragState || event.pointerId !== dragState.id) return;
    const id = dragState.id;
    dragState = null;
    panel.setAttribute('data-dragging', 'false');
    if (dragHandle.hasPointerCapture(id)) dragHandle.releasePointerCapture(id);
    persistUI();
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    dragHandle.addEventListener(type, finishDrag);
  }

  dragHandle.addEventListener('keydown', event => {
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (event.key === 'Home') {
      event.preventDefault(); placePanel(true); persistUI(); return;
    }
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const step = event.shiftKey ? 30 : 10;
    uiState.x += move[0] * step;
    uiState.y += move[1] * step;
    placePanel(); persistUI();
  });

  document.addEventListener('keydown', event => {
    if (event.altKey && event.shiftKey && event.code === 'KeyK' && !event.repeat) {
      event.preventDefault();
      showPanel(panel.hidden);
    }
  });
  window.addEventListener('resize', () => {
    if (!panel.hidden) placePanel();
    persistUI();
  });
  placePanel();
  showPanel(!uiState.hidden, false);
  const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  let running = false;
  let generation = 0;
  let closingShare = false;

  function visible(el) {
    if (!el || !el.isConnected) return false;

    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);

    return (
      r.width > 0 &&
      r.height > 0 &&
      r.bottom > 0 &&
      r.top < innerHeight &&
      r.right > 0 &&
      r.left < innerWidth &&
      s.display !== 'none' &&
      s.visibility !== 'hidden'
    );
  }

  function click(el) {
    const control = el.closest(
      'button,a,[role="button"],[role="tab"]'
    );

    (control || el).click();
  }

  function label(el) {
    return [
      el.getAttribute('aria-label') || '',
      el.getAttribute('title') || '',
      el.textContent || ''
    ].join(' ').replace(/\s+/g, ' ').trim();
  }

  function findControl(pattern) {
    return [...document.querySelectorAll(
      'a,button,[role="button"],[role="tab"]'
    )].find(el =>
      visible(el) && pattern.test(label(el))
    );
  }

  function firstVisible(selector) {
    return [...document.querySelectorAll(selector)]
      .find(visible);
  }

  function matchesText(el, pattern) {
    return ['aria-label', 'title'].some(name =>
      pattern.test((el.getAttribute(name) || '').trim())
    ) || pattern.test((el.textContent || '').replace(/\s+/g, ' ').trim());
  }

  function semantic(root, pattern) {
    return [...root.querySelectorAll(
      'button,a,[role="button"],[role="tab"],[role="menuitem"],[data-e2e],[aria-label]'
    )].find(el => visible(el) && matchesText(el, pattern));
  }

  function hasLayout(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    for (let node = el; node && node !== document; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.getAttribute('aria-hidden') === 'true' ||
          node.hasAttribute('hidden') || style.display === 'none' ||
          style.visibility === 'hidden') return false;
    }
    return true;
  }

  function collectionPanel(tab) {
    const id = tab.getAttribute('aria-controls');
    const controlled = id && document.getElementById(id);
    if (controlled && hasLayout(controlled)) return controlled;
    const panels = [...document.querySelectorAll('[role="tabpanel"]')]
      .filter(hasLayout);
    const tabId = tab.getAttribute('id');
    const labelled = tabId && panels.find(panel =>
      (panel.getAttribute('aria-labelledby') || '').split(/\s+/).includes(tabId)
    );
    if (labelled) return labelled;
    return panels.length === 1 ? panels[0] : null;
  }

  function previewKey(element) {
    const image = element.matches('img') ? element : element.querySelector('img');
    if (!image) return null;
    try {
      const url = new URL(image.currentSrc || image.getAttribute('src'), location.href);
      return url.origin + url.pathname;
    } catch { return null; }
  }

  function savedPreview(panel, seen, seenPreviews) {
    // Fallback für TikTok-ImageX-Kacheln ohne Link oder data-e2e-Kennung.
    // Nur in der zuvor geöffneten Gespeichert-Ansicht auf einer Profilseite.
    if (!/^\/@[^/]+\/?$/.test(location.pathname)) return null;
    const root = panel || document.querySelector(
      'main,[role="main"],[data-e2e="user-page"]'
    ) || document;
    for (const image of root.querySelectorAll('img')) {
      if (image.closest('nav,aside,header,footer,[role="navigation"]')) continue;
      const alt = image.getAttribute('alt') || '';
      if (!/erstellt von|created by|original sound|mit der musik|with (?:the )?(?:music|sound)/i.test(alt)) continue;
      let url;
      try { url = new URL(image.currentSrc || image.getAttribute('src'), location.href); }
      catch { continue; }
      if (!/(^|\.)tiktokcdn(?:-[a-z0-9]+)?\.com$/i.test(url.hostname)) continue;
      const style = getComputedStyle(image);
      if (style.display === 'none' || style.visibility === 'hidden' ||
          image.hasAttribute('hidden') || image.getAttribute('aria-hidden') === 'true') continue;
      const target = hasLayout(image) ? image : image.parentElement;
      if (!target || target === document.body || !hasLayout(target)) continue;
      const r = target.getBoundingClientRect();
      if (r.width < 100 || r.height < 100) continue;
      if (seenPreviews.has(url.origin + url.pathname)) continue;
      const link = image.closest('a[href]');
      if (link) {
        try {
          const postUrl = new URL(link.href || link.getAttribute('href'), location.href);
          if (seen.has(postUrl.origin + postUrl.pathname)) continue;
        } catch { continue; }
      }
      return target;
    }
    return null;
  }

  function collectionEntry(config, tab, seen, seenPreviews = new Set()) {
    // Einige Layouts verwenden für gespeicherte Beiträge dieselben Kacheln
    // wie für Uploads. Nur nach dem Klick auf den gewünschten Tab suchen.
    if (tab.getAttribute('aria-selected') === 'false') return null;
    const specific = [...document.querySelectorAll(config.items)].filter(hasLayout);
    const panel = collectionPanel(tab);
    const grids = [...document.querySelectorAll(
      '[data-e2e="user-post-item-list"],[data-e2e="user-post-item"],'+
      '[data-e2e="user-favorite-item-list"],[data-e2e="user-collect-item-list"]'
    )].filter(hasLayout);
    const roots = [...specific, ...(panel ? [panel] : []), ...grids];

    for (const root of roots) {
      const links = [
        ...(root.matches('a[href]') ? [root] : []),
        ...root.querySelectorAll('a[href]')
      ];
      for (const link of links) {
        if (!hasLayout(link)) continue;
        let url;
        try { url = new URL(link.href || link.getAttribute('href'), location.href); }
        catch { continue; }
        if (url.origin !== location.origin ||
            !/^\/@[^/]+\/(video|photo)\/\d+\/?$/.test(url.pathname)) continue;
        if (!seen.has(url.origin + url.pathname)) return link;
      }
    }

    // Manche ausdrücklich bezeichneten Kacheln sind selbst klickbar
    // und besitzen keinen Link. Keine Sammlungsordner blind öffnen.
    const item = specific.find(item => !item.querySelector('a[href]') &&
      !seenPreviews.has(previewKey(item)) &&
      (item.matches('button,[role="button"]') ||
       item.querySelector('video,img'))
    ) || null;
    if (item) return item;
    return config === modes.saved ? savedPreview(panel, seen, seenPreviews) : null;
  }

  const removeRepostText = /^(remove|delete|undo) repost$|^repost (entfernen|löschen|zurücknehmen|rückgängig machen)$|^erneute veröffentlichung (entfernen|löschen|rückgängig machen)$/i;
  const addRepostText = /^(repost|erneut veröffentlichen|reposten)$/i;

  function savedControl(post) {
    const selectors = '[data-e2e="collect-icon"],[data-e2e="browse-collect-icon"],[data-e2e="favorite-icon"],[data-e2e="browse-favorite-icon"]';
    const icon = [...post.root.querySelectorAll(selectors)].find(visible) ||
      semantic(post.root, /^(remove from (favorites|favourites)|add to (favorites|favourites)|unsave|save|aus (den )?favoriten entfernen|zu (den )?favoriten hinzufügen|speichern|gespeichert|speicherung aufheben|aus gespeicherten entfernen)$/i);
    if (!icon) throw new Error('Speichern-Knopf nicht erkannt.');
    return { icon, button: icon.closest('button,[role="button"]') || icon };
  }

  function savedState(post) {
    const control = savedControl(post);
    const pressed = control.button.getAttribute('aria-pressed') ??
      control.icon.getAttribute('aria-pressed');
    if (pressed === 'true') return true;
    if (pressed === 'false') return false;

    const remove = /^(remove from (favorites|favourites)|unsave|aus (den )?favoriten entfernen|speicherung aufheben|aus gespeicherten entfernen)$/i;
    const add = /^(add to (favorites|favourites)|save|zu (den )?favoriten hinzufügen|speichern)$/i;
    if ([control.icon, control.button].some(el => matchesText(el, remove))) return true;
    if ([control.icon, control.button].some(el => matchesText(el, add))) return false;

    let inactive = false;
    for (const el of control.icon.querySelectorAll('svg,svg path')) {
      const color = getComputedStyle(el).fill.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
      if (!color) continue;
      const [r, g, b] = color.slice(1).map(Number);
      if (r >= 230 && g >= 150 && g <= 230 && b < 110) return true;
      if ((r === 255 && g === 255 && b === 255) ||
          (r === 22 && g === 24 && b === 35)) inactive = true;
    }
    if (inactive) return false;
    throw new Error('Gespeichert-Zustand unbekannt. Kein Klick ausgeführt.');
  }

  function repostState(post, includeMenu = false) {
    const root = includeMenu ? document : post.root;
    const remove = semantic(root, removeRepostText);
    if (remove) return { active: true, control: remove };

    const add = semantic(root, addRepostText);
    if (add) {
      const control = add.closest('button,[role="button"]') || add;
      const pressed = control.getAttribute('aria-pressed') ?? add.getAttribute('aria-pressed');
      if (pressed === 'true') return { active: true, control };
      return { active: false, control };
    }
    return null;
  }

  function shareControl(post) {
    return [...post.root.querySelectorAll(
      '[data-e2e="share-icon"],[data-e2e="browse-share-icon"]'
    )].find(visible) || semantic(post.root, /^(share|teilen|share video|beitrag teilen|video teilen)$/i);
  }

  function dismissShare() {
    // Kein erneuter Klick auf den Repost-Schalter.
    closingShare = true;
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', code: 'Escape', bubbles: true
      }));
    } finally {
      closingShare = false;
    }
  }

  function area(el) {
    const r = el.getBoundingClientRect();

    return Math.max(
      0,
      Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)
    ) * Math.max(
      0,
      Math.min(r.right, innerWidth) - Math.max(r.left, 0)
    );
  }

  function context() {
    const selector =
      '[data-e2e="like-icon"],' +
      '[data-e2e="browse-like-icon"]';

    const media = [
      ...document.querySelectorAll('video,img')
    ].filter(el => {
      if (!visible(el)) return false;
      if (el.tagName === 'VIDEO') return true;

      const r = el.getBoundingClientRect();
      return r.width >= 180 && r.height >= 180;
    }).sort((a, b) => area(b) - area(a));

    for (const item of media) {
      for (
        let root = item.parentElement;
        root && root !== document.body;
        root = root.parentElement
      ) {
        const icons = [
          ...root.querySelectorAll(selector)
        ].filter(visible);

        if (icons.length > 1) break;
        if (icons.length !== 1) continue;

        const icon = icons[0];
        const button =
          icon.closest('button,[role="button"]') || icon;

        const link = root.querySelector(
          'a[href*="/video/"],a[href*="/photo/"]'
        );

        let key = '';

        if (link) {
          const url = new URL(link.href, location.href);
          key = url.origin + url.pathname;
        } else if (
          /\/(?:video|photo)\/\d+/.test(location.pathname)
        ) {
          key = location.origin + location.pathname;
        } else {
          key = item.currentSrc || item.src;
        }

        if (key) {
          return {
            media: item,
            root: root,
            icon: icon,
            button: button,
            key: key
          };
        }
      }
    }

    return null;
  }

  function liked(post) {
    const pressed =
      post.button.getAttribute('aria-pressed') ??
      post.icon.getAttribute('aria-pressed');

    if (pressed === 'true') return true;
    if (pressed === 'false') return false;

    const text =
      post.button.getAttribute('aria-label') ||
      post.icon.getAttribute('aria-label') || '';

    if (
      /unlike|remove like|dislike|gefällt mir nicht|like entfernen/i
        .test(text)
    ) {
      return true;
    }

    if (/^(like|gefällt mir)(\b|$)/i.test(text)) {
      return false;
    }

    let inactive = false;

    for (
      const shape of post.icon.querySelectorAll('svg,svg path')
    ) {
      const match = getComputedStyle(shape).fill.match(
        /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/
      );

      if (!match) continue;

      const r = Number(match[1]);
      const g = Number(match[2]);
      const b = Number(match[3]);

      if (
        r >= 240 &&
        g < 100 &&
        b >= 60 &&
        b < 130
      ) {
        return true;
      }

      if (
        (r === 255 && g === 255 && b === 255) ||
        (r === 22 && g === 24 && b === 35)
      ) {
        inactive = true;
      }
    }

    if (inactive) return false;

    throw new Error('Like-Zustand nicht erkannt.');
  }

  function next(post) {
    const arrow = firstVisible(
      '[data-e2e="arrow-right"],' +
      '[data-e2e="browse-video-next"],' +
      'button[aria-label="Next video"],' +
      'button[aria-label="Nächstes Video"]'
    );

    if (arrow) {
      click(arrow);
      return;
    }

    // Wie im ersten Script vom Beitragsmedium ausgehen.
    for (
      let el = post.media.parentElement;
      el;
      el = el.parentElement
    ) {
      const style = getComputedStyle(el);

      if (
        /(auto|scroll)/.test(style.overflowY) &&
        el.scrollHeight > el.clientHeight + 40
      ) {
        el.scrollBy({
          top: el.clientHeight,
          behavior: 'smooth'
        });
        return;
      }
    }

    window.scrollBy({
      top: innerHeight,
      behavior: 'smooth'
    });
  }

  function stop(message = 'Gestoppt.') {
    running = false;
    generation++;
    setRunningUI(false);

    get('status').textContent = message;
    get('start').disabled = false;
    get('delay').disabled = false;
    get('mode').disabled = false;
  }

  get('stop').onclick = () => stop();

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !closingShare) stop();
  });

  get('start').onclick = async () => {
    if (running) return;

    const delay = Number(get('delay').value);
    const mode = get('mode').value;
    const config = modes[mode];

    if (
      !Number.isFinite(delay) ||
      delay < 3 ||
      delay > 120
    ) {
      get('status').textContent =
        'Pause: 3 bis 120 Sekunden.';
      return;
    }

    running = true;
    setRunningUI(true);

    const token = ++generation;
    const live = () =>
      running && generation === token;

    const seen = new Set();
    const seenPreviews = new Set();
    let count = 0;

    get('start').disabled = true;
    get('delay').disabled = true;
    get('mode').disabled = true;

    function check() {
      if (!live()) {
        throw new Error('Abgebrochen.');
      }
    }

    async function waitFor(find, timeout = 8000) {
      const end = Date.now() + timeout;

      while (Date.now() < end) {
        check();

        const result = find();
        if (result) return result;

        await sleep(300);
      }

      check();
      return null;
    }

    async function openCollectionPost() {
      check();

      // Gegebenenfalls die Beitragsansicht schließen.
      const close = firstVisible(
        '[data-e2e="browse-close"],' +
        'button[aria-label="Close"],' +
        'button[aria-label="Schließen"]'
      );

      if (close) {
        click(close);
        await sleep(700);
        check();
      }

      get('status').textContent =
        'Aktualisiere Liste: Öffne „Für dich“ …';

      const fyp = await waitFor(() =>
        firstVisible(
          'a[data-e2e="nav-foryou"],' +
          '[data-e2e="nav-foryou"],' +
          'a[href="/foryou"]'
        ) ||
        findControl(/^(für dich|for you)$/i)
      );

      if (!fyp) {
        throw new Error(
          '„Für dich“-Knopf nicht gefunden.'
        );
      }

      click(fyp);

      const leftProfile = await waitFor(() =>
        /^\/(?:foryou)?\/?$/.test(location.pathname)
      );

      if (!leftProfile) {
        throw new Error(
          'Wechsel zu „Für dich“ nicht bestätigt.'
        );
      }

      await sleep(1800);
      check();

      get('status').textContent =
        'Öffne dein Profil erneut …';

      const profile = await waitFor(() =>
        firstVisible(
          'a[data-e2e="profile-icon"],' +
          'a[data-e2e="nav-profile"],' +
          '[data-e2e="nav-profile"]'
        ) ||
        findControl(
          /^(profil|profile|mein profil|view profile)$/i
        )
      );

      if (!profile) {
        throw new Error(
          'Profil-Knopf nicht gefunden.'
        );
      }

      click(profile);

      const profileOpened = await waitFor(() =>
        /^\/@[^/]+\/?$/.test(location.pathname)
      );

      if (!profileOpened) {
        throw new Error(
          'Profil konnte nicht geöffnet werden.'
        );
      }

      await sleep(1200);
      check();

      get('status').textContent =
        'Öffne „' + config.tab + '“ …';

      const likedTab = await waitFor(() =>
        firstVisible(config.tabs) ||
        [...document.querySelectorAll('[role="tab"],button,a,[data-e2e]')]
          .find(el => visible(el) && matchesText(el, config.tabText))
      );

      if (!likedTab) {
        throw new Error(
          'Tab „' + config.tab + '“ nicht gefunden oder im Web nicht verfügbar.'
        );
      }

      click(likedTab);

      await sleep(2000);
      check();

      // Optionaler Untertab innerhalb der gespeicherten Ansicht.
      if (mode === 'saved') {
        const panel = collectionPanel(likedTab);
        const videosTab = panel && semantic(panel, /^(videos|beiträge|posts)$/i);
        if (videosTab && videosTab.getAttribute('aria-selected') !== 'true') {
          click(videosTab);
          await sleep(1000);
          check();
        }
      }

      get('status').textContent =
        'Öffne ersten Beitrag aus „' + config.tab + '“ …';

      const firstPost = await waitFor(
        () => collectionEntry(config, likedTab, seen, seenPreviews), 12000
      );

      if (!firstPost) {
        throw new Error(
          'Keine unbearbeiteten Beitragskacheln in „' + config.tab + '“ erkannt. ' +
          (mode === 'saved' ? 'Falls Sammlungen angezeigt werden: Beiträge/Videos öffnen. ' : '') +
          'Die Liste kann leer oder noch nicht aktualisiert sein.'
        );
      }

      firstPost.scrollIntoView({
        block: 'center'
      });

      await sleep(300);
      check();

      const openedPreviewKey = previewKey(firstPost);
      click(firstPost);

      const post = await waitFor(context);

      if (!post) {
        throw new Error(
          'Erster Beitrag konnte nicht geöffnet werden.'
        );
      }

      if (openedPreviewKey) seenPreviews.add(openedPreviewKey);

      if (seen.has(post.key)) {
        throw new Error(
          'Liste weiterhin veraltet: ' +
          'Beitrag wurde bereits bearbeitet.'
        );
      }

      return post;
    }

    function samePost(key) {
      check();
      const post = context();
      if (!post || post.key !== key) {
        throw new Error('Beitrag während der Aktion gewechselt.');
      }
      return post;
    }

    async function getRepostState(key) {
      const post = samePost(key);
      let state = repostState(post);
      if (state) return state;
      const share = shareControl(post);
      if (!share) throw new Error('Teilen-Menü für Reposts nicht gefunden.');
      share.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await sleep(350);
      check();
      state = repostState(samePost(key), true);
      if (state) return state;
      click(share);
      state = await waitFor(() => repostState(samePost(key), true), 4000);
      if (!state) throw new Error('Repost-Zustand unbekannt oder im Web nicht verfügbar.');
      return state;
    }

    async function removeSelected(post) {
      if (mode === 'reposts') {
        const state = await getRepostState(post.key);
        if (!state.active) { dismissShare(); return false; }
        samePost(post.key);
        // Nur explizit „Entfernen“ oder einen nachweislich aktiven Schalter klicken.
        click(state.control);
        await sleep(900);
        check();
        const after = await getRepostState(post.key);
        if (after.active) throw new Error('Repost-Entfernung nicht bestätigt.');
        dismissShare();
        return true;
      }

      const read = mode === 'saved' ? savedState : liked;
      if (!read(post)) return false;
      if (mode === 'saved') click(savedControl(post).button);
      else post.button.click();

      const confirmed = await waitFor(() => {
        const current = samePost(post.key);
        return !read(current) ? current : null;
      }, 4000);
      if (!confirmed) throw new Error(config.title + ': Änderung nicht bestätigt.');
      return true;
    }

    try {
      // Gespeicherte und Reposts ausschließlich aus der gewählten eigenen Liste öffnen.
      let pending = mode === 'likes' ? null : await openCollectionPost();
      while (live()) {
        let post =
          pending ||
          context() ||
          await waitFor(context, 4000);
        pending = null;

        if (!post) {
          post = await openCollectionPost();
        }

        check();

        if (seen.has(post.key)) {
          post = await openCollectionPost();
        }

        get('status').textContent = config.title + ' …';
        const removed = await removeSelected(post);

        seen.add(post.key);
        if (removed) count++;

        get('status').textContent =
          count + ' entfernt · ' + seen.size + ' geprüft. Warte …';

        await sleep(delay * 1000);
        check();

        const current = context();

        if (!current) {
          pending = await openCollectionPost();
          continue;
        }

        if (current.key !== post.key) {
          continue;
        }

        if (mode !== 'reposts' && (mode === 'saved' ? savedState(current) : liked(current))) {
          throw new Error(
            'TikTok hat die Änderung zurückgesetzt.'
          );
        }

        if (mode === 'reposts') {
          const state = await getRepostState(current.key);
          if (state.active) throw new Error('TikTok hat den Repost wiederhergestellt.');
          dismissShare();
        }

        next(current);

        const changed = await waitFor(() => {
          const candidate = context();

          return candidate &&
            candidate.key !== post.key
              ? candidate
              : null;
        }, 6000);

        if (!changed) {
          pending = await openCollectionPost();
        }

        await sleep(700);
      }
    } catch (error) {
      if (live()) {
        stop(error.message);
      }
    }
  };
})();
