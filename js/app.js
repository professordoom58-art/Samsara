(function (global) {
  "use strict";

  var screen = document.getElementById("screen");
  var audio = document.getElementById("audio");
  var status = document.getElementById("status-message");
  var state = SonoraStorage.load();
  var tracks = [];
  var activeScreen = "library";
  var searchTerm = "";
  var sortBy = "title";
  var scanGeneration = 0;
  var statusTimer = null;
  var selectedPlaylistId = null;
  var selectedGroup = null;
  var artworkUrls = [];

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
    var heading = makeElement("div", "section-heading");
    var input = makeElement("input", "search");
    var filtered = visibleTracks().sort(SonoraLibrary.compareBy(sortBy));
    var tools = makeElement("div", "library-tools");
    var links = makeElement("div", "library-links");
    var list = makeElement("div", "track-list library-track-list");
    var actions = [
      ["Favourites", "favorites"],
      ["Recent", "recent"],
      ["Most played", "most-played"],
      ["Artists", "artists"],
      ["Albums", "albums"],
      ["Folders", "folders"],
      ["Queue", "queue"]
    ];
    var i;

    heading.appendChild(makeElement("h1", "", "Music"));
    heading.appendChild(makeElement("span", "muted", tracks.length + " tracks"));
    screen.appendChild(heading);
    input.type = "search";
    input.placeholder = "Search title, artist, album";
    input.setAttribute("aria-label", "Search music library");
    input.value = searchTerm;
    tools.appendChild(input);
    var sort = makeElement("select", "sort-select");
    sort.setAttribute("aria-label", "Sort tracks");
    [["title", "Title"], ["artist", "Artist"], ["album", "Album"], ["year", "Year"]].forEach(function (item) {
      var option = makeElement("option", "", item[1]);
      option.value = item[0];
      sort.appendChild(option);
    });
    sort.value = sortBy;
    tools.appendChild(sort);
    screen.appendChild(tools);
    sort.addEventListener("change", function () {
      sortBy = sort.value;
      render();
    });
    for (i = 0; i < actions.length; i += 1) {
      var link = makeButton(actions[i][0], "navigate", "library-link");
      link.setAttribute("data-screen", actions[i][1]);
      links.appendChild(link);
    }
    screen.appendChild(links);
    screen.appendChild(list);

    input.addEventListener("input", function () {
      searchTerm = input.value;
      render();
      var nextInput = document.querySelector(".search");
      nextInput.focus();
      nextInput.setSelectionRange(searchTerm.length, searchTerm.length);
    });

    if (!filtered.length) {
      if (tracks.length) {
        list.appendChild(makeElement("div", "empty-state", "No matching tracks."));
      } else {
        var empty = makeElement("div", "empty-state");
        empty.appendChild(makeElement("strong", "", "No tracks found"));
        empty.appendChild(makeElement("span", "", "Scan local music storage to build your library."));
        empty.appendChild(makeButton("Rescan storage", "scan", "action-button"));
        list.appendChild(empty);
      }
      return;
    }
    for (i = 0; i < filtered.length; i += 1) {
      var trackItem = makeTrackRow(filtered[i], tracks.indexOf(filtered[i]), i + 1, true);
      list.appendChild(trackItem);
    }
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
    var controls;
    var info;
    var playback;
    var timeRow;
    var seek;
    var playerState = SonoraPlayer.getState();
    var currentTime = audio.currentTime || 0;
    var duration = isFinite(audio.duration) ? audio.duration : 0;

    if (!track) {
      showEmpty("Nothing playing", "Choose a track from your library.", false);
      return;
    }

    var wrapper = makeElement("section", "player-card");
    var artworkUrl = getArtworkUrl(track);
    if (artworkUrl) {
      wrapper.style.backgroundImage = "linear-gradient(90deg, rgba(12, 24, 31, .75), rgba(17, 31, 39, .24)), url(\"" + artworkUrl + "\")";
      wrapper.className += " has-artwork";
    }
    info = makeElement("div", "player-info");
    info.appendChild(makeElement("h1", "", track.title));
    info.appendChild(makeElement("p", "", track.artist));
    info.appendChild(makeElement("p", "player-album", track.album));

    var main = makeElement("div", "player-main");
    main.appendChild(info);
    var playButton = makeButton(audio.paused ? "▶" : "Ⅱ", "toggle-play", "control primary");
    playButton.setAttribute("aria-label", audio.paused ? "Play" : "Pause");
    main.appendChild(playButton);
    wrapper.appendChild(main);

    controls = makeElement("div", "player-actions");
    var favourite = SonoraPlayer.isFavourite(track);
    var favouriteButton = makeButton(favourite ? "♥" : "＋", "favourite", "control action-icon");
    favouriteButton.setAttribute("aria-label", favourite ? "Remove from favourites" : "Add to favourites");
    if (favourite) {
      favouriteButton.className += " selected";
    }
    controls.appendChild(favouriteButton);

    var previousButton = makeButton("|‹", "previous", "control action-icon");
    previousButton.setAttribute("aria-label", "Previous track");
    controls.appendChild(previousButton);

    var progress = makeElement("div", "player-progress");
    playback = makeElement("div", "playback-bar");
    seek = makeElement("input", "seek");
    seek.type = "range";
    seek.min = "0";
    seek.max = String(duration || 100);
    seek.value = String(duration ? Math.min(currentTime, duration) : 0);
    seek.setAttribute("aria-label", "Playback position");
    timeRow = makeElement("div", "time-row");
    var currentLabel = makeElement("span", "", formatTime(currentTime));
    var durationLabel = makeElement("span", "", formatTime(duration));
    currentLabel.id = "current-time";
    durationLabel.id = "duration-time";
    seek.id = "playback-seek";
    timeRow.appendChild(currentLabel);
    timeRow.appendChild(durationLabel);
    playback.appendChild(seek);
    playback.appendChild(timeRow);
    progress.appendChild(playback);
    controls.appendChild(progress);

    var nextButton = makeButton("›|", "next", "control action-icon");
    nextButton.setAttribute("aria-label", "Next track");
    controls.appendChild(nextButton);
    var shuffleButton = makeButton("⌁", "shuffle", "control action-icon" + (playerState.shuffle ? " selected" : ""));
    shuffleButton.setAttribute("aria-label", playerState.shuffle ? "Shuffle on" : "Shuffle off");
    controls.appendChild(shuffleButton);
    var repeatLabel = playerState.repeat === "off" ? "Repeat off" : (playerState.repeat === "all" ? "Repeat all" : "Repeat one");
    var repeatButton = makeButton("↻", "repeat", "control action-icon" + (playerState.repeat !== "off" ? " selected" : ""));
    repeatButton.setAttribute("aria-label", repeatLabel);
    controls.appendChild(repeatButton);
    wrapper.appendChild(controls);
    screen.appendChild(wrapper);

    seek.addEventListener("change", function () {
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
      "Bass Boost": [6, 4, 0, 0, 0],
      "Rock": [5, 3, -1, 2, 4],
      "Pop": [-1, 2, 5, 2, -1],
      "Classical": [4, 2, -1, 2, 4],
      "Jazz": [4, 2, -1, 2, 4],
      "Vocal": [-2, 1, 4, 3, 0]
    };
    presets.Custom = equalizer.bands.slice();
    var heading = makeElement("div", "section-heading");
    var panel = makeElement("div", "settings-list");
    var toggle = makeElement("input", "eq-toggle");
    var preset = makeElement("select", "search");
    var names = ["Flat", "Bass Boost", "Rock", "Pop", "Classical", "Jazz", "Vocal", "Custom"];
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
    var frequencies = ["60 Hz", "250 Hz", "1 kHz", "4 kHz", "12 kHz"];
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
    var heading = makeElement("div", "section-heading");
    var cards = makeElement("div", "settings-list");
    heading.appendChild(makeElement("h1", "", "More"));
    screen.appendChild(heading);

    var scanCard = makeElement("div", "setting-card");
    scanCard.appendChild(makeElement("strong", "", "Music library"));
    scanCard.appendChild(makeElement("p", "", "Scan music and SD-card storage for local audio files."));
    scanCard.appendChild(makeButton("Rescan library", "scan"));
    cards.appendChild(scanCard);

    var formatCard = makeElement("div", "setting-card");
    formatCard.appendChild(makeElement("strong", "", "Format status"));
    formatCard.appendChild(makeElement("p", "", "Playback uses the device's HTML audio codecs. FLAC decoding is not bundled yet. Device codec support has not been verified."));
    cards.appendChild(formatCard);

    var eqCard = makeElement("div", "setting-card");
    eqCard.appendChild(makeElement("strong", "", "Audio and library"));
    var eqButton = makeButton("Equalizer", "navigate", "action-button");
    eqButton.setAttribute("data-screen", "equalizer");
    eqCard.appendChild(eqButton);
    cards.appendChild(eqCard);

    var categories = [
      ["Artists", "artists"], ["Albums", "albums"], ["Folders", "folders"],
      ["Recently played", "recent"], ["Most played", "most-played"],
      ["Favourites", "favorites"], ["Queue", "queue"]
    ];
    var categoryCard = makeElement("div", "setting-card");
    categoryCard.appendChild(makeElement("strong", "", "Browse"));
    categories.forEach(function (item) {
      var button = makeButton(item[0], "navigate", "action-button");
      button.setAttribute("data-screen", item[1]);
      categoryCard.appendChild(button);
    });
    cards.appendChild(categoryCard);

    var volumeCard = makeElement("div", "setting-card");
    volumeCard.appendChild(makeElement("strong", "", "Volume"));
    var volume = makeElement("input", "volume-control");
    volume.type = "range";
    volume.min = "0";
    volume.max = "1";
    volume.step = "0.05";
    volume.value = String(SonoraPlayer.getState().volume);
    volume.setAttribute("aria-label", "Playback volume");
    volume.addEventListener("input", function () {
      SonoraPlayer.setVolume(Number(volume.value));
    });
    volumeCard.appendChild(volume);
    cards.appendChild(volumeCard);

    screen.appendChild(cards);
  }

  function render() {
    var i;
    document.body.className = activeScreen === "now-playing" ? "now-playing-active" : "";
    screen.textContent = "";
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
    for (i = 0; i < document.querySelectorAll(".nav-button").length; i += 1) {
      var button = document.querySelectorAll(".nav-button")[i];
      var buttonScreen = button.getAttribute("data-screen");
      var isActive = buttonScreen === activeScreen ||
        (buttonScreen === "playlists" && activeScreen === "playlist-detail");
      button.className = "nav-button" + (isActive ? " active" : "");
    }
  }

  function updateTime() {
    var currentLabel = document.getElementById("current-time");
    var durationLabel = document.getElementById("duration-time");
    var seek = document.getElementById("playback-seek");
    if (!currentLabel || !durationLabel || !seek) {
      return;
    }
    currentLabel.textContent = formatTime(audio.currentTime);
    durationLabel.textContent = formatTime(audio.duration);
    if (document.activeElement !== seek) {
      seek.max = String(isFinite(audio.duration) ? audio.duration : 100);
      seek.value = String(audio.currentTime || 0);
    }
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
      tracks = foundTracks.sort(SonoraLibrary.compareTracks);
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

  function activate(action, index, source) {
    var track;
    source = source || document.activeElement;
    if (action === "navigate") {
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
      13: "Enter",
      32: " ",
      37: "ArrowLeft",
      38: "ArrowUp",
      39: "ArrowRight",
      40: "ArrowDown"
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

  screen.addEventListener("click", function (event) {
    var target = event.target;
    var action;
    while (target && target !== screen && !target.getAttribute("data-action")) {
      target = target.parentNode;
    }
    if (target && target !== screen) {
      action = target.getAttribute("data-action");
      activate(action, Number(target.getAttribute("data-index")), target);
    }
  });

  document.querySelector(".bottom-nav").addEventListener("click", function (event) {
    var target = event.target;
    if (target && target.getAttribute("data-screen")) {
      activeScreen = target.getAttribute("data-screen");
      render();
    }
  });

  document.addEventListener("keydown", function (event) {
    var focused = document.activeElement;
    var key = keyName(event);
    if (key === "Backspace" || key === "Escape") {
      if (selectedGroup !== null) {
        selectedGroup = null;
        render();
        event.preventDefault();
      } else if (activeScreen === "playlist-detail") {
        activeScreen = "playlists";
        render();
        event.preventDefault();
      } else if (activeScreen !== "library") {
        activeScreen = "library";
        render();
        event.preventDefault();
      }
      return;
    }
    if (key === "ArrowDown" || key === "ArrowUp") {
      moveFocus(key === "ArrowDown" ? 1 : -1);
      event.preventDefault();
      return;
    }
    if (key === "Enter") {
      if (focused && (focused.getAttribute("data-action") || focused.getAttribute("data-screen"))) {
        focused.click();
      } else {
        moveFocus(1);
      }
      event.preventDefault();
      return;
    }
    if (key === "ArrowLeft" && activeScreen === "now-playing") {
      SonoraPlayer.previous();
      render();
      event.preventDefault();
    } else if (key === "ArrowRight" && activeScreen === "now-playing") {
      SonoraPlayer.next();
      render();
      event.preventDefault();
    } else if (key === " " && activeScreen === "now-playing") {
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
      if (activeScreen === "now-playing") {
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
}(window));
