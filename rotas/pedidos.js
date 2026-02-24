const router = require('express').Router()

const pool = require('../db')

router.get('/:id', async (req, res) => {
    try {
        // Buscar pedidos com saldo devedor
        const pedidos = await pool.query(
            'SELECT * FROM pedidos WHERE id_cliente= $1 ORDER BY id DESC LIMIT 50',
            [req.params.id]
        );

        // Para cada pedido, buscar seus itens
        const pedidosComItens = await Promise.all(
            pedidos.rows.map(async (pedido) => {
                const itens = await pool.query(
                    'SELECT * FROM pedidos_itens WHERE id_pedido = $1',
                    [pedido.id]
                );
                return {
                    ...pedido,
                    itens: itens.rows
                };
            })
        );

        res.status(200).json(pedidosComItens);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar pedidos' });
    }
});

router.post('/novo', async (req, res) => {
    const { cliente, itens } = req.body;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1️⃣ Verificar ou criar cliente (Ignorando Maiúsculas/Minúsculas)
        let clienteId;
        // Usamos ILIKE ou LOWER para comparar sem distinção
        const clienteExistente = await client.query(
            'SELECT id FROM clientes WHERE LOWER(nome) = LOWER($1)',
            [cliente]
        );

        if (clienteExistente.rows.length === 0) {
            // Se for criar um novo, salve com a primeira letra maiúscula (Opcional, mas fica bonito)
            const nomeFormatado = cliente.charAt(0).toUpperCase() + cliente.slice(1).toLowerCase();

            const insertCliente = await client.query(
                'INSERT INTO clientes (nome) VALUES ($1) RETURNING id',
                [nomeFormatado]
            );
            clienteId = insertCliente.rows[0].id;
        } else {
            clienteId = clienteExistente.rows[0].id;
        }

        // 2️⃣ Criar pedido - agora calculando corretamente
        // Usamos item.preco (que é o unitário que vem do front)
        const valorTotal = itens.reduce((total, item) => total + (item.preco * item.quantidade), 0);

        const insertPedido = await client.query(
            'INSERT INTO pedidos (id_cliente, valor_total, data) VALUES ($1, $2, NOW()) RETURNING id',
            [clienteId, valorTotal]
        );

        const pedidoId = insertPedido.rows[0].id;

        // 3️⃣ Inserir itens do pedido
        for (const item of itens) {
            await client.query(
                'INSERT INTO pedidos_itens (id_pedido, produto, quantidade, valor_unt) VALUES ($1, $2, $3, $4)',
                [
                    pedidoId,
                    item.nome,
                    item.quantidade,
                    item.preco // <--- Aqui você salva o valor de UMA unidade
                ]
            );
        }

        await client.query('COMMIT');

        res.status(201).json({ message: 'Pedido criado com sucesso', pedidoId });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: 'Erro ao criar pedido' });
    } finally {
        client.release();
    }
});

router.post('/registrar-pagamento/:id', async (req, res) => {
    const { id } = req.params;
    let { valor } = req.body;

    // Blinda: Converta para número e valide
    valor = parseFloat(valor);

    if (!valor || isNaN(valor) || valor <= 0) {
        return res.status(400).json({ error: 'Valor deve ser um número positivo' });
    }

    const client = await pool.connect();

    try {
        // Verificar o cliente
        const cliente = await pool.query('SELECT * FROM clientes WHERE id = $1', [id]);

        if (cliente.rows.length === 0) {
            return res.status(404).json({ error: 'Cliente não encontrado' });
        }

        await client.query('BEGIN');

        // Buscar notas em aberto (ordenadas por data)
        const notas = await pool.query(
            'SELECT id, valor_total, ja_abatido FROM pedidos WHERE id_cliente = $1 ORDER BY data',
            [id]
        );

        // 🔒 BLINDA: Calcular o total devedor
        const totalDevedor = notas.rows.reduce((total, nota) => {
            const valorTotal = parseFloat(nota.valor_total) || 0;
            const jaAbatido = parseFloat(nota.ja_abatido) || 0;
            return total + (valorTotal - jaAbatido);
        }, 0);

        // 🔒 BLINDA: Validar se o pagamento não é maior que o devedor
        if (valor > totalDevedor) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Valor do pagamento (R$ ${valor.toFixed(2)}) não pode ser maior que o total devedor (R$ ${totalDevedor.toFixed(2)})`,
                total_devedor: parseFloat(totalDevedor.toFixed(2)),
                valor_solicitado: valor
            });
        }

        let saldo = valor;
        const notasAtualizadas = [];

        // Abater progressivamente em cada nota
        for (const nota of notas.rows) {
            if (saldo <= 0) break;

            const valorTotal = parseFloat(nota.valor_total) || 0;
            const jaAbatido = parseFloat(nota.ja_abatido) || 0;

            const faltaAbater = valorTotal - jaAbatido;

            if (faltaAbater > 0) {
                const abatimento = Math.min(saldo, faltaAbater);
                const novoJaAbatido = jaAbatido + abatimento;

                await client.query(
                    'UPDATE pedidos SET ja_abatido = $1 WHERE id = $2',
                    [novoJaAbatido, nota.id]
                );

                saldo -= abatimento;

                notasAtualizadas.push({
                    id: nota.id,
                    valor_total: valorTotal,
                    ja_abatido: novoJaAbatido,
                    saldo_restante: valorTotal - novoJaAbatido,
                    abatido_neste_pagamento: abatimento
                });
            }
        }

        client.query('INSERT INTO pagamentos (cliente_id, valor, data) VALUES ($1, $2, NOW())', [id, valor]);

        await client.query('COMMIT');

        res.json({
            message: 'Pagamento registrado com sucesso',
            valor_pago: valor,
            total_devedor: parseFloat(totalDevedor.toFixed(2)),
            saldo_restante: parseFloat((totalDevedor - valor).toFixed(2)),
            notas_afetadas: notasAtualizadas.length,
            detalhes: notasAtualizadas
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: 'Erro ao registrar pagamento' });
    } finally {
        client.release();
    }
});


module.exports = router