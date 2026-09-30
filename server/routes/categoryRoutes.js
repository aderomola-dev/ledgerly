const express = require('express');
const router = express.Router();
const { query } = require('../config/db');

router.get('/', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        id,
        name,
        category_type
      FROM categories
      WHERE user_id = $1 OR user_id IS NULL
      ORDER BY name ASC
    `, [String(req.userId)]);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Get categories error:', error);

    res.status(500).json({
      success: false,
      error: 'Server error fetching categories'
    });
  }
});

module.exports = router;