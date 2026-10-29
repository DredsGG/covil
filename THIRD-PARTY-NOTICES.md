# Third-party software

The Windows app bundles these projects. Their licenses apply to their own code. The interface (React, LiveKit client, noise suppression and fonts) is served by the Covil server, which lists its own components.

| Project | Version | License | Used for |
|---|---|---|---|
| [Electron](https://github.com/electron/electron) | 45.0.0 | MIT (Chromium: BSD-3-Clause and others, see `LICENSES.chromium.html` in the build) | Windows app |
| [uiohook-napi](https://github.com/SnosMe/uiohook-napi) | 1.5.5 | MIT | Global shortcuts and push-to-talk (key down and key up while a game has focus) |
| [libuiohook](https://github.com/kwhat/libuiohook) (inside uiohook-napi) | — | LGPL-3.0-or-later | Same. It is loaded at runtime as a separate native module (`uiohook-napi.node`); its source ships in `resources/app/node_modules/uiohook-napi/libuiohook` and is available at the link. Covil itself stays MIT. |
| [electron-builder](https://github.com/electron-userland/electron-builder) / [NSIS](https://nsis.sourceforge.io/) | 26.18.0 / 3 | MIT / zlib | Windows installer (Covil-Setup) |
