

Follow these instructions to ignite the Beagle AI station in your local workspace.

## 🛰️ Pre-Flight Check
1. Ensure **Docker Desktop** (or Engine) is installed.
2. Have your **Gemini API Key** ready.
3. Verify **pnpm** is available as your primary thruster (npm is blocked).

## ☄️ Ignition Sequence (Standard)

If you have `pnpm` installed locally:

```bash
# 1. Synchronize propulsion systems
pnpm install

# 2. Lift-off to local dev server
pnpm dev
```

## 🛸 Orbital Deployment (Docker)

To bypass local dependency gravity entirely:

```bash
# 1. Configure your environment payload
echo "API_KEY=your_gemini_api_key_here" > .env

# 2. Forge the hull and ignite engines
docker-compose up --build -d
```

## 🌌 Navigation
Once the engines are green, the station will be accessible at:
**[http://localhost:5173](http://localhost:5173)**

## 🛠️ Maintenance & Telemetry
- **View logs**: `docker-compose logs -f`
- **Scuttle station**: `docker-compose down`
- **Re-synchronize thrusters**: `pnpm install --force` (if pnpm is blocked, rely on Docker cache)
