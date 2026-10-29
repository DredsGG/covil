// Atalhos globais do app Windows (v0.5.0): valem com o Covil em segundo plano, inclusive dentro do jogo.
// Usa o uiohook-napi (MIT; inclui a libuiohook, LGPL-3.0) para saber quando a tecla é APERTADA e SOLTA,
// o que o globalShortcut do Electron não dá (apertar para falar precisa do "solta"). O uiohook só escuta:
// a tecla continua chegando no jogo. Se o módulo não carregar, os atalhos de liga/desliga caem no
// globalShortcut e o apertar para falar funciona só com a janela do Covil em foco.
import { createRequire } from 'node:module';
import { globalShortcut } from 'electron';

const require = createRequire(import.meta.url);
let hook = null;
let Key = null;
try { ({ uIOhook: hook, UiohookKey: Key } = require('uiohook-napi')); } catch (e) { hook = null; console.warn('[covil] uiohook indisponível:', e?.message || e); }

// KeyboardEvent.code (o que a tela grava) -> nome do uiohook
function codigoParaUio(code) {
  if (!Key || !code) return null;
  const m = /^Key([A-Z])$/.exec(code) || /^Digit(\d)$/.exec(code);
  if (m) return Key[m[1]];
  const map = {
    ControlLeft: 'Ctrl', ControlRight: 'CtrlRight', ShiftLeft: 'Shift', ShiftRight: 'ShiftRight', AltLeft: 'Alt', AltRight: 'AltRight',
    MetaLeft: 'Meta', MetaRight: 'MetaRight', NumpadEnter: 'NumpadEnter', IntlBackslash: 'Backslash',
  };
  const nome = map[code] || code;
  return Key[nome] ?? null;
}
// tecla -> nome do globalShortcut (plano B)
function acelerador(a) {
  if (!a?.code) return null;
  const k = /^Key([A-Z])$/.exec(a.code)?.[1] || /^Digit(\d)$/.exec(a.code)?.[1] || (/^F\d{1,2}$/.test(a.code) ? a.code : null) || (/^Numpad(\d)$/.exec(a.code) ? 'num' + a.code.slice(6) : null)
    || { Space: 'Space', Backquote: '`', Minus: '-', Equal: '=', Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' }[a.code];
  if (!k) return null;
  return [a.ctrl && 'CommandOrControl', a.alt && 'Alt', a.shift && 'Shift', a.meta && 'Super', k].filter(Boolean).join('+');
}

export function criarAtalhos(enviar) {
  let lista = {}; // acao -> { code | mouse, ctrl, shift, alt, meta }
  const presos = new Set(); // ações seguradas agora
  let ligado = false;
  const mods = { ctrl: false, shift: false, alt: false, meta: false };
  const ehMod = (kc) => {
    if (!Key) return null;
    if (kc === Key.Ctrl || kc === Key.CtrlRight) return 'ctrl';
    if (kc === Key.Shift || kc === Key.ShiftRight) return 'shift';
    if (kc === Key.Alt || kc === Key.AltRight) return 'alt';
    if (kc === Key.Meta || kc === Key.MetaRight) return 'meta';
    return null;
  };
  function casa(a, e) {
    const kc = codigoParaUio(a.code);
    if (kc == null || kc !== e.keycode) return false;
    if (ehMod(kc)) return true; // atalho que é só Ctrl/Shift/Alt
    return !!a.ctrl === !!(e.ctrlKey || mods.ctrl) && !!a.shift === !!(e.shiftKey || mods.shift) && !!a.alt === !!(e.altKey || mods.alt);
  }
  function baixo(e, mouse) {
    if (!mouse) { const m = ehMod(e.keycode); if (m) mods[m] = true; }
    for (const [acao, a] of Object.entries(lista)) {
      const ok = mouse ? a.mouse && a.mouse === e.button : casa(a, e);
      if (!ok || presos.has(acao)) continue;
      presos.add(acao);
      enviar(acao, 'down');
    }
  }
  function cima(e, mouse) {
    if (!mouse) { const m = ehMod(e.keycode); if (m) mods[m] = false; }
    for (const [acao, a] of Object.entries(lista)) {
      if (!presos.has(acao)) continue;
      const ok = mouse ? a.mouse === e.button : codigoParaUio(a.code) === e.keycode;
      if (!ok) continue;
      presos.delete(acao);
      enviar(acao, 'up');
    }
  }
  function ligarHook() {
    if (!hook || ligado) return !!hook;
    try {
      hook.on('keydown', (e) => baixo(e, false));
      hook.on('keyup', (e) => cima(e, false));
      // uiohook: botões laterais do mouse são 4 e 5 (como "Mouse 4" e "Mouse 5" da tela)
      hook.on('mousedown', (e) => { if (e.button >= 4) baixo(e, true); });
      hook.on('mouseup', (e) => { if (e.button >= 4) cima(e, true); });
      hook.start();
      ligado = true;
    } catch (e) { console.warn('[covil] uiohook não iniciou:', e?.message || e); hook = null; }
    return ligado;
  }
  return {
    definir(nova) {
      lista = {};
      for (const [k, v] of Object.entries(nova || {})) if (v && (v.code || v.mouse)) lista[k] = v;
      presos.clear();
      if (ligarHook()) return { global: true };
      // plano B: só liga/desliga, pelo globalShortcut
      globalShortcut.unregisterAll();
      for (const [acao, a] of Object.entries(lista)) {
        if (acao === 'falar') continue;
        const acc = acelerador(a);
        if (acc) { try { globalShortcut.register(acc, () => enviar(acao, 'down')); } catch {} }
      }
      return { global: false };
    },
    parar() { try { if (ligado) hook.stop(); } catch {} globalShortcut.unregisterAll(); },
    disponivel: () => !!hook,
  };
}
