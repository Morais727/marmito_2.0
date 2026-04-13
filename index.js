const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'bot-principal'
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Estado por contato
const estados = {};

const CARDAPIO = [
    {
        chave: 'tamanho',
        titulo: '📦 Tamanho da marmita',
        opcoes: [
            'Pequeno - R$ 17.00',
            'Médio - R$ 19.00',
            'Grande - R$ 21.00',
            'Salada - R$ 15.00'
        ]
    },
    {
        chave: 'arroz',
        titulo: '🍚 Escolha o arroz',
        opcoes: [
            'Arroz branco',
            'Arroz integral'
        ]
    },
    {
        chave: 'feijao',
        titulo: '🥘 Escolha o feijão',
        opcoes: [
            'Carioca',
            'Tropeiro'
        ]
    },
    {
        chave: 'guarnicao',
        titulo: '🥦 Escolha a guarnição',
        opcoes: [
            'Quiabo com angu',
            'Repolho refogado',
            'Farofa de legumes'
        ]
    },
    {
        chave: 'complemento',
        titulo: '🍝 Escolha o complemento',
        opcoes: [
            'Macarrão ao molho sugo',
            'Lasanha de frango'
        ]
    },
    {
        chave: 'proteina',
        titulo: '🥩 Escolha a proteína',
        opcoes: [
            'Filé de frango grelhado',
            'Falso lombo de carne moída',
            'Frango com quiabo',
            'Pernil assado',
            'Linguiça toscana'
        ]
    },
    {
        chave: 'sobremesa',
        titulo: '🍰 Escolha a sobremesa',
        opcoes: [
            'Nenhuma',
            'Canudo de doce de leite - R$ 4.00',
            'Trento chocolate - R$ 3.50',
            'Trento limão - R$ 3.50',
            'Trento dark - R$ 3.50',
            'Trento maracujá - R$ 3.50'
        ]
    },
    {
        chave: 'bebida',
        titulo: '🥤 Escolha a bebida',
        opcoes: [
            'Nenhuma',
            'Laranjada - R$ 6.00',
            'Maracujá - R$ 6.00',
            'Laranja com morango - R$ 6.00',
            'Laranja com acerola - R$ 6.00',
            'Abacaxi - R$ 6.00',
            'Coca 2L - R$ 15.00',
            'Guaraná 1L - R$ 10.00',
            'Refri 600ml - R$ 7.50',
            'Refri 350ml - R$ 5.50',
            'Refri mini pet - R$ 3.00'
        ]
    }
];

client.on('qr', (qr) => {
    console.log('QR Code recebido. Escaneie com o WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp conectado com sucesso.');
});

client.on('authenticated', () => {
    console.log('Autenticado com sucesso.');
});

client.on('auth_failure', (msg) => {
    console.error('Falha na autenticação:', msg);
});

client.on('disconnected', (reason) => {
    console.log('Cliente desconectado:', reason);
});

