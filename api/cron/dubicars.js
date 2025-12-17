import { Pool } from "pg";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
    // Verify cron secret to prevent unauthorized access
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        console.log("Starting Dubicars scraper at:", new Date().toISOString());

        // Run the Dubicars scraper
        // Adjust the path to your scraper file
        const { stdout, stderr } = await execAsync("node scrapers/dubicars.js");

        if (stderr) {
            console.error("Scraper stderr:", stderr);
        }

        // Parse the scraper output (assuming it returns JSON)
        let cars;
        try {
            cars = JSON.parse(stdout);
        } catch (e) {
            console.error("Failed to parse scraper output:", e);
            return res.status(500).json({
                error: "Scraper output parsing failed",
                output: stdout
            });
        }

        if (!Array.isArray(cars) || cars.length === 0) {
            return res.status(200).json({
                success: true,
                message: "No cars found",
                count: 0
            });
        }

        // Insert/update cars in database
        let count = 0;
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

            // Check if listing exists
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

        console.log(`Dubicars scraper completed: ${count} cars processed`);

        return res.status(200).json({
            success: true,
            scraper: "Dubicars",
            count,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error("Dubicars cron error:", error);
        return res.status(500).json({
            error: "Cron job failed",
            details: error.message
        });
    }
}
