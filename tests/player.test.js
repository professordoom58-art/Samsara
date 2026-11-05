"use strict";

var assert = require("assert");
var fs = require("fs");
var vm = require("vm");

function makeAudio() {
  var listeners = {};
  return {
    paused: true,
    currentTime: 0,
    duration: 90,
    volume: 1,
    src: "",
    addEventListener: function (name, callback) {
      listeners[name] = listeners[name] || [];
      listeners[name].push(callback);
    },
    removeEventListener: function (name, callback) {
      listeners[name] = (listeners[name] || []).filter(function (item) { return item !== callback; });
    },
    load: function () {},
    play: function () { this.paused = false; },
    pause: function () { this.paused = true; }
  };
}

var saved = null;
var audio = makeAudio();
var sandbox = {
  console: console,
  setTimeout: setTimeout,
  addEventListener: function () {},
  URL: {
    createObjectURL: function () { return "blob:test"; },
    revokeObjectURL: function () {}
  },
  SonoraStorage: {
    save: function (state) { saved = JSON.parse(JSON.stringify(state)); }
  }
};
sandbox.window = sandbox;
vm.runInNewContext(fs.readFileSync("js/player.js", "utf8"), sandbox);

var state = {
  favourites: [],
  recent: [],
  playCounts: {},
  currentId: null,
  position: 0,
  volume: 0.8,
  shuffle: false,
  repeat: "off",
  playlists: [],
  equalizer: {
    enabled: false,
    preamp: 0,
    bands: [0, 0, 0, 0, 0],
    preset: "Flat"
  }
};
var track = {
  id: "local|song.mp3",
  name: "song.mp3",
  title: "Song",
  file: { name: "song.mp3" }
};
var flac = {
  id: "local|song.flac",
  name: "song.flac",
  title: "FLAC",
  file: { name: "song.flac" }
};
var secondTrack = {
  id: "local|second.mp3",
  name: "second.mp3",
  title: "Second",
  file: { name: "second.mp3" }
};
var unsupportedMessage = false;
sandbox.SonoraPlayer.init(audio, state, {
  unsupportedFlac: function () { unsupportedMessage = true; }
});
sandbox.SonoraPlayer.setTracks([track, flac]);
assert.strictEqual(sandbox.SonoraPlayer.playTrack(track, 0), true);
assert.strictEqual(audio.paused, false);
assert.strictEqual(sandbox.SonoraPlayer.toggleFavourite(), true);
assert.strictEqual(sandbox.SonoraPlayer.isFavourite(track), true);
sandbox.SonoraPlayer.toggleShuffle();
assert.strictEqual(state.shuffle, true);
assert.strictEqual(sandbox.SonoraPlayer.getQueue()[0], track);
assert.strictEqual(
  JSON.stringify(sandbox.SonoraPlayer.getQueue().map(function (item) { return item.id; }).sort()),
  JSON.stringify([track.id, flac.id].sort())
);
sandbox.SonoraPlayer.cycleRepeat();
assert.strictEqual(state.repeat, "all");
var playlist = sandbox.SonoraPlayer.createPlaylist("Road trip");
assert.strictEqual(playlist.name, "Road trip");
assert.strictEqual(sandbox.SonoraPlayer.addToPlaylist(playlist.id, track.id), true);
assert.strictEqual(sandbox.SonoraPlayer.movePlaylistItem(playlist.id, 0, 0), true);
assert.strictEqual(sandbox.SonoraPlayer.removeFromPlaylist(playlist.id, track.id), true);
sandbox.SonoraPlayer.setEqualizer({ enabled: true, bands: [4, 2, 0, -2, -4], preamp: 1 });
assert.deepStrictEqual(state.equalizer.bands, [4, 2, 0, -2, -4]);
assert.strictEqual(state.equalizer.enabled, true);
sandbox.SonoraPlayer.setQueue([track, secondTrack], track);
assert.strictEqual(sandbox.SonoraPlayer.getQueue().length, 2);
assert.strictEqual(sandbox.SonoraPlayer.moveQueueItem(1, 0), true);
assert.strictEqual(sandbox.SonoraPlayer.getQueue()[0], secondTrack);
assert.strictEqual(sandbox.SonoraPlayer.getCurrentIndex(), 1);
sandbox.SonoraPlayer.next();
assert.strictEqual(sandbox.SonoraPlayer.getCurrentTrack(), secondTrack);
sandbox.SonoraPlayer.setVolume(0.49);
assert.strictEqual(audio.volume, 0.5);
assert.strictEqual(sandbox.SonoraPlayer.playTrack(flac, 0), false);
assert.strictEqual(unsupportedMessage, true);
assert.strictEqual(saved.repeat, "all");
console.log("Player tests passed.");