function normalizarTexto(texto) {
    return (texto || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function normalizarMensagem(message) {
    return {
        id: message.id?._serialized || null,
        de: message.from || null,
        para: message.to || null,
        corpo: message.body || '',
        timestamp: message.timestamp
            ? new Date(message.timestamp * 1000).toISOString()
            : new Date().toISOString(),
        tipo: message.type || 'chat',
        origemGrupo: message.from?.endsWith('@g.us') || false
    };
}

function tratarMensagem(dado) {
    const texto = normalizarTexto(dado.corpo);

    const resultado = {
        ...dado,
        categoria: 'outros',
        camposExtraidos: {}
    };

    if (texto === '\\pedir') {
        resultado.categoria = 'comando_pedir';
    }

    return resultado;
}

function identificarAcao(texto) {
    const msg = normalizarTexto(texto);

    if (msg === '\\pedir') {
        return { tipo: 'INICIAR_PEDIDO' };
    }

    return null;
}

function salvarJsonLinha(obj, arquivo = 'mensagens_tratadas.jsonl') {
    const caminho = path.resolve(arquivo);
    fs.appendFileSync(caminho, JSON.stringify(obj) + '\n', 'utf8');
}

function formatarDataLocal(data = new Date()) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

function formatarHoraLocal(data = new Date()) {
    const hora = String(data.getHours()).padStart(2, '0');
    const minuto = String(data.getMinutes()).padStart(2, '0');
    const segundo = String(data.getSeconds()).padStart(2, '0');
    return `${hora}:${minuto}:${segundo}`;
}

function obterCaminhoPedidosDoDia() {
    const hoje = formatarDataLocal();
    return path.resolve(`pedidos_do_dia_${hoje}.json`);
}

function lerPedidosDoDia() {
    const caminho = obterCaminhoPedidosDoDia();

    if (!fs.existsSync(caminho)) {
        return [];
    }

    try {
        const conteudo = fs.readFileSync(caminho, 'utf8');
        return JSON.parse(conteudo);
    } catch (error) {
        console.error('Erro ao ler arquivo de pedidos do dia:', error);
        return [];
    }
}

function salvarPedidoNoArquivo(pedido) {
    const caminho = obterCaminhoPedidosDoDia();
    const pedidos = lerPedidosDoDia();

    pedidos.push(pedido);

    fs.writeFileSync(caminho, JSON.stringify(pedidos, null, 2), 'utf8');
}

async function obterNomeContato(message) {
    try {
        const contato = await message.getContact();
        return (
            contato.pushname ||
            contato.name ||
            contato.shortName ||
            contato.number ||
            message.from
        );
    } catch (error) {
        return message.from;
    }
}

function encontrarOpcaoEscolhida(textoRecebido, etapa) {
    const texto = normalizarTexto(textoRecebido);

    if (/^\d+$/.test(texto)) {
        const index = parseInt(texto, 10) - 1;
        if (index >= 0 && index < etapa.opcoes.length) {
            return etapa.opcoes[index];
        }
    }

    for (const opcao of etapa.opcoes) {
        if (normalizarTexto(opcao) === texto) {
            return opcao;
        }
    }

    return null;
}

async function enviarListaOuTexto(chatId, etapa) {
    const texto =
        `${etapa.titulo}\n\n` +
        etapa.opcoes.map((opcao, index) => `${index + 1} - ${opcao}`).join('\n') +
        `\n\nDigite o número da opção desejada.`;

    await client.sendMessage(chatId, texto);
}

async function iniciarFluxoPedido(message) {
    const contato = message.from;
    const nomeUsuario = await obterNomeContato(message);

    estados[contato] = {
        etapaAtual: 0,
        aguardandoPedido: true,
        nomeUsuario,
        telefone: contato,
        pedido: {}
    };

    await message.reply(
        `Olá, *${nomeUsuario}*! Vamos montar seu pedido.\n` +
        `Vou te enviar o cardápio em partes para você selecionar cada item.`
    );

    await enviarProximaEtapa(message);
}

async function enviarProximaEtapa(message) {
    const contato = message.from;
    const estado = estados[contato];

    if (!estado || !estado.aguardandoPedido) {
        return;
    }

    if (estado.etapaAtual >= CARDAPIO.length) {
        await finalizarPedido(message);
        return;
    }

    const etapa = CARDAPIO[estado.etapaAtual];
    await enviarListaOuTexto(contato, etapa);
}

async function processarSelecaoPedido(message) {
    const contato = message.from;
    const estado = estados[contato];

    if (!estado || !estado.aguardandoPedido) {
        return false;
    }

    const etapa = CARDAPIO[estado.etapaAtual];
    if (!etapa) {
        return false;
    }

    const textoSelecionado = message.body || '';
    const opcaoEscolhida = encontrarOpcaoEscolhida(textoSelecionado, etapa);

    if (!opcaoEscolhida) {
        await message.reply(
            `Não consegui identificar sua escolha para *${etapa.titulo}*.\n` +
            `Responda com o número correspondente à opção desejada.`
        );
        await enviarListaOuTexto(contato, etapa);
        return true;
    }

    estado.pedido[etapa.chave] = opcaoEscolhida;
    estado.etapaAtual += 1;

    await message.reply(`✅ Seleção registrada: *${opcaoEscolhida}*`);

    if (estado.etapaAtual < CARDAPIO.length) {
        await enviarProximaEtapa(message);
        return true;
    }

    await finalizarPedido(message);
    return true;
}

async function finalizarPedido(message) {
    const contato = message.from;
    const estado = estados[contato];

    if (!estado) return;

    const agora = new Date();

    const pedidoFinal = {
        nomeUsuarioWhatsapp: estado.nomeUsuario,
        telefone: estado.telefone,
        dataPedido: formatarDataLocal(agora),
        horaPedido: formatarHoraLocal(agora),
        itens: estado.pedido
    };

    salvarPedidoNoArquivo(pedidoFinal);

    const resumo =
        `✅ *Pedido registrado com sucesso!*\n\n` +
        `👤 Cliente: ${pedidoFinal.nomeUsuarioWhatsapp}\n` +
        `🕒 Hora: ${pedidoFinal.horaPedido}\n` +
        `📅 Data: ${pedidoFinal.dataPedido}\n\n` +
        `🧾 *Resumo do pedido:*\n` +
        `📦 Tamanho: ${pedidoFinal.itens.tamanho || '-'}\n` +
        `🍚 Arroz: ${pedidoFinal.itens.arroz || '-'}\n` +
        `🥘 Feijão: ${pedidoFinal.itens.feijao || '-'}\n` +
        `🥦 Guarnição: ${pedidoFinal.itens.guarnicao || '-'}\n` +
        `🍝 Complemento: ${pedidoFinal.itens.complemento || '-'}\n` +
        `🥩 Proteína: ${pedidoFinal.itens.proteina || '-'}\n` +
        `🍰 Sobremesa: ${pedidoFinal.itens.sobremesa || '-'}\n` +
        `🥤 Bebida: ${pedidoFinal.itens.bebida || '-'}\n\n` +
        `Obrigado pelo pedido!`;

    await message.reply(resumo);

    delete estados[contato];
}

async function executarAcao(message, acao) {
    if (!acao) return;

    switch (acao.tipo) {
        case 'INICIAR_PEDIDO':
            await iniciarFluxoPedido(message);
            break;
    }
}

client.on('message', async (message) => {
    try {
        if (message.fromMe) return;

        if (message.from.endsWith('@g.us')) {
            console.log('Mensagem de grupo ignorada:', message.body);
            return;
        }

        const bruto = normalizarMensagem(message);
        const tratado = tratarMensagem(bruto);

        salvarJsonLinha(tratado);
        console.log('Mensagem recebida:', tratado.corpo);

        const contato = message.from;

        if (estados[contato]?.aguardandoPedido) {
            const foiProcessado = await processarSelecaoPedido(message);
            if (foiProcessado) {
                return;
            }
        }

        const acao = identificarAcao(message.body);

        if (!acao) {
            console.log('Mensagem ignorada:', message.body);
            return;
        }

        await executarAcao(message, acao);
    } catch (error) {
        console.error('Erro ao processar mensagem:', error);
    }
});

client.initialize();