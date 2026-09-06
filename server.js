require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

// Explicitly trust requests from your Vite frontend
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// Connect to Neon PostgreSQL using the URL in your .env file
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ROUTE 1: Get Dashboard Stats
app.get('/api/dashboard/today', async (req, res) => {
  try {
    const statsQuery = await pool.query(
      `SELECT 
          COUNT(id) as total_patients, 
          COALESCE(SUM(fee_collected), 0) as total_revenue 
       FROM visits 
       WHERE visit_date = CURRENT_DATE`
    );

    res.json({ stats: statsQuery.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server Error fetching stats' });
  }
});

// ROUTE 2: Get Master Patient List
app.get('/api/patients', async (req, res) => {
  try {
    const allPatients = await pool.query(
      `SELECT * FROM patients ORDER BY created_at DESC`
    );
    res.json(allPatients.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server Error fetching patients' });
  }
});

// ROUTE 3: Quick-Add New Patient
app.post('/api/patients', async (req, res) => {
  const { parent_phone, child_name, dob, gender } = req.body;
  
  try {
    const newPatient = await pool.query(
      `INSERT INTO patients (parent_phone, child_name, dob, gender) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [parent_phone, child_name, dob, gender]
    );
    res.status(201).json(newPatient.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add patient' });
  }
});
// ROUTE 4: Log a Visit
app.post('/api/visits', async (req, res) => {
  const { patient_id, chief_complaint, diagnosis, fee_collected } = req.body;
  
  try {
    const newVisit = await pool.query(
      `INSERT INTO visits (patient_id, chief_complaint, diagnosis, fee_collected) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [patient_id, chief_complaint, diagnosis, fee_collected]
    );
    res.status(201).json(newVisit.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log visit' });
  }
});
// Using 5001 to avoid the Mac Port 5000 background conflict
const PORT = 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));