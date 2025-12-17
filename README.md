# Car Listing API

Backend API for car listing automation system built with Node.js, Vercel Serverless Functions, and PostgreSQL (Neon).

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Environment Variables

Create a `.env` file in the root directory:

```env
POSTGRES_URL=your_neon_postgres_connection_string
CRON_SECRET=your-random-secret-key
```

**In Vercel Dashboard**, add these environment variables:
- `POSTGRES_URL` - Your Neon PostgreSQL connection string
- `CRON_SECRET` - A random secret key for cron job authentication

### 3. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

## ⏰ Automated Cron Jobs

The API includes automated scrapers that run on schedule:

- **Dubicars Scraper**: Runs daily at **9:00 AM UTC**
- **YallaMotors Scraper**: Runs daily at **11:00 AM UTC**

### How Cron Jobs Work

1. Vercel automatically triggers the cron endpoints at scheduled times
2. Each endpoint runs the respective scraper from the `scrapers/` folder
3. Results are automatically uploaded to the database
4. Cron jobs are protected by `CRON_SECRET` authentication

### Manual Trigger (for testing)

```bash
curl -X GET https://your-domain.vercel.app/api/cron/dubicars \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

> **Note**: Vercel cron jobs use UTC timezone. Adjust the schedule in `vercel.json` if you need a different timezone.

---

## 📌 API Endpoints

### POST /api/upload
Upload scraped car listings (bulk insert/update)

**Request Body:**
```json
[
  {
    "id": "listing_1763670655109_3rulyhso",
    "source": "Dubicars",
    "link": "https://www.dubicars.com/example",
    "image": "https://example.jpg",
    "phone_number": "+97150 123 4567",
    "year": "2024",
    "mileage": "17,000 Km",
    "specs": "GCC",
    "price": "AED 185000",
    "price_numeric": 185000,
    "owner_name": "John Doe",
    "trim": "Sedan",
    "location": "Dubai",
    "status": "new",
    "created_at": "2025-11-20T20:30:55.109Z",
    "updated_at": "2025-11-20T20:30:55.109Z"
  }
]
```

**Response:**
```json
{
  "success": true,
  "count": 1,
  "message": "Successfully processed 1 car listings"
}
```

---

### GET /api/listings
Retrieve all car listings (sorted by updated_at DESC)

**Response:**
```json
{
  "success": true,
  "count": 10,
  "listings": [...]
}
```

---

### POST /api/approve
Approve a car listing

**Request Body:**
```json
{
  "id": "listing_123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Listing approved successfully",
  "listing": {...}
}
```

---

### POST /api/reject
Reject a car listing

**Request Body:**
```json
{
  "id": "listing_123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Listing rejected successfully",
  "listing": {...}
}
```

---

### POST /api/message
Mark a listing as messaged

**Request Body:**
```json
{
  "id": "listing_123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Listing marked as messaged successfully",
  "listing": {...}
}
```

## 🗄️ Database Schema

The API expects the following PostgreSQL table:

```sql
CREATE TABLE car_listings (
    id TEXT PRIMARY KEY,
    source TEXT,
    link TEXT,
    image TEXT,
    phone_number TEXT,
    year INT,
    mileage TEXT,
    specs TEXT,
    price TEXT,
    price_numeric INT,
    owner_name TEXT,
    trim TEXT,
    location TEXT,
    status TEXT,
    approved BOOLEAN DEFAULT FALSE,
    messaged BOOLEAN DEFAULT FALSE,
    replied BOOLEAN DEFAULT FALSE,
    reply_count INT DEFAULT 0,
    last_messaged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 📁 Project Structure

```
car-api/
├── api/
│   ├── cron/
│   │   ├── dubicars.js       # Dubicars cron job (9 AM daily)
│   │   └── yallamotors.js    # YallaMotors cron job (11 AM daily)
│   ├── upload.js             # Bulk upload/update listings
│   ├── listings.js           # Get all listings
│   ├── approve.js            # Approve a listing
│   ├── reject.js             # Reject a listing
│   └── message.js            # Mark as messaged
├── scrapers/                 # Your scraper files (not included)
├── package.json
├── vercel.json               # Includes cron configuration
├── .gitignore
├── .env.example
└── README.md
```

## 🚀 Pushing to GitHub

### First Time Setup

```bash
# Initialize git repository
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: Car API with cron jobs"

# Add remote repository
git remote add origin https://github.com/adxtya-codes/car-api.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Subsequent Updates

```bash
git add .
git commit -m "Your commit message"
git push
```

## 🔒 Security Notes

- Never commit `.env` file
- Always use environment variables for database credentials
- SSL is enabled for PostgreSQL connections

## 📝 License

MIT
