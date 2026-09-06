# Reviewing a Starwards build

## What this is

Starwards is a multiplayer spaceship bridge simulator built for LARPs. We're
asking you to run a build, sit at a station or two, and tell us what it felt
like — we want your impressions, not a bug hunt.

## Download

Grab the current development build:
**[starwards.exe](https://github.com/starwards/starwards/releases/download/master-latest/starwards.exe)**
(~100 MB, Windows 10/11 64-bit only).

## Run

1. Double-click `starwards.exe`.
2. **Windows SmartScreen** will likely warn "Windows protected your PC" —
   expected, since this build isn't code-signed. Click **More info**, then
   **Run anyway**.
3. **Windows Firewall** may ask to allow network access — click **Allow
   access**. This is what lets other devices on your Wi-Fi join as stations.
4. A console (black terminal) window opens, prints a few startup lines
   ending in `listening on http://localhost:8080`, and your browser opens
   automatically to the lobby. **Don't close the console window** — closing
   it shuts the game down for everyone connected.

## Connect

The lobby is the game's home page.

- **This computer** opens any station directly from the lobby's buttons.
- **Phones and tablets on the same Wi-Fi** can join too: the lobby's
  "Connect other devices" panel shows a QR code — scan it from another
  device to open a station there.

Station pages: **GM screen** (runs the scenario), **Pilot**, **Weapons**,
**Engineer**, **Signals**, **Relay**.

For a meaningful solo run, open two browser tabs: the **GM screen** in one,
and a crew station (e.g. **Pilot**) in the other.

## A 20-minute suggested script

1. On the GM screen, start the **Wave Defence** scenario.
2. Take **Pilot** for 5 minutes — `Q`/`E` to rotate, `A`/`D` to strafe,
   `W`/`S` to boost, `R`/`F` to raise/lower warp. Press **SPACE** any time
   for the full hotkey list.
3. Take **Weapons** for 5 minutes — `[`/`]` to cycle targets, `x` to fire
   tubes, `f` to fire the chain gun. **SPACE** for the full hotkey list.
4. Take **Engineer** for 5 minutes — every ship system has its own
   power/coolant keys. **SPACE** opens the hotkey list for this ship.
5. Spend the last 5 minutes watching the **GM screen** — see the scenario
   play out from the game master's point of view.

## Send feedback

Please [open a playtest feedback issue](https://github.com/starwards/starwards/issues/new?template=playtest-feedback.yml).
Include which station(s) you played, what confused you, what felt good, and
a screenshot if anything broke. **No need to reproduce or diagnose anything
— just tell us what you saw.**

## Known limitations

- **Windows only** — no macOS or Linux build yet.
- **Unsigned build** — expect the SmartScreen warning above; there's no
  code-signing certificate yet.
- **No internet play** — everyone must be on the same local network.
- **Hardcoded scenario** — only the scenarios built into this build are
  available; there's no scenario editor yet.
