const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Minimaler DOM-Ersatz: prüft Erkennung und tatsächlich ausgeführte Klicks.
// Keine Verbindung zu TikTok und keine Änderungen an einem Konto.
class Element {
  constructor(tag = 'div', attrs = {}, text = '') {
    this.tagName = tag.toUpperCase();
    this.attrs = { ...attrs };
    this.textContent = text;
    this.children = [];
    this.style = {};
    this.isConnected = true;
    this.disabled = false;
    this.clicks = 0;
  }
  appendChild(child) { child.parentElement = this; this.children.push(child); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
  getBoundingClientRect() { return { width: 300, height: 400, top: 100, bottom: 500, left: 100, right: 400 }; }
  matches(selector) {
    return selector.split(',').some(part => {
      part = part.trim();
      if (part === 'svg path') return this.tagName === 'PATH';
      const match = part.match(/^(\w+)?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/);
      if (!match) return false;
      return (!match[1] || this.tagName === match[1].toUpperCase()) &&
        (!match[2] || (this.getAttribute(match[2]) !== null &&
          (match[3] === undefined || this.getAttribute(match[2]) === match[3])));
    });
  }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector)
    ]);
  }
  closest(selector) {
    // Nur echte Vorfahren für den simulierten Klick verwenden.
    for (let node = this; node; node = node.parentElement) {
      if (node.matches(selector)) return node;
    }
    return null;
  }
  click() {
    this.clicks++;
    for (let node = this; node; node = node.parentElement) {
      if (node.onclick) node.onclick({ target: this, currentTarget: node });
    }
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  dispatchEvent(event) { if (this.onEvent) this.onEvent(event); }
}

function setup(mode) {
  const controls = Object.fromEntries(['mode', 'delay', 'start', 'stop', 'status']
    .map(id => [id, new Element()]));
  controls.mode.value = mode;
  controls.delay.value = '3';
  const document = new Element();
  document.body = new Element('body');
  document.appendChild(document.body);
  const events = {};
  document.addEventListener = (name, callback) => {
    (events[name] ||= []).push(callback);
  };
  document.dispatchEvent = event => {
    for (const callback of events[event.type] || []) callback(event);
  };
  document.createElement = tag => {
    const element = new Element(tag);
    element.attachShadow = () => ({
      innerHTML: '', getElementById: id => controls[id]
    });
    return element;
  };
  document.getElementById = id => document.querySelector('[id="' + id + '"]');
  let clock = 0;
  const window = {};
  window.top = window;
  window.self = window;
  const sandbox = {
    document, window, innerHeight: 900, innerWidth: 1200,
    location: { href: 'https://www.tiktok.com/@test/video/1', pathname: '/@test/video/1', origin: 'https://www.tiktok.com' },
    URL, Date: { now: () => clock },
    getComputedStyle: el => ({ display: el.display || 'block', visibility: 'visible', fill: el.fill || 'none' }),
    setTimeout: (callback, ms) => { clock += ms; queueMicrotask(callback); },
    KeyboardEvent: class { constructor(type, data) { this.type = type; Object.assign(this, data); } },
    MouseEvent: class { constructor(type, data) { this.type = type; Object.assign(this, data); } }
  };
  const source = fs.readFileSync(path.join(__dirname, '../tiktok-entliken.user.js'), 'utf8')
    .replace('    try {\n      // Gespeicherte', `    globalThis.session = {
      removeSelected, getRepostState, openCollectionPost, collectionEntry, collectionPanel, previewKey, config,
      setPost: post => { context = () => post; },
      active: live
    };
    return;
    try {\n      // Gespeicherte`);
  vm.runInNewContext(source, sandbox);

  const root = new Element('article');
  document.body.appendChild(root);
  function toggle(e2e, pressed) {
    const button = new Element('button', { 'aria-pressed': String(pressed) });
    const icon = new Element('span', { 'data-e2e': e2e });
    button.appendChild(icon);
    root.appendChild(button);
    button.onclick = () => {
      button.attrs['aria-pressed'] = String(button.attrs['aria-pressed'] !== 'true');
    };
    return { button, icon };
  }
  const like = toggle('like-icon', true);
  const saved = toggle('collect-icon', true);
  const post = { root, ...like, key: 'post-1' };

  return {
    controls, root, document, sandbox, like, saved, post,
    async start() {
      await controls.start.onclick();
      assert.ok(sandbox.session, 'Test-Einstieg wurde geladen');
      sandbox.session.setPost(post);
      return sandbox.session;
    }
  };
}

test('Likes-Modus entfernt ausschließlich den Like', async () => {
  const env = setup('likes');
  const session = await env.start();
  assert.equal(await session.removeSelected(env.post), true);
  assert.equal(env.like.button.clicks, 1);
  assert.equal(env.saved.button.clicks, 0);
  assert.equal(await session.removeSelected(env.post), false);
  assert.equal(env.like.button.clicks, 1);
});

