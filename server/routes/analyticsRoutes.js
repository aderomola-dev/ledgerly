const express = require('express');
const {
    getSummary,
    getCategorySpending,
    getMonthlyAnalytics
} = require('../controllers/analyticsController');

const router = express.Router();

router.get('/summary', getSummary);
router.get('/categories', getCategorySpending);
router.get('/monthly', getMonthlyAnalytics);

module.exports = router;
