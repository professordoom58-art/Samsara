(function (global) {
  "use strict";

  var audio = null;
  var tracks = [];
  var queueTracks = [];
  var baseQueueTracks = [];
  var state = null;
  var currentTrack = null;
  var currentIndex = -1;
  var objectUrl = null;
  var saveTimer = null;
  var callbacks = {};
  var audioContext = null;
  var preampNode = null;
  var equalizerFilters = [];
  var equalizerAvailable = false;
  var interruptedPlayback = false;
  var frequencies = [60, 230, 910, 3600, 14000];

  function notify(name) {
    if (callbacks[name]) {
      callbacks[name]();
    }
  }

  function savePosition() {
    if (!state || !audio) {
      return;
    }
    state.position = isFinite(audio.currentTime) ? audio.currentTime : 0;
    state.volume = audio.volume;
    SonoraStorage.save(state);
  }

  function attemptPlay() {
    var playResult;
    try {
      if (audioContext && audioContext.state === "suspended" && audioContext.resume) {
        var resumeResult = audioContext.resume();
        if (resumeResult && typeof resumeResult.catch === "function") {
          resumeResult.catch(function (error) {
            global.console.warn("Unable to resume the audio processing context.", error);
          });
        }
      }
      playResult = audio.play();
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch(function (error) {
          global.console.error("Audio playback could not start.", error);
          notify("playbackError");
        });
      }
    } catch (error) {
      global.console.error("Audio playback could not start.", error);
      notify("playbackError");
    }
  }

  function applyEqualizer() {
    var equalizer = state.equalizer;
    var i;
    if (!equalizerAvailable) {
      return;
    }
    preampNode.gain.value = equalizer.enabled ? equalizer.preamp : 0;
    for (i = 0; i < equalizerFilters.length; i += 1) {
      equalizerFilters[i].gain.value = equalizer.enabled ? equalizer.bands[i] : 0;
    }
  }

  function initializeEqualizer() {
    var Context = global.AudioContext || global.webkitAudioContext || global.mozAudioContext;
    var source;
    var previous;
    var i;
    var filter;
    if (!Context) {
      return;
    }
    try {
      audioContext = new Context();
      if (!audioContext.createMediaElementSource) {
        throw new Error("MediaElementSource is not available.");
      }
      source = audioContext.createMediaElementSource(audio);
      preampNode = audioContext.createGain();
      previous = source;
      for (i = 0; i < frequencies.length; i += 1) {
        filter = audioContext.createBiquadFilter();
        filter.type = "peaking";
        filter.frequency.value = frequencies[i];
        filter.Q.value = 0.8;
        equalizerFilters.push(filter);
        previous.connect(filter);
        previous = filter;
      }
      previous.connect(preampNode);
      preampNode.connect(audioContext.destination);
      equalizerAvailable = true;
      applyEqualizer();
    } catch (error) {
      audioContext = null;
      preampNode = null;
      equalizerFilters = [];
      equalizerAvailable = false;
      global.console.warn("Web Audio equalizer is unavailable.", error);
    }
  }

  function rememberTrack(track) {
    var recent = state.recent.filter(function (id) {
      return id !== track.id;
    });
    state.playCounts = state.playCounts || {};
    recent.unshift(track.id);
    state.recent = recent.slice(0, 50);
    state.playCounts[track.id] = (state.playCounts[track.id] || 0) + 1;
    state.currentId = track.id;
  }

  function playTrack(track, startAt) {
    var index = queueTracks.indexOf(track);
    var nextUrl;

    if (!track || !track.file) {
      return false;
    }
    if (/\.(flac)$/i.test(track.name)) {
      notify("unsupportedFlac");
      return false;
    }

    savePosition();
    currentIndex = index !== -1 ? index : tracks.indexOf(track);
    currentTrack = track;
    rememberTrack(track);
    state.position = 0;

    if (objectUrl) {
      global.URL.revokeObjectURL(objectUrl);
    }
    nextUrl = global.URL.createObjectURL(track.file);
    objectUrl = nextUrl;
    if (startAt > 0) {
      audio.addEventListener("loadedmetadata", function seekOnce() {
        audio.removeEventListener("loadedmetadata", seekOnce);
        if (isFinite(audio.duration) && startAt < audio.duration) {
          audio.currentTime = startAt;
        }
        attemptPlay();
      });
    }
    audio.src = nextUrl;
    audio.load();
    if (startAt <= 0) {
      attemptPlay();
    }
    SonoraStorage.save(state);
    notify("track");
    return true;
  }

  function next() {
    var index;
    if (!queueTracks.length) {
      return;
    }
    index = currentIndex + 1;
    if (index >= queueTracks.length) {
      if (state.repeat !== "all") {
        audio.pause();
        audio.currentTime = 0;
        notify("time");
        return;
      }
      index = 0;
    }
    playTrack(queueTracks[index], 0);
  }

  function previous() {
    var index;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      notify("time");
      return;
    }
    index = currentIndex - 1;
    if (index < 0) {
      index = state.repeat === "all" && queueTracks.length ? queueTracks.length - 1 : 0;
    }
    if (queueTracks[index]) {
      playTrack(queueTracks[index], 0);
    }
  }

  function setTracks(newTracks) {
    tracks = newTracks || [];
    baseQueueTracks = tracks.slice();
    queueTracks = state.shuffle ? shuffleQueue(baseQueueTracks, currentTrack) : baseQueueTracks.slice();
    currentIndex = -1;
    if (state.currentId) {
      tracks.some(function (track, index) {
        if (track.id === state.currentId) {
          currentTrack = track;
          currentIndex = queueTracks.indexOf(track);
          return true;
        }
        return false;
      });
    }
    notify("track");
  }

  function toggleFavourite() {
    var index;
    if (!currentTrack) {
      return false;
    }
    index = state.favourites.indexOf(currentTrack.id);
    if (index === -1) {
      state.favourites.push(currentTrack.id);
    } else {
      state.favourites.splice(index, 1);
    }
    SonoraStorage.save(state);
    notify("track");
    return index === -1;
  }

  function toggleShuffle() {
    state.shuffle = !state.shuffle;
    if (state.shuffle) {
      queueTracks = shuffleQueue(baseQueueTracks, currentTrack);
    } else {
      queueTracks = baseQueueTracks.slice();
    }
    currentIndex = currentTrack ? queueTracks.indexOf(currentTrack) : -1;
    SonoraStorage.save(state);
    notify("track");
  }

  function shuffleQueue(source, preserveTrack) {
    var current = preserveTrack && source.indexOf(preserveTrack) !== -1 ? preserveTrack : null;
    var remaining = source.filter(function (track) { return track !== current; });
    var i;
    var randomIndex;
    var temporary;
    for (i = remaining.length - 1; i > 0; i -= 1) {
      randomIndex = Math.floor(Math.random() * (i + 1));
      temporary = remaining[i];
      remaining[i] = remaining[randomIndex];
      remaining[randomIndex] = temporary;
    }
    return current ? [current].concat(remaining) : remaining;
  }

  function cycleRepeat() {
    state.repeat = state.repeat === "off" ? "all" : (state.repeat === "all" ? "one" : "off");
    SonoraStorage.save(state);
    notify("track");
  }

  function init(audioElement, savedState, eventCallbacks) {
    audio = audioElement;
    state = savedState;
    callbacks = eventCallbacks || {};
    audio.volume = state.volume;
    initializeEqualizer();
    try {
      audio.mozAudioChannelType = "content";
    } catch (error) {
      global.console.warn("Content audio channel is unavailable.", error);
    }

    audio.addEventListener("timeupdate", function () {
      if (!saveTimer) {
        saveTimer = global.setTimeout(function () {
          saveTimer = null;
          savePosition();
        }, 5000);
      }
      notify("time");
    });
    audio.addEventListener("durationchange", function () {
      if (currentTrack && isFinite(audio.duration)) {
        currentTrack.duration = audio.duration;
      }
      notify("time");
    });
    audio.addEventListener("play", function () {
      notify("playback");
    });
    audio.addEventListener("pause", function () {
      savePosition();
      notify("playback");
    });
    audio.addEventListener("ended", function () {
      if (state.repeat === "one") {
        audio.currentTime = 0;
        attemptPlay();
      } else {
        next();
      }
    });
    audio.addEventListener("error", function () {
      var code = audio.error ? audio.error.code : 0;
      global.console.error("Audio playback failed. Media error code: " + code);
      notify("playbackError");
    });
    audio.addEventListener("mozinterruptbegin", function () {
      interruptedPlayback = !audio.paused;
      if (interruptedPlayback) {
        audio.pause();
      }
    });
    audio.addEventListener("mozinterruptend", function () {
      if (interruptedPlayback) {
        interruptedPlayback = false;
        attemptPlay();
      }
    });

    global.addEventListener("pagehide", savePosition);
  }

  function restore() {
    var track = tracks.filter(function (item) {
      return item.id === state.currentId;
    })[0];
    if (track) {
      currentTrack = track;
      currentIndex = queueTracks.indexOf(track);
      notify("track");
    }
  }

  function savePlaylists() {
    SonoraStorage.save(state);
    notify("playlists");
  }

  function createPlaylist(name) {
    var playlist = {
      id: "playlist-" + new Date().getTime() + "-" + Math.floor(Math.random() * 100000),
      name: name,
      tracks: []
    };
    state.playlists.push(playlist);
    savePlaylists();
    return playlist;
  }

  function renamePlaylist(id, name) {
    var playlist = state.playlists.filter(function (item) { return item.id === id; })[0];
    if (!playlist) {
      return false;
    }
    playlist.name = name;
    savePlaylists();
    return true;
  }

  function deletePlaylist(id) {
    var before = state.playlists.length;
    state.playlists = state.playlists.filter(function (item) { return item.id !== id; });
    if (state.playlists.length !== before) {
      savePlaylists();
      return true;
    }
    return false;
  }

  function addToPlaylist(id, trackId) {
    var playlist = state.playlists.filter(function (item) { return item.id === id; })[0];
    if (!playlist) {
      return false;
    }
    if (playlist.tracks.indexOf(trackId) === -1) {
      playlist.tracks.push(trackId);
      savePlaylists();
    }
    return true;
  }

  function removeFromPlaylist(id, trackId) {
    var playlist = state.playlists.filter(function (item) { return item.id === id; })[0];
    var index;
    if (!playlist) {
      return false;
    }
    index = playlist.tracks.indexOf(trackId);
    if (index === -1) {
      return false;
    }
    playlist.tracks.splice(index, 1);
    savePlaylists();
    return true;
  }

  function movePlaylistItem(id, from, to) {
    var playlist = state.playlists.filter(function (item) { return item.id === id; })[0];
    var trackId;
    if (!playlist || from < 0 || from >= playlist.tracks.length || to < 0 || to >= playlist.tracks.length) {
      return false;
    }
    trackId = playlist.tracks.splice(from, 1)[0];
    playlist.tracks.splice(to, 0, trackId);
    savePlaylists();
    return true;
  }

  function setEqualizer(equalizer) {
    var i;
    if (equalizer.enabled !== undefined) {
      state.equalizer.enabled = Boolean(equalizer.enabled);
    }
    if (equalizer.preset !== undefined) {
      state.equalizer.preset = equalizer.preset;
    }
    if (isFinite(equalizer.preamp)) {
      state.equalizer.preamp = Math.max(-12, Math.min(12, equalizer.preamp));
    }
    if (equalizer.bands) {
      for (i = 0; i < 5; i += 1) {
        if (isFinite(equalizer.bands[i])) {
          state.equalizer.bands[i] = Math.max(-12, Math.min(12, equalizer.bands[i]));
        }
      }
    }
    SonoraStorage.save(state);
    applyEqualizer();
    notify("equalizer");
  }

  function setQueue(newQueue, startTrack) {
    baseQueueTracks = (newQueue || []).slice();
    queueTracks = state.shuffle ? shuffleQueue(baseQueueTracks, startTrack || currentTrack) : baseQueueTracks.slice();
    currentIndex = -1;
    if (startTrack) {
      playTrack(startTrack, 0);
    } else {
      notify("queue");
    }
  }

  function moveQueueItem(from, to) {
    var item;
    if (from < 0 || from >= queueTracks.length || to < 0 || to >= queueTracks.length) {
      return false;
    }
    item = queueTracks.splice(from, 1)[0];
    queueTracks.splice(to, 0, item);
    baseQueueTracks = queueTracks.slice();
    currentIndex = queueTracks.indexOf(currentTrack);
    notify("queue");
    return true;
  }

  global.SonoraPlayer = {
    init: init,
    setTracks: setTracks,
    restore: restore,
    playTrack: playTrack,
    togglePlay: function () {
      if (!currentTrack) {
        return;
      }
      if (audio.paused) {
        if (!audio.src) {
          playTrack(currentTrack, state.position);
        } else {
          attemptPlay();
        }
      } else {
        audio.pause();
      }
    },
    next: next,
    previous: previous,
    seek: function (value) {
      if (isFinite(audio.duration)) {
        audio.currentTime = Math.max(0, Math.min(audio.duration, value));
      }
    },
    setVolume: function (value) {
      audio.volume = Math.max(0, Math.min(1, Math.round(value * 14) / 14));
      state.volume = audio.volume;
      SonoraStorage.save(state);
    },
    toggleFavourite: toggleFavourite,
    isFavourite: function (track) {
      return Boolean(track && state.favourites.indexOf(track.id) !== -1);
    },
    toggleShuffle: toggleShuffle,
    cycleRepeat: cycleRepeat,
    createPlaylist: createPlaylist,
    renamePlaylist: renamePlaylist,
    deletePlaylist: deletePlaylist,
    addToPlaylist: addToPlaylist,
    removeFromPlaylist: removeFromPlaylist,
    movePlaylistItem: movePlaylistItem,
    setEqualizer: setEqualizer,
    isEqualizerAvailable: function () { return equalizerAvailable; },
    getTracks: function () {
      return tracks;
    },
    getQueue: function () {
      return queueTracks;
    },
    setQueue: setQueue,
    moveQueueItem: moveQueueItem,
    getCurrentTrack: function () {
      return currentTrack;
    },
    getCurrentIndex: function () {
      return currentIndex;
    },
    getState: function () {
      return state;
    },
    getAudio: function () {
      return audio;
    }
  };
}(window));