test('Gespeicherte-Modus entfernt ausschließlich die Speicherung', async () => {
  const env = setup('saved');
  const session = await env.start();
  assert.equal(session.config.tab, 'Gespeichert');
  assert.equal(await session.removeSelected(env.post), true);
  assert.equal(env.saved.button.clicks, 1);
  assert.equal(env.like.button.clicks, 0);
  assert.equal(await session.removeSelected(env.post), false);
  assert.equal(env.saved.button.clicks, 1);
});

test('Unbekannter Speicherzustand löst keinen Klick aus', async () => {
  const env = setup('saved');
  delete env.saved.button.attrs['aria-pressed'];
  const session = await env.start();
  await assert.rejects(() => session.removeSelected(env.post), /unbekannt/);
  assert.equal(env.saved.button.clicks, 0);
  assert.equal(env.like.button.clicks, 0);
});

test('Gelbes Lesezeichen wird als gespeichert erkannt', async () => {
  const env = setup('saved');
  delete env.saved.button.attrs['aria-pressed'];
  const shape = new Element('svg');
  shape.fill = 'rgb(250, 206, 21)';
  env.saved.icon.appendChild(shape);
  env.saved.button.onclick = () => { shape.fill = 'rgb(255, 255, 255)'; };
  const session = await env.start();
  assert.equal(await session.removeSelected(env.post), true);
  assert.equal(env.saved.button.clicks, 1);
});

test('Repost-Menü: entfernen, Zustand prüfen und weiter aktiv bleiben', async () => {
  const env = setup('reposts');
  const share = new Element('button', { 'data-e2e': 'share-icon' });
  env.root.appendChild(share);
  const item = new Element('button', { role: 'menuitem' }, 'Remove repost');
  let removed = false;
  function showMenu() {
    item.textContent = removed ? 'Repost' : 'Remove repost';
    if (!env.document.children.includes(item)) env.document.appendChild(item);
  }
  share.onEvent = showMenu;
  share.onclick = showMenu;
  item.onclick = () => { removed = true; item.textContent = 'Repost'; };
  const session = await env.start();
  assert.equal(session.config.tab, 'Reposts');
  assert.equal(await session.removeSelected(env.post), true);
  assert.equal(item.clicks, 1);
  assert.equal(env.like.button.clicks, 0);
  assert.equal(env.saved.button.clicks, 0);
  assert.equal(session.active(), true, 'Internes Escape darf den Lauf nicht stoppen');
});

test('Ein nicht aktiver Repost wird niemals neu erstellt', async () => {
  const env = setup('reposts');
  const button = new Element('button', {}, 'Repost');
  env.root.appendChild(button);
  const session = await env.start();
  assert.equal(await session.removeSelected(env.post), false);
  assert.equal(button.clicks, 0);
  assert.equal(session.active(), true);
});

test('Deutsche Repost-Entfernung wird erkannt', async () => {
  const env = setup('reposts');
  const button = new Element('button', {}, 'Repost zurücknehmen');
  button.onclick = () => { button.textContent = 'Erneut veröffentlichen'; };
  env.root.appendChild(button);
  const session = await env.start();
  assert.equal(await session.removeSelected(env.post), true);
  assert.equal(button.clicks, 1);
});

test('Unbestätigte Repost-Entfernung wird als Fehler gemeldet', async () => {
  const env = setup('reposts');
  const button = new Element('button', {}, 'Remove repost');
  env.root.appendChild(button);
  const session = await env.start();
  await assert.rejects(() => session.removeSelected(env.post), /nicht bestätigt/);
  assert.equal(button.clicks, 1);
});

test('Stopp verhindert eine weitere Repost-Aktion nach einer Wartezeit', async () => {
  const env = setup('reposts');
  const share = new Element('button', { 'data-e2e': 'share-icon' });
  share.onEvent = () => env.controls.stop.onclick();
  env.root.appendChild(share);
  const session = await env.start();
  await assert.rejects(() => session.removeSelected(env.post), /Abgebrochen/);
  assert.equal(share.clicks, 0);
});

