# 🔧 Troubleshooting Guide

## Current Errors

### Error 1: `getaddrinfo ENOTFOUND base`
**Meaning**: The `POSTGRES_URL` environment variable is malformed or incomplete.

### Error 2: `Unauthorized`
**Meaning**: The `CRON_SECRET` environment variable is not set or incorrect.

---

## ✅ Step-by-Step Fix

### Step 1: Get Your Neon Connection String

1. Go to: https://console.neon.tech/
2. Log in and select your project
3. Click **"Connection Details"** or **"Dashboard"**
4. Copy the **Connection String** (should look like this):

```
postgresql://username:password@ep-something-a1b2c3d4.us-east-2.aws.neon.tech/neondb?sslmode=require
```

**Important**: Make sure you copy the ENTIRE string - it's very long!

---

### Step 2: Update Environment Variables in Vercel

#### Option A: Using Vercel Dashboard (Recommended)

1. Go to: https://vercel.com/dashboard
2. Click on your **car-api** project
3. Click **Settings** (top navigation)
4. Click **Environment Variables** (left sidebar)
5. You should see `POSTGRES_URL` and `CRON_SECRET` listed

**For POSTGRES_URL:**
- Click the **⋮** (three dots) next to it
- Click **Edit**
- **Delete the old value completely**
- Paste your full Neon connection string
- Make sure **all environments** are checked (Production, Preview, Development)
- Click **Save**

**For CRON_SECRET:**
- Click the **⋮** (three dots) next to it
- Click **Edit**
- Enter: `89369378-c937-4e71-98a6-0243a99066fd`
- Make sure **all environments** are checked
- Click **Save**

#### Option B: Using Vercel CLI

```powershell
# Set POSTGRES_URL
vercel env add POSTGRES_URL

# When prompted:
# - Paste your full Neon connection string
# - Select: Production, Preview, Development (use spacebar to select all)

# Set CRON_SECRET
vercel env add CRON_SECRET

# When prompted:
# - Enter: 89369378-c937-4e71-98a6-0243a99066fd
# - Select: Production, Preview, Development
```

---

### Step 3: Redeploy

After updating environment variables, you MUST redeploy:

```powershell
vercel --prod
```

Wait for deployment to complete (you'll see a URL when done).

---

### Step 4: Test Again

```powershell
# Test listings endpoint
Invoke-WebRequest -Uri "https://car-api-nu.vercel.app/api/listings"

# Expected: {"success":true,"count":0,"listings":[]}
```

```powershell
# Test cron job
Invoke-WebRequest -Uri "https://car-api-nu.vercel.app/api/cron/dubicars" -Headers @{"Authorization"="Bearer 89369378-c937-4e71-98a6-0243a99066fd"}

# Expected: {"error":"Scraper output parsing failed"} or {"success":true,...}
# (This is normal if scrapers aren't added yet)
```

---

## 🔍 Common Issues

### Issue: Still getting "ENOTFOUND base"

**Cause**: The connection string is incomplete or has extra characters.

**Fix**:
1. Double-check you copied the ENTIRE connection string from Neon
2. Make sure there are no spaces or line breaks
3. It should start with `postgresql://` and end with `?sslmode=require`

### Issue: Still getting "Unauthorized"

**Cause**: The `CRON_SECRET` doesn't match.

**Fix**:
1. Make sure you entered exactly: `89369378-c937-4e71-98a6-0243a99066fd`
2. No extra spaces or quotes
3. Redeploy after setting it

### Issue: Changes not taking effect

**Cause**: You didn't redeploy after changing environment variables.

**Fix**:
```powershell
vercel --prod
```

---

## 📞 Need More Help?

If you're still stuck, check:

1. **Vercel Deployment Logs**:
   - Go to https://vercel.com/dashboard
   - Click your project
   - Click on the latest deployment
   - Check the **Runtime Logs** tab

2. **Verify Environment Variables**:
   - In Vercel dashboard → Settings → Environment Variables
   - Make sure both variables are listed
   - Make sure "Production" is checked for both

3. **Test Connection String Locally**:
   ```powershell
   # Create a test file
   node -e "const {Pool}=require('pg');const p=new Pool({connectionString:'YOUR_NEON_URL',ssl:{rejectUnauthorized:false}});p.query('SELECT NOW()').then(r=>console.log(r.rows)).catch(e=>console.error(e));"
   ```
