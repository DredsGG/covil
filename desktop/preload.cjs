// Ponte segura entre a página do Covil e o app Windows (desde a v0.7.0 só app: o servidor é o Covil Servidor).
const { contextBridge, ipcRenderer } = require('electron');

// síncrono: o contextBridge copia os valores na hora de expor
const info = ipcRenderer.sendSync('covil:info-sync') || { version: '', isHost: false };
const ready = Promise.resolve();
const call = (ch, ...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('covilDesktop', {
  version: info.version,
  isHost: false,
  servidorFixo: !!info.servidorFixo,
  idioma: info.idioma || '',
  ready: () => ready,
  getSources: () => call('covil:sources'),
  prepareShare: (pick) => call('covil:prepareShare', pick),
  openExternal: (url) => call('covil:openExternal', url),
  getConfig: () => call('covil:getConfig'),
  setConfig: (p) => call('covil:setConfig', p),
  changeServer: () => call('covil:changeServer'),
  checkUpdate: () => call('covil:checkUpdate'),
  ultimaVersao: () => call('covil:ultimaVersao'),
  installUpdate: (i) => call('covil:installUpdate', i),
  onProgresso: (fn) => {
    const h = (_e, p) => fn(p);
    ipcRenderer.on('covil:progresso', h);
    return () => ipcRenderer.removeListener('covil:progresso', h);
  },
  choose: (c) => call('covil:choose', c),
  reconectar: () => call('covil:reconectar'),
  setAtalhos: (lista) => call('covil:setAtalhos', lista),
  idleSeconds: () => call('covil:idle'),
  onShortcut: (fn) => {
    const h = (_e, name) => fn(name);
    ipcRenderer.on('covil:atalho', h);
    return () => ipcRenderer.removeListener('covil:atalho', h);
  },
  // v0.5.9: versões antigas do Covil no PC
  restos: {
    listar: () => call('covil:restos', 'listar'),
    apagar: (caminhos) => call('covil:restos', 'apagar', caminhos),
    dispensar: (caminhos) => call('covil:restos', 'dispensar', caminhos),
  },
  // v0.5.4: jogando agora
  jogos: {
    estado: () => call('covil:jogos', 'estado'),
    programas: () => call('covil:jogos', 'programas'),
    registrar: (p) => call('covil:jogos', 'registrar', p),
    remover: (caminho) => call('covil:jogos', 'remover', caminho),
    mostrar: (sim) => call('covil:jogos', 'mostrar', sim),
    otimizado: (sim) => call('covil:jogos', 'otimizado', !!sim),
    onJogo: (fn) => {
      const h = (_e, j) => fn(j);
      ipcRenderer.on('covil:jogo', h);
      return () => ipcRenderer.removeListener('covil:jogo', h);
    },
  },
});
