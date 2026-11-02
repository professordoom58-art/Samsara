"use strict";

var assert = require("assert");
var fs = require("fs");
var vm = require("vm");

function makeStorage(name, files) {
  return {
    storageName: name,
    enumerate: function () {
      var index = 0;
      var cursor = {
        result: null,
        done: false,
        continue: function () {
          index += 1;
          dispatch();
        }
      };

      function dispatch() {
        setTimeout(function () {
          cursor.result = files[index] || null;
          cursor.done = index >= files.length;
          if (cursor.onsuccess) {
            cursor.onsuccess();
          }
        }, 0);
      }

      dispatch();
      return cursor;
    }
  };
}

var sandbox = {
  console: console,
  setTimeout: setTimeout,
  SonoraStorage: {
    getMetadata: function () { return null; },
    setMetadata: function () {}
  },
  SonoraMetadata: {
    read: function (file, callback) {
      callback(null, {
        title: file.name.indexOf("Zebra") === 0 ? "Tagged Zebra" : "",
        artist: "Test artist"
      });
    }
  },
  navigator: {
    getDeviceStorages: function (type) {
      return type === "music" ? [musicStorage] : [sdStorage];
    }
  }
};
var musicStorage = makeStorage("internal", [
  { name: "Zebra.mp3", size: 10, lastModified: 1, type: "audio/mpeg" },
  { name: "Notes.txt", size: 2, lastModified: 1, type: "text/plain" }
]);
var sdStorage = makeStorage("card", [
  { name: "Alpha.wav", size: 20, lastModified: 2, type: "audio/wav" }
]);
sandbox.window = sandbox;
vm.runInNewContext(fs.readFileSync("js/library.js", "utf8"), sandbox);

sandbox.SonoraLibrary.scan(null, function (error, tracks) {
  try {
    assert.strictEqual(error, null);
    assert.deepStrictEqual(
      Array.prototype.map.call(tracks, function (track) { return track.title; }).sort(),
      ["Alpha", "Tagged Zebra"]
    );
    assert.strictEqual(tracks.length, 2, "unsupported files should be excluded");
    assert.ok(tracks.every(function (track) { return !!track.file; }));
    assert.ok(tracks.some(function (track) {
      return track.title === "Tagged Zebra" && track.artist === "Test artist";
    }), "scanned metadata should be applied to tracks");

    var unsupportedRuntime = {
      console: console,
      navigator: {}
    };
    unsupportedRuntime.window = unsupportedRuntime;
    vm.runInNewContext(fs.readFileSync("js/library.js", "utf8"), unsupportedRuntime);
    unsupportedRuntime.SonoraLibrary.scan(null, function (storageError, emptyTracks) {
      try {
        assert.strictEqual(storageError, "This runtime does not expose KaiOS DeviceStorage.");
        assert.strictEqual(emptyTracks.length, 0);
        console.log("Unsupported-runtime test passed.");
      } catch (testError) {
        console.error(testError);
        process.exitCode = 1;
      }
    });
    console.log("Library scan tests passed.");
  } catch (testError) {
    console.error(testError);
    process.exitCode = 1;
  }
});
