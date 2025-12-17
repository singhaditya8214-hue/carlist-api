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
        const { id } = req.body;

        // Validate input
        if (!id) {
            return res.status(400).json({ error: "Missing required field: id" });
        }

        // Check if listing exists
        const checkQuery = "SELECT id FROM car_listings WHERE id = $1";
        const checkResult = await pool.query(checkQuery, [id]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: "Listing not found" });
        }

        // Update listing to approved
        const updateQuery = `
      UPDATE car_listings 
      SET 
        approved = true,
        status = 'approved',
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

        const result = await pool.query(updateQuery, [id]);

        return res.status(200).json({
            success: true,
            message: "Listing approved successfully",
            listing: result.rows[0]
        });

    } catch (error) {
        console.error("Approve error:", error);
        return res.status(500).json({
            error: "Internal server error",
            details: error.message
        });
    }
}
