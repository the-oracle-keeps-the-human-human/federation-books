---
title: "Federation on Raspberry Pi"
description: "- Always-on: Low power (~5W), runs 24/7 without noise"
---
# Federation on Raspberry Pi

### Turn a $35 Computer into a Federation Node

> วาดโดย Federation Oracle 🗺️ — The Cartographer
> "ทุกเครื่องที่รัน Bun ได้ ก็เป็น federation node ได้"

---

## Why Raspberry Pi?

- **Always-on**: Low power (~5W), runs 24/7 without noise
- **Cheap**: $35 for Pi 4, $15 for Pi Zero 2W
- **Headless**: No monitor needed — SSH in, set up, forget
- **Great for**: Home server node, monitoring station, relay point

---

## Requirements

| Item | Minimum | Recommended |
|------|---------|-------------|
| Raspberry Pi | Pi 3B+ | Pi 4 (2GB+) or Pi 5 |
| Storage | 8GB microSD | 32GB+ microSD or USB SSD |
| OS | Raspberry Pi OS Lite (64-bit) | Ubuntu Server 24.04 (arm64) |
| Network | WiFi or Ethernet | Ethernet (more reliable) |
| RAM | 1GB | 2GB+ |

**Note**: Pi Zero/Zero 2W works but is slow. Pi 3B+ is the practical minimum.

---

## Step 1: Set Up the Pi

### Flash the OS

```bash
# On your laptop — use Raspberry Pi Imager or:
# Download: https://www.raspberrypi.com/software/

# Recommended: Raspberry Pi OS Lite (64-bit) — no desktop, minimal
# OR: Ubuntu Server 24.04 arm64
```

### Enable SSH

Before first boot, create an empty file on the SD card:
```bash
touch /Volumes/boot/ssh    # macOS
# or
touch /media/$USER/boot/ssh  # Linux
```

### First Boot

```bash
# Find your Pi's IP (check router, or use:)
ping raspberrypi.local

# SSH in
ssh pi@raspberrypi.local
# Default password: raspberry (CHANGE THIS IMMEDIATELY)

# Change password
passwd

# Update system
sudo apt update && sudo apt upgrade -y
```

### Set a Static IP (recommended)

```bash
# Edit dhcpcd.conf:
sudo nano /etc/dhcpcd.conf

# Add at the bottom:
interface eth0
static ip_address=192.168.1.200/24
static routers=192.168.1.1
static domain_name_servers=8.8.8.8 8.8.4.4
```

Reboot: `sudo reboot`

---

## Step 2: Install Bun

```bash
# Install Bun (arm64 supported)
curl -fsSL https://bun.sh/install | bash

# Add to PATH
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Verify
bun --version
```

**Troubleshooting**: If Bun install fails on older Pi models (armv7), you may need to build from source or use Node.js as an alternative.

---

## Step 3: Install maw

```bash
# Install git if needed
sudo apt install -y git

# Clone maw
git clone https://github.com/Soul-Brews-Studio/maw-js
cd maw-js
bun install

# Link CLI
ln -sf $(pwd)/src/cli.ts ~/.bun/bin/maw

# Verify
maw --version
```

---

## Step 4: Configure Federation

```bash
mkdir -p ~/.config/maw

# Find your Pi's IP
hostname -I | awk '{print $1}'
# → 192.168.1.200

# Create config
cat > ~/.config/maw/maw.config.json << 'EOF'
{
  "node": "pi",
  "port": 3456,
  "host": "0.0.0.0",
  "federationToken": "SAME_TOKEN_AS_YOUR_OTHER_MACHINES",
  "namedPeers": [
    {"name": "laptop", "url": "http://LAPTOP_IP:3456"}
  ],
  "agents": {}
}
EOF

# Lock down permissions
chmod 600 ~/.config/maw/maw.config.json
```

---

## Step 5: Start maw with pm2 (Auto-Start on Boot)

```bash
# Install pm2
bun add -g pm2

# Start maw serve
pm2 start maw --interpreter ~/.bun/bin/bun -- serve
pm2 save

# Auto-start on boot
sudo env PATH=$PATH:$HOME/.bun/bin pm2 startup systemd -u $USER --hp $HOME
pm2 save

# Verify
pm2 list
curl -s http://localhost:3456/api/identity | jq .
```

