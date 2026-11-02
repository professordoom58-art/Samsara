# SAMSARA Agent Instructions

Read [README.md](README.md) for the project goals, target constraints, and verification requirements.

## Implementation guidelines

- Target the JioPhone 2 on KaiOS 2.5.x: 320 × 240 landscape, keypad-first navigation, legacy Gecko, and constrained memory/CPU.
- Prefer small vanilla JavaScript, HTML, and CSS modules. Avoid modern syntax or APIs unless compatibility with the target engine is verified.
- Bundle runtime dependencies. Do not rely on a network connection, CDN, runtime download, or WebAssembly.
- Treat codecs, Web Audio processing, DeviceStorage access, background playback, and sideloading as unverified until tested on the target firmware.
- Do not claim a format is supported based on its extension or UI alone. FLAC requires a real bundled decoder and tested decoding/seeking.
- Keep scanning incremental, avoid loading entire audio files into memory, and release playback and artwork resources when no longer needed.
- Handle unavailable files, unsupported media, permission failures, playback interruptions, and storage errors explicitly.
- Preserve keypad focus visibility and predictable navigation on every screen.
- Keep documentation aligned with the actual implementation; clearly distinguish automated, emulator, and physical-device test results.

## Changes and validation

- Inspect existing project files and follow established patterns before changing code. Do not overwrite unrelated work.
- Add or update focused tests for behavior changes. Use the repository's configured checks once they exist; do not invent successful build or device-test results.
- Validate the manifest, package contents, runtime dependencies, and target-engine syntax as the app scaffold becomes available.
- If target-device access is unavailable, state which requirements remain unverified instead of treating simulation as physical-device validation.

## Current repository status

The project has a vanilla HTML/CSS/JavaScript KaiOS app, a PowerShell WPK packaging script, and dependency-free Node.js smoke tests. Metadata parsing, library views, playlists, queue controls, playback, and a Web Audio EQ are implemented. FLAC audio decoding is not integrated, and KaiOS/JioPhone-specific behavior remains unverified without a physical device. See `README.md` for current build and test commands; do not treat browser tests as proof of device support.
