import { Pool } from "pg";

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
    // Only allow GET requests
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const query = `
      SELECT 
        id,
        source,
        link,
        image,
        phone_number,
        year,
        mileage,
        specs,
        price,
        price_numeric,
        owner_name,
        trim,
        location,
        status,
        approved,
        messaged,
        replied,
        reply_count,
        last_messaged_at,
        created_at,
        updated_at
      FROM car_listings
      ORDER BY updated_at DESC
    `;

        const result = await pool.query(query);

        return res.status(200).json({
            success: true,
            count: result.rows.length,
            listings: result.rows
        });

    } catch (error) {
        console.error("Listings fetch error:", error);
        return res.status(500).json({
            error: "Internal server error",
            details: error.message
        });
    }
}
