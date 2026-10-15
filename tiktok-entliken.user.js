// ==UserScript==
// @name         TikTok Likes, Gespeicherte und Reposts entfernen - by flitzkanone
// @namespace    local.tiktok.controls
// @version      1.6.1
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
  host.style.cssText =
    'position:fixed;top:90px;left:16px;z-index:2147483647';

  const ui = host.attachShadow({ mode: 'open' });

  ui.innerHTML = `
    <style>
      section {
        font:14px system-ui;
        background:#171717;
        color:white;
        padding:14px;
        border:1px solid #555;
        border-radius:12px;
        width:250px;
        box-shadow:0 4px 20px #0008;
      }
      label {
        display:block;
        margin:12px 0;
      }
      input {
        width:55px;
      }
      button,input,select {
        font:inherit;
        padding:6px;
        border-radius:6px;
      }
      button {
        cursor:pointer;
      }
      p {
        font-size:12px;
        overflow-wrap:anywhere;
      }
    </style>
    <section>
      <b>TikTok · Beiträge aufräumen</b>
      <label>Aktion:
        <select id="mode">
          <option value="likes">Likes entfernen</option>
          <option value="saved">Gespeicherte entfernen</option>
          <option value="reposts">Reposts zurücknehmen</option>
        </select>
      </label>
      <label>
        Pause:
        <input
          id="delay"
          type="number"
          min="3"
          max="120"
          value="5"
        >
        Sekunden
      </label>
      <button id="start">Start</button>
      <button id="stop">Stopp</button>
      <p id="status">Bereit.</p>
    </section>
  `;

  document.body.appendChild(host);

  const get = id => ui.getElementById(id);
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

  function collectionEntry(config, tab, seen) {
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
    return specific.find(item => !item.querySelector('a[href]') &&
      (item.matches('button,[role="button"]') ||
       item.querySelector('video,img'))
    ) || null;
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

    const token = ++generation;
    const live = () =>
      running && generation === token;

    const seen = new Set();
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
        () => collectionEntry(config, likedTab, seen), 12000
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

      click(firstPost);

      const post = await waitFor(context);

      if (!post) {
        throw new Error(
          'Erster Beitrag konnte nicht geöffnet werden.'
        );
      }

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
