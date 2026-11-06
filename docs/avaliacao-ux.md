# Avaliação de UX: navegação

Avaliação heurística feita depois de incluir extratos de conta corrente e a pasta monitorada, quando o app passou
a ter seis destinos e três formas de entrada de arquivos. Método:

- **Percurso das tarefas principais**, no celular (390 px, toque) e no computador (1280 px, mouse e teclado):
  1. importar a primeira fatura e o primeiro extrato;
  2. entender "para onde vai o dinheiro" num mês específico;
  3. descobrir de onde vem um gasto alto (categoria → estabelecimento → lançamentos) e voltar;
  4. classificar o que o app não reconheceu;
  5. configurar a pasta monitorada e acompanhar o que entrou sozinho;
  6. ver quanto da próxima fatura já está comprometido.
- **Heurísticas de Nielsen** (visibilidade do estado, consistência, reconhecer em vez de lembrar, controle e
  liberdade, prevenção de erros) e padrões de navegação mobile (no máximo cinco abas na barra inferior, "Mais"
  para o restante, alvos de toque de 44 px).
- **Acessibilidade de navegação** (WCAG 2.1: 2.4.1 Pular blocos, 2.4.2 Título da página, 2.4.3 Ordem do foco).

Severidade: **alta** atrapalha a tarefa; **média** causa erro ou retrabalho; **baixa** é atrito.

## Problemas encontrados

| #   | Problema                                                                                                                                                                                         | Heurística                               | Severidade | Solução                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No celular, **Dados** era um ícone sem rótulo no topo; com seis destinos, a barra inferior não comportava todos e a hierarquia ficava arbitrária.                                                | Reconhecer em vez de lembrar             | Alta       | Barra inferior com **Início, Lançamentos, Importar, Parcelas e Mais**. "Mais" abre uma folha com De/para, Dados e backup, pasta monitorada e instalação, cada item com descrição. |
| 2   | Coisas que pedem ação ficavam espalhadas: arquivo esperando revisão só aparecia entrando em Importar; pasta pedindo permissão, só na tela da pasta; não reconhecidos, só no contador do De/para. | Visibilidade do estado                   | Alta       | Painel **"Precisa da sua atenção"** no Início, com o que está pendente e um botão para cada item; contador somado na aba Mais e nos itens do menu.                                |
| 3   | Nomes diferentes para a mesma tela: "Visão geral" no computador e "Início" no celular; título "Importar fatura" depois de aceitar extratos; textos falando só de "faturas".                      | Consistência                             | Média      | "Início" em todo lugar; "Importar faturas e extratos"; textos de período em **meses** em vez de faturas.                                                                          |
| 4   | Cada tela tinha o próprio filtro de período ("Fatura" em Lançamentos, "Período" no Início): o mês escolhido se perdia ao trocar de aba.                                                          | Consistência; controle                   | Média      | **Filtros globais** (período, origem cartão/conta, cartão) iguais em Início, Lançamentos e Parcelas, mantidos ao navegar.                                                         |
| 5   | Ao abrir Lançamentos a partir de uma categoria, não havia indicação de que a lista estava filtrada nem caminho de volta.                                                                         | Controle e liberdade                     | Média      | Barra de contexto com **"← Voltar ao Início"** e **chips dos filtros ativos**, removíveis um a um, mais "Limpar tudo".                                                            |
| 6   | Elementos com cara de clicáveis que não faziam nada: linhas de "Onde você mais gasta" e colunas da evolução mensal.                                                                              | Correspondência com o esperado           | Média      | Estabelecimento abre os lançamentos dele; coluna do mês aplica aquele mês ao período. Ambos com foco por teclado e dica no tooltip.                                               |
| 7   | Trocar de tela não mudava o título da aba nem movia o foco; não havia "pular para o conteúdo".                                                                                                   | WCAG 2.4.1, 2.4.2, 2.4.3                 | Média      | Título por tela ("Lançamentos · Raio-X"), foco vai para o conteúdo ao navegar, link "Pular para o conteúdo".                                                                      |
| 8   | Na tela Importar, a fila de revisão aparecia abaixo do envio e da pasta: depois de um arquivo chegar pela pasta, era preciso rolar para achá-lo.                                                 | Visibilidade do estado                   | Média      | Fila **"Para revisar"** no topo da tela quando há itens, com contagem.                                                                                                            |
| 9   | O registro da pasta mostrava duas linhas por arquivo ("arquivo novo" e o resultado).                                                                                                             | Minimalismo                              | Baixa      | Uma linha por arquivo, com o resultado.                                                                                                                                           |
| 10  | Remover um documento era definitivo.                                                                                                                                                             | Controle e liberdade; prevenção de erros | Baixa      | Aviso com **"Desfazer"** depois de remover.                                                                                                                                       |
| 11  | O aviso de dados de exemplo ocupava o topo de todas as telas no celular.                                                                                                                         | Minimalismo                              | Baixa      | Aparece só no Início e em Importar.                                                                                                                                               |
| 12  | Pix enviados dominavam o gasto sem dizer para quem eram, e nada sugeria resolver isso.                                                                                                           | Ajuda a agir                             | Média      | Destaque "x% do gasto são Pix sem destino definido" com atalho para o De/para, onde cada destinatário aparece como pendente.                                                      |
| 13  | Sem atalho para buscar lançamentos no teclado.                                                                                                                                                   | Flexibilidade e eficiência               | Baixa      | Tecla **/** foca a busca em Lançamentos.                                                                                                                                          |

## Fora do escopo desta rodada

- Persistir filtros e a aba atual entre aberturas do app (hoje voltam ao padrão).
- Busca global (estabelecimento, valor, data) acessível de qualquer tela.
- Teste com usuários reais; esta avaliação é heurística e não substitui observar pessoas usando o app.
