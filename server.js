require('dotenv').config()
const cors = require('cors')
const express = require('express')
const app = express()
const fs = require('fs')

app.use(cors())

app.use(express.json())

app.use('/clientes', require('./rotas/clientes'))
app.use('/pedidos', require('./rotas/pedidos'))
app.use('/login', require('./rotas/login'))

app.get('/catalogo', (req, res) => {
    const data = fs.readFileSync('./produtos.json', 'utf-8');
    res.json(JSON.parse(data));
});

app.listen(process.env.PORT, () => {
    console.log('servidor rodando');
    console.log(process.env.PORT);

})

const pool = require('./db')

pool.connect()
    .then(client => {
        console.log('✅ Conectado ao PostgreSQL')
        client.release()
    })
    .catch(err => {
        console.error('❌ Erro ao conectar no PostgreSQL:', err)
    })
