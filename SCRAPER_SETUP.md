# ⚠️ Important: Vercel Serverless Limitations

## The Problem

Vercel serverless functions **cannot run external Node.js scripts** using `child_process.exec()`. The `scrapers/` folder won't be accessible in the serverless environment.

## ✅ Solution: Two Options

### **Option 1: Run Scrapers Locally (Recommended)**

Run your scrapers on your local machine or a separate server, then use the `/api/upload` endpoint to send the data.

**How it works:**
1. Run scrapers locally on schedule (using Windows Task Scheduler or cron on Linux)
2. Scrapers output JSON
3. Send JSON to `/api/upload` endpoint

**Example:**

```javascript
// run-scrapers.js (run this locally)
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runDubicars() {
  const { stdout } = await execAsync('node scrapers/scrape_dubicars_ultimate.js');
  const cars = JSON.parse(stdout);
  
  // Upload to API
  const response = await fetch('https://car-api-nu.vercel.app/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cars)
  });
  
  console.log('Uploaded:', await response.json());
}

runDubicars();
```

**Schedule with Windows Task Scheduler:**
- Create a task to run `node run-scrapers.js` at 9 AM daily

---

### **Option 2: Use GitHub Actions (Cloud-based)**

Run scrapers using GitHub Actions on schedule, then upload to your API.

**How it works:**
1. GitHub Actions runs on schedule
2. Executes your scrapers
3. Uploads results to your API

**Create `.github/workflows/scrapers.yml`:**

```yaml
name: Run Scrapers

on:
  schedule:
    - cron: '0 9 * * *'  # 9 AM UTC daily (Dubicars)
    - cron: '0 11 * * *' # 11 AM UTC daily (YallaMotors)
  workflow_dispatch: # Manual trigger

jobs:
  run-dubicars:
    runs-on: ubuntu-latest
    if: github.event.schedule == '0 9 * * *' || github.event_name == 'workflow_dispatch'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - name: Run Dubicars Scraper
        run: |
          OUTPUT=$(node scrapers/scrape_dubicars_ultimate.js)
          echo "$OUTPUT" > dubicars.json
      - name: Upload to API
        run: |
          curl -X POST https://car-api-nu.vercel.app/api/upload \
            -H "Content-Type: application/json" \
            -d @dubicars.json

  run-yallamotors:
    runs-on: ubuntu-latest
    if: github.event.schedule == '0 11 * * *' || github.event_name == 'workflow_dispatch'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - name: Run YallaMotors Scraper
        run: |
          OUTPUT=$(node scrapers/approvedyallafinal.js)
          echo "$OUTPUT" > yallamotors.json
      - name: Upload to API
        run: |
          curl -X POST https://car-api-nu.vercel.app/api/upload \
            -H "Content-Type: application/json" \
            -d @yallamotors.json
```

---

## 🎯 Recommended Approach

**Use GitHub Actions (Option 2)** because:
- ✅ Runs in the cloud (no need for local machine to be on)
- ✅ Free for public repos
- ✅ Easy to monitor and debug
- ✅ Automatic scheduling
- ✅ Version controlled

---

## 🗑️ What to Remove

Since Vercel cron jobs won't work for running scrapers, you can:

1. Remove `/api/cron/dubicars.js`
2. Remove `/api/cron/yallamotors.js`
3. Remove cron configuration from `vercel.json`
4. Keep `/api/upload` - this is what you'll use to upload scraped data

---

## 📝 Next Steps

1. Choose Option 1 (local) or Option 2 (GitHub Actions)
2. I can help you set up whichever you prefer
3. Test the `/api/upload` endpoint with sample data

Which option would you like to use?
