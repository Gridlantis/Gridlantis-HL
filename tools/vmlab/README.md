# VM Lab

Full virtual machines inside Open HL, in the spirit of VirtualBox. Open it from
the **VM Lab** icon in the sidebar, or at `/vmlab`.

- **Operating systems** — download Ubuntu, Debian, Fedora, AlmaLinux, Alpine or
  Kali from the catalog; add an ISO or disk image you already have in Open HL
  Files with **Add from my files**; upload one; import one by host path; or
  fetch any URL. Windows ISOs come from Microsoft and are added by hand.
- **Virtual machines** — one VM each. Choose the disk image or ISO to boot,
  CPU, memory, disk, network (internet, isolated, none), and whether work is
  **kept** (persistent disk) or **discarded** the moment it shuts down.
- **Booting an ISO** — pick an ISO as the VM's operating system and it boots
  from CD onto a fresh blank disk, exactly like a new VirtualBox machine. Once
  installed, *Boot from disk next time* in the VM's menu flips the boot order;
  the ISO stays attached and can be swapped or ejected.
- **Console** — full VM screen in any browser or the Open HL desktop app, with
  two-way clipboard, “type this text” (for login prompts), special keys, and
  live USB attach/detach.
- **USB** — pass devices plugged into the host through to a VM.
- **Host** — hardware specs, virtualization readiness, live CPU / memory /
  network / disk charts, per-VM usage and capacity.
- **Hosts** — more than one machine can run VMs. This one is always there; add
  a second device with the VM Lab agent and switch between them with the
  **VM host** picker at the top of the page. See *A second VM host* below.

## Host setup

VM Lab needs QEMU. Without root:

```sh
tools/vmlab/install-qemu.sh          # downloads the distro's QEMU into vmlab/qemu
```

With root (also enables USB passthrough and the Windows 11 TPM):

```sh
sudo tools/vmlab/setup-host.sh       # QEMU, OVMF, swtpm, kvm group, USB udev rule
```

VMs run as transient `systemd --user` units named `openhl-vm-<id>`, so
restarting Open HL never stops them; Open HL re-attaches on start.

```sh
systemctl --user list-units 'openhl-vm-*'
```

### Hardware acceleration and VirtualBox

VirtualBox (and VMware) take the CPU's VT-x while their VMs run, and every KVM
guest then crashes on its first instruction. VM Lab detects this, starts VMs in
software emulation instead (much slower), and says so on the page. Shut the
VirtualBox VMs down, or move them into VM Lab, to get full speed.

## A second VM host

A second machine can host VMs too — useful when it has the spare CPU and RAM,
or when this one's virtualization is tied up. That machine runs the **VM Lab
agent**: the same VM Lab code as Open HL, serving only `/api/vmlab/*` behind a
bearer token, with no login page and no other Open HL subsystem. Open HL proxies to
it, so its machines, images, USB devices, host stats and consoles appear in the
VM Lab page exactly like this machine's.

```
Open HL (this machine)                  the second device
┌────────────────────────┐            ┌──────────────────────────┐
│ /vmlab  [VM host ▾]    │  HTTP+WS   │ vmlab-agent.js :3010     │
│  ├ local  → vmlab-api  │ ─ token →  │  └ vmlab-api + domains   │
│  └ remote → proxy ─────┼───────────>│      QEMU / KVM / USB    │
└────────────────────────┘            └──────────────────────────┘
```

### Setting one up

From this machine, over SSH:

```sh
tools/vmlab/deploy-agent.sh user@other-machine        # --port, --dir, --no-qemu, --no-service
```

It copies the code, installs QEMU there if needed, starts the agent as a
`systemd --user` service, and prints the address and token to paste into
**VM Lab → Hosts → Add a VM host**.

By hand instead — copy `src/`, `vmlab-agent.js` and `tools/` to that machine and:

```sh
node vmlab-agent.js                   # prints its token and listens on :3010
```

| variable | |
|---|---|
| `VMLAB_AGENT_TOKEN` | the shared secret; generated into `vmlab/agent-token` when unset |
| `VMLAB_AGENT_PORT` | default 3010 |
| `VMLAB_AGENT_BIND` | default 0.0.0.0 |
| `VMLAB_DIR` | where that machine keeps images, disks and VM state |

The agent needs no `.env` and no `PASSWORD`; the token is its whole login.
**So keep the port on a tailnet or LAN and never expose it to the internet.**
Open HL stores each host's address and token in `vmlab/hosts.json` (mode 0600,
on the SSD), and never sends them anywhere but to that host.

### Living with two hosts

