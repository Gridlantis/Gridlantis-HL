# Open HL

A self-hosted dashboard: notes, flows, mail, voicemail and texts, reminders and
calendar, files and live folders, monitoring, VM Lab, phone and PC hosts,
containers, smart home, finance and local AI.

## Run

    cp .env.example .env    # set PASSWORD at least
    node server.js          # http://localhost:3000

Node 22+ and no npm dependencies.
Data lives in `data/` and uploads in `uploads/`, both created on first start.

Check every page renders: `node tools/lint-pages.js`.

## License

Open HL is source-available under the [PolyForm Strict License 1.0.0](LICENSE):
you may use it for personal and other noncommercial purposes, but not change it,
build on it, or redistribute it. Bundled third-party parts keep their own
licenses: three.js (MIT, `src/ui/vendor/three-0.170.0/LICENSE`), the fonts
(SIL OFL and CC0, `src/ui/vendor/fonts/LICENSE.txt`) and Font Awesome
(`src/ui/vendor/fontawesome`).
