const pool = require('../db')

const router = require('express').Router()

router.get('/todos', async (req, res) => {
    const clientes = await pool.query('SELECT * FROM clientes')

    res.status(200).json(clientes.rows)
})

router.get('/devedores', async (req, res) => {
    const clientes = await pool.query(`SELECT 
    c.id,
    c.nome,
    SUM(p.valor_total - p.ja_abatido) AS saldo,
    MIN(p.data) AS desde
FROM clientes c
JOIN pedidos p ON p.id_cliente = c.id
GROUP BY c.id, c.nome
HAVING SUM(p.valor_total - p.ja_abatido) != 0;`)

    res.status(200).json(clientes.rows)
})

module.exports = router