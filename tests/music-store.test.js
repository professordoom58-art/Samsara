"use strict";

var assert = require("assert");
var fs = require("fs");
var vm = require("vm");
var records = {};
var stores = {};
var database = {
  objectStoreNames: {
    contains: function (name) { return Boolean(stores[name]); }
  },
  createObjectStore: function (name) {
    stores[name] = true;
  },
  transaction: function () {
    var transaction = {};
    transaction.objectStore = function () {
      return {
        put: function (record) {
          var request = {};
          setTimeout(function () {
            records[record.id] = record;
            if (request.onsuccess) {
              request.onsuccess();
            }
            if (transaction.oncomplete) {
              transaction.oncomplete();
            }
          }, 0);
          return request;
        },
        getAll: function () {
          var request = {};
          setTimeout(function () {
            request.result = Object.keys(records).map(function (id) { return records[id]; });
            if (request.onsuccess) {
              request.onsuccess();
            }
          }, 0);
          return request;
        }
      };
    };
    return transaction;
  },
  close: function () {}
};
var sandbox = {
  indexedDB: {
    open: function () {
      var request = {};
      setTimeout(function () {
        request.result = database;
        if (request.onupgradeneeded) {
          request.onupgradeneeded();
        }
        if (request.onsuccess) {
          request.onsuccess();
        }
      }, 0);
      return request;
    }
  }
};
sandbox.window = sandbox;
vm.runInNewContext(fs.readFileSync("js/music-store.js", "utf8"), sandbox);

var track = {
  id: "import|demo.mp3",
  name: "demo.mp3",
  title: "Demo",
  artist: "Artist",
  album: "Album",
  type: "audio/mpeg",
  size: 12,
  duration: 30,
  folder: "Music",
  artwork: null,
  file: { name: "demo.mp3", lastModified: 1 }
};

sandbox.SamsaraMusicStore.save(track, function (saveError) {
  assert.ifError(saveError);
  sandbox.SamsaraMusicStore.list(function (listError, restored) {
    assert.ifError(listError);
    assert.strictEqual(restored.length, 1);
    assert.strictEqual(restored[0].id, track.id);
    assert.strictEqual(restored[0].file.name, track.file.name);
    console.log("Imported music persistence tests passed.");
  });
});
