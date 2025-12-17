import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const cars = req.body;

    // Validate input
    if (!Array.isArray(cars) || cars.length === 0) {
      return res.status(400).json({ error: "Invalid input: expected array of cars" });
    }

    let count = 0;

    // Process each car listing
    for (const car of cars) {
      const {
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
        created_at,
        updated_at
      } = car;

      // Check if listing already exists
      const checkQuery = "SELECT id FROM car_listings WHERE id = $1";
      const checkResult = await pool.query(checkQuery, [id]);

      if (checkResult.rows.length > 0) {
        // Update existing listing
        const updateQuery = `
          UPDATE car_listings 
          SET 
            price_numeric = $1,
            price = $2,
            status = 'new',
            updated_at = NOW()
          WHERE id = $3
        `;
        await pool.query(updateQuery, [price_numeric, price, id]);
      } else {
        // Insert new listing
        const insertQuery = `
          INSERT INTO car_listings (
            id, source, link, image, phone_number, year, mileage, 
            specs, price, price_numeric, owner_name, trim, location, 
            status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'new', $14, $15)
        `;
        await pool.query(insertQuery, [
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
          created_at || new Date().toISOString(),
          updated_at || new Date().toISOString()
        ]);
      }

      count++;
    }

    return res.status(200).json({ 
      success: true, 
      count,
      message: `Successfully processed ${count} car listings`
    });

  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      details: error.message 
    });
  }
}
