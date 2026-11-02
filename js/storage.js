(function (global) {
  "use strict";

  var KEY = "sonora-state-v1";
  var cachedState = null;

  function defaults() {
    return {
      favourites: [],
      recent: [],
      playCounts: {},
      currentId: null,
      position: 0,
      volume: 0.8,
      shuffle: false,
      repeat: "off",
      playlists: [],
      metadata: {},
      equalizer: {
        enabled: false,
        preamp: 0,
        bands: [0, 0, 0, 0, 0],
        preset: "Flat"
      }
    };
  }

  function load() {
    var state = defaults();
    var raw;

    if (cachedState) {
      return cachedState;
    }

    try {
      raw = global.localStorage.getItem(KEY);
      if (raw) {
        state = JSON.parse(raw);
      }
    } catch (error) {
      global.console.error("Unable to load saved player settings.", error);
      state = defaults();
    }

    if (!state || typeof state !== "object") {
      state = defaults();
    }

    state.favourites = Array.isArray(state.favourites) ? state.favourites : [];
    state.recent = Array.isArray(state.recent) ? state.recent : [];
    state.playCounts = state.playCounts && typeof state.playCounts === "object" ? state.playCounts : {};
    state.position = isFinite(state.position) ? state.position : 0;
    state.volume = isFinite(state.volume) ? Math.max(0, Math.min(1, state.volume)) : 0.8;
    state.shuffle = Boolean(state.shuffle);
    state.repeat = state.repeat === "all" || state.repeat === "one" ? state.repeat : "off";
    state.playlists = Array.isArray(state.playlists) ? state.playlists : [];
    state.playlists = state.playlists.filter(function (playlist) {
      return playlist && typeof playlist.id === "string" && typeof playlist.name === "string";
    });
    state.playlists.forEach(function (playlist) {
      playlist.tracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
    });
    state.metadata = state.metadata && typeof state.metadata === "object" ? state.metadata : {};
    state.equalizer = state.equalizer && typeof state.equalizer === "object" ? state.equalizer : defaults().equalizer;
    state.equalizer.enabled = Boolean(state.equalizer.enabled);
    state.equalizer.preamp = isFinite(state.equalizer.preamp) ? Math.max(-12, Math.min(12, state.equalizer.preamp)) : 0;
    state.equalizer.bands = Array.isArray(state.equalizer.bands) ? state.equalizer.bands.slice(0, 5) : [0, 0, 0, 0, 0];
    while (state.equalizer.bands.length < 5) {
      state.equalizer.bands.push(0);
    }
    state.equalizer.bands = state.equalizer.bands.map(function (gain) {
      return isFinite(gain) ? Math.max(-12, Math.min(12, gain)) : 0;
    });
    cachedState = state;
    return state;
  }

  function save(state) {
    try {
      cachedState = state;
      global.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (error) {
      global.console.error("Unable to save player settings.", error);
    }
  }

  function getMetadata(id) {
    var state = cachedState || load();
    return state.metadata[id] || null;
  }

  function setMetadata(id, metadata) {
    var state = load();
    state.metadata[id] = metadata;
    save(state);
  }

  global.SonoraStorage = {
    load: load,
    save: save,
    getMetadata: getMetadata,
    setMetadata: setMetadata
  };
}(window));
