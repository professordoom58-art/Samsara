"use strict";

var assert = require("assert");
var fs = require("fs");
var vm = require("vm");

function syncSafe(value) {
  return [(value >> 21) & 127, (value >> 14) & 127, (value >> 7) & 127, value & 127];
}

function frame(id, data) {
  var length = data.length;
  return Buffer.concat([
    Buffer.from(id, "ascii"),
    Buffer.from([(length >> 24) & 255, (length >> 16) & 255, (length >> 8) & 255, length & 255, 0, 0]),
    Buffer.from(data)
  ]);
}

var sandbox = { Blob: Blob, console: console };
sandbox.window = sandbox;
vm.runInNewContext(fs.readFileSync("js/metadata.js", "utf8"), sandbox);

var picture = Buffer.from([0, 105, 109, 97, 103, 101, 47, 106, 112, 101, 103, 0, 3, 0, 255, 216, 255, 217]);
var tag = Buffer.concat([
  frame("TIT2", [0].concat(Array.from(Buffer.from("Eyes Without A Face")))),
  frame("TPE1", [0].concat(Array.from(Buffer.from("Billy Idol")))),
  frame("TALB", [0].concat(Array.from(Buffer.from("Rebel Yell")))),
  frame("APIC", picture)
]);
var header = Buffer.from([73, 68, 51, 3, 0, 0].concat(syncSafe(tag.length)));
var bytes = Buffer.concat([header, tag]);
var result = sandbox.SonoraMetadata.parseBytes(bytes);

assert.strictEqual(result.title, "Eyes Without A Face");
assert.strictEqual(result.artist, "Billy Idol");
assert.strictEqual(result.album, "Rebel Yell");
assert.ok(result.artwork instanceof Blob);
assert.strictEqual(result.artwork.type, "image/jpeg");

function le32(value) {
  return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
}

var commentText = Buffer.from("TITLE=Flac title", "utf8");
var commentBlock = Buffer.concat([
  Buffer.from(le32(0)),
  Buffer.from(le32(1)),
  Buffer.from(le32(commentText.length)),
  commentText
]);
var flacBlockHeader = Buffer.from([0x84, (commentBlock.length >> 16) & 255, (commentBlock.length >> 8) & 255, commentBlock.length & 255]);
var flac = Buffer.concat([Buffer.from("fLaC"), flacBlockHeader, commentBlock]);
assert.strictEqual(sandbox.SonoraMetadata.parseBytes(flac).title, "Flac title");

var infoData = Buffer.concat([
  Buffer.from("INFO"),
  Buffer.from("INAM"),
  Buffer.from(le32(9)),
  Buffer.from("Wave song"),
  Buffer.from([0])
]);
var riff = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from(le32(4 + 8 + infoData.length)),
  Buffer.from("WAVE"),
  Buffer.from("LIST"),
  Buffer.from(le32(infoData.length)),
  infoData
]);
assert.strictEqual(sandbox.SonoraMetadata.parseBytes(riff).title, "Wave song");

function atom(type, content) {
  return Buffer.concat([
    Buffer.from([(content.length + 8) >>> 24, ((content.length + 8) >>> 16) & 255, ((content.length + 8) >>> 8) & 255, (content.length + 8) & 255]),
    Buffer.from(type, "binary"),
    content
  ]);
}

var m4aTitle = atom("©nam", atom("data", Buffer.concat([
  Buffer.from([0, 0, 0, 1, 0, 0, 0, 0]),
  Buffer.from("Atom song", "utf8")
])));
var ilst = atom("ilst", m4aTitle);
var meta = atom("meta", Buffer.concat([Buffer.from([0, 0, 0, 0]), ilst]));
var udta = atom("udta", meta);
var moov = atom("moov", udta);
var mp4 = Buffer.concat([atom("ftyp", Buffer.from("M4A ")), moov]);
assert.strictEqual(sandbox.SonoraMetadata.parseBytes(mp4).title, "Atom song");
console.log("ID3, FLAC, WAV, M4A metadata and artwork tests passed.");