for (const [mode, tabSelector, itemSelector] of [
  ['likes', 'liked-tab', 'user-liked-item'],
  ['saved', 'favorites-tab', 'user-favorite-item'],
  ['reposts', 'repost-tab', 'user-repost-item']
]) {
  test(mode + ': Navigation über Für dich zum richtigen Profil-Tab', async () => {
    const env = setup(mode);
    const session = await env.start();
    session.setPost(null);
    const order = [];
    const fyp = new Element('a', { 'data-e2e': 'nav-foryou' });
    fyp.onclick = () => {
      order.push('fyp'); env.sandbox.location.pathname = '/foryou';
    };
    const profile = new Element('a', { 'data-e2e': 'nav-profile' });
    profile.onclick = () => {
      order.push('profile'); env.sandbox.location.pathname = '/@test';
    };
    const tab = new Element('button', { 'data-e2e': tabSelector });
    tab.onclick = () => order.push(mode);
    const item = new Element('button', { 'data-e2e': itemSelector });
    item.scrollIntoView = () => {};
    item.onclick = () => {
      order.push('post'); session.setPost(env.post);
    };
    for (const element of [fyp, profile, tab, item]) {
      env.document.body.appendChild(element);
    }
    assert.equal(await session.openCollectionPost(), env.post);
    assert.deepEqual(order, ['fyp', 'profile', mode, 'post']);
    assert.equal(env.like.button.clicks, 0);
    assert.equal(env.saved.button.clicks, 0);
  });
}

test('Gespeichert: generische Profilkacheln ohne aria-controls werden erkannt', async () => {
  const env = setup('saved');
  const session = await env.start();
  const tab = new Element('button', { 'aria-selected': 'true' });
  const grid = new Element('div', { 'data-e2e': 'user-post-item-list' });
  const link = new Element('a', { href: '/@test/video/123?lang=de' });
  grid.appendChild(link);
  env.document.body.appendChild(grid);
  assert.equal(session.collectionEntry(session.config, tab, new Set()), link);
});

test('Gespeichert: Fotolink im sichtbaren Tabpanel ohne spezielle Kachelkennung', async () => {
  const env = setup('saved');
  const session = await env.start();
  const tab = new Element('button', { id: 'saved-tab', 'aria-selected': 'true' });
  const panel = new Element('div', { role: 'tabpanel', 'aria-labelledby': 'saved-tab' });
  const link = new Element('a', { href: '/@test/photo/456' });
  panel.appendChild(link);
  env.document.body.appendChild(panel);
  assert.equal(session.collectionEntry(session.config, tab, new Set()), link);
});

test('Versteckte Upload-Kacheln werden nicht geöffnet', async () => {
  const env = setup('saved');
  const session = await env.start();
  const tab = new Element('button', { 'aria-selected': 'true' });
  const grid = new Element('div', { 'data-e2e': 'user-post-item-list', hidden: '' });
  grid.appendChild(new Element('a', { href: '/@test/video/123' }));
  env.document.body.appendChild(grid);
  assert.equal(session.collectionEntry(session.config, tab, new Set()), null);
});

test('Noch nicht aktiver Gespeichert-Tab öffnet keine Uploads', async () => {
  const env = setup('saved');
  const session = await env.start();
  const tab = new Element('button', { 'aria-selected': 'false' });
  const grid = new Element('div', { 'data-e2e': 'user-post-item-list' });
  grid.appendChild(new Element('a', { href: '/@test/video/123' }));
  env.document.body.appendChild(grid);
  assert.equal(session.collectionEntry(session.config, tab, new Set()), null);
});

test('Bearbeitete erste Kachel wird zugunsten der nächsten übersprungen', async () => {
  const env = setup('saved');
  const session = await env.start();
  const tab = new Element('button');
  const grid = new Element('div', { 'data-e2e': 'user-post-item-list' });
  const stale = new Element('a', { href: '/@test/video/123?lang=de' });
  const next = new Element('a', { href: '/@test/photo/456' });
  grid.appendChild(stale);
  grid.appendChild(next);
  env.document.body.appendChild(grid);
  const seen = new Set(['https://www.tiktok.com/@test/video/123']);
  assert.equal(session.collectionEntry(session.config, tab, seen), next);
});

test('Sammlungsordner und fremde Links sind keine Beitragskacheln', async () => {
  const env = setup('saved');
  const session = await env.start();
  const tab = new Element('button');
  const grid = new Element('div', { 'data-e2e': 'user-post-item-list' });
  grid.appendChild(new Element('a', { href: '/@test/collection/123' }));
  grid.appendChild(new Element('a', { href: 'https://example.com/@test/video/456' }));
  env.document.body.appendChild(grid);
  assert.equal(session.collectionEntry(session.config, tab, new Set()), null);
});

test('Beiträge unterhalb des sichtbaren Bereichs können angescrollt werden', async () => {
  const env = setup('saved');
  const session = await env.start();
  const tab = new Element('button');
  const grid = new Element('div', { 'data-e2e': 'user-post-item-list' });
  const link = new Element('a', { href: '/@test/video/789' });
  link.getBoundingClientRect = () => ({ width: 200, height: 300, top: 1500, bottom: 1800, left: 100, right: 300 });
  grid.appendChild(link);
  env.document.body.appendChild(grid);
  assert.equal(session.collectionEntry(session.config, tab, new Set()), link);
});
