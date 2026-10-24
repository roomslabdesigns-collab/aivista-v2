# Deploy AIVista on Oracle Cloud (Always Free)

You'll end up with AIVista running 24/7 at `https://<your-server-ip>.sslip.io` with HTTPS,
automatic restarts and daily-capable monitoring, at no cost. Total time: about an hour, once.

---

## 1. Create an Oracle Cloud account

1. Go to https://www.oracle.com/cloud/free/ and click **Start for free**.
2. Pick your **Home Region** carefully — it can't be changed later, and free servers only exist there.
   Choose one close to you (e.g. *India West (Mumbai)* or *India South (Hyderabad)*).
3. Oracle asks for a card to verify your identity. Always Free resources are not charged.

## 2. Create the server

1. In the console: **☰ menu → Compute → Instances → Create instance**.
2. **Name:** `aivista`
3. **Image and shape → Edit:**
   - Image: **Canonical Ubuntu 24.04**
   - Shape: **Ampere → VM.Standard.A1.Flex**, set **2 OCPUs** and **12 GB memory**
     (both inside the Always Free limits; label shows "Always Free-eligible").
4. **Add SSH keys:** choose **Generate a key pair for me** and click **Save private key**.
   Move the downloaded `.key` file to `C:\Users\Dell\.ssh\aivista.key`.
5. Click **Create**. Wait until the state is **Running**, then copy the **Public IP address**.

> **"Out of capacity" error?** Free ARM servers are popular. Try a different *Availability domain*
> in the placement section, or retry later (early morning usually works).

## 3. Open ports 80 and 443 in Oracle's network

1. On the instance page, click the **subnet** link (under *Primary VNIC*).
2. Click the **Default Security List** → **Add Ingress Rules**, and add two rules:

   | Source CIDR | IP Protocol | Destination Port |
   |---|---|---|
   | `0.0.0.0/0` | TCP | `80` |
   | `0.0.0.0/0` | TCP | `443` |

(The setup script opens the same ports in the server's own firewall.)

## 4. Connect to the server

In PowerShell on your PC (replace `YOUR_IP`):

```bash
icacls C:\Users\Dell\.ssh\aivista.key /inheritance:r /grant:r "$($env:USERNAME):R"
```
```bash
ssh -i C:\Users\Dell\.ssh\aivista.key ubuntu@YOUR_IP
```

Type `yes` the first time. You're now on the server; every command below runs there.

## 5. Give the server access to your private GitHub repo

The repo is private, so the server needs a read-only **deploy key**:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_aivista -N "" -C "aivista-server"
```
```bash
cat ~/.ssh/github_aivista.pub
```

Copy the line it prints, then on GitHub open
**roomslabdesigns-collab/aivista-v2 → Settings → Deploy keys → Add deploy key**,
paste it, title it `oracle-server`, leave *Allow write access* **unchecked**, and save.

Back on the server:

```bash
printf 'Host github.com\n  IdentityFile ~/.ssh/github_aivista\n  StrictHostKeyChecking accept-new\n' >> ~/.ssh/config
```
```bash
git clone git@github.com:roomslabdesigns-collab/aivista-v2.git ~/aivista
```

## 6. Run the setup script

```bash
bash ~/aivista/deploy/oracle-setup.sh
```

It takes 5–10 minutes (Node.js, Chromium, Caddy, build). At the end it prints your site address,
like `https://140-238-1-2.sslip.io`. Have your own domain? Point its DNS **A record** at the server IP and run
`bash ~/aivista/deploy/oracle-setup.sh yourdomain.com` instead.

## 7. Add your API keys

```bash
nano ~/aivista/.env
```

Fill in `GEMINI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY` and `COHERE_API_KEY`.
Save with **Ctrl+O, Enter**, exit with **Ctrl+X**, then:

```bash
sudo systemctl restart aivista
```

## 8. Create your account and lock sign-ups

1. Open your site address and **Sign up**.
2. Stop strangers from creating accounts: in `.env` set `ALLOW_SIGNUP=false`, then
   `sudo systemctl restart aivista`.

---

## Everyday commands (on the server)

| Task | Command |
|---|---|
| Deploy the latest code from GitHub | `bash ~/aivista/deploy/update.sh` |
| Live logs | `journalctl -u aivista -f` |
| Restart | `sudo systemctl restart aivista` |
| Status | `systemctl status aivista` |

`update.sh` backs up the database to `~/aivista/data/backups/` (keeps the last 10) before every update.

## Backups

The whole database is one file: `~/aivista/data/aivista.db`. To copy it to your PC (run on your PC):

```bash
scp -i C:\Users\Dell\.ssh\aivista.key ubuntu@YOUR_IP:~/aivista/data/aivista.db .
```

## Troubleshooting

- **Site doesn't load:** check the step 3 ingress rules, then `sudo systemctl status caddy` and `journalctl -u aivista -n 50`.
- **HTTPS error on the first visit:** the certificate is still being issued — wait 30 seconds and reload.
- **Crawling JavaScript sites fails:** `cd ~/aivista && npx playwright install --with-deps chromium`.
- **Oracle idle reclaim:** Oracle may reclaim Always Free instances that stay almost completely idle for 7 days.
  A running AIVista with monitoring enabled normally keeps it active; upgrading the account to
  *Pay As You Go* (still free for Always Free resources) removes this rule.
