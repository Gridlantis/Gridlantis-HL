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

## Password

`PASSWORD` is the only required setting. Open HL refuses to start without it.

1. Copy the example file: `cp .env.example .env`
2. Open `.env` and replace `change-me` with a password of your own:

       PASSWORD=your-own-long-password

3. Start Open HL (`node server.js`) and open http://localhost:3000. The sign-in
   page asks for that password. The desktop and Android apps use the same one.

To change the password, edit `PASSWORD` in `.env` and restart Open HL.

A few rules for `.env`: one `KEY=value` per line, comments on their own line
(a `#` after a value becomes part of the value), and a variable already set in
your shell overrides the file.

## API keys

Every key below is optional. A feature whose keys are missing simply stays
off, and the rest of Open HL works without it. Unless the table says
otherwise, put keys in `.env` and restart Open HL. On the home page, click
Halo and choose **Help** to see the same information inside the app.

| Feature | What it needs | Where to get it |
| --- | --- | --- |
| AI chat | `OPENROUTER_API_KEY` for cloud models. Local models through Ollama need no key; set `OLLAMA_HOST` if Ollama runs on another machine. | openrouter.ai/keys. The key can also be pasted on the AI page. |
| Calendar (Google sync) | `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from a "Web application" OAuth client with the Calendar API turned on. Its redirect URI must be `http://localhost:<PORT>/api/calendar/callback`, or set `GOOGLE_REDIRECT_URI`. | Google Cloud console. Then press Connect on the Calendar page. |
| Mail | No API key. Add each account on the Mail page with its address and an app password (Gmail, Outlook and iCloud require one). | Your mail account's security settings. |
| Voicemail and Texts | `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`. Optional `TWILIO_NUMBER` keeps only messages for that number. | console.twilio.com |
| Monitoring | Optional `UPTIMEROBOT_KEY` (read-only) to show UptimeRobot monitors. Checking your own machines needs no key. | uptimerobot.com, Integrations and API |
| HomeOS | Kasa, Sonoff and Tuya devices on your network need nothing. Cloud vendors: `WYZE_EMAIL`, `WYZE_PASSWORD`, `WYZE_API_KEY`, `WYZE_KEY_ID`; `BLINK_EMAIL`, `BLINK_PASSWORD` (set `BLINK_UUID` too, to avoid 2FA on every restart); `RING_REFRESH_TOKEN`; `TUYA_CLIENT_ID`, `TUYA_CLIENT_SECRET` for Tuya devices that can't be reached locally. | The vendor's app or developer console (developer-api-console.wyze.com, iot.tuya.com; Ring tokens come from the ring-client-api tool). |
| Weather, Finance, spoken alerts | No keys. `WEATHER_LAT` and `WEATHER_LON` choose the weather location. | — |

`.env.example` lists every setting with its default.

## License

Open HL is source-available under the [PolyForm Strict License 1.0.0](LICENSE):
you may use it for personal and other noncommercial purposes, but not change it,
build on it, or redistribute it. Bundled third-party parts keep their own
licenses: three.js (MIT, `src/ui/vendor/three-0.170.0/LICENSE`), the fonts
(SIL OFL and CC0, `src/ui/vendor/fonts/LICENSE.txt`) and Font Awesome
(`src/ui/vendor/fontawesome`).
