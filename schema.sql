-- Car Listings Table Schema
-- Run this SQL in your Neon database console

CREATE TABLE IF NOT EXISTS car_listings (
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

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_car_listings_status ON car_listings(status);
CREATE INDEX IF NOT EXISTS idx_car_listings_updated_at ON car_listings(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_car_listings_source ON car_listings(source);
