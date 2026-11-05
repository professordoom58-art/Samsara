"use strict";

var assert = require("assert");
var fs = require("fs");
var vm = require("vm");

var connections = [];
var filters = [];
var preamp;
var context = {
  state: "running",
  destination: { name: "destination" },
  createMediaElementSource: function () {
    return { connect: function (target) { connections.push(["source", target]); } };
  },
  createGain: function () {
    preamp = { gain: { value: 1 }, connect: function (target) { connections.push(["gain", target]); } };
    return preamp;
  },
  createBiquadFilter: function () {
    var filter = {
      type: "",
      frequency: { value: 0 },
      Q: { value: 0 },
      gain: { value: 0 },
      connect: function (target) { connections.push(["filter", target]); }
    };
    filters.push(filter);
    return filter;
  }
};

function AudioContext() {
  return context;
}

var audio = {
  volume: 1,
  paused: true,
  addEventListener: function () {},
  createElement: function () {},
  load: function () {},
  play: function () {},
  pause: function () {}
};
var sandbox = {
  console: console,
  setTimeout: setTimeout,
  addEventListener: function () {},
  AudioContext: AudioContext,
  URL: { createObjectURL: function () { return "blob:test"; }, revokeObjectURL: function () {} },
  SonoraStorage: { save: function () {} }
};
sandbox.window = sandbox;
vm.runInNewContext(fs.readFileSync("js/player.js", "utf8"), sandbox);

var state = {
  favourites: [], recent: [], playCounts: {}, playlists: [], metadata: {},
  currentId: null, position: 0, volume: 0.8, shuffle: false, repeat: "off",
  equalizer: { enabled: false, preamp: 0, bands: [0, 0, 0, 0, 0], preset: "Flat" }
};
sandbox.SonoraPlayer.init(audio, state, {});
assert.strictEqual(sandbox.SonoraPlayer.isEqualizerAvailable(), true);
sandbox.SonoraPlayer.setEqualizer({ enabled: true, preamp: 2, bands: [6, 3, 0, -2, -4] });
assert.deepStrictEqual(filters.map(function (item) { return item.frequency.value; }), [60, 230, 910, 3600, 14000]);
assert.deepStrictEqual(filters.map(function (item) { return item.gain.value; }), [6, 3, 0, -2, -4]);
assert.strictEqual(preamp.gain.value, 2);
assert.strictEqual(connections.length, 7);
console.log("Equalizer graph and gain application tests passed.");
