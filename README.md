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
