// ==UserScript==
// @name         TikTok Entliken mit Profil-Aktualisierung - by flitzkanone
// @namespace    local.tiktok.controls
// @version      1.5.0
// @description  Videos und Fotos entliken; bei Bedarf über Für dich die gelikten Beiträge erneut öffnen.
// @match        https://www.tiktok.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  if (window.top !== window.self) return;

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
      button,input {
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
      <b>TikTok · Entliken</b>
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
  }

  get('stop').onclick = () => stop();

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') stop();
  });

  get('start').onclick = async () => {
    if (running) return;

    const delay = Number(get('delay').value);

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

    async function openLikedPost() {
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
        'Öffne „Geliked“ …';

      const likedTab = await waitFor(() =>
        firstVisible(
          '[data-e2e="liked-tab"],' +
          '[data-e2e="likes-tab"]'
        ) ||
        findControl(
          /^(geliked|liked|gefällt mir|gelikte beiträge|liked videos)(?:\s+\d[\d.,KkMm]*)?$/i
        )
      );

      if (!likedTab) {
        throw new Error(
          'Tab „Geliked“ nicht gefunden.'
        );
      }

      click(likedTab);

      await sleep(2000);
      check();

      get('status').textContent =
        'Öffne ersten gelikten Beitrag …';

      const firstPost = await waitFor(() => {
        const items = [
          ...document.querySelectorAll(
            '[data-e2e="user-liked-item"]'
          )
        ];

        const item = items.find(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });

        if (item) {
          return item.querySelector(
            'a[href*="/video/"],a[href*="/photo/"]'
          ) || item;
        }

        const selected = [
          ...document.querySelectorAll(
            '[role="tab"][aria-selected="true"]'
          )
        ].find(el =>
          /geliked|liked|gefällt mir/i.test(label(el))
        );

        if (!selected) return null;

        const panelId =
          selected.getAttribute('aria-controls');

        const tabPanel = panelId
          ? document.getElementById(panelId)
          : null;

        return tabPanel && tabPanel.querySelector(
          'a[href*="/video/"],a[href*="/photo/"]'
        );
      });

      if (!firstPost) {
        throw new Error(
          'Keine gelikten Beiträge gefunden ' +
          'oder Liste nicht erkannt.'
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

    try {
      while (live()) {
        let post =
          context() ||
          await waitFor(context, 4000);

        if (!post) {
          post = await openLikedPost();
        }

        check();

        if (seen.has(post.key)) {
          post = await openLikedPost();
        }

        if (liked(post)) {
          get('status').textContent =
            'Like entfernen …';

          post.button.click();

          const confirmed = await waitFor(() => {
            const current = context();

            if (!current) return null;

            if (current.key !== post.key) {
              throw new Error(
                'Beitrag während der Aktion gewechselt.'
              );
            }

            return !liked(current)
              ? current
              : null;
          }, 4000);

          if (!confirmed) {
            throw new Error(
              'Entliken nicht bestätigt.'
            );
          }
        }

        seen.add(post.key);
        count++;

        get('status').textContent =
          count + ' Beiträge bearbeitet. Warte …';

        await sleep(delay * 1000);
        check();

        const current = context();

        if (!current) {
          await openLikedPost();
          continue;
        }

        if (current.key !== post.key) {
          continue;
        }

        if (liked(current)) {
          throw new Error(
            'TikTok hat den Like wiederhergestellt.'
          );
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
          await openLikedPost();
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
