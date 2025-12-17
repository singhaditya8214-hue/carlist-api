import { Pool } from "pg";

export default async function handler(req, res) {
    try {
        // Log environment variable (masked)
        const connString = process.env.POSTGRES_URL;
        const masked = connString ? `${connString.substring(0, 20)}...${connString.substring(connString.length - 20)}` : 'NOT SET';

        console.log('Connection string (masked):', masked);
        console.log('Connection string length:', connString?.length || 0);

        if (!connString) {
            return res.status(500).json({
                error: "POSTGRES_URL not set",
                envVars: Object.keys(process.env).filter(k => k.includes('POSTGRES'))
            });
        }

        const pool = new Pool({
            connectionString: connString,
            ssl: { rejectUnauthorized: false }
        });

        // Test query
        const result = await pool.query('SELECT NOW() as current_time');
        await pool.end();

        return res.status(200).json({
            success: true,
            message: "Database connection successful!",
            currentTime: result.rows[0].current_time,
            connectionStringLength: connString.length
        });

    } catch (error) {
        console.error("Database test error:", error);
        return res.status(500).json({
            error: "Database connection failed",
            details: error.message,
            code: error.code,
            stack: error.stack
        });
    }
}
