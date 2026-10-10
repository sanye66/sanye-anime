function trayMediaScript(hidden) {
  return `(() => {
    const state = globalThis.__sanyeTrayMedia ??= { hidden: false, installed: false };
    state.hidden = ${Boolean(hidden)};
    if (!state.installed) {
      document.addEventListener('play', event => {
        if (state.hidden && event.target instanceof HTMLVideoElement) event.target.pause();
      }, true);
      state.installed = true;
    }
    if (state.hidden) document.querySelectorAll('video').forEach(video => video.pause());
  })()`
}

module.exports = { trayMediaScript }
