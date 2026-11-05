(function (global) {
  "use strict";

  var DATABASE = "samsara-music";
  var VERSION = 1;
  var STORE = "tracks";
  var database = null;
  var opening = false;
  var waiters = [];

  function open(callback) {
    var request;
    var completed = false;
    if (!global.indexedDB) {
      callback(new Error("IndexedDB is unavailable in this runtime."));
      return;
    }
    if (database) {
      callback(null, database);
      return;
    }
    waiters.push(callback);
    if (opening) {
      return;
    }
    opening = true;
    function finish(error, result) {
      var callbacks;
      var i;
      if (completed) {
        return;
      }
      completed = true;
      opening = false;
      if (!error) {
        database = result;
        database.onversionchange = function () {
          database.close();
          database = null;
        };
      }
      callbacks = waiters.slice();
      waiters = [];
      for (i = 0; i < callbacks.length; i += 1) {
        callbacks[i](error || null, result || null);
      }
    }
    request = global.indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = function () {
      var openedDatabase = request.result;
      if (!openedDatabase.objectStoreNames.contains(STORE)) {
        openedDatabase.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = function () {
      finish(null, request.result);
    };
    request.onerror = function () {
      finish(request.error || new Error("Unable to open the music library database."));
    };
    request.onblocked = function () {
      finish(new Error("Music library database upgrade is blocked."));
    };
  }

  function save(track, callback) {
    open(function (error, database) {
      var transaction;
      var request;
      var completed = false;
      function finish(saveError) {
        if (!completed) {
          completed = true;
          callback(saveError || null);
        }
      }
      if (error) {
        finish(error);
        return;
      }
      transaction = database.transaction([STORE], "readwrite");
      request = transaction.objectStore(STORE).put({
        id: track.id,
        name: track.name,
        title: track.title,
        artist: track.artist,
        album: track.album,
        type: track.type,
        size: track.size,
        lastModified: track.file.lastModified || 0,
        folder: track.folder,
        duration: track.duration,
        artwork: track.artwork || null,
        file: track.file
      });
      request.onerror = function () {
        finish(request.error || new Error("Unable to save the imported track."));
      };
      transaction.onabort = function () {
        finish(transaction.error || new Error("Saving the imported track was aborted."));
      };
      transaction.oncomplete = function () {
        finish(null);
      };
    });
  }

  function list(callback) {
    open(function (error, database) {
      var transaction;
      var request;
      var completed = false;
      function finish(listError, records) {
        if (!completed) {
          completed = true;
          callback(listError || null, records || []);
        }
      }
      if (error) {
        finish(error, []);
        return;
      }
      transaction = database.transaction([STORE], "readonly");
      request = transaction.objectStore(STORE).getAll();
      request.onerror = function () {
        finish(request.error || new Error("Unable to restore imported tracks."), []);
      };
      request.onsuccess = function () {
        finish(null, request.result || []);
      };
      transaction.onabort = function () {
        finish(transaction.error || new Error("Restoring imported tracks was aborted."), []);
      };
    });
  }

  global.SamsaraMusicStore = {
    save: save,
    list: list
  };
}(window));
