# Render Deployment Guide for TradeIdeas

Since your GitHub repository is **private**, you have two options:

## Option 1: Make Repository Public (Easiest for Render Setup)

1. Go to: https://github.com/moosadrahul/tradeideas/settings
2. Scroll down to "Danger Zone"
3. Click "Change visibility"
4. Select "Public"
5. Confirm

Then on Render:
1. Go to https://dashboard.render.com/web/new
2. Choose "Public Git Repository"
3. Paste: `https://github.com/moosadrahul/tradeideas`
4. Click "Connect"
5. Follow the configuration steps below

## Option 2: Use GitHub Personal Access Token (Keeps Repo Private)

### Step 1: Create GitHub Token

1. Go to: https://github.com/settings/tokens/new
2. Fill in:
   - **Note:** "Render deployment for TradeIdeas"
   - **Expiration:** 90 days (or longer)
3. Check these scopes:
   - ✅ `repo` (Full control of private repositories)
4. Click "Generate token"
5. **Copy the token immediately** (you won't see it again!)

### Step 2: Add Token to Render

1. Go to: https://dashboard.render.com/account/tokens
2. Click "Create API Token"
3. Name: `github-pat`
4. Paste your GitHub token
5. Save

### Step 3: Deploy on Render

1. Go to: https://dashboard.render.com/web/new
2. Select "Git Provider" → Connect your GitHub account
3. Select `tradeideas` repository
4. Click "Connect"

## Configuration Step (Either Option)

After connecting your repository, you'll see a form:

**Name:** `tradeideas` (or any name)
**Environment:** Python 3
**Region:** Choose closest to you
**Branch:** main
**Build Command:** `pip install -r requirements.txt || true`
**Start Command:** `python3 server.py`
**Plan:** Free

## Add Environment Variable

Scroll to "Advanced" and click "Add Environment Variable":

| Key | Value |
|-----|-------|
| `TWELVE_DATA_API_KEY` | `39d668c1ea964e149832ed84bc2328ef` |
| `HOST` | `0.0.0.0` |
| `PORT` | (leave empty - Render sets automatically) |

## Deploy!

Click **"Deploy"** and wait for Render to build and start your app.

Your app will be live at: **`https://tradeideas.onrender.com`** (or similar)

---

## Troubleshooting

**"Repository not found"**
- Make sure repository is public OR you've added GitHub token correctly
- Your repo is currently PRIVATE, so choose Option 2 above

**API Key returns 401**
- Make sure your Twelve Data API key is correct
- Restart the service on Render dashboard

**Port already in use**
- Render manages ports automatically; shouldn't happen

**Deploy fails**
- Check build logs in Render dashboard
- Make sure `render.yaml` exists in repo root