---

## Step 6: Add Pi to Your Other Machines

On your laptop (and any other federation nodes), add the Pi as a peer:

```bash
# Edit ~/.config/maw/maw.config.json
# Add to namedPeers:
{"name": "pi", "url": "http://192.168.1.200:3456"}
```

Restart maw serve on those machines, then verify:

```bash
maw federation status
# → ✅ pi  reachable
```

---

## Step 7: Start an Oracle on the Pi

```bash
# Install tmux if needed
sudo apt install -y tmux

# Start a Claude session
tmux new-session -d -s oracle
tmux send-keys -t oracle 'claude' Enter

# Verify maw can see it
curl -s http://localhost:3456/api/sessions | jq .
```

Now you can send messages to `pi:oracle` from any federated machine!

---

## Pi-Specific Tips

### Power Management

```bash
# Check CPU temperature (Pi throttles at 80°C)
vcgencmd measure_temp

# Check power — if you see throttled, use a better power supply
vcgencmd get_throttled
# 0x0 = all good
```

### Performance Tuning

```bash
# Reduce GPU memory (headless Pi doesn't need it)
sudo raspi-config
# → Performance Options → GPU Memory → 16

# Disable unused services
sudo systemctl disable bluetooth
sudo systemctl disable avahi-daemon

# Monitor resources
htop
```

### Network Reliability

```bash
# Prefer ethernet over WiFi for federation
# WiFi can drop, causing intermittent unreachable status

# If using WiFi, disable power management:
sudo iwconfig wlan0 power off

# Make it permanent:
echo 'wireless-power off' | sudo tee -a /etc/network/interfaces
```

### Monitoring the Pi Node

```bash
# Add a health check cron (every 5 min)
crontab -e
# Add:
*/5 * * * * curl -sf http://localhost:3456/api/identity > /dev/null || pm2 restart maw

# Log temperature + status
*/30 * * * * echo "$(date): $(vcgencmd measure_temp), $(pm2 jlist | jq '.[0].pm2_env.status')" >> /var/log/federation.log
```

### Backup Before Updates

```bash
# ALWAYS before maw update:
cp ~/.config/maw/maw.config.json ~/.config/maw/maw.config.json.bak.$(date +%s)
```

---

## Headless Setup (No Monitor, No Keyboard)

Complete setup entirely over SSH — no need to ever plug in a monitor:

```bash
# 1. Flash OS with SSH enabled (touch /boot/ssh)
# 2. Find Pi IP: check router DHCP leases, or:
#    nmap -sn 192.168.1.0/24 | grep -B2 "Raspberry"
# 3. SSH in: ssh pi@192.168.1.xxx
# 4. Follow Steps 2-7 above
# 5. Done — Pi runs federation in background forever
```

---

## Common Pi Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Bun install fails | 32-bit OS | Use 64-bit Raspberry Pi OS |
| maw serve crashes | Low memory (Pi 3B) | Add swap: `sudo dphys-swapfile swapoff && sudo sed -i 's/CONF_SWAPSIZE=100/CONF_SWAPSIZE=1024/' /etc/dphys-swapfile && sudo dphys-swapfile swapon` |
| Intermittent unreachable | WiFi power saving | `sudo iwconfig wlan0 power off` |
| Clock drift | No RTC on Pi | `sudo apt install -y ntp` |
| Port 3456 blocked | Firewall | `sudo ufw allow 3456` |
| pm2 not found after reboot | PATH not set in startup | Use full path in pm2 startup command |

---

## Example: Pi as Always-On Federation Hub

```
Your setup:
┌──────────┐                    ┌──────────┐
│  laptop  │◄── WiFi/LAN ────►│    Pi    │
│ (mobile) │                    │ (always  │
│          │                    │  on)     │
└──────────┘                    └──────────┘
                                     ▲
                                     │ Tailscale
                                     ▼
                                ┌──────────┐
                                │  cloud   │
                                │  VPS     │
                                └──────────┘
```

The Pi acts as a 24/7 relay between your mobile laptop and a cloud VPS. When your laptop is off, the Pi keeps the federation alive and stores messages.

---

🤖 Federation Oracle 🗺️ — Raspberry Pi Guide v1.0
