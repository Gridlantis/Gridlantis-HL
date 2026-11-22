# Gridlantis-HL

A self-hosted dashboard: notes, flows, mail, voicemail and texts, reminders and
calendar, files and live folders, monitoring, VM Lab, phone and PC hosts,
containers, smart home, finance and local AI.

## Download

The easiest way to run Gridlantis-HL is **Gridlantis-HL Server**, for Linux, Windows and
macOS, from the [latest release](https://github.com/Gridlantis/Gridlantis-HL/releases/latest)
or [gridlantis.org](https://gridlantis.org/software#gridlantis-hl-download). On first
start it asks for your name, a password and a port, then shows the address to
open in your browser. It keeps Gridlantis-HL's data in its own app-data folder; its
Settings has a button that opens it. The app's source is in `server-app/`.

## Run

    cp .env.example .env    # set PASSWORD at least
    node server.js          # http://localhost:3000

Node 22+ and no npm dependencies.
Data lives in `data/` and uploads in `uploads/`, both created on first start.

Check every page renders: `node tools/lint-pages.js`.

## Password

`PASSWORD` is the only required setting. Gridlantis-HL refuses to start without it.

1. Copy the example file: `cp .env.example .env`
2. Open `.env` and replace `change-me` with a password of your own:

       PASSWORD=your-own-long-password

3. Start Gridlantis-HL (`node server.js`) and open http://localhost:3000. The sign-in
   page asks for that password. The desktop and Android apps use the same one.

To change the password, edit `PASSWORD` in `.env` and restart Gridlantis-HL.

A few rules for `.env`: one `KEY=value` per line, comments on their own line
(a `#` after a value becomes part of the value), and a variable already set in
your shell overrides the file.

## Use it from other devices

Gridlantis-HL listens on every network interface, so nothing in Gridlantis-HL needs
changing to reach it from another device.

**Use [Tailscale](https://tailscale.com).** Install it on the machine running
Gridlantis-HL and on your phone or laptop, sign both into the same tailnet, then open
`http://<tailscale-ip>:3000`. This works at home and away, and the traffic is
encrypted. Don't forward port 3000 on your router: Gridlantis-HL is plain HTTP behind
one password.

**Home network without Tailscale.** Open `http://<machine-ip>:3000` or
`http://openhl.local:3000`. If the page doesn't load, the machine's firewall is
blocking it. Allow TCP port 3000 (and UDP 5353 for the `openhl.local` name)
from your local network only. With ufw on a `192.168.1.x` network:

    sudo ufw allow from 192.168.1.0/24 to any port 3000 proto tcp
    sudo ufw allow from 192.168.1.0/24 to any port 5353 proto udp

Use your own network's range in place of `192.168.1.0/24`.

## API keys

Every key below is optional. A feature whose keys are missing simply stays
off, and the rest of Gridlantis-HL works without it. Unless the table says
otherwise, add keys in **Settings → Keys** (the gear at the bottom of the
sidebar). They are saved to `.env`; press **Restart now** to apply them. When
Gridlantis-HL runs from a terminal or a service, restart it there instead. You
can still edit `.env` by hand. On the home page, click Halo and choose **Help**
to see the same information inside the app.

## Updates

**Settings → Updates → Check for updates** asks GitHub for the latest release
(only when pressed) and, with Gridlantis-HL Server, gives a direct download of
the right installer for this computer. Installing it over the old version keeps
your password, port and data. A git checkout updates with `git pull`.

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

Gridlantis-HL is source-available under the [PolyForm Strict License 1.0.0](LICENSE):
you may use it for personal and other noncommercial purposes, but not change it,
build on it, or redistribute it. Bundled third-party parts keep their own
licenses: three.js (MIT, `src/ui/vendor/three-0.170.0/LICENSE`), the fonts
(SIL OFL and CC0, `src/ui/vendor/fonts/LICENSE.txt`) and Font Awesome
(`src/ui/vendor/fontawesome`).
