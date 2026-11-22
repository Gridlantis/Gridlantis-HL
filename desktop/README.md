# Gridlantis-HL desktop

Gridlantis-HL in its own window for Windows and Linux. It connects to an Gridlantis-HL server
(LAN, Tailscale or public address), remembers it and the login, and gives VM
Lab consoles automatic two-way clipboard and full keyboard capture. The
browser version keeps working unchanged.

On the host itself, the connect screen can also **start Gridlantis-HL from its
folder** using the app's built-in Node runtime.

## Build

Needs Node 22+.

```sh
cd desktop
npm install
npm run dist          # Linux AppImage + .deb, Windows portable .exe + zip
npm run dist:linux    # just Linux
npm run dist:win      # just Windows portable .exe + zip (no Wine needed)
npm run dist:win-installer   # Windows setup .exe — on Linux this needs Wine
```

Output lands in `desktop/dist/`, which Gridlantis-HL serves at `/download` (the download
icon at the bottom of the sidebar).

## Use

- First run: enter the server address, e.g. `http://100.64.0.1:3000`.
- Ctrl+Shift+Alt+S returns to the connect screen.
- Self-signed HTTPS: tick “Trust this server's certificate”; the fingerprint is
  pinned and a changed certificate is refused.
- VM consoles open in their own window. Inside a console, Ctrl+R, F5 and
  similar keys go to the VM instead of reloading the app.

Settings live in the app's user-data folder (`~/.config/Gridlantis-HL` on Linux,
`%APPDATA%\Gridlantis-HL` on Windows).
