(function (global) {
  "use strict";

  var extensions = {
    mp3: true,
    wav: true,
    aac: true,
    m4a: true,
    ogg: true,
    opus: true,
    flac: true
  };

  function titleFromName(name) {
    var base = name.replace(/^.*[\\/]/, "");
    return base.replace(/\.[^.]+$/, "") || "Unknown track";
  }

  function extensionOf(name) {
    var match = /\.([^.]+)$/.exec(name);
    return match ? match[1].toLowerCase() : "";
  }

  function dirname(name) {
    var index = name.lastIndexOf("/");
    if (index < 0) {
      index = name.lastIndexOf("\\");
    }
    return index < 0 ? "Music" : name.substring(0, index) || "Music";
  }

  function makeTrack(file, storage) {
    var name = file.name || "Unknown track";
    var extension = extensionOf(name);
    if (!extensions[extension]) {
      return null;
    }

    return {
      id: [storage.storageName || "", name, file.size || 0, file.lastModified || 0].join("|"),
      title: titleFromName(name),
      artist: "Unknown artist",
      album: "Local music",
      name: name,
      size: file.size || 0,
      type: file.type || "",
      file: file,
      folder: dirname(name),
      storageName: storage.storageName || ""
    };
  }

  function getStorages() {
    var storages = [];
    var warnings = [];
    var names = ["music", "sdcard"];
    var i;
    var entries;
    var j;
    var storage;
    var key;
    var seen = {};

    if (!global.navigator.getDeviceStorages) {
      return {
        storages: [],
        error: "This runtime does not expose KaiOS DeviceStorage.",
        warnings: []
      };
    }

    for (i = 0; i < names.length; i += 1) {
      try {
        entries = global.navigator.getDeviceStorages(names[i]) || [];
      } catch (error) {
        global.console.error("Unable to access " + names[i] + " storage.", error);
        warnings.push("Unable to access " + names[i] + " storage.");
        continue;
      }

      for (j = 0; j < entries.length; j += 1) {
        storage = entries[j];
        key = (storage.storageName || names[i]) + "|" + names[i];
        if (!seen[key]) {
          seen[key] = true;
          storages.push(storage);
        }
      }
    }

    return { storages: storages, error: null, warnings: warnings };
  }

  function scan(onProgress, onDone) {
    var result = getStorages();
    var tracks = [];
    var found = {};
    var index = 0;
    var warnings = result.warnings ? result.warnings.slice() : [];
    var pendingMetadata = [];
    var activeMetadata = 0;
    var enumerationDone = false;
    var scanFinished = false;

    if (result.error) {
      onDone(result.error, tracks);
      return;
    }
    if (!result.storages.length) {
      onDone("No music storage is available.", tracks);
      return;
    }

    function finishIfDone() {
      if (!scanFinished && enumerationDone && activeMetadata === 0 && !pendingMetadata.length) {
        scanFinished = true;
        onDone(warnings.length ? warnings.join(" ") : null, tracks);
      }
    }

    function processMetadata() {
      var track;
      var cached;
      while (activeMetadata < 2 && pendingMetadata.length) {
        track = pendingMetadata.shift();
        cached = global.SonoraStorage.getMetadata(track.id);
        if (cached && !cached.hasArtwork) {
          track.title = cached.title || track.title;
          track.artist = cached.artist || track.artist;
          track.album = cached.album || track.album;
          track.albumArtist = cached.albumArtist || "";
          track.trackNumber = cached.trackNumber || "";
          track.discNumber = cached.discNumber || "";
          track.genre = cached.genre || "";
          track.year = cached.year || "";
          track.composer = cached.composer || "";
          track.lyrics = cached.lyrics || "";
          continue;
        }

        activeMetadata += 1;
        (function (metadataTrack) {
          global.SonoraMetadata.read(metadataTrack.file, function (error, metadata) {
            if (error) {
              global.console.warn("Unable to read metadata for " + metadataTrack.name + ".", error);
            } else {
              metadataTrack.title = metadata.title || metadataTrack.title;
              metadataTrack.artist = metadata.artist || metadataTrack.artist;
              metadataTrack.album = metadata.album || metadataTrack.album;
              metadataTrack.albumArtist = metadata.albumArtist || "";
              metadataTrack.trackNumber = metadata.track || "";
              metadataTrack.discNumber = metadata.disc || "";
              metadataTrack.genre = metadata.genre || "";
              metadataTrack.year = metadata.year || "";
              metadataTrack.composer = metadata.composer || "";
              metadataTrack.lyrics = metadata.lyrics || "";
              metadataTrack.artwork = metadata.artwork || null;
              global.SonoraStorage.setMetadata(metadataTrack.id, {
                title: metadataTrack.title,
                artist: metadataTrack.artist,
                album: metadataTrack.album,
                albumArtist: metadataTrack.albumArtist,
                trackNumber: metadataTrack.trackNumber,
                discNumber: metadataTrack.discNumber,
                genre: metadataTrack.genre,
                year: metadataTrack.year,
                composer: metadataTrack.composer,
                lyrics: metadataTrack.lyrics,
                hasArtwork: Boolean(metadataTrack.artwork)
              });
            }
            activeMetadata -= 1;
            global.setTimeout(processMetadata, 0);
            finishIfDone();
          });
        }(track));
      }
      finishIfDone();
    }

    function scanNextStorage() {
      var storage;
      var cursor;

      if (index >= result.storages.length) {
        enumerationDone = true;
        finishIfDone();
        return;
      }

      storage = result.storages[index];
      index += 1;
      try {
        cursor = storage.enumerate();
      } catch (error) {
        global.console.error("Unable to enumerate storage.", error);
        warnings.push("Unable to enumerate " + (storage.storageName || "music") + " storage.");
        scanNextStorage();
        return;
      }

      var completed = false;
      function finishStorage(error) {
        if (completed) {
          return;
        }
        completed = true;
        if (error) {
          warnings.push(error);
        }
        scanNextStorage();
      }

      cursor.onerror = function (event) {
        var message = event && event.target && event.target.error;
        global.console.error("Storage scan failed.", message || event);
        finishStorage("Unable to finish scanning " + (storage.storageName || "music") + " storage.");
      };
      cursor.onsuccess = function () {
        var file = cursor.result;
        var track;
        var key;

        if (file) {
          track = makeTrack(file, storage);
          if (track) {
            key = track.name + "|" + track.size + "|" + (file.lastModified || 0);
            if (!found[key]) {
              found[key] = true;
              tracks.push(track);
              pendingMetadata.push(track);
              if (onProgress) {
                onProgress(tracks.length);
              }
              processMetadata();
            }
          }
        }

        if (completed) {
          return;
        }
        if (cursor.done) {
          finishStorage(null);
        } else {
          cursor.continue();
        }
      };
    }

    scanNextStorage();
  }

  function compareTracks(a, b) {
    var left = a.title.toLowerCase();
    var right = b.title.toLowerCase();
    return left < right ? -1 : (left > right ? 1 : 0);
  }

  global.SonoraLibrary = {
    scan: scan,
    compareTracks: compareTracks,
    compareBy: function (field) {
      return function (a, b) {
        var left = String(a[field] || "").toLowerCase();
        var right = String(b[field] || "").toLowerCase();
        return left < right ? -1 : (left > right ? 1 : compareTracks(a, b));
      };
    }
  };
}(window));
