require('dotenv').config()

const router = require('express').Router()
const jwt = require('jsonwebtoken');


const pool = require('../db')

router.post('/', async (req, res) => {
    const { nome, senha } = req.body

    console.log(req.body);


    try {
        const usuario = await pool.query(
            'SELECT * FROM usuarios WHERE nome = $1 AND senha = $2',
            [nome, senha]
        )

        if (usuario.rows.length === 0) {
            return res.status(401).json({ error: 'Credenciais inválidas!' })
        }

        const token = jwt.sign({
            nome: usuario.rows[0].nome,
            role: usuario.rows[0].role
        }, process.env.JWT_SECRET)

        res.status(200).json({
            message: 'Login bem-sucedido!',
            token,
            role: usuario.rows[0].role
        })
    } catch (error) {

    }

})



module.exports = router