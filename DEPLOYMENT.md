# Vanguard Lounge — Deployment & Operations Guide

A luxury sweepstakes arcade directory with instant player registration, dedicated player dashboard, game-linked real-time live chat concierge, and admin support desk.

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Running Locally](#3-running-locally)
4. [Initial Setup: Claiming the Administrator Account](#4-initial-setup-claiming-the-administrator-account)
5. [Managing Support Staff & Players](#5-managing-support-staff--players)
6. [Testing the Systems](#6-testing-the-systems)
   - [Player Registration (Zero-OTP)](#player-registration-zero-otp)
   - [Player Dashboard](#player-dashboard)
   - [Game-Linked Live Chat Support](#game-linked-live-chat-support)
   - [Admin / Staff Support Inbox](#admin--staff-support-inbox)
7. [Deploying to Production Hosting](#7-deploying-to-production-hosting)
   - [Option A: Deploy to Render / Railway (Recommended)](#option-a-deploy-to-render--railway-recommended)
   - [Option B: Deploy to Ubuntu / Debian VPS with PM2 & Nginx](#option-b-deploy-to-ubuntu--debian-vps-with-pm2--nginx)
   - [Option C: Docker Container Deployment](#option-c-docker-container-deployment)
   - [Option D: Supabase Integration](#option-d-supabase-integration)
8. [Environment Variables Reference](#8-environment-variables-reference)
9. [Security & Compliance Architecture](#9-security--compliance-architecture)

---

## 1. Architecture Overview

- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons, Vite.
- **Backend**: Node.js HTTP server (`server.ts`) powered by `tsx`.
- **Database (Built-in)**: SQLite via `better-sqlite3` (`data/portal.db`) with automatic WAL mode, non-destructive schema migrations, foreign keys, and indexes.
- **Real-Time Engine**: Server-Sent Events (SSE) with authenticated connections, event broadcasting (`NEW_MESSAGE`, `MESSAGES_READ`, `CONVERSATION_UPDATED`), and automatic reconnection.
- **Password Security**: Salted cryptographic password hashing with Node.js native `crypto.scrypt`. Plaintext passwords are never stored.

---

## 2. Prerequisites

- **Node.js**: `v20.x` or `v22.x` (LTS recommended).
- **npm**: `v10.x` or higher.
- **Git**

---

## 3. Running Locally

### Step 1: Clone and Enter the Directory
```bash
cd "vanguard-lounge (1)"
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
# Windows PowerShell
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Ensure your `.env` contains:
```env
PORT=3000
NODE_ENV=development
ADMIN_PASSCODE=ChangeMeToAStrongAdminSetupPasscode123!
JWT_SECRET=super_secret_vanguard_jwt_encryption_key_at_least_32_characters
```

### Step 4: Launch the Development Server
```bash
npm run dev
```

Visit **`http://localhost:3000`** in your browser. The single dev command automatically compiles the React Vite frontend and starts the backend API.

---

## 4. Initial Setup: Claiming the Administrator Account

When Vanguard Lounge is first launched on a clean database, there are no administrators. The application provides a secure bootstrap gate:

1. Open **`http://localhost:3000`**.
2. Click **Admin Setup** in the segmented mode tabs.
3. Fill in:
   - **Full Name**: e.g., `Executive Administrator`
   - **Email Address**: e.g., `admin@vanguardlounge.com`
   - **Phone Number**: e.g., `+1 (555) 019-9000`
   - **Password**: Secure password (minimum 8 characters)
   - **Server Admin Setup Passcode**: Enter the `ADMIN_PASSCODE` value defined in your `.env` file (e.g., `ChangeMeToAStrongAdminSetupPasscode123!`).
4. Click **Activate Admin Account**.
5. The account is created with `admin` privileges and you are logged in.
6. **Notice**: Once the first administrator is claimed, the **Admin Setup** tab permanently disappears from public view to prevent unauthorized access.

---

## 5. Managing Support Staff & Players

1. Log in with your Administrator account.
2. In the sidebar, click **Admin Console**.
3. Select the **Accounts & Staff** tab.
4. From this tab, you can:
   - **Search Players**: Filter registered players instantly by Full Name, Email, or Phone Number.
   - **Change Roles**: Promote any registered player to `Support Staff` or `Administrator` via the dropdown.
   - **Manage Status**: Toggle account status between `Active` and `Suspended`.
   - **View Phone Numbers**: View the verified player phone numbers collected during registration.

---

## 6. Testing the Systems

### Player Registration (Zero-OTP)
1. In an Incognito window or after logging out, open **`http://localhost:3000`**.
2. Click **Create Account** or select the **Register** tab.
3. Enter:
   - **Full Name**: `Jane Doe`
   - **Email Address**: `jane@example.com`
   - **Phone Number**: `+1 (555) 234-5678`
   - **Password**: `password123`
   - **Confirm Password**: `password123`
4. Click **Create Account & Enter**.
5. Account is created immediately without OTP codes or email verification.
6. You are automatically logged in and redirected to the **Player Dashboard**.

### Player Dashboard
- Displays **Player Name**, **Email Address**, **Phone Number**, **Loyalty Tier**, and **Points**.
- Provides **Instant Game Launchers** for all available sweepstakes arcade titles.
- Lists **Previous Support Chat Conversations** with unread count badges and status pills.
- Includes **Account Settings** (update Full Name, update Phone Number) and **Change Password**.
- Allows direct sign out.

### Game-Linked Live Chat Support
1. On the **Game Floor** (`games` tab or dashboard), browse the available games: Juwa 2.0, Fire Kirin, Orion Stars, Milky Way, Ultra Panda, etc.
2. Click **Play** on any game card (e.g., *Juwa 2.0*).
3. The app opens **Support Chat** automatically:
   - Pre-fills the draft message: `"I want to play Juwa 2.0"`.
   - Displays a prominent **Linked Game Banner** at the top of the chat thread with game artwork, title, and linked platform indicators.
   - Clicking **Send** immediately delivers your request to the support queue.
   - Automated concierge immediately delivers verified client download and web launcher buttons.
   - Real-time read status (`✓` sent, `✓✓` read) appears on your messages.

### Admin / Staff Support Inbox
1. Log in as an Admin or Support Staff member.
2. Click **Support Chat** in the sidebar.
3. View the customer queue:
   - See incoming customer threads with customer full names, phone numbers, and associated game titles.
   - Filter conversations by status (**All**, **Open**, **Pending**, **Resolved**).
   - View unread badge indicators.
   - Select any conversation to chat with the player in real time.
   - Opening a conversation automatically marks all customer messages as read and notifies the player in real time.
   - Update the conversation status pill (**Open**, **Pending**, **Resolved**) directly from the thread header.

---

## 7. Deploying to Production Hosting

### Option A: Deploy to Render / Railway (Recommended)

Both Render and Railway support full-stack Node.js applications with persistent disk storage for SQLite.

#### Deploying on Render:
1. Push your repository to GitHub.
2. In Render Dashboard, click **New +** > **Web Service**.
3. Connect your repository.
4. Set configurations:
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
5. Add a Persistent Disk:
   - In **Disks**, click **Add Disk**.
   - **Name**: `vanguard-data`
   - **Mount Path**: `/opt/render/project/src/data`
   - **Size**: `1 GB` (or larger)
6. Under **Environment Variables**, add:
   - `PORT`: `3000` (Render handles internal port mapping)
   - `NODE_ENV`: `production`
   - `ADMIN_PASSCODE`: `[A_STRONG_RANDOM_PASSCODE]`
   - `JWT_SECRET`: `[A_LONG_RANDOM_SECRET_KEY]`
7. Click **Create Web Service**.

#### Deploying on Railway:
1. In Railway Dashboard, click **New Project** > **Deploy from GitHub repo**.
2. Under **Variables**, add:
   - `PORT`: `3000`
   - `NODE_ENV`: `production`
   - `ADMIN_PASSCODE`: `[A_STRONG_RANDOM_PASSCODE]`
   - `JWT_SECRET`: `[A_LONG_RANDOM_SECRET_KEY]`
3. Add a Volume:
   - Go to your service settings > **Volumes** > **Add Volume**.
   - Set **Mount Path** to `/app/data`.
4. Railway will automatically build and start the service with high-speed HTTPS.

---

### Option B: Deploy to Ubuntu / Debian VPS with PM2 & Nginx

#### 1. Server Preparation
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx build-essential

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

#### 2. Clone and Build
```bash
cd /var/www
sudo git clone <YOUR_GIT_REPO_URL> vanguard-lounge
cd vanguard-lounge
sudo npm install
sudo npm run build
```

#### 3. Configure Environment
```bash
sudo cp .env.example .env
sudo nano .env
# Set ADMIN_PASSCODE, JWT_SECRET, PORT=3000, NODE_ENV=production
```

#### 4. Run with PM2
```bash
pm2 start server.ts --name "vanguard-lounge" --interpreter ./node_modules/.bin/tsx
pm2 save
pm2 startup
```

#### 5. Configure Nginx Reverse Proxy & SSL
Create `/etc/nginx/sites-available/vanguard-lounge`:
```nginx
server {
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE stream buffering disabled for instant messages
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```

Enable site and install Certbot SSL:
```bash
sudo ln -s /etc/nginx/sites-available/vanguard-lounge /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

### Option C: Docker Container Deployment

Create a `Dockerfile` in the root:
```dockerfile
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src/server ./src/server
RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 3000
ENV NODE_ENV=production
CMD ["npx", "tsx", "server.ts"]
```

Build and run:
```bash
docker build -t vanguard-lounge .
docker run -d -p 3000:3000 -v $(pwd)/data:/app/data --env-file .env vanguard-lounge
```

---

### Option D: Supabase Integration

If you prefer using Supabase as your primary cloud PostgreSQL database instead of local SQLite:

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase dashboard.
3. Paste the contents of `supabase_schema.sql` (included in this repository) and click **Run**.
4. The script creates:
   - Complete `profiles` table with phone numbers, loyalty points, and role enums.
   - Automated user synchronization trigger between Supabase Auth and `public.profiles`.
   - `games`, `conversations`, `messages` (with `is_read`), and `enquiries` tables.
   - Row Level Security (RLS) policies protecting member chats.
   - Realtime publication subscriptions on `messages` and `conversations`.
5. Add your Supabase project URL and anon key to `.env`:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   ```

---

## 8. Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `PORT` | Yes | HTTP port for server (default: `3000`). |
| `NODE_ENV` | Yes | `development` or `production`. |
| `ADMIN_PASSCODE` | Yes | Secret code used during first-time setup to claim the Admin role. |
| `JWT_SECRET` | Yes | Cryptographic secret for signing session authentication tokens. |
| `DATABASE_PATH` | No | Path to SQLite file (default: `./data/portal.db`). |
| `GOOGLE_CLIENT_ID` | Optional | Google Cloud OAuth Client ID (if enabling Google login). |
| `GOOGLE_CLIENT_SECRET` | Optional | Google Cloud OAuth Secret. |
| `GOOGLE_REDIRECT_URI` | Optional | OAuth callback URL (default: `http://localhost:3000/api/auth/google/callback`). |

---

## 9. Security & Compliance Architecture

1. **Password Encryption**: All passwords are salted with 16-byte cryptographically secure random bytes and hashed using `scrypt` (`N=16384, r=8, p=1`). Plaintext passwords are never logged or stored.
2. **Access Control**: Role-based access control enforces strict boundaries (`customer`, `staff`, `admin`). Customers can only view their own conversations and notifications. Ordinary users cannot access admin endpoints or customer phone numbers.
3. **Data Protection**: Phone numbers and emails are validated on input and stored in encrypted/sanitized database records.
4. **Legal Compliance Gate**: All funding, deposits, and card-entry features remain locked behind the compliance layer until official licensing is finalized.
