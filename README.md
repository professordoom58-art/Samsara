# SAMSARA

SAMSARA is an offline-first music player being built for the JioPhone 2 running KaiOS 2.5.x. The target device has a 320 × 240 landscape display, a physical T9 keypad, and constrained memory and processing resources.

> **Project status:** Working web-app build with a KaiOS `.wpk` packager. The app now has a fixed 320 × 240 Nothing OS-inspired player/library/settings UI, softkey and D-pad controls, local audio import, metadata extraction, IndexedDB persistence for imported files, and a Web Audio EQ. FLAC audio decoding and physical-device verification remain incomplete.

## Project goals

- Play local music offline, with a library scanned from internal storage and microSD where the platform allows.
- Provide keypad-first navigation, playlists, search, favourites, queue controls, and persistent playback state.
- Extract and cache track metadata and embedded artwork.
- Support MP3, WAV, AAC/M4A, and FLAC only after testing real files on the target runtime. FLAC requires a bundled, compatible software decoder; WebAssembly and runtime downloads are not acceptable.
- Investigate five-band equalization and background playback against the actual KaiOS 2.5 APIs and device behavior.
- Keep startup time, memory use, battery use, and dependency size appropriate for the device.

## Target platform and constraints

| Area | Target |
|---|---|
| Device | JioPhone 2 (2018) |
| Operating system | KaiOS 2.5.x |
| Display and input | 320 × 240 landscape; physical keypad |
| Application model | Packaged KaiOS application |
| Runtime | Legacy Gecko browser engine; use compatible JavaScript and APIs |
| Network | No network dependency after installation |

The availability and behavior of DeviceStorage, audio channels, codecs, Web Audio, background playback, and sideloading can vary by firmware. Verify them on-device; emulator results alone do not establish device support.

## Application components

The app is divided into small modules:

- Application lifecycle and keypad navigation
- File scanning, music library, and metadata parsing
- Playback engine and decoder management
- Persistent storage, playlists, and playback state
- Equalizer/DSP, if supported by the target runtime
- Screen rendering for library, now playing, queue, playlists, search, settings, and track information
- Metadata parsing for ID3 tags, FLAC Vorbis comments/pictures, WAV INFO, and M4A/iTunes atoms
- Local file/directory import with IndexedDB-backed audio-file persistence and localStorage-backed player/playlist state

Use vanilla JavaScript, HTML, and CSS unless a dependency provides a clear benefit and is compatible with the target engine. Bundle all runtime dependencies locally.

## Verification expectations

Test real audio data, not file extensions alone. Coverage should include:

- MP3 CBR/VBR, PCM WAV, AAC/M4A, and FLAC (including 16-bit and 24-bit files, sample-rate variations, metadata, artwork, and seeking)
- Library scanning, search, sorting, duplicate detection, and a collection of at least 1,000 tracks
- Playback controls, queue, shuffle/repeat, playlists, persistence, and error handling
- Keypad focus and navigation at the target screen resolution
- Equalizer output processing, background playback, screen-off behavior, and call interruptions
- Manifest/package validity, JavaScript compatibility, and bundled dependencies

Record whether each result comes from automated tests, an emulator, or a physical JioPhone 2. Physical-device checks are required before claiming device-specific behavior works.

## Development and installation

The app is plain HTML, CSS, and JavaScript. Build the packaged KaiOS archive from PowerShell:

```powershell
.\scripts\build.ps1
```

The script creates `dist\SAMSARA.wpk` with `manifest.webapp` at the archive root. The archive is an unsigned development package; it does not guarantee that JioPhone retail firmware will permit installation. Platform tooling/signing and device sideload access remain firmware-dependent.

The distributable `dist\SAMSARA.wpk` is kept in Git; only the temporary ZIP used during packaging is ignored. Local audio test files in `public/` are excluded. Add only media you have the right to redistribute.

### Implemented so far

- KaiOS `manifest.webapp` scaffold with requested storage and content-audio permissions.
- DeviceStorage enumeration for `music` and `sdcard`, with common local audio extensions, duplicate filtering, and alphabetical sorting.
- ID3v2.2–2.4 and ID3v1 tags; FLAC Vorbis comments/pictures; WAV INFO; and M4A/iTunes metadata extraction, with extracted text metadata cached locally.
- Library search and sort, artists/albums/folders group views, recent/most-played/favourites, persistent named playlists with rename/delete/add/remove/reorder/play, and reorderable queue.
- HTML audio playback, seek, previous/next, shuffle, repeat, keypad focus, and saved playback position/volume.
- Five-band Web Audio EQ and presets where `AudioContext`/`BiquadFilterNode` are available; interruption handlers for KaiOS audio-channel events.
- Fixed 320 × 240 Now Playing, Music Library, and Settings screens that leave system indicators to KaiOS, with softkeys, focus styling, and Tab-toggle presentation board.
- Explicit status messaging for codec errors and unsupported FLAC playback.

FLAC metadata/artwork parsing is implemented, but FLAC audio decoding is not yet integrated. Background playback and all Web Audio behavior require verification on target firmware.

The app does not create fake demo songs: the library lists real files discovered on device or selected through **LOAD MUSIC**. Imported files are persisted in IndexedDB where supported; playlists and playback settings are saved in localStorage.

### Local checks

Run the dependency-free smoke tests from the project directory with:

```powershell
node tests\library.test.js
node tests\player.test.js
node tests\metadata.test.js
node tests\equalizer.test.js
node tests\music-store.test.js
```

These tests exercise mocked storage/audio APIs, synthetic metadata, and IndexedDB persistence; they do not verify KaiOS hardware or audio codec support.

### Local MP3 browser check

An MP3 test file supplied locally was imported through **LOAD MUSIC** in the desktop browser preview. `ffprobe` identified MP3 audio at 44.1 kHz, stereo, 320 kb/s, with a duration of about 4:59 and ID3 title/artist/album tags. Metadata, embedded artwork, playback, timestamps, navigation, presentation-board rendering, and IndexedDB restore were exercised in the browser. The media file is intentionally not included in the repository.

This does **not** establish KaiOS/JioPhone codec support. DeviceStorage permission/access, physical keypad events, call interruptions, screen-off playback, EQ on KaiOS Gecko, and physical-device memory/battery performance remain unverified. FLAC decoding remains unimplemented.

## Definition of done

The project is complete only when the required playback formats (including FLAC through a bundled decoder), metadata and artwork, library, playlists, controls, equalizer, keypad navigation, and background behavior have been implemented and tested; automated tests pass; dependencies are bundled; and physical-device results and any firmware limitations are documented.