- Each host keeps **its own** VMs, disks and images. Nothing is shared or
  synced; "Add from my files" on a remote host browses *that* machine's files.
- USB passthrough passes devices plugged into **the host running the VM**, so
  run `sudo tools/vmlab/setup-host.sh --user <you>` on the second device too.
- The console works the same from anywhere: the browser's WebSocket goes to
  Open HL, Open HL splices it onto the agent's, and the agent talks to that
  machine's QEMU. Only Open HL ever reaches the agent.
- If a host is asleep or offline the page says so and offers a way back to this
  machine; the other host is unaffected.
- Turning a host **off** in the list keeps its address and token but stops
  Open HL talking to it. Removing it forgets both — the VMs over there keep
  running and reappear if it is added again.

```sh
ssh other-machine 'journalctl --user -u openhl-vmlab-agent -f'   # agent logs
ssh other-machine 'sudo loginctl enable-linger $USER'           # survive logout
```

## Guests and the guest agent

The guest info panel (guest IP, clean shutdown, live clipboard) uses the QEMU
guest agent.

- **Linux cloud images** — nothing to do. On first boot VM Lab's cloud-init
  seed creates the login you set (default: your own host username, random
  password shown on the card), installs `qemu-guest-agent` (and `spice-vdagent` for desktop
  images), and runs your extra packages and first-boot commands.
- **Linux from ISO** — install `qemu-guest-agent` (and `spice-vdagent` on a
  desktop) inside the VM. Optional: *Save disk as new image* afterwards to reuse
  that install as a base for new VMs.
- **Windows** — attach the *VirtIO drivers + guest agent* disc from the catalog
  as the second CD, run `virtio-win-guest-tools.exe` inside Windows, then save
  the disk as an image. That installs the guest agent and the clipboard agent.

A VM with an isolated / no network cannot install packages on first boot, so
give it an image that already has the guest agent (prepare one once with
internet, then *Save disk as new image*).

## Clipboard

Copy and paste work both ways between the client computer and the VM once the
guest runs `spice-vdagent` (Linux desktops, Windows guest tools):

| client | host → VM | VM → host |
|---|---|---|
| Open HL desktop app | automatic | automatic |
| browser on HTTPS or localhost | automatic | automatic |
| browser on plain HTTP | Ctrl+V pastes | copied when the browser allows, otherwise one click in the Clipboard panel |

Text consoles and login screens have no clipboard agent; use **Clipboard →
Type it**, which sends the text as keystrokes.

## Reaching Open HL from anywhere

Open HL listens on port 3000 on every interface. Choose one:

1. **Tailscale (recommended).** Install Tailscale on each client and open
   `http://<host tailscale IP>:3000`. Only your tailnet can reach it.
2. **Tailscale with HTTPS** (enables automatic clipboard sync in browsers):
   `tailscale serve --bg 3000`, then open `https://<host>.<tailnet>.ts.net`.
3. **Public internet:** `tailscale funnel --bg 3000`, or a reverse proxy with a
   real certificate. Open HL then faces the whole internet behind one password —
   use a long one. Failed logins are rate-limited (5 per 15 minutes per address).

## Checking from a client

Run on any Linux client (or pipe it over SSH) to test login, the VM Lab API,
host stats, a VNC handshake through the console tunnel, and desktop downloads:

```sh
OPENHL_URL=http://100.64.0.1:3000 OPENHL_PW='…' tools/vmlab/client-smoke-test.sh
ssh root@client "OPENHL_URL=http://100.64.0.1:3000 OPENHL_PW='…' bash -s" < tools/vmlab/client-smoke-test.sh
```

## Files

| path | |
|---|---|
| `src/domains/vmlab/` | lifecycle, images, QMP/agent client, USB, host stats |
| `src/domains/vmlab/hosts.js` | the host registry (this machine + remote agents) |
| `src/domains/vmlab/remote.js` | talking to a remote agent: probe, proxy, console tunnel |
| `src/routes/vmlab-api.js` | the machine-facing API, mounted by both Open HL and the agent |
| `src/routes/vmlab.js` | pages, host routing/proxying, and the VNC WebSocket tunnel |
| `vmlab-agent.js`, `src/vmlab-agent.js` | the agent a second device runs |
| `tools/vmlab/deploy-agent.sh` | installs and starts that agent over SSH |
| `src/ui/vmlab/` | browser code for the VM Lab page and console |
| `src/ui/vendor/novnc/` | noVNC 1.6.0 (MPL-2.0), unmodified |
| `vmlab/` | data: images, disks, logs, state (gitignored) |
