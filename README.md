# Solar Monitor

Solar Monitor provides solar production logging like the original SunPower or SunStrong app. It runs on your own network and reads the PVS gateway directly. It does not use a SunPower or SunStrong cloud account.

It is an independent project. It is not affiliated with, endorsed by, or sold by SunPower or SunStrong.

A local logger takes the place of the paid monitoring service, which is about $100 a year. If this saves you that fee, tips are welcome:

**BTC** `bc1qsmm6sn98wchnj89w6ttnjs7gfmxz2xg04t9lsz`

## What it shows

- Live production from the production meter
- Live home use, and whether the house is importing or exporting
- Today’s energy and this month’s energy, derived on this computer from the meter’s lifetime reading
- Each inverter the gateway reports, marked healthy, warning, or offline

The page refreshes about every 20 seconds. Readings are stored in `data/energy-log.json` on the machine running the app. That file stays on your computer. It is not part of this repository.

On startup the app tries the address saved in `data/gateway.json`. If that host does not answer as a PVS, it searches this computer’s local IPv4 subnet. Use **Use this IP** on the page to pin an address. **Discover** clears the pin and searches again.

The PVS and this app need to be on a network that can see each other. A guest Wi-Fi network that isolates clients will not work.

## Run on a computer

Install [Node.js 20](https://nodejs.org/) or newer, then:

```bash
git clone https://github.com/BenK49GT/SolarMonitor.git
cd SolarMonitor
npm install
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). Leave that command running.

For a production build on the same computer:

```bash
npm run build
npm start
```

`npm start` listens on all interfaces, port **4317**. On a phone on the same Wi-Fi, use this computer’s LAN address with that port.

## Run as a Raspberry Pi service

Use a Pi on the same LAN as the PVS, with Node.js 20 or newer. Raspberry Pi OS and a Pi 4 or newer are the comfortable fit. A Pi 2 can run out of memory during `npm install` and `npm run build`.

```bash
sudo mkdir -p /opt/solar-monitor
sudo chown "$USER" /opt/solar-monitor
git clone https://github.com/BenK49GT/SolarMonitor.git /opt/solar-monitor
cd /opt/solar-monitor
npm install
npm run build
```

Install the service. If `node` is not at `/usr/bin/node`, change `ExecStart` in the unit file.

```bash
sudo cp deploy/solar-monitor.service /etc/systemd/system/solar-monitor.service
sudo systemctl daemon-reload
sudo systemctl enable --now solar-monitor
```

The page is `http://<pi-lan-address>:4317`. Check status with `systemctl status solar-monitor`. Logs are `journalctl -u solar-monitor -f`.

To keep that address from changing, reserve the Pi’s MAC in the router’s DHCP settings. Do the same for the PVS if its address moves and the page loses the gateway. **Discover** on the page searches again.

## License

This project is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE.md).

You may use, modify, and share it for noncommercial purposes, including running it at home and giving copies to other owners. You may not sell it or use it in a commercial product. Anyone who receives a copy should also receive these terms.

Required Notice: Copyright BenK49GT (https://github.com/BenK49GT/SolarMonitor)
