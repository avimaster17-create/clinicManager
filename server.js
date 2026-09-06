require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ROUTE 1: Get Dashboard Stats
app.get('/api/dashboard/today', async (req, res) => {
  try {
    const statsQuery = await pool.query(
      `SELECT COUNT(id) as total_patients, COALESCE(SUM(fee_collected), 0) as total_revenue FROM visits WHERE visit_date = CURRENT_DATE`
    );
    res.json({ stats: statsQuery.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server Error fetching stats' });
  }
});

// ROUTE 2: Get Master Patient List (UNCOMMENTED!)
app.get('/api/patients', async (req, res) => {
  try {
    const allPatients = await pool.query(`SELECT * FROM patients ORDER BY created_at DESC`);
    res.json(allPatients.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server Error fetching patients' });
  }
});

// ROUTE 3: Add Patient (Combines error logging + Gender + Historical Date)
app.post('/api/patients', async (req, res) => {
  const { child_name, parent_phone, dob, gender, created_at } = req.body;
  try {
    let newPatient;
    if (created_at && created_at.trim() !== '') {
      newPatient = await pool.query(
        `INSERT INTO patients (child_name, parent_phone, dob, gender, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [child_name, parent_phone, dob, gender, created_at]
      );
    } else {
      newPatient = await pool.query(
        `INSERT INTO patients (child_name, parent_phone, dob, gender, created_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) RETURNING *`,
        [child_name, parent_phone, dob, gender]
      );
    }
    res.status(201).json(newPatient.rows[0]);
  } catch (err) {
    console.error("Database error adding patient:", err.message);
    try {
      await pool.query(
        'INSERT INTO webservice_logs (endpoint, error_message, request_body) VALUES ($1, $2, $3)',
        ['POST /api/patients', err.message, JSON.stringify(req.body)]
      );
    } catch (logErr) {}
    res.status(500).json({ error: "Failed to add patient", details: err.message });
  }
});

// ROUTE 4: View Logs
app.get('/api/logs', async (req, res) => {
  try {
    const logs = await pool.query('SELECT * FROM webservice_logs ORDER BY created_at DESC LIMIT 20');
    res.json(logs.rows);
  } catch (err) {
    res.status(500).json({ error: "Could not fetch logs" });
  }
});

// ROUTE 5: Log a Visit
app.post('/api/visits', async (req, res) => {
  const { patient_id, chief_complaint, diagnosis, fee_collected } = req.body;
  try {
    const newVisit = await pool.query(
      `INSERT INTO visits (patient_id, chief_complaint, diagnosis, fee_collected) VALUES ($1, $2, $3, $4) RETURNING *`,
      [patient_id, chief_complaint, diagnosis, fee_collected]
    );
    res.status(201).json(newVisit.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to log visit' });
  }
});

// ROUTE 6: Patient History
app.get('/api/patients/:id/history', async (req, res) => {
  try {
    const patientQuery = await pool.query('SELECT * FROM patients WHERE id = $1', [req.params.id]);
    if (patientQuery.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
    const visitsQuery = await pool.query('SELECT * FROM visits WHERE patient_id = $1 ORDER BY created_at DESC', [req.params.id]);
    res.json({ patient: patientQuery.rows[0], visits: visitsQuery.rows.length > 0 ? visitsQuery.rows : [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch patient history' });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));