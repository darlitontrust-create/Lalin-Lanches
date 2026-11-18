# Lalin Lanches · Sistema de gestão

Sistema web da lanchonete **Lalin Lanches**: pedidos no balcão, fila da cozinha, cobrança com PIX e troco, caixa, estoque, cadastro, despesas, perdas e resultados. Funciona no computador, tablet e celular.

**Tecnologias:** React 18 + TypeScript + Vite · Firebase Authentication (Google) · Cloud Firestore (tempo real) · Firebase Hosting.

> Passo a passo para publicar: [docs/DEPLOY-FIREBASE.md](docs/DEPLOY-FIREBASE.md)
> Passo a passo para subir no GitHub: [docs/GITHUB.md](docs/GITHUB.md)

## Módulos

| Módulo | O que faz |
|---|---|
| **Pedidos** | Abre e fecha o caixa. Abas **Novo pedido**, **Fila** e **Cobrança** no mesmo lugar. Cliente primeiro (nome obrigatório), depois os itens. Retirada de ingredientes, "Completo" em verde, observação por item, **No local / Para viagem** no pedido e por item, pergunta se a mudança vale para todas as unidades (ou separa uma por linha). Fila com filtro de status, editar, cancelar e WhatsApp para o cliente. Cobrança com troco, PIX (QR + copia e cola com valor) e cartões/vale. |
| **Caixa** | Situação do caixa aberto, fechamento e histórico de fechamentos (XLSX/PDF). |
| **Estoque** | Posição com alertas (baixo/zerado), **marcar como indisponível** (bloqueia a venda), entrada/baixa, importação de entradas por XLSX, inventário com ajuste automático e movimentações. |
| **Cadastro** | Produtos com código automático `TIPO.CATEGORIA.CLASSE.0001`, ingredientes, histórico de preços, importar/exportar XLSX. Tipos, categorias, classes, unidades, formas de pagamento, PIX, categorias de despesa/investimento e mensagens de WhatsApp. |
| **Despesas** | Lançamento de despesas operacionais (aluguel, energia, água, impostos…) e investimentos. Entram no resultado operacional. |
| **Perdas** | Lançamento com baixa automática no estoque e relatórios por motivo, produto e categoria. |
| **Resultados** | Indicadores que mudam conforme **Dia / Semana / Mês / Período** e **Faturamento / Quantidade / Ticket médio**, gráfico (horas no Dia, últimos 15 dias no Mês), mais vendidos, custos e resultado financeiro com despesas. |
| **Usuários** | Só o administrador vê. Libera contas Google, define perfil e permissões por módulo. |

## Regras importantes

- **Acesso:** só entra quem está cadastrado em Usuários. O administrador principal é `darlitontrust@gmail.com` (definido em `.env` e em `firestore.rules`) e é criado automaticamente no primeiro login.
- **Caixa e fila:** a numeração dos pedidos recomeça no nº 1 a cada abertura de caixa. O caixa **só fecha** quando todos os pedidos estão pagos e entregues, ou cancelados.
- **Cancelamento de pedido pago:** o pagamento fica marcado como estornado e os itens voltam ao estoque.
- **Estoque zerado** só avisa. Para bloquear a venda, marque o produto como **Indisponível** no Estoque.
- **Baixa de estoque** acontece quando o pedido é pago.
- **Apagar registros (só administrador):** pedidos/vendas (Caixa › Vendas do dia), movimentações de estoque, perdas e despesas. Ao apagar, o estoque é corrigido automaticamente.
- **Cadastros não são apagados:** produtos, tipos, categorias, classes, unidades, formas de pagamento, motivos e categorias de despesa só podem ser **alterados** ou **inativados**. Usuários são bloqueados, não removidos.

## Rodar no computador

```bash
npm install
cp .env.example .env   # preencha com os dados do Firebase
npm run dev            # abre em http://localhost:5173
```

## Estrutura

```
src/
  App.tsx            login, bloqueio de acesso, menu e tema claro/escuro
  firebase.ts        conexão com o Firebase (lê o .env)
  db.ts              leitura/gravação no Firestore (tempo real)
  ops.ts             regras de negócio: criar/editar/pagar/cancelar pedido, totais do caixa
  seed.ts            configuração e cardápio inicial
  utils.ts           formatação, PIX, WhatsApp, planilhas XLSX
  pages/             um arquivo por módulo
firestore.rules      regras de segurança (permissões por módulo)
firebase.json        hosting + firestore
```

## Coleções no Firestore

`users` (id = e-mail) · `config/app` · `products` · `orders` · `caixas` · `moves` · `inventories` · `losses` · `expenses`

## Próximos passos (roadmap)

Controle de mesas, delivery, impressão de comandas, iFood, integração com maquininhas (Stone, PagSeguro, Mercado Pago, Cielo), PIX dinâmico via banco, ficha técnica com baixa de matéria-prima, compras e fornecedores, app Android/iOS.
