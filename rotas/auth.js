const jwt = require('jsonwebtoken');

const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Pega o token após o "Bearer"

    if (!token) return res.status(401).json({ error: 'Acesso negado!' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.usuario = decoded; // Aqui vai estar { nome: 'PC' } ou { nome: 'Tablet' }
        next();
    } catch (err) {
        res.status(403).json({ error: 'Token inválido ou expirado!' });
    }
};

module.exports = { verificarToken };