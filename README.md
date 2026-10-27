# Solar Monitor

A local dashboard for a SunPower PVS supervisor on the home network. It reads the gateway directly. It does not use a SunPower cloud account, a database, or a login of its own.

Open [http://127.0.0.1:4317](http://127.0.0.1:4317).

## Run

From this folder:

```bash
npm install
npm run dev
```

The dev server listens on all interfaces, port **4317**. Leave that command running, then open the URL above. On a phone on the same Wi-Fi, use this computer’s LAN address with the same port.

To run a production build later:

```bash
npm run build
npm start
```

## What it shows

- Current production, from the production meter’s live power
- Today’s energy and this month’s energy, from the local lifetime log
- Each inverter the gateway reports, marked healthy, warning, or offline
- A place to type the gateway IP if automatic discovery misses it

The page refreshes about every 20 seconds. Each live reading appends the production meter’s lifetime kWh to `data/energy-log.json`. Today is the change since local midnight, and this month is the change since the first of the month. Until those baselines exist, the cards show only the energy since recording started, labeled with that time.

If the gateway cannot be reached, the page says so and shows **sample data**, labeled as sample. Those numbers are not from the house.

## How the gateway is found

On startup the app tries the address saved in `data/gateway.json`. If that host does not answer, it looks through this computer’s local IPv4 subnet for `https://<ip>/cgi-bin/dl_cgi/supervisor/info`. It does not scan beyond that subnet.

Use **Use this IP** on the page to pin an address. **Discover** clears the pin and searches again.

Newer PVS firmware (this house is a PVS6, build 61846) requires the local owner session described by SunStrong. The app takes the serial number from the open supervisor endpoint and does not store the password.

## Energy the gateway does not report

This PVS6 reports instantaneous power and lifetime energy. Daily and monthly totals are derived on this computer from `data/energy-log.json`. Lifetime energy stays on the current-power card.

Live power is `p_3phsum_kw` on the production meter (`TYPE` `PVS5-METER-P`), which matches `/sys/livedata/pv_p`. Lifetime energy is `net_ltea_3phsum_kwh`, which matches `/sys/livedata/pv_en`.
