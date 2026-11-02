(function (global) {
  "use strict";

  var frames = {
    TIT2: "title", TT2: "title",
    TPE1: "artist", TP1: "artist",
    TALB: "album", TAL: "album",
    TPE2: "albumArtist", TP2: "albumArtist",
    TRCK: "track", TRK: "track",
    TPOS: "disc", TPA: "disc",
    TCON: "genre", TCO: "genre",
    TYER: "year", TDRC: "year", TYE: "year",
    TCMP: "composer", TCM: "composer",
    USLT: "lyrics", ULT: "lyrics",
    COMM: "comment", COM: "comment"
  };

  function readInteger(bytes, offset, length) {
    var value = 0;
    var i;
    for (i = 0; i < length; i += 1) {
      value = value * 256 + bytes[offset + i];
    }
    return value;
  }

  function syncSafe(bytes, offset) {
    return ((bytes[offset] & 127) << 21) |
      ((bytes[offset + 1] & 127) << 14) |
      ((bytes[offset + 2] & 127) << 7) |
      (bytes[offset + 3] & 127);
  }

  function decodeText(bytes, encoding) {
    var result = "";
    var i;
    var code;
    if (encoding === 1 || encoding === 2) {
      var little = encoding === 1 && bytes.length > 2 && bytes[1] === 255;
      i = encoding === 1 && bytes.length > 2 && (bytes[1] === 254 || bytes[1] === 255) ? 2 : 0;
      for (; i + 1 < bytes.length; i += 2) {
        code = little ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1];
        if (!code) {
          break;
        }
        result += String.fromCharCode(code);
      }
    } else if (encoding === 3) {
      try {
        var escaped = "";
        for (i = 0; i < bytes.length; i += 1) {
          if (bytes[i] === 0) {
            break;
          }
          escaped += "%" + ("0" + bytes[i].toString(16)).slice(-2);
        }
        result = decodeURIComponent(escaped);
      } catch (ignore) {
        result = "";
      }
    } else {
      for (i = 0; i < bytes.length && bytes[i]; i += 1) {
        code = bytes[i];
        result += String.fromCharCode(code);
      }
    }
    return result.replace(/\u0000/g, "").replace(/^\s+|\s+$/g, "");
  }

  function textFrame(bytes) {
    if (!bytes.length) {
      return "";
    }
    return decodeText(bytes.subarray(1), bytes[0]);
  }

  function terminated(bytes, offset, encoding) {
    var i = offset;
    if (encoding === 1 || encoding === 2) {
      while (i + 1 < bytes.length && (bytes[i] !== 0 || bytes[i + 1] !== 0)) {
        i += 2;
      }
      return { value: decodeText(bytes.subarray(offset, i), encoding), next: Math.min(i + 2, bytes.length) };
    }
    while (i < bytes.length && bytes[i] !== 0) {
      i += 1;
    }
    return { value: decodeText(bytes.subarray(offset, i), encoding), next: Math.min(i + 1, bytes.length) };
  }

  function pictureFrame(bytes, version) {
    var encoding = bytes[0];
    var offset;
    var mime;
    var description;
    if (version === 2) {
      mime = "image/" + String.fromCharCode(bytes[1], bytes[2], bytes[3]).toLowerCase();
      offset = 4;
    } else {
      var mimeEnd = 1;
      while (mimeEnd < bytes.length && bytes[mimeEnd] !== 0) {
        mimeEnd += 1;
      }
      mime = decodeText(bytes.subarray(1, mimeEnd), 0);
      offset = mimeEnd + 1;
    }
    offset += 1;
    description = terminated(bytes, offset, encoding);
    if (description.next >= bytes.length) {
      return null;
    }
    return new Blob([bytes.subarray(description.next)], { type: mime || "image/jpeg" });
  }

  function parseID3(bytes, metadata) {
    var version;
    var tagSize;
    var offset;
    var end;
    var headerLength;
    var idLength;
    var sizeLength;
    var frameId;
    var frameSize;
    var data;
    var key;
    var value;
    var flags;

    if (bytes.length < 10 || bytes[0] !== 73 || bytes[1] !== 68 || bytes[2] !== 51) {
      return;
    }
    version = bytes[3];
    if (version < 2 || version > 4) {
      return;
    }
    tagSize = syncSafe(bytes, 6);
    offset = 10;
    end = Math.min(bytes.length, 10 + tagSize);
    if (bytes[5] & 64) {
      headerLength = version === 2 ? bytes[offset] : (version === 4 ? syncSafe(bytes, offset) : readInteger(bytes, offset, 4));
      offset += version === 2 || version === 3 ? headerLength + 4 : headerLength;
    }
    idLength = version === 2 ? 3 : 4;
    sizeLength = version === 4 || version === 2 ? idLength : 4;

    while (offset + idLength + sizeLength <= end) {
      frameId = decodeText(bytes.subarray(offset, offset + idLength), 0);
      if (!frameId || /^\u0000+$/.test(frameId)) {
        break;
      }
      if (version === 4) {
        frameSize = syncSafe(bytes, offset + idLength);
      } else {
        frameSize = readInteger(bytes, offset + idLength, sizeLength);
      }
      flags = version === 2 ? 0 : readInteger(bytes, offset + idLength + sizeLength, 2);
      headerLength = idLength + sizeLength + (version === 2 ? 0 : 2);
      if (frameSize <= 0 || offset + headerLength + frameSize > end) {
        break;
      }
      data = bytes.subarray(offset + headerLength, offset + headerLength + frameSize);
      offset += headerLength + frameSize;
      if (flags & 8 || flags & 64) {
        continue;
      }
      if (frameId === "APIC" || frameId === "PIC") {
        if (!metadata.artwork) {
          metadata.artwork = pictureFrame(data, version);
        }
        continue;
      }
      if (frameId === "USLT" || frameId === "ULT" || frameId === "COMM" || frameId === "COM") {
        if (data.length < 4) {
          continue;
        }
        var encoding = data[0];
        var languageOffset = frameId === "USLT" || frameId === "ULT" ? 4 : 4;
        var description = terminated(data, languageOffset, encoding);
        value = terminated(data, description.next, encoding).value;
        key = frames[frameId];
        if (key && value && !metadata[key]) {
          metadata[key] = value;
        }
        continue;
      }
      key = frames[frameId];
      if (key && !metadata[key] && (frameId.charAt(0) === "T")) {
        value = textFrame(data);
        if (value) {
          metadata[key] = value;
        }
      }
    }
  }

  function parseID3v1(bytes, metadata) {
    var start;
    if (bytes.length < 128) {
      return;
    }
    start = bytes.length - 128;
    if (bytes[start] !== 84 || bytes[start + 1] !== 65 || bytes[start + 2] !== 71) {
      return;
    }
    if (!metadata.title) {
      metadata.title = decodeText(bytes.subarray(start + 3, start + 33), 0);
    }
    if (!metadata.artist) {
      metadata.artist = decodeText(bytes.subarray(start + 33, start + 63), 0);
    }
    if (!metadata.album) {
      metadata.album = decodeText(bytes.subarray(start + 63, start + 93), 0);
    }
    if (!metadata.year) {
      metadata.year = decodeText(bytes.subarray(start + 93, start + 97), 0);
    }
  }

  function parseFlac(bytes, metadata) {
    var offset = 4;
    var last = false;
    if (bytes.length < 4 || bytes[0] !== 102 || bytes[1] !== 76 || bytes[2] !== 97 || bytes[3] !== 67) {
      return;
    }
    metadata.format = "FLAC";
    while (!last && offset + 4 <= bytes.length) {
      var header = bytes[offset];
      var type = header & 127;
      var length = (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
      var start = offset + 4;
      var end = start + length;
      if (end > bytes.length) {
        break;
      }
      last = Boolean(header & 128);
      if (type === 0 && length === 34) {
        var packed = (bytes[start + 10] * 16777216) + (bytes[start + 11] << 16) +
          (bytes[start + 12] << 8) + bytes[start + 13];
        metadata.sampleRate = packed >>> 12;
        metadata.channels = ((packed >>> 9) & 7) + 1;
        metadata.bitsPerSample = ((packed >>> 4) & 31) + 1;
        var totalSamples = ((packed & 15) * 4294967296) +
          (bytes[start + 14] * 16777216) + (bytes[start + 15] << 16) +
          (bytes[start + 16] << 8) + bytes[start + 17];
        if (metadata.sampleRate) {
          metadata.duration = totalSamples / metadata.sampleRate;
        }
      } else if (type === 4) {
        parseVorbisComments(bytes.subarray(start, end), metadata);
      } else if (type === 6 && !metadata.artwork) {
        metadata.artwork = parseFlacPicture(bytes.subarray(start, end));
      }
      offset = end;
    }
  }

  function littleInteger(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) | (bytes[offset + 3] * 16777216)) >>> 0;
  }

  function readVorbisString(bytes, offset) {
    var length;
    if (offset + 4 > bytes.length) {
      return null;
    }
    length = littleInteger(bytes, offset);
    if (offset + 4 + length > bytes.length) {
      return null;
    }
    return {
      value: decodeText(bytes.subarray(offset + 4, offset + 4 + length), 3),
      next: offset + 4 + length
    };
  }

  function setComment(metadata, key, value) {
    var names = {
      TITLE: "title", ARTIST: "artist", ALBUM: "album",
      ALBUMARTIST: "albumArtist", TRACKNUMBER: "track",
      DISCNUMBER: "disc", GENRE: "genre", DATE: "year",
      COMPOSER: "composer", LYRICS: "lyrics"
    };
    key = names[key.toUpperCase()];
    if (key && value && !metadata[key]) {
      metadata[key] = value;
    }
  }

  function parseVorbisComments(bytes, metadata) {
    var vendor = readVorbisString(bytes, 0);
    var offset;
    var count;
    var i;
    var entry;
    var equals;
    if (!vendor || vendor.next + 4 > bytes.length) {
      return;
    }
    offset = vendor.next;
    count = littleInteger(bytes, offset);
    offset += 4;
    for (i = 0; i < count && offset < bytes.length; i += 1) {
      entry = readVorbisString(bytes, offset);
      if (!entry) {
        break;
      }
      offset = entry.next;
      equals = entry.value.indexOf("=");
      if (equals > 0) {
        setComment(metadata, entry.value.substring(0, equals), entry.value.substring(equals + 1));
      }
    }
  }

  function parseFlacPicture(bytes) {
    var offset = 4;
    var mimeLength;
    var descriptionLength;
    var dataLength;
    var mime;
    if (bytes.length < 32) {
      return null;
    }
    mimeLength = readInteger(bytes, offset, 4);
    offset += 4;
    if (offset + mimeLength + 4 > bytes.length) {
      return null;
    }
    mime = decodeText(bytes.subarray(offset, offset + mimeLength), 3);
    offset += mimeLength;
    descriptionLength = readInteger(bytes, offset, 4);
    offset += 4 + descriptionLength;
    if (offset + 20 > bytes.length) {
      return null;
    }
    offset += 16;
    dataLength = readInteger(bytes, offset, 4);
    offset += 4;
    if (offset + dataLength > bytes.length) {
      return null;
    }
    return new Blob([bytes.subarray(offset, offset + dataLength)], { type: mime || "image/jpeg" });
  }

  function parseWave(bytes, metadata) {
    var offset = 12;
    if (bytes.length < 12 || decodeText(bytes.subarray(0, 4), 0) !== "RIFF" ||
      decodeText(bytes.subarray(8, 12), 0) !== "WAVE") {
      return;
    }
    metadata.format = "WAV";
    while (offset + 8 <= bytes.length) {
      var id = decodeText(bytes.subarray(offset, offset + 4), 0);
      var length = littleInteger(bytes, offset + 4);
      var start = offset + 8;
      var end = Math.min(bytes.length, start + length);
      if (id === "LIST" && decodeText(bytes.subarray(start, start + 4), 0) === "INFO") {
        var cursor = start + 4;
        while (cursor + 8 <= end) {
          var infoId = decodeText(bytes.subarray(cursor, cursor + 4), 0);
          var infoLength = littleInteger(bytes, cursor + 4);
          var infoValue = decodeText(bytes.subarray(cursor + 8, Math.min(end, cursor + 8 + infoLength)), 3);
          var infoMap = { INAM: "title", IART: "artist", IPRD: "album", ICRD: "year", IGNR: "genre", ITRK: "track", ICMT: "comment" };
          if (infoMap[infoId] && infoValue && !metadata[infoMap[infoId]]) {
            metadata[infoMap[infoId]] = infoValue;
          }
          cursor += 8 + infoLength + (infoLength & 1);
        }
      }
      if (end <= offset || end >= bytes.length) {
        break;
      }
      offset = end + (length & 1);
    }
  }

  function atomText(bytes) {
    return decodeText(bytes, 3).replace(/\u0000/g, "");
  }

  function parseM4a(bytes, metadata) {
    var fields = {
      "\u00a9nam": "title", "\u00a9ART": "artist", "aART": "albumArtist",
      "\u00a9alb": "album", "\u00a9gen": "genre", "\u00a9day": "year",
      "\u00a9wrt": "composer"
    };
    function walk(start, end, depth, item) {
      var offset = start;
      if (depth > 8) {
        return;
      }
      while (offset + 8 <= end) {
        var size = readInteger(bytes, offset, 4);
        var type = decodeText(bytes.subarray(offset + 4, offset + 8), 0);
        var header = 8;
        if (size === 1) {
          if (offset + 16 > end) {
            return;
          }
          size = readInteger(bytes, offset + 12, 4);
          header = 16;
        } else if (size === 0) {
          size = end - offset;
        }
        if (size < header || offset + size > end) {
          return;
        }
        var dataStart = offset + header;
        var atomEnd = offset + size;
        if (type === "data" && item && dataStart + 8 <= atomEnd) {
          var kind = readInteger(bytes, dataStart, 4) & 16777215;
          var payload = bytes.subarray(dataStart + 8, atomEnd);
          if (fields[item] && !metadata[fields[item]]) {
            metadata[fields[item]] = atomText(payload);
          } else if (item === "trkn" && payload.length >= 6) {
            metadata.track = String((payload[2] << 8) | payload[3]);
          } else if (item === "disk" && payload.length >= 6) {
            metadata.disc = String((payload[2] << 8) | payload[3]);
          } else if (item === "covr" && !metadata.artwork) {
            metadata.artwork = new Blob([payload], { type: kind === 14 ? "image/png" : "image/jpeg" });
          }
        } else if (type === "meta") {
          walk(dataStart + 4, atomEnd, depth + 1, item);
        } else if (type === "moov" || type === "udta" || type === "ilst" || type === "trak" ||
          type === "mdia" || type === "minf" || type === "stbl" || type === "edts") {
          walk(dataStart, atomEnd, depth + 1, type === "ilst" ? "ilst" : item);
        } else if (item === "ilst") {
          walk(dataStart, atomEnd, depth + 1, type);
        }
        offset += size;
      }
    }
    var i;
    var isM4a = false;
    var moovOffset = -1;
    for (i = 4; i + 4 <= bytes.length; i += 1) {
      var atomName = decodeText(bytes.subarray(i, i + 4), 0);
      if (atomName === "ftyp") {
        isM4a = true;
      } else if (atomName === "moov") {
        moovOffset = i - 4;
        isM4a = true;
      }
    }
    if (isM4a) {
      metadata.format = "M4A";
      if (moovOffset >= 0) {
        var moovLength = readInteger(bytes, moovOffset, 4);
        walk(moovOffset, Math.min(bytes.length, moovOffset + moovLength), 0, "");
      } else {
        walk(0, bytes.length, 0, "");
      }
    }
  }

  function parseBytes(buffer) {
    var bytes = new Uint8Array(buffer);
    var metadata = {};
    parseID3(bytes, metadata);
    parseID3v1(bytes, metadata);
    parseFlac(bytes, metadata);
    parseWave(bytes, metadata);
    parseM4a(bytes, metadata);
    return metadata;
  }

  function read(file, callback) {
    var reader;
    var head;
    var headBytes;
    var done = false;
    function finish(error, metadata) {
      if (done) {
        return;
      }
      done = true;
      callback(error, metadata || {});
    }

    if (!file || typeof file.slice !== "function" || !global.FileReader) {
      finish(null, {});
      return;
    }
    reader = new global.FileReader();
    reader.onerror = function () {
      finish(reader.error || new Error("Unable to read media metadata."));
    };
    reader.onload = function () {
      var metadata;
      try {
        if (!headBytes) {
          headBytes = new Uint8Array(reader.result);
          if (file.size > 128) {
            reader.readAsArrayBuffer(file.slice(Math.max(0, file.size - 128)));
          } else {
            finish(null, parseBytes(headBytes));
          }
          return;
        }
        metadata = parseBytes(headBytes);
        var tailBytes = new Uint8Array(reader.result);
        parseID3v1(tailBytes, metadata);
        if (/\.m4a$/i.test(file.name || "")) {
          parseM4a(tailBytes, metadata);
        }
        finish(null, metadata);
      } catch (error) {
        finish(error);
      }
    };
    head = file.slice(0, Math.min(file.size, 512 * 1024));
    reader.readAsArrayBuffer(head);
  }

  global.SonoraMetadata = {
    read: read,
    parseBytes: parseBytes
  };
}(window));
