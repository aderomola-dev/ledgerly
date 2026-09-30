/**
 * Transaction Routes
 * Defines API routing endpoints for transaction operations
 */

const express = require('express');
const router = express.Router();
const {
    getAllTransactions,
    getTransactionById,
    createTransaction,
    updateTransaction,
    deleteTransaction
} = require('../controllers/transactionController');

// GET /api/transactions & POST /api/transactions
router.route('/')
    .get(getAllTransactions)
    .post(createTransaction);

// GET /api/transactions/:id, PUT /api/transactions/:id, DELETE /api/transactions/:id
router.route('/:id')
    .get(getTransactionById)
    .put(updateTransaction)
    .delete(deleteTransaction);

module.exports = router;
