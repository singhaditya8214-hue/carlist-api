# 🚀 Deployment Checklist

Your API is deployed at: **https://car-api-nu.vercel.app/**

## ⚠️ Current Issues

1. ❌ Environment variables not set
2. ❌ Database connection failing
3. ❌ Cron jobs won't work without environment variables

---

## ✅ Fix Steps

### Step 1: Add Environment Variables in Vercel

1. Go to: https://vercel.com/dashboard
2. Click on your **car-api** project
3. Go to **Settings** → **Environment Variables**
4. Add these two variables:

#### Variable 1: POSTGRES_URL
- **Name**: `POSTGRES_URL`
- **Value**: Your Neon PostgreSQL connection string
  ```
  postgresql://username:password@host/database?sslmode=require
  ```
- **Environment**: ✅ Production, ✅ Preview, ✅ Development

#### Variable 2: CRON_SECRET
- **Name**: `CRON_SECRET`
- **Value**: `89369378-c937-4e71-98a6-0243a99066fd`
- **Environment**: ✅ Production, ✅ Preview, ✅ Development

### Step 2: Redeploy

After adding environment variables, redeploy to apply them:

```powershell
vercel --prod
```

Or simply go to your Vercel dashboard and click **"Redeploy"** on the latest deployment.

---

## 🧪 Test After Redeployment

### Test 1: Check Listings Endpoint
```powershell
Invoke-WebRequest -Uri "https://car-api-nu.vercel.app/api/listings"
```

Expected response: `{"success": true, "count": 0, "listings": []}`

### Test 2: Test Cron Job (Manual Trigger)
```powershell
Invoke-WebRequest -Uri "https://car-api-nu.vercel.app/api/cron/dubicars" -Headers @{"Authorization"="Bearer 89369378-c937-4e71-98a6-0243a99066fd"}
```

Expected response: `{"success": true, "scraper": "Dubicars", "count": X}`

---

## ⏰ Cron Schedule

Once environment variables are set, these will run automatically:

- **Dubicars**: Every day at 9:00 AM UTC
- **YallaMotors**: Every day at 11:00 AM UTC

### Convert to UAE Time (UTC+4)
- 9:00 AM UTC = **1:00 PM UAE**
- 11:00 AM UTC = **3:00 PM UAE**

### To Change Schedule to UAE Morning Times

If you want them to run at 9 AM and 11 AM **UAE time**, edit `vercel.json`:

```json
{
  "version": 2,
  "crons": [
    {
      "path": "/api/cron/dubicars",
      "schedule": "0 5 * * *"
    },
    {
      "path": "/api/cron/yallamotors",
      "schedule": "0 7 * * *"
    }
  ]
}
```

Then push changes:
```powershell
git add vercel.json
git commit -m "Update cron schedule to UAE timezone"
git push
```

---

## 📝 Next Steps

1. ✅ Add environment variables in Vercel dashboard
2. ✅ Redeploy using `vercel --prod`
3. ✅ Test endpoints
4. ✅ Add your scrapers to the `scrapers/` folder
5. ✅ Push scrapers to GitHub
6. ✅ Redeploy again

---

## 🔗 Useful Links

- **Your Deployment**: https://car-api-nu.vercel.app/
- **Vercel Dashboard**: https://vercel.com/dashboard
- **GitHub Repo**: https://github.com/adxtya-codes/car-api

---

## 📞 Support

If you encounter issues:
1. Check Vercel deployment logs
2. Verify environment variables are set correctly
3. Ensure your Neon database is accessible
4. Make sure scrapers output valid JSON to stdout
