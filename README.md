<p align="center">
  <img src="apps/web/public/lockup.svg" width="96" alt="xrns">
</p>

A browser tool for Renoise song files. Drop an `.xrns` in and see what is inside it:
song structure, tracks, patterns, notes. Then diff it against another version of the
same song, which is the part that does not exist anywhere else. Trackers have no
version control, so there is no way to answer what changed between `song_v3.xrns` and
`song_v4.xrns`.

Everything runs in the browser. The file never leaves the machine.

`packages/core` reads the format and holds the song model. It imports no node and no
DOM, so the same code runs in a page, in a worker and in a test.

## Running

    npm install
    npm run dev

That builds `packages/core`, starts Vite and prints a local address. Drop an `.xrns`
file on the page, then a second one to compare against it.

    npm run check

`check` runs the type checker, ESLint, Prettier and the tests.

The reader tests also run against the demo songs in a local Renoise install, which
carry far denser pattern data than the committed fixtures. They are found
automatically on Windows, or set `RENOISE_LIBRARY_SONGS` to the folder that holds
them. Tests that use them skip when it is absent.
