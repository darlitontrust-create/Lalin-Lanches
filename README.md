# Lalin Lanches · Sistema de gestão

Sistema web da lanchonete **Lalin Lanches**: pedidos no balcão, fila da cozinha, cobrança com PIX e troco, caixa, estoque, cadastro, despesas, perdas e resultados. Funciona no computador, tablet e celular.

**Tecnologias:** React 18 + TypeScript + Vite · Firebase Authentication (Google) · Cloud Firestore (tempo real) · Firebase Hosting.

> Passo a passo para publicar: [docs/DEPLOY-FIREBASE.md](docs/DEPLOY-FIREBASE.md)
> Passo a passo para subir no GitHub: [docs/GITHUB.md](docs/GITHUB.md)

## Módulos

| Módulo | O que faz |
|---|---|
| **Pedidos** | Abre e fecha o caixa. Abas **Novo pedido**, **Cozinha**, **Comandas** e **Cobrança**. Cliente primeiro (nome obrigatório), filtro por categoria/classe, retirada de ingredientes, observação e **No local / Para viagem** por item. **Cozinha** mostra só itens das classes marcadas em Cadastro (padrão: Lanches e Massas; churrasquinho e bebidas saem pelo balcão), separados por envio; **Comandas** mostram o pedido completo com bebidas e permitem editar ou **adicionar itens** até o pagamento. **Cobrança** com forma única, **pagamento misto** (R$ ou %, com troco e valor faltante) e **rachar conta** (igual, com arredondamento, ou por valor/% e forma de cada pessoa). PIX com QR + copia e cola. |
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
- **Baixa de estoque** acontece quando o pedido é pago. Produtos de revenda podem ter **composição** (ex.: 1 Pão com pernil baixa 1 Pão de sal + 1 porção de Pernil): venda, perda, cancelamento, edição e exclusão movimentam o produto e a matéria-prima vinculada. O vínculo pode ser feito no produto de revenda (Composição) ou na matéria-prima (Vincular a produtos de revenda).
- **WhatsApp:** em Cadastro › Mensagens WhatsApp dá para fazer a conversa abrir sozinha, com a mensagem pronta, quando o status do pedido muda.
- **Senha do administrador** (Usuários): exigida para limpar o Log de exclusões. A senha inicial é 1991 — troque no primeiro acesso.
- **Editar e excluir registros (só administrador):** pedidos e itens de pedido, inclusive de caixas já fechados (Caixa › Vendas do dia e Fechamentos › Pedidos), perdas, despesas e movimentações de estoque. Toda exclusão pede um **motivo** (lista em Cadastro › Motivos de exclusão), corrige o estoque, refaz os totais do caixa fechado e fica registrada no menu **Log de exclusões**, que não pode ser alterado.
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

`users` (id = e-mail) · `config/app` · `products` · `orders` · `caixas` · `moves` · `inventories` · `losses` · `expenses` · `deletions` (log de exclusões) · `secure` (senha do administrador)

## Próximos passos (roadmap)

Controle de mesas, delivery, impressão de comandas, iFood, integração com maquininhas (Stone, PagSeguro, Mercado Pago, Cielo), PIX dinâmico via banco, ficha técnica com baixa de matéria-prima, compras e fornecedores, app Android/iOS.
