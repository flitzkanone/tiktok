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
    this.events = {};
    this.captured = new Set();
  }
  appendChild(child) { child.parentElement = this; this.children.push(child); }
  getAttribute(name) { return this.attrs[name] ?? (name === 'id' ? this.id : null) ?? null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  focus() { this.focused = true; }
  addEventListener(type, callback) { (this.events[type] ||= []).push(callback); }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
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
  dispatchEvent(event) {
    if (this.onEvent) this.onEvent(event);
    for (const callback of this.events[event.type] || []) callback(event);
  }
}

function setup(mode, options = {}) {
  const controls = Object.fromEntries(['mode', 'delay', 'start', 'stop', 'status',
    'panel', 'drag', 'launcher', 'hide', 'reset-position', 'status-card', 'run-label']
    .map(id => [id, new Element()]));
  controls.panel.offsetWidth = 340;
  controls.panel.offsetHeight = 430;
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
  const window = new Element();
  window.top = window;
  window.self = window;
  const storage = options.storage || new Map();
  const localStorage = options.blockStorage ? {
    getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }
  } : {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value)
  };
  const sandbox = {
    localStorage,
    document, window, innerHeight: 900, innerWidth: 1200,
    location: { href: 'https://www.tiktok.com/@test/video/1', pathname: '/@test/video/1', origin: 'https://www.tiktok.com' },
    URL, Date: { now: () => clock },
    getComputedStyle: el => ({ display: el.display || 'block', visibility: 'visible', fill: el.fill || 'none' }),
    setTimeout: (callback, ms) => { clock += ms; if (options.onSleep) options.onSleep(clock); queueMicrotask(callback); },
    KeyboardEvent: class { constructor(type, data) { this.type = type; Object.assign(this, data); } },
    MouseEvent: class { constructor(type, data) { this.type = type; Object.assign(this, data); } }
  };
  const source = fs.readFileSync(path.join(__dirname, '../tiktok-entliken.user.js'), 'utf8')
    .replace('    try {\n      // Gespeicherte', `    globalThis.session = {
      liked, removeSelected, confirmInactive, getRepostState, openCollectionPost, collectionEntry, collectionPanel, previewKey, config,
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
    controls, root, document, sandbox, like, saved, post, storage,
    reload: () => vm.runInNewContext(source, sandbox),
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

function pointer(target, type, x, y, pointerId = 1) {
  target.dispatchEvent({ type, button: 0, pointerId, clientX: x, clientY: y, preventDefault() {} });
}

test('UI: ausblenden und oben wieder öffnen ohne eine Aktion auszuführen', () => {
  const env = setup('likes');
  env.controls.hide.click();
  assert.equal(env.controls.panel.hidden, true);
  assert.equal(env.controls.launcher.getAttribute('aria-expanded'), 'false');
  env.controls.launcher.click();
  assert.equal(env.controls.panel.hidden, false);
  assert.equal(env.controls.launcher.getAttribute('aria-expanded'), 'true');
  assert.equal(env.like.button.clicks, 0);
});

test('UI: ein ausgeblendeter Vorgang bleibt aktiv und kann per Esc gestoppt werden', async () => {
  const env = setup('likes');
  const session = await env.start();
  env.controls.hide.click();
  assert.equal(session.active(), true);
  assert.equal(env.controls.launcher.getAttribute('data-running'), 'true');
  env.document.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(session.active(), false);
  assert.equal(env.controls.launcher.getAttribute('data-running'), 'false');
});

test('UI: Drag wird am Fensterrand begrenzt und gespeichert', () => {
  const env = setup('likes');
  pointer(env.controls.drag, 'pointerdown', 850, 100);
  pointer(env.controls.drag, 'pointermove', -1000, -1000);
  pointer(env.controls.drag, 'pointerup', -1000, -1000);
  assert.equal(env.controls.panel.style.left, '12px');
  assert.equal(env.controls.panel.style.top, '12px');
  assert.equal(env.controls.drag.hasPointerCapture(1), false);
  const stored = JSON.parse(env.storage.get('flitzkanone.tiktok-cleanup.ui.v1'));
  assert.equal(stored.x, 12);
  assert.equal(stored.y, 12);
});

test('UI: Position und Ausblendung werden nach erneutem Laden wiederhergestellt', () => {
  const env = setup('likes');
  pointer(env.controls.drag, 'pointerdown', 850, 100);
  pointer(env.controls.drag, 'pointermove', 500, 250);
  pointer(env.controls.drag, 'pointerup', 500, 250);
  env.controls.hide.click();
  const reloaded = setup('likes', { storage: env.storage });
  assert.equal(reloaded.controls.panel.hidden, true);
  assert.equal(reloaded.controls.panel.style.left, env.controls.panel.style.left);
  assert.equal(reloaded.controls.panel.style.top, env.controls.panel.style.top);
  assert.equal(reloaded.like.button.clicks, 0);
});

test('UI: kleineres Fenster hält das geöffnete Panel erreichbar', () => {
  const env = setup('likes');
  env.sandbox.innerWidth = 390;
  env.sandbox.innerHeight = 500;
  env.sandbox.window.dispatchEvent({ type: 'resize' });
  assert.ok(parseFloat(env.controls.panel.style.left) <= 38);
  assert.ok(parseFloat(env.controls.panel.style.top) <= 58);
});

test('UI: Tastatur verschiebt und setzt die Position zurück', () => {
  const env = setup('likes');
  const initial = parseFloat(env.controls.panel.style.left);
  env.controls.drag.dispatchEvent({ type: 'keydown', key: 'ArrowLeft', preventDefault() {} });
  assert.equal(parseFloat(env.controls.panel.style.left), initial - 10);
  env.controls.drag.dispatchEvent({ type: 'keydown', key: 'Home', preventDefault() {} });
  assert.equal(parseFloat(env.controls.panel.style.left), initial);
});

test('UI: Alt+Shift+K öffnet ein ausgeblendetes Panel', () => {
  const env = setup('likes');
  env.controls.hide.click();
  env.document.dispatchEvent({ type: 'keydown', code: 'KeyK', altKey: true, shiftKey: true, preventDefault() {} });
  assert.equal(env.controls.panel.hidden, false);
});

test('UI: blockierter lokaler Speicher verhindert die Bedienung nicht', () => {
  const env = setup('likes', { blockStorage: true });
  env.controls.hide.click();
  env.controls.launcher.click();
  assert.equal(env.controls.panel.hidden, false);
});

for (const mode of ['likes', 'saved']) {
  test(mode + ': verzögerte Anzeige wird ohne zweiten Klick bestätigt', async () => {
    let button;
    const env = setup(mode, { onSleep: clock => {
      if (button) button.attrs['aria-pressed'] = String(clock < 2100);
    } });
    button = env[mode === 'likes' ? 'like' : 'saved'].button;
    button.onclick = () => {};
    const session = await env.start();
    assert.equal(await session.removeSelected(env.post), true);
    assert.equal(button.clicks, 1);
  });
  test(mode + ': dauerhafter Rücksprung wird nicht als Erfolg behandelt', async () => {
    let button;
    const env = setup(mode, { onSleep: clock => {
      if (button && clock >= 600) button.attrs['aria-pressed'] = 'true';
    } });
    button = env[mode === 'likes' ? 'like' : 'saved'].button;
    const session = await env.start();
    await assert.rejects(() => session.removeSelected(env.post), /nicht sicher bestätigt/);
    assert.equal(button.clicks, 1);
  });
}

test('Abschlussprüfung wartet auf stabilen Zustand ohne erneuten Klick', async () => {
  const env = setup('likes', { onSleep: clock => {
    if (clock >= 1800) env.like.button.attrs['aria-pressed'] = 'false';
  } });
  const session = await env.start();
  await session.confirmInactive(env.post.key);
  assert.equal(env.like.button.clicks, 0);
});

test('Like: weißes Herz mit veraltetem aktivem Attribut wird niemals geklickt', async () => {
  const env = setup('likes');
  const shape = new Element('svg');
  shape.fill = 'rgb(255, 255, 255)';
  env.like.icon.appendChild(shape);
  const session = await env.start();
  await assert.rejects(() => session.removeSelected(env.post), /widersprüchlich/);
  assert.equal(env.like.button.clicks, 0);
});

test('Like: Wechsel zu inaktiv vor dem Klick setzt keinen neuen Like', async () => {
  const env = setup('likes', { onSleep: () => {
    env.like.button.attrs['aria-pressed'] = 'false';
  } });
  const session = await env.start();
  assert.equal(await session.removeSelected(env.post), false);
  assert.equal(env.like.button.clicks, 0);
});

test('Like: nach erneut aktivem Zustand auch bei Neustart kein zweiter Klick', async () => {
  const env = setup('likes');
  let session = await env.start();
  assert.equal(await session.removeSelected(env.post), true);
  env.like.button.attrs['aria-pressed'] = 'true';
  env.controls.stop.click();
  session = await env.start();
  await assert.rejects(() => session.removeSelected(env.post), /bereits angeklickt/);
  assert.equal(env.like.button.clicks, 1);
});

test('Like: widersprüchliche Beschriftung und Attribut stoppen ohne Klick', async () => {
  const env = setup('likes');
  env.like.button.attrs['aria-label'] = 'Like';
  const session = await env.start();
  await assert.rejects(() => session.removeSelected(env.post), /widersprüchlich/);
  assert.equal(env.like.button.clicks, 0);
});

test('Zweite Script-Kopie erzeugt weder ein zweites Menü noch neue Listener', () => {
  const env = setup('likes');
  const start = env.controls.start.onclick;
  env.reload();
  assert.equal(env.document.querySelectorAll('[id="tt-cleanup-root"]').length, 1);
  assert.equal(env.controls.start.onclick, start);
});
