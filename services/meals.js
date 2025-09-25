const express = require('express');
const router = express.Router();
const { pool } = require('./db');

// Middleware to check authentication
const isAuthenticated = (req, res, next) => {
  // In test environment, mock authentication by checking for a header
  if (process.env.NODE_ENV === 'test') {
    if (req.headers.authorization) {
      const testUserId =
        process.env.TEST_USER_ID || '00000000-0000-0000-0000-000000000001';
      req.user = { id: testUserId }; // Mock user with stable UUID
      return next();
    } else {
      return res.status(401).json({ message: 'Authentication required.' });
    }
  }

  // Real authentication check for dev/prod
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Authentication required.' });
};

// GET /api/meals
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM meal_logs WHERE user_id = $1 ORDER BY consumed_at DESC',
      [req.user.id],
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching meals:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/meals
router.post('/', isAuthenticated, async (req, res) => {
  const { meal_type, food_item, calories, consumed_at } = req.body;
  if (!meal_type || !food_item || !calories || !consumed_at) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO meal_logs (user_id, meal_type, food_item, calories, consumed_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.id, meal_type, food_item, calories, consumed_at],
    );
    res
      .status(201)
      .json({ message: 'Meal log created successfully', meal: result.rows[0] });
  } catch (error) {
    console.error('Error creating meal:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
