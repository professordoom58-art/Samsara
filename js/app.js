(function (global) {
  "use strict";

  var screen = document.getElementById("screen");
  var appScreen = screen;
  var audio = document.getElementById("audio");
  var status = document.getElementById("status-message");
  var filePicker = document.getElementById("music-file-picker");
  var state = SonoraStorage.load();
  var tracks = [];
  var persistedTracks = [];
  var activeScreen = "library";
  var searchTerm = "";
  var sortBy = "title";
  var scanGeneration = 0;
  var statusTimer = null;
  var selectedPlaylistId = null;
  var selectedGroup = null;
  var artworkUrls = [];
  var focusedTrackIndex = 0;
  var focusedSettingIndex = 0;
  var playerFocusIndex = 2;
  var presentationBoard = false;
  var importedTrackIds = {};
  var playerPresets = {
    "Flat": [0, 0, 0, 0, 0],
    "Bass Boost": [7, 5, 1, 0, 0],
    "Vocal": [-2, 1, 4, 3, 1],
    "Nothing Dot": [4, -2, 3, -2, 4],
    "Treble": [-1, 0, 2, 5, 7]
  };

  function setStatus(message) {
    status.textContent = message;
    status.className = "status-message visible";
    if (statusTimer) {
      global.clearTimeout(statusTimer);
    }
    statusTimer = global.setTimeout(function () {
      status.className = "status-message";
      statusTimer = null;
    }, 3500);
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) {
      return "--:--";
    }
    seconds = Math.floor(seconds);
    return Math.floor(seconds / 60) + ":" + ("0" + (seconds % 60)).slice(-2);
  }

  function makeElement(tag, className, text) {
    var element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  function makeButton(text, action, className) {
    var button = makeElement("button", className || "action-button", text);
    button.type = "button";
    button.setAttribute("data-action", action);
    return button;
  }

  function showEmpty(title, message, action) {
    var wrap = makeElement("div", "empty-state");
    wrap.appendChild(makeElement("strong", "", title));
    wrap.appendChild(makeElement("span", "", message));
    if (action) {
      wrap.appendChild(makeButton("Rescan", "scan"));
    }
    screen.appendChild(wrap);
  }

  function makeTrackRow(track, index, number, showAdd) {
    var item = makeElement("div", "track-item");
    var button = makeElement("button", "track-row");
    var order = makeElement("span", "track-index", String(number));
    var copy = makeElement("span", "track-copy");
    var title = makeElement("span", "track-title", track.title);
    var artist = makeElement("span", "track-artist", track.artist);
    var duration = makeElement("span", "track-duration", track.duration ? formatTime(track.duration) : "");

    button.type = "button";
    button.setAttribute("data-action", "play-track");
    button.setAttribute("data-index", String(index));
    copy.appendChild(title);
    copy.appendChild(artist);
    button.appendChild(order);
    button.appendChild(copy);
    button.appendChild(duration);
    item.appendChild(button);
    if (showAdd && selectedPlaylistId) {
      var add = makeButton("+", "add-playlist-track", "row-action");
      add.setAttribute("data-track-id", track.id);
      add.setAttribute("aria-label", "Add " + track.title + " to playlist");
      item.appendChild(add);
    }
    return item;
  }

  function renderTrackRows(items, title, mode, playlist) {
    var heading = makeElement("div", "section-heading");
    var list = makeElement("div", "track-list");
    var i;
    var index;
    heading.appendChild(makeElement("h1", "", title));
    heading.appendChild(makeElement("span", "muted", items.length + " tracks"));
    screen.appendChild(heading);
    if (!items.length) {
      showEmpty("No tracks", "Scan your music storage or add tracks from the library.", mode !== "library");
      return;
    }
    for (i = 0; i < items.length; i += 1) {
      index = tracks.indexOf(items[i]);
      if (index < 0) {
        continue;
      }
      var row = makeTrackRow(items[i], index, i + 1, mode !== "playlist");
      if (mode === "playlist") {
        var moveUp = makeButton("↑", "playlist-up", "row-action");
        moveUp.setAttribute("data-playlist-id", playlist.id);
        moveUp.setAttribute("data-index", String(i));
        row.appendChild(moveUp);
        var moveDown = makeButton("↓", "playlist-down", "row-action");
        moveDown.setAttribute("data-playlist-id", playlist.id);
        moveDown.setAttribute("data-index", String(i));
        row.appendChild(moveDown);
        var remove = makeButton("−", "remove-playlist-track", "row-action");
        remove.setAttribute("data-playlist-id", playlist.id);
        remove.setAttribute("data-track-id", items[i].id);
        remove.setAttribute("aria-label", "Remove " + items[i].title + " from playlist");
        row.appendChild(remove);
      }
      list.appendChild(row);
    }
    screen.appendChild(list);
  }

  function visibleTracks() {
    var term = searchTerm.toLowerCase();
    return tracks.filter(function (track) {
      return !term || (track.title + " " + track.artist + " " + track.album).toLowerCase().indexOf(term) !== -1;
    });
  }

  function renderLibrary() {
    var heading = makeElement("div", "matrix-heading library-heading");
    var list = makeElement("div", "matrix-track-list");
    var title = makeElement("h1", "matrix-title");
    var note = makeElement("span", "heading-note", "\u266B");
    var indexLabel = makeElement("span", "track-counter");
    var visible = tracks.slice().sort(SonoraLibrary.compareTracks);
    var currentIndex = Math.max(0, Math.min(focusedTrackIndex, Math.max(visible.length - 1, 0)));
    var first = Math.max(0, Math.min(currentIndex - 2, visible.length - 6));
    var last = Math.min(visible.length, first + 6);
    var i;
    title.textContent = "MUSIC LIBRARY";
    heading.appendChild(note);
    heading.appendChild(title);
    indexLabel.textContent = visible.length ? (currentIndex + 1) + "/" + visible.length : "0/0";
    heading.appendChild(indexLabel);
    screen.appendChild(heading);
    if (!visible.length) {
      var empty = makeElement("div", "matrix-empty");
      empty.appendChild(makeElement("strong", "", "NO MUSIC LOADED"));
      empty.appendChild(makeElement("span", "", "Load audio files or scan device storage."));
      empty.appendChild(makeButton("Load music", "load-music", "load-music-inline"));
      list.appendChild(empty);
    } else {
      for (i = first; i < last; i += 1) {
        var track = visible[i];
        var row = makeButton("", "select-track", "matrix-track-row" + (i === currentIndex ? " focused" : ""));
        var playing = track.id === (SonoraPlayer.getCurrentTrack() || {}).id;
        var number = makeElement("span", "matrix-track-number", ("0" + (i + 1)).slice(-2));
        var copy = makeElement("span", "matrix-track-copy");
        copy.appendChild(makeElement("span", "matrix-track-title", track.title));
        copy.appendChild(makeElement("span", "matrix-track-artist", track.artist));
        row.setAttribute("data-track-id", track.id);
        row.setAttribute("data-index", String(tracks.indexOf(track)));
        row.setAttribute("data-visible-index", String(i));
        row.appendChild(number);
        row.appendChild(copy);
        if (playing) {
          row.appendChild(makeElement("span", "playing-equalizer", "\u2582\u2585\u2583\u2586"));
        }
        list.appendChild(row);
      }
      if (visible.length > 6) {
        var scrollbar = makeElement("span", "matrix-scrollbar");
        var thumb = makeElement("span", "matrix-scroll-thumb");
        var thumbHeight = Math.max(14, 100 * 6 / visible.length);
        thumb.style.height = thumbHeight + "%";
        thumb.style.top = ((100 - thumbHeight) * currentIndex / Math.max(1, visible.length - 1)) + "%";
        scrollbar.appendChild(thumb);
        list.appendChild(scrollbar);
      }
    }
    screen.appendChild(list);
    screen.className = "screen screen-library";
  }

  function getArtworkUrl(track) {
    if (!track.artwork) {
      return "";
    }
    if (!track._artworkUrl) {
      track._artworkUrl = global.URL.createObjectURL(track.artwork);
      artworkUrls.push(track._artworkUrl);
    }
    return track._artworkUrl;
  }

  function renderPlayer() {
    var track = SonoraPlayer.getCurrentTrack();
    var playerState = SonoraPlayer.getState();
    var currentTime = audio.currentTime || 0;
    var duration = isFinite(audio.duration) ? audio.duration : 0;
    var wrapper = makeElement("section", "now-playing-view");
    var upper = makeElement("div", "now-upper");
    var artworkWrap = makeElement("div", "artwork-wrap");
    var artwork = makeElement("div", "artwork-frame");
    var artworkUrl = track ? getArtworkUrl(track) : "";
    var info = makeElement("div", "now-track-info");
    var title = makeElement("h1", "now-track-title", track ? track.title : "NO TRACK");
    var artist = makeElement("p", "now-track-artist", track ? track.artist : "Load music to begin");
    var statusLine = makeElement("p", "playback-status");
    var statusIcon = makeElement("span", "playback-status-icon", audio.paused ? "\u25B6" : "\u25B6");
    statusLine.appendChild(statusIcon);
    statusLine.appendChild(document.createTextNode(audio.paused ? "PAUSED" : "PLAYING"));
    artworkWrap.appendChild(makeElement("span", "artwork-dots", ""));
    if (artworkUrl) {
      var cover = makeElement("img", "artwork-cover");
      cover.src = artworkUrl;
      cover.alt = "";
      artwork.appendChild(cover);
      artwork.className += " has-cover";
    } else {
      artwork.appendChild(makeElement("span", "dot-sphere", ""));
      artwork.appendChild(makeElement("span", "sphere-accent", ""));
    }
    artworkWrap.appendChild(artwork);
    info.appendChild(title);
    info.appendChild(artist);
    info.appendChild(statusLine);
    upper.appendChild(artworkWrap);
    upper.appendChild(info);
    wrapper.appendChild(upper);

    var progressRow = makeElement("div", "now-progress-row");
    var elapsed = makeElement("span", "progress-time", formatTime(currentTime));
    var seek = makeElement("input", "seek now-seek");
    var remaining = makeElement("span", "progress-time", "-" + formatTime(Math.max(0, duration - currentTime)));
    seek.type = "range";
    seek.min = "0";
    seek.max = String(duration || 100);
    seek.value = String(duration ? Math.min(currentTime, duration) : 0);
    seek.id = "playback-seek";
    seek.setAttribute("aria-label", "Playback position");
    seek.setAttribute("data-player-control", "scrubber");
    seek.style.background = seekBackground(currentTime, duration);
    elapsed.id = "current-time";
    remaining.id = "remaining-time";
    progressRow.appendChild(elapsed);
    progressRow.appendChild(seek);
    progressRow.appendChild(remaining);
    wrapper.appendChild(progressRow);

    var controls = makeElement("div", "now-controls");
    var controlSpecs = [
      [playerState.shuffle ? "\u21C4" : "\u21C4", "shuffle", "Shuffle", playerState.shuffle ? " active" : ""],
      ["|\u25C0", "previous", "Previous", ""],
      [audio.paused ? "\u25B6" : "\u275A\u275A", "toggle-play", audio.paused ? "Play" : "Pause", " primary-control"],
      ["\u25B6|", "next", "Next", ""],
      [playerState.repeat === "one" ? "\u21BB\u2081" : "\u21BB", "repeat", "Repeat " + playerState.repeat, playerState.repeat !== "off" ? " active" : ""]
    ];
    var i;
    for (i = 0; i < controlSpecs.length; i += 1) {
      var control = makeButton(controlSpecs[i][0], controlSpecs[i][1],
        "now-control" + controlSpecs[i][3] + (i === playerFocusIndex ? " focused" : ""));
      control.setAttribute("aria-label", controlSpecs[i][2]);
      control.setAttribute("data-player-control", String(i));
      controls.appendChild(control);
    }
    wrapper.appendChild(controls);

    var volumeRow = makeElement("div", "volume-row");
    var volumeLabel = makeElement("span", "volume-label", "\u25C1 VOL " + Math.round(playerState.volume * 100) + "%");
    var volumeMeter = makeElement("button", "volume-meter", "");
    volumeMeter.type = "button";
    volumeMeter.setAttribute("data-action", "volume-toggle");
    volumeMeter.setAttribute("aria-label", "Volume " + Math.round(playerState.volume * 100) + " percent");
    for (i = 0; i < 14; i += 1) {
      volumeMeter.appendChild(makeElement("i", i < Math.round(playerState.volume * 14) ? "volume-segment active" : "volume-segment"));
    }
    volumeRow.appendChild(volumeLabel);
    volumeRow.appendChild(volumeMeter);
    wrapper.appendChild(volumeRow);
    screen.appendChild(wrapper);
    screen.className = "screen screen-player";

    seek.addEventListener("input", function () {
      SonoraPlayer.seek(Number(seek.value));
    });
  }

  function renderQueue() {
    var heading = makeElement("div", "section-heading");
    var list = makeElement("div", "queue-list");
    var currentIndex = SonoraPlayer.getCurrentIndex();
    var queue = SonoraPlayer.getQueue();
    var i;
    heading.appendChild(makeElement("h1", "", "Queue"));
    heading.appendChild(makeElement("span", "muted", queue.length + " tracks"));
    screen.appendChild(heading);
    if (!queue.length) {
      showEmpty("Queue is empty", "Scan storage to find local tracks.", true);
      return;
    }
    for (i = 0; i < queue.length; i += 1) {
      var row = makeElement("div", "queue-row" + (i === currentIndex ? " current" : ""));
      var copy = makeElement("div", "track-copy");
      copy.appendChild(makeElement("div", "track-title", queue[i].title));
      copy.appendChild(makeElement("div", "track-artist", queue[i].artist));
      row.appendChild(makeElement("span", "track-index", i === currentIndex ? "▶" : String(i + 1)));
      row.appendChild(copy);
      var up = makeButton("↑", "queue-up", "row-action");
      up.setAttribute("data-index", String(i));
      var down = makeButton("↓", "queue-down", "row-action");
      down.setAttribute("data-index", String(i));
      row.appendChild(up);
      row.appendChild(down);
      list.appendChild(row);
    }
    screen.appendChild(list);
  }

  function renderGroup(field, title) {
    var groups = {};
    var values = [];
    var i;
    for (i = 0; i < tracks.length; i += 1) {
      var value = tracks[i][field] || (field === "folder" ? "Music" : "Unknown");
      if (!groups[value]) {
        groups[value] = [];
        values.push(value);
      }
      groups[value].push(tracks[i]);
    }
    values.sort(function (a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
    if (selectedGroup !== null) {
      var back = makeButton("‹ " + title, "back-groups", "action-button");
      screen.appendChild(back);
      renderTrackRows(groups[selectedGroup] || [], selectedGroup, "group");
      return;
    }
    var heading = makeElement("div", "section-heading");
    var list = makeElement("div", "track-list");
    heading.appendChild(makeElement("h1", "", title));
    heading.appendChild(makeElement("span", "muted", values.length + " items"));
    screen.appendChild(heading);
    if (!values.length) {
      showEmpty("Nothing here yet", "Scan your music library first.", true);
      return;
    }
    for (i = 0; i < values.length; i += 1) {
      var button = makeElement("button", "track-row group-row", values[i]);
      button.type = "button";
      button.setAttribute("data-action", "open-group");
      button.setAttribute("data-group", values[i]);
      button.appendChild(makeElement("span", "muted", groups[values[i]].length + " tracks"));
      list.appendChild(button);
    }
    screen.appendChild(list);
  }

  function renderPlaylists() {
    var heading = makeElement("div", "section-heading");
    var form = makeElement("div", "playlist-create");
    var input = makeElement("input", "search");
    var list = makeElement("div", "track-list");
    var playlists = SonoraPlayer.getState().playlists;
    var i;
    heading.appendChild(makeElement("h1", "", "Playlists"));
    heading.appendChild(makeElement("span", "muted", playlists.length + " saved"));
    screen.appendChild(heading);
    input.id = "new-playlist-name";
    input.placeholder = "New playlist name";
    input.setAttribute("aria-label", "New playlist name");
    form.appendChild(input);
    form.appendChild(makeButton("Create", "create-playlist", "action-button"));
    screen.appendChild(form);
    if (!playlists.length) {
      screen.appendChild(makeElement("div", "empty-state", "Create a playlist, then add tracks from Music."));
    }
    for (i = 0; i < playlists.length; i += 1) {
      var row = makeElement("div", "playlist-row");
      var open = makeButton(playlists[i].name + "  ·  " + playlists[i].tracks.length, "open-playlist", "playlist-open");
      open.setAttribute("data-playlist-id", playlists[i].id);
      row.appendChild(open);
      var play = makeButton("▶", "play-playlist", "row-action");
      play.setAttribute("data-playlist-id", playlists[i].id);
      row.appendChild(play);
      list.appendChild(row);
    }
    screen.appendChild(list);
  }

  function renderPlaylistDetail() {
    var playlists = SonoraPlayer.getState().playlists;
    var playlist = playlists.filter(function (item) { return item.id === selectedPlaylistId; })[0];
    if (!playlist) {
      activeScreen = "playlists";
      renderPlaylists();
      return;
    }
    var tracksInPlaylist = playlist.tracks.map(function (id) {
      return tracks.filter(function (track) { return track.id === id; })[0];
    }).filter(Boolean);
    var heading = makeElement("div", "section-heading");
    var controls = makeElement("div", "playlist-controls");
    var backButton = makeButton("‹ Lists", "navigate", "action-button");
    backButton.setAttribute("data-screen", "playlists");
    heading.appendChild(backButton);
    heading.appendChild(makeElement("span", "muted", tracksInPlaylist.length + " tracks"));
    screen.appendChild(heading);
    var rename = makeElement("input", "search");
    rename.id = "playlist-rename";
    rename.value = playlist.name;
    rename.setAttribute("aria-label", "Playlist name");
    controls.appendChild(rename);
    var renameButton = makeButton("Save name", "rename-playlist", "action-button");
    renameButton.setAttribute("data-playlist-id", playlist.id);
    controls.appendChild(renameButton);
    var playButton = makeButton("Play playlist", "play-playlist", "action-button");
    playButton.setAttribute("data-playlist-id", playlist.id);
    controls.appendChild(playButton);
    var deleteButton = makeButton("Delete", "delete-playlist", "action-button");
    deleteButton.setAttribute("data-playlist-id", playlist.id);
    controls.appendChild(deleteButton);
    screen.appendChild(controls);
    selectedPlaylistId = playlist.id;
    renderTrackRows(tracksInPlaylist, playlist.name, "playlist", playlist);
  }

  function renderFavorites() {
    var ids = SonoraPlayer.getState().favourites;
    renderTrackRows(tracks.filter(function (track) { return ids.indexOf(track.id) !== -1; }), "Favourites", "favorites");
  }

  function renderRecent() {
    var ids = SonoraPlayer.getState().recent;
    renderTrackRows(ids.map(function (id) {
      return tracks.filter(function (track) { return track.id === id; })[0];
    }).filter(Boolean), "Recently played", "recent");
  }

  function renderMostPlayed() {
    var counts = SonoraPlayer.getState().playCounts;
    var ranked = tracks.slice().sort(function (a, b) {
      return (counts[b.id] || 0) - (counts[a.id] || 0) || SonoraLibrary.compareTracks(a, b);
    }).filter(function (track) { return counts[track.id] > 0; });
    renderTrackRows(ranked, "Most played", "most-played");
  }

  function renderEqualizer() {
    var equalizer = SonoraPlayer.getState().equalizer;
    var presets = {
      "Flat": [0, 0, 0, 0, 0],
      "Bass Boost": [7, 5, 1, 0, 0],
      "Vocal": [-2, 1, 4, 3, 1],
      "Nothing Dot": [4, -2, 3, -2, 4],
      "Treble": [-1, 0, 2, 5, 7]
    };
    presets.Custom = equalizer.bands.slice();
    var heading = makeElement("div", "section-heading");
    var panel = makeElement("div", "settings-list");
    var toggle = makeElement("input", "eq-toggle");
    var preset = makeElement("select", "search");
    var names = ["Flat", "Bass Boost", "Vocal", "Nothing Dot", "Treble", "Custom"];
    var i;
    heading.appendChild(makeElement("h1", "", "Equalizer"));
    screen.appendChild(heading);
    var stateLine = makeElement("label", "setting-card eq-enable");
    toggle.type = "checkbox";
    toggle.checked = equalizer.enabled;
    stateLine.appendChild(toggle);
    stateLine.appendChild(makeElement("strong", "", SonoraPlayer.isEqualizerAvailable() ? "Enable five-band EQ" : "Web Audio EQ unavailable"));
    panel.appendChild(stateLine);
    preset.setAttribute("aria-label", "Equalizer preset");
    for (i = 0; i < names.length; i += 1) {
      var option = makeElement("option", "", names[i]);
      option.value = names[i];
      preset.appendChild(option);
    }
    preset.value = equalizer.preset;
    panel.appendChild(preset);
    var frequencies = ["60 Hz", "230 Hz", "910 Hz", "3.6 kHz", "14 kHz"];
    for (i = 0; i < frequencies.length; i += 1) {
      var band = makeElement("label", "eq-band");
      band.appendChild(makeElement("span", "", frequencies[i]));
      var range = makeElement("input", "volume-control");
      range.type = "range";
      range.min = "-12";
      range.max = "12";
      range.step = "1";
      range.value = equalizer.bands[i];
      range.setAttribute("data-band", String(i));
      range.setAttribute("aria-label", frequencies[i] + " gain");
      band.appendChild(range);
      panel.appendChild(band);
    }
    var preamp = makeElement("label", "eq-band");
    preamp.appendChild(makeElement("span", "", "Preamp"));
    var preampRange = makeElement("input", "volume-control");
    preampRange.type = "range";
    preampRange.min = "-12";
    preampRange.max = "12";
    preampRange.step = "1";
    preampRange.value = equalizer.preamp;
    preampRange.id = "eq-preamp";
    preampRange.setAttribute("aria-label", "Preamp gain");
    preamp.appendChild(preampRange);
    panel.appendChild(preamp);
    screen.appendChild(panel);
    toggle.addEventListener("change", function () {
      SonoraPlayer.setEqualizer({ enabled: toggle.checked });
    });
    preset.addEventListener("change", function () {
      SonoraPlayer.setEqualizer({ preset: preset.value, bands: presets[preset.value] });
      renderEqualizer();
    });
    var sliders = panel.querySelectorAll("input[type=range]");
    for (i = 0; i < sliders.length; i += 1) {
      sliders[i].addEventListener("change", function () {
        var update = {};
        if (this.id === "eq-preamp") {
          update.preamp = Number(this.value);
        } else {
          update.bands = equalizer.bands.slice();
          update.bands[Number(this.getAttribute("data-band"))] = Number(this.value);
          update.preset = "Custom";
          document.querySelector('[aria-label="Equalizer preset"]').value = "Custom";
        }
        SonoraPlayer.setEqualizer(update);
      });
    }
  }

  function renderSettings() {
    var heading = makeElement("div", "matrix-heading settings-heading");
    var cards = makeElement("div", "settings-menu");
    var headingIcon = makeElement("span", "settings-heading-icon", "\u2699");
    heading.appendChild(headingIcon);
    heading.appendChild(makeElement("h1", "matrix-title", "SETTINGS"));
    screen.appendChild(heading);

    var equalizer = makeButton("", "select-setting", "settings-card" + (focusedSettingIndex === 0 ? " focused" : ""));
    equalizer.setAttribute("data-setting-index", "0");
    equalizer.appendChild(makeElement("span", "settings-card-icon", "\u2261"));
    equalizer.appendChild(makeElement("span", "settings-card-label", "EQUALIZER"));
    equalizer.appendChild(makeElement("span", "settings-card-chevron", ">"));
    cards.appendChild(equalizer);

    var load = makeButton("", "select-setting", "settings-card" + (focusedSettingIndex === 1 ? " focused" : ""));
    load.setAttribute("data-setting-index", "1");
    load.appendChild(makeElement("span", "settings-card-icon", "\u25B1"));
    load.appendChild(makeElement("span", "settings-card-label", "LOAD MUSIC"));
    load.appendChild(makeElement("span", "settings-card-chevron", ">"));
    cards.appendChild(load);
    screen.appendChild(cards);
    screen.className = "screen screen-settings";
  }

  function updateSoftkeys() {
    var left = document.getElementById("softkey-left");
    var right = document.getElementById("softkey-right");
    var labels = {
      "now-playing": ["Options", "Back"],
      library: ["Play", "Back"],
      settings: ["Select", "Back"],
      equalizer: ["Select", "Back"]
    };
    var current = labels[activeScreen] || ["Select", "Back"];
    left.textContent = current[0];
    right.textContent = current[1];
  }

  function renderDevicePreview(view, label) {
    var device = makeElement("section", "device-preview");
    var content = makeElement("main", "screen");
    var footer = makeElement("footer", "softkey-bar");
    var left = makeButton(view === "now-playing" ? "Options" : (view === "library" ? "Play" : "Select"), "soft-left", "softkey");
    var right = makeButton("Back", "soft-right", "softkey");
    var tag = makeElement("div", "preview-label", label);

    device.setAttribute("data-preview", view);
    footer.appendChild(left);
    footer.appendChild(makeElement("span", "dpad-indicator", ""));
    footer.appendChild(right);
    device.appendChild(tag);
    device.appendChild(content);
    device.appendChild(footer);

    screen = content;
    if (view === "now-playing") {
      renderPlayer();
    } else if (view === "settings") {
      renderSettings();
    } else {
      renderLibrary();
    }
    screen = appScreen;
    return device;
  }

  function renderBoard() {
    var board = makeElement("div", "presentation-board");
    board.appendChild(renderDevicePreview("now-playing", "NOW PLAYING"));
    board.appendChild(renderDevicePreview("library", "MUSIC LIBRARY"));
    board.appendChild(renderDevicePreview("settings", "SETTINGS"));
    screen.appendChild(board);
    screen.className = "screen board-host";
  }

  function render() {
    var i;
    screen = appScreen;
    document.body.className = presentationBoard ? "presentation-board-mode" :
      (activeScreen === "now-playing" ? "now-playing-active" : "");
    screen.textContent = "";
    screen.className = "screen";
    if (presentationBoard) {
      renderBoard();
      updateSoftkeys();
      return;
    }
    if (activeScreen === "now-playing") {
      renderPlayer();
    } else if (activeScreen === "queue") {
      renderQueue();
    } else if (activeScreen === "playlists") {
      renderPlaylists();
    } else if (activeScreen === "playlist-detail") {
      renderPlaylistDetail();
    } else if (activeScreen === "favorites") {
      renderFavorites();
    } else if (activeScreen === "recent") {
      renderRecent();
    } else if (activeScreen === "most-played") {
      renderMostPlayed();
    } else if (activeScreen === "artists") {
      renderGroup("artist", "Artists");
    } else if (activeScreen === "albums") {
      renderGroup("album", "Albums");
    } else if (activeScreen === "folders") {
      renderGroup("folder", "Folders");
    } else if (activeScreen === "equalizer") {
      renderEqualizer();
    } else if (activeScreen === "settings") {
      renderSettings();
    } else {
      renderLibrary();
    }
    updateSoftkeys();
  }

  function seekBackground(currentTime, duration) {
    var percentage = duration > 0 ? Math.max(0, Math.min(100, currentTime / duration * 100)) : 0;
    return "linear-gradient(to right, #ff1e1e 0%, #ff1e1e " + percentage +
      "%, #333 " + percentage + "%, #333 100%)";
  }

  function updateTime() {
    var currentLabel = document.getElementById("current-time");
    var durationLabel = document.getElementById("remaining-time");
    var seek = document.getElementById("playback-seek");
    if (!currentLabel || !durationLabel || !seek) {
      return;
    }
    currentLabel.textContent = formatTime(audio.currentTime);
    durationLabel.textContent = "-" + formatTime(Math.max(0, audio.duration - audio.currentTime));
    if (document.activeElement !== seek) {
      seek.max = String(isFinite(audio.duration) ? audio.duration : 100);
      seek.value = String(audio.currentTime || 0);
    }
    seek.style.background = seekBackground(audio.currentTime || 0, audio.duration);
  }

  function scanLibrary() {
    var generation = ++scanGeneration;
    setStatus("Scanning storage…");
    SonoraLibrary.scan(function (count) {
      if (generation === scanGeneration) {
        setStatus("Found " + count + " tracks");
      }
    }, function (error, foundTracks) {
      if (generation !== scanGeneration) {
        return;
      }
      tracks = mergeTracks(foundTracks, persistedTracks).sort(SonoraLibrary.compareTracks);
      SonoraPlayer.setTracks(tracks);
      SonoraPlayer.restore();
      if (error && tracks.length) {
        setStatus(tracks.length + " tracks; some storage could not be scanned");
        global.console.warn(error);
      } else {
        setStatus(error || tracks.length + " tracks");
      }
      render();
    });
  }

  function mergeTracks(primary, additional) {
    var merged = [];
    var seen = {};
    (primary || []).concat(additional || []).forEach(function (track) {
      if (track && !seen[track.id]) {
        seen[track.id] = true;
        merged.push(track);
      }
    });
    return merged;
  }

  function restoreImportedTracks() {
    SamsaraMusicStore.list(function (error, records) {
      if (error) {
        global.console.warn("Unable to restore imported audio files.", error);
        setStatus("Imported music could not be restored: " + error.message);
        return;
      }
      persistedTracks = records.filter(function (record) {
        return record && record.file;
      }).map(function (record) {
        importedTrackIds[record.id] = true;
        return record;
      });
      tracks = mergeTracks(tracks, persistedTracks).sort(SonoraLibrary.compareTracks);
      SonoraPlayer.setTracks(tracks);
      SonoraPlayer.restore();
      render();
      if (persistedTracks.length) {
        setStatus("Restored " + persistedTracks.length + " imported track" +
          (persistedTracks.length === 1 ? "" : "s"));
      }
    });
  }

  function durationForFile(file, callback) {
    var probe = new global.Audio();
    var url = global.URL.createObjectURL(file);
    var settled = false;
    function finish(duration) {
      if (settled) {
        return;
      }
      settled = true;
      probe.removeEventListener("loadedmetadata", loaded);
      probe.removeEventListener("error", failed);
      probe.src = "";
      global.URL.revokeObjectURL(url);
      callback(duration || 0);
    }
    function loaded() {
      finish(isFinite(probe.duration) ? probe.duration : 0);
    }
    function failed() {
      finish(0);
    }
    probe.addEventListener("loadedmetadata", loaded);
    probe.addEventListener("error", failed);
    probe.src = url;
    probe.load();
  }

  function loadMusicFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    var pending = 0;
    var added = 0;
    var allowed = /\.(mp3|flac|wav|ogg|opus|m4a|aac)$/i;
    files = files.filter(function (file) {
      return allowed.test(file.name || "");
    });
    if (!files.length) {
      setStatus("Choose MP3, FLAC, WAV, OGG, AAC, or M4A files");
      return;
    }
    pending = files.length;
    setStatus("Reading " + files.length + " audio file" + (files.length === 1 ? "" : "s"));
    function completeOne() {
      pending -= 1;
      if (pending === 0) {
        tracks.sort(SonoraLibrary.compareTracks);
        SonoraPlayer.setTracks(tracks);
        SonoraPlayer.restore();
        focusedTrackIndex = 0;
        activeScreen = "library";
        render();
        setStatus(added + " track" + (added === 1 ? "" : "s") + " loaded");
      }
    }
    files.forEach(function (file) {
      var sourcePath = file.webkitRelativePath || file.name;
      var id = ["import", sourcePath, file.size, file.lastModified || 0].join("|");
      var basename = file.name.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
      var splitName = /^(.+?)\s+-\s+(.+)$/.exec(basename);
      if (importedTrackIds[id]) {
        completeOne();
        return;
      }
      var track = {
        id: id,
        name: file.name,
        title: splitName ? splitName[2] : basename,
        artist: splitName ? splitName[1] : "Unknown artist",
        album: "Local music",
        type: file.type || "",
        size: file.size || 0,
        file: file,
        folder: file.webkitRelativePath ? file.webkitRelativePath.replace(/\\/g, "/").replace(/\/[^/]+$/, "") : "Local music"
      };
      importedTrackIds[id] = true;
      SonoraMetadata.read(file, function (metadataError, metadata) {
        if (metadataError) {
          global.console.warn("Unable to read metadata for " + file.name + ".", metadataError);
        } else {
          track.title = metadata.title || track.title;
          track.artist = metadata.artist || track.artist;
          track.album = metadata.album || track.album;
          track.artwork = metadata.artwork || null;
        }
        durationForFile(file, function (duration) {
          track.duration = duration;
          tracks.push(track);
          SamsaraMusicStore.save(track, function (saveError) {
            if (saveError) {
              global.console.warn("Unable to persist imported audio file " + file.name + ".", saveError);
              setStatus(file.name + " loaded, but could not be saved for next time");
            } else {
              persistedTracks.push(track);
            }
          });
          added += 1;
          completeOne();
        });
      });
    });
  }

  function playSelectedLibraryTrack() {
    var ordered = tracks.slice().sort(SonoraLibrary.compareTracks);
    if (!ordered.length) {
      filePicker.click();
      return;
    }
    focusedTrackIndex = Math.max(0, Math.min(focusedTrackIndex, ordered.length - 1));
    SonoraPlayer.setQueue(ordered, ordered[focusedTrackIndex]);
    activeScreen = "now-playing";
    render();
  }

  function setVolumeFromKey(direction) {
    var volume = SonoraPlayer.getState().volume;
    SonoraPlayer.setVolume(Math.max(0, Math.min(1, volume + direction / 14)));
    playerFocusIndex = 2;
    render();
  }

  function activateSetting() {
    var names = ["Flat", "Bass Boost", "Vocal", "Nothing Dot", "Treble"];
    if (focusedSettingIndex === 1) {
      filePicker.click();
      return;
    }
    var equalizer = SonoraPlayer.getState().equalizer;
    var current = names.indexOf(equalizer.preset);
    var nextPreset = names[(current + 1) % names.length];
    SonoraPlayer.setEqualizer({
      enabled: true,
      preset: nextPreset,
      bands: playerPresets[nextPreset]
    });
    setStatus(nextPreset + (SonoraPlayer.isEqualizerAvailable() ? " EQ enabled" : " preset saved; Web Audio unavailable"));
  }

  function activate(action, index, source) {
    var track;
    source = source || document.activeElement;
    var playerControl = source && source.getAttribute ? source.getAttribute("data-player-control") : null;
    var preview = source && source.closest ? source.closest("[data-preview]") : null;
    if (playerControl !== null && playerControl !== "scrubber") {
      playerFocusIndex = Number(playerControl);
    }
    if (preview && presentationBoard) {
      activeScreen = preview.getAttribute("data-preview");
    }
    if (action === "toggle-board") {
      presentationBoard = !presentationBoard;
      render();
    } else if (action === "soft-left") {
      if (activeScreen === "now-playing") {
        activeScreen = "settings";
      } else if (activeScreen === "library") {
        playSelectedLibraryTrack();
      } else if (activeScreen === "settings") {
        activateSetting();
      }
      render();
    } else if (action === "soft-right") {
      activeScreen = activeScreen === "now-playing" ? "library" : "now-playing";
      render();
    } else if (action === "select-track") {
      focusedTrackIndex = Number(source.getAttribute("data-visible-index"));
      render();
    } else if (action === "select-setting") {
      focusedSettingIndex = Number(source.getAttribute("data-setting-index"));
      activateSetting();
      render();
    } else if (action === "load-music") {
      filePicker.click();
    } else if (action === "volume-toggle") {
      var currentVolume = SonoraPlayer.getState().volume;
      SonoraPlayer.setVolume(currentVolume >= 1 ? 0 : Math.min(1, currentVolume + 1 / 14));
      render();
    } else if (action === "navigate") {
      activeScreen = source.getAttribute("data-screen");
      selectedGroup = null;
      render();
    } else if (action === "open-group") {
      selectedGroup = source.getAttribute("data-group");
      render();
    } else if (action === "back-groups") {
      selectedGroup = null;
      render();
    } else if (action === "scan") {
      scanLibrary();
    } else if (action === "play-track") {
      track = tracks[index];
      if (track) {
        SonoraPlayer.setQueue(tracks, track);
        activeScreen = "now-playing";
        render();
      }
    } else if (action === "toggle-play") {
      SonoraPlayer.togglePlay();
      render();
    } else if (action === "next") {
      SonoraPlayer.next();
      render();
    } else if (action === "previous") {
      SonoraPlayer.previous();
      render();
    } else if (action === "favourite") {
      setStatus(SonoraPlayer.toggleFavourite() ? "Added to favourites" : "Removed from favourites");
      render();
    } else if (action === "shuffle") {
      SonoraPlayer.toggleShuffle();
      render();
    } else if (action === "repeat") {
      SonoraPlayer.cycleRepeat();
      render();
    } else if (action === "create-playlist") {
      var nameInput = document.getElementById("new-playlist-name");
      var name = nameInput ? nameInput.value.replace(/^\s+|\s+$/g, "") : "";
      if (name) {
        var playlist = SonoraPlayer.createPlaylist(name);
        selectedPlaylistId = playlist.id;
        activeScreen = "playlist-detail";
        render();
      } else {
        setStatus("Enter a playlist name");
      }
    } else if (action === "open-playlist") {
      selectedPlaylistId = source.getAttribute("data-playlist-id");
      activeScreen = "playlist-detail";
      render();
    } else if (action === "play-playlist") {
      var playlistId = source.getAttribute("data-playlist-id");
      var selectedPlaylist = SonoraPlayer.getState().playlists.filter(function (item) { return item.id === playlistId; })[0];
      var playlistTracks = selectedPlaylist ? selectedPlaylist.tracks.map(function (id) {
        return tracks.filter(function (item) { return item.id === id; })[0];
      }).filter(Boolean) : [];
      if (playlistTracks.length) {
        SonoraPlayer.setQueue(playlistTracks, playlistTracks[0]);
        activeScreen = "now-playing";
        render();
      } else {
        setStatus("This playlist has no available tracks");
      }
    } else if (action === "add-playlist-track") {
      var addId = source.getAttribute("data-track-id");
      if (selectedPlaylistId && SonoraPlayer.addToPlaylist(selectedPlaylistId, addId)) {
        setStatus("Added to playlist");
      }
    } else if (action === "remove-playlist-track") {
      SonoraPlayer.removeFromPlaylist(
        source.getAttribute("data-playlist-id"),
        source.getAttribute("data-track-id")
      );
      render();
    } else if (action === "rename-playlist") {
      var renameInput = document.getElementById("playlist-rename");
      var renameValue = renameInput ? renameInput.value.replace(/^\s+|\s+$/g, "") : "";
      if (renameValue && SonoraPlayer.renamePlaylist(source.getAttribute("data-playlist-id"), renameValue)) {
        setStatus("Playlist renamed");
        render();
      }
    } else if (action === "delete-playlist") {
      SonoraPlayer.deletePlaylist(source.getAttribute("data-playlist-id"));
      selectedPlaylistId = null;
      activeScreen = "playlists";
      render();
    } else if (action === "queue-up" || action === "queue-down") {
      var queueIndex = Number(source.getAttribute("data-index"));
      SonoraPlayer.moveQueueItem(queueIndex, queueIndex + (action === "queue-up" ? -1 : 1));
      render();
    } else if (action === "playlist-up" || action === "playlist-down") {
      var itemIndex = Number(source.getAttribute("data-index"));
      SonoraPlayer.movePlaylistItem(
        source.getAttribute("data-playlist-id"),
        itemIndex,
        itemIndex + (action === "playlist-up" ? -1 : 1)
      );
      render();
    }
  }

  function keyName(event) {
    if (event.key) {
      return event.key;
    }
    return {
      8: "Backspace",
      9: "Tab",
      13: "Enter",
      32: " ",
      37: "ArrowLeft",
      38: "ArrowUp",
      39: "ArrowRight",
      40: "ArrowDown",
      81: "q",
      112: "F1",
      113: "F2"
    }[event.keyCode] || "";
  }

  function moveFocus(direction) {
    var elements = Array.prototype.slice.call(document.querySelectorAll(
      "#screen button:not([disabled]), #screen input:not([disabled]), .bottom-nav button:not([disabled])"
    ));
    var index = elements.indexOf(document.activeElement);
    if (!elements.length) {
      return;
    }
    if (index === -1) {
      index = direction > 0 ? 0 : elements.length - 1;
    } else {
      index = (index + direction + elements.length) % elements.length;
    }
    elements[index].focus();
  }

  appScreen.addEventListener("click", function (event) {
    var target = event.target;
    var action;
    while (target && target !== appScreen && !target.getAttribute("data-action")) {
      target = target.parentNode;
    }
    if (target && target !== appScreen) {
      action = target.getAttribute("data-action");
      activate(action, Number(target.getAttribute("data-index")), target);
    }
  });

  document.getElementById("softkey-left").addEventListener("click", function () {
    activate("soft-left", 0, this);
  });
  document.getElementById("softkey-right").addEventListener("click", function () {
    activate("soft-right", 0, this);
  });
  filePicker.addEventListener("change", function () {
    loadMusicFiles(filePicker.files);
    filePicker.value = "";
  });

  document.addEventListener("keydown", function (event) {
    var focused = document.activeElement;
    var key = keyName(event);
    if (key === "Tab") {
      presentationBoard = !presentationBoard;
      render();
      event.preventDefault();
      return;
    }
    if (key === "SoftLeft" || key === "F1" || key.toLowerCase() === "q") {
      activate("soft-left");
      event.preventDefault();
      return;
    }
    if (key === "SoftRight" || key === "F2" || key === "Backspace" || key === "Escape") {
      activate("soft-right");
      event.preventDefault();
      return;
    }
    if (key === "ArrowDown" || key === "ArrowUp") {
      if (activeScreen === "now-playing") {
        setVolumeFromKey(key === "ArrowUp" ? 1 : -1);
      } else if (activeScreen === "library") {
        focusedTrackIndex = Math.max(0, Math.min(tracks.length - 1,
          focusedTrackIndex + (key === "ArrowDown" ? 1 : -1)));
        render();
        var focusedRow = appScreen.querySelector(".matrix-track-row.focused");
        if (focusedRow && focusedRow.scrollIntoView) {
          focusedRow.scrollIntoView(false);
        }
      } else if (activeScreen === "settings") {
        focusedSettingIndex = focusedSettingIndex === 0 ? 1 : 0;
        render();
      } else {
        moveFocus(key === "ArrowDown" ? 1 : -1);
      }
      event.preventDefault();
      return;
    }
    if ((key === "ArrowLeft" || key === "ArrowRight") && activeScreen === "now-playing") {
      if (focused === appScreen.querySelector("#playback-seek") || playerFocusIndex === 5) {
        SonoraPlayer.seek(audio.currentTime + (key === "ArrowRight" ? 5 : -5));
      } else {
        playerFocusIndex = (playerFocusIndex + (key === "ArrowRight" ? 1 : 5)) % 6;
        render();
        var control = playerFocusIndex === 5 ? appScreen.querySelector("#playback-seek") :
          appScreen.querySelector('[data-player-control="' + playerFocusIndex + '"]');
        if (control) {
          control.focus();
        }
      }
      event.preventDefault();
      return;
    }
    if (key === "Enter") {
      if (activeScreen === "library") {
        playSelectedLibraryTrack();
      } else if (activeScreen === "settings") {
        activateSetting();
        render();
      } else if (activeScreen === "now-playing") {
        if (focused && focused.id === "playback-seek") {
          event.preventDefault();
          return;
        }
        var control = appScreen.querySelector('[data-player-control="' + playerFocusIndex + '"]');
        if (control) {
          control.click();
        } else {
          SonoraPlayer.togglePlay();
          render();
        }
      } else if (focused && focused.getAttribute("data-action")) {
        focused.click();
      } else {
        moveFocus(1);
      }
      event.preventDefault();
      return;
    }
    if (key === " " && activeScreen === "now-playing") {
      SonoraPlayer.togglePlay();
      render();
      event.preventDefault();
    }
  });

  audio.addEventListener("error", function () {
    var error = audio.error;
    if (error && error.code === 4) {
      setStatus("Codec unavailable for this file");
    } else {
      setStatus("Could not play this file");
    }
  });

  SonoraPlayer.init(audio, state, {
    track: render,
    time: function () {
      if (activeScreen === "now-playing" || presentationBoard) {
        updateTime();
      }
    },
    playback: render,
    playbackError: function () {
      setStatus("Could not play this file");
    },
    unsupportedFlac: function () {
      setStatus("FLAC decoder is not bundled yet");
    }
  });

  render();
  scanLibrary();
  restoreImportedTracks();
}(window));
