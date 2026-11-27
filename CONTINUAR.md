# Como continuar em outro computador

## O que copiar

Copie a pasta `3d-Iceberg` com:

- `source/` (as fontes)
- `index.html`, `descida.mp4`, `CONTINUAR.md`
- `trabalho/` **sem** `browsers/`, `node_modules/`, `r/`, `critico/rodada1/`, `critico/rodada2/` e `critico/rodada3/` (juntos passam de 4 GB e são refeitos). Mantenha os scripts `.mjs`, `entradas.json`, `package.json`, `package-lock.json`, os `perf_*.json` e `critico/*.md`.
- `referencia/superficie.png` e `referencia/submerso.png`: salve as duas imagens nessa pasta. Na máquina anterior elas nunca chegaram ao disco.

Depois abra uma sessão nova dentro da pasta e cole tudo que está abaixo da linha.

---

Continue um trabalho já em andamento nesta pasta. Primeiro o briefing original, que continua valendo inteiro; depois o estado atual e o passo a passo.

## BRIEFING ORIGINAL

Construa uma experiência 3D em tempo real, que rode no navegador: um iceberg num oceano noturno, que o usuário percorre na vertical. Ao subir, vê o iceberg acima da água; ao descer, atravessa a superfície e vê o oceano por baixo, com a massa submersa do iceberg. A passagem é contínua, sem corte. Só precisa ter imagem no patamar de um jogo ou demo técnica de ponta de 2026, e me deixar controlar a subida e a descida.

PRIORIDADES (nesta ordem, quando entrarem em conflito)
1. Qualidade visual
2. Parecer as imagens de referência
3. Taxa de quadros estável na máquina-alvo
4. Tamanho da entrega

RESTRIÇÕES
- Sem engine e sem biblioteca 3D ou de física: nada de three.js, Babylon.js, PlayCanvas ou parecidos. Renderizado em WebGPU.
- Tudo procedural: nenhum arquivo de textura, de modelo, de HDRI ou de áudio. Iceberg, água, céu, estrelas, partículas e materiais saem do seu código.
- A entrega é um único `index.html` autocontido nesta pasta, que abre sem rede. Ele pode ser montado por um passo de build a partir de fontes em `source/`. Informe o tamanho final.
- Zero alocação de JavaScript por quadro. Pré-aloque todos os buffers.
- O iceberg e o cenário são originais. As imagens em `referencia/` valem como patamar de imagem e direção de arte (luz, cor, materiais, densidade de detalhe, pós-processamento): não reproduza o formato exato do iceberg, nem interface, menu, texto, logotipo ou marca que apareçam nelas.
- As imagens de `referencia/` não entram na página.

REFERÊNCIAS
- `referencia/superficie.png`: iceberg à noite, céu estrelado, horizonte com brilho azul, oceano escuro com reflexo longo e quebrado do gelo na água.
- `referencia/submerso.png`: visão de baixo da água, superfície ondulada iluminada vista de baixo, massa de gelo submersa escura e azulada, com veios âmbar luminosos nas fissuras, fundo que some no preto.

ALVO
- MacBook Pro M4 Max (36 GB), macOS 27.2, Chrome 157, tela de 120 Hz
- 2560×1440 em resolução cheia. Tempo de quadro de GPU de até 11 ms na média, e nenhum quadro acima de 16,7 ms durante a sequência roteirizada de 60 s.

CENA
- Acima da água: noite limpa, céu escuro com estrelas nítidas e brilho azul no horizonte, como na referência. O iceberg é alto e irregular, com picos, reentrâncias, terraços e superfície lisa e derretida em alguns pontos. A luz é fria e difusa (lua baixa fora de quadro ou céu), com sombreamento suave e gelo que deixa a luz atravessar nas bordas finas (espalhamento sob a superfície, tons de branco, azul-claro e ciano).
- Oceano até o horizonte, escuro e azul-marinho, com ondulação procedural de várias escalas, reflexo do iceberg e do céu na água (reflexo longo e quebrado pelas ondas, como na referência), brilhos especulares das estrelas e pequenos pedaços de gelo flutuando. A linha d'água do iceberg tem espuma fina e gelo molhado e brilhante.
- Abaixo da água: a superfície vista de baixo, ondulando, com a "janela de Snell" (o céu comprimido num círculo, com reflexo interno total ao redor), raios de luz que descem e cáusticas. A massa submersa é muito maior que a emersa, com formas orgânicas e escuras, azul-petróleo quase preto, e veios âmbar emissivos nas fissuras, como na referência. Neve marinha (partículas em suspensão), bolhas ocasionais, absorção de cor com a profundidade (o vermelho some, o azul domina, o fundo vai ao preto) e névoa volumétrica.
- A travessia da superfície é o momento central: quando a câmera passa pela linha d'água, a tela mostra a divisão acima e abaixo da água, com menisco, gotas e filme de água na lente, sem corte nem salto de exposição. A adaptação da exposição entre a noite e o fundo escuro é suave.
- O mundo tem limite, mas o limite não pode aparecer: oceano e fundo somem em névoa e escuridão antes de qualquer borda.
- Pós-processamento de jogo atual: desfoque de movimento, bloom, tone mapping, leve aberração e vinheta discretas, e anti-aliasing temporal sem fantasma e sem serrilhado nas bordas finas (silhueta do iceberg, linha d'água, estrelas, cristas de onda, veios âmbar). As estrelas não podem cintilar de forma feia com o movimento.
- Interface mínima e original: um indicador discreto de profundidade (por exemplo, uma linha vertical fina com a posição atual). Nenhum texto copiado das referências.

CONTROLES
- Roda do mouse (ou gesto de rolagem no trackpad) para baixo desce, para cima sobe. Arrastar na vertical, com o dedo ou o mouse, faz o mesmo. A posição é um valor contínuo de 0 (topo, acima da água) a 1 (fundo), com inércia e suavização, e limite nos extremos.
- Teclado: S ou seta para baixo desce, W ou seta para cima sobe (contínuo enquanto segura). Home vai ao topo, End vai ao fundo. Espaço alterna entre ir sozinho ao fundo e voltar ao topo, em passeio automático. C troca a câmera: órbita lenta ao redor do iceberg, ou câmera fixa de frente. A, D e o arrasto horizontal giram a câmera em volta do iceberg.
- A página não rola; o canvas ocupa a tela toda.

VERIFICAÇÃO
- Crítico visual: um subagente separado, novo a cada rodada, que vê SÓ os seus renders e as imagens de `referencia/`, nunca o seu código nem o seu raciocínio. Ele recebe a lista de arquivos e a escala de severidade abaixo, e mais nada: nenhuma explicação sua sobre o que é de propósito. Dê a ele 6 poses fixas de câmera, renderizadas em 2560×1440 no Chrome com aceleração de GPU: (1) acima da água, visão aberta do iceberg e do oceano; (2) acima da água, de perto, no gelo e na linha d'água; (3) exatamente na linha d'água, metade acima e metade abaixo; (4) logo abaixo da superfície, olhando para cima, com a janela de Snell; (5) profundidade média, com a massa submersa; (6) fundo, com os veios âmbar. Dê também a sequência roteirizada de 60 s (0–5 s parado no topo, 5–25 s descida, 25–35 s no fundo, 35–55 s subida, 55–60 s parado no topo), pilotada por entradas gravadas e capturada quadro a quadro com passo fixo de 1/60 s. Da sequência, ele recebe um quadro a cada meio segundo e três rajadas de 8 quadros consecutivos (na travessia da superfície descendo, no fundo e na travessia subindo), para pegar cintilação, serrilhado, objeto surgindo do nada, faixas de gradiente, salto de exposição e fantasma. Ele compara lado a lado com as referências e devolve defeitos concretos, em ordem de prioridade. Escala: "grave" é o que qualquer pessoa nota em 1 segundo como imagem que não é de ponta, ou como cena que não tem a direção de arte das referências; "médio" se nota olhando com atenção; "menor" só aparece na comparação lado a lado. Itere até ele não apontar nada acima de "menor".
- Desempenho: consultas de tempo de GPU e um log de tempo de quadro da sequência roteirizada de 60 s, rodando em tempo real. Informe média, percentil 99 e máximo, separando o trecho acima da água, a travessia e o trecho submerso.
- Controles: um teste automatizado que confere cada entrada e o efeito (rolagem para baixo aumenta a profundidade, para cima diminui, os extremos travam em 0 e 1, arrasto vertical, W, S, setas, Home, End, Espaço, C e rotação com A e D), e a sequência roteirizada completa vai do topo ao fundo e volta sem nenhum quadro com a câmera em estado inválido, sem atravessar o gelo e sem mostrar o limite do mundo.

PRONTO QUANDO: as três verificações passarem. Entregue `index.html`, o tamanho, o relatório de desempenho, a revisão final do crítico e o vídeo da sequência de 60 s em `descida.mp4` (2560×1440, 60 quadros por segundo).

AMBIENTE (como descrito no briefing; confira, porque na máquina anterior não era assim)
O Chrome está em `/Applications/Google Chrome.app`. O `/opt/homebrew/bin/python3` tem o Playwright instalado, e há `ffmpeg` e `node` no PATH. Use o Chrome sem janela para os renders; janela visível só nas medições de desempenho. Guarde scripts, renders e pacotes do crítico em `trabalho/`, dentro desta pasta.

## ESTADO ATUAL (não recomece do zero)

**O que existe**
- `source/`: `common.wgsl`, `bake.wgsl`, `waves.wgsl`, `scene.wgsl`, `post.wgsl`, `particles.wgsl`, `main.js`, `index.template.html`, `build.mjs`. `node source/build.mjs` gera o `index.html` autocontido (77 KB); `--raw` mantém o WGSL legível.
- Arquitetura: o iceberg é um campo de distância assado na carga num volume 3D (256×320×256), com um segundo volume de luz (sombra da lua, oclusão do céu, espessura). Um shader de tela cheia faz ray marching do gelo, intersecta o oceano (3 cascatas de ondas em compute, com mips), traça reflexo e refração e integra o meio subaquático. Depois: TAA, partículas, desfoque de movimento, bloom, exposição automática e composição final (gotas na lente, menisco, indicador de profundidade). A câmera acompanha a ondulação perto da superfície usando uma cópia em CPU das duas cascatas longas.
- Câmera (mudou em 27/11/2026, a pedido do dono do projeto): a página abre na câmera fixa de frente em **descida reta**, a 280 m do iceberg, mesma distância e inclinação do topo ao fundo; só a altura muda. `V` alterna para o caminho original (aproxima e inclina conforme desce), `C` liga a órbita lenta. O gelo flutuante foi tirado da faixa de 105 a 305 m do centro para a câmera não cruzar nenhum pedaço.
- Luz de preenchimento no gelo fundo ("deep fill" em `scene.wgsl`), também a pedido: a base do iceberg não some mais no preto.
- `trabalho/` (ferramentas em node + Playwright): `lib.mjs` (lança o navegador e serve a pasta; funciona em macOS e em Linux com Vulkan), `shot.mjs` e `sheet.mjs` (renders avulsos; `straight=1` usa a descida reta), `capture.mjs` (6 poses + sequência de 60 s com `entradas.json`; vídeo pelo codificador H.264 de hardware do navegador ou, sem ele, quadros crus para o libx264), `pacote.mjs` (recortes 1:1 e folhas de contato), `montage.mjs`, `perf.mjs` (tempo de GPU por timestamp query, janela visível), `teste_controles.mjs`, `teste_alocacao.mjs`, `heapflat.mjs`.

**Verificações**
- Controles: `teste_controles.mjs` passa 35 de 35 (inclui a descida reta). O critério de "salto de câmera" passou a ser a variação de velocidade entre quadros, com teto de 1,0 m por quadro.
- Alocação por quadro: `teste_alocacao.mjs` passa. Zero alocação no código da página fora dos objetos que a API WebGPU devolve em `render()` (cerca de 370 B por quadro). O estado e os argumentos numéricos passam todos por um `Float64Array`, e há um aquecimento do JIT na carga.
- Crítico: três rodadas feitas, sempre sem as imagens de referência em arquivo. Contagem acima de "menor": 13, 15, 12. A rodada 4 foi capturada até 75% e interrompida; NÃO foi criticada. Falta decidir se a sequência de 60 s e o vídeo passam a usar a descida reta (hoje `capture.mjs` usa o caminho original com órbita).
- Desempenho: nada medido no M4 Max. Só existe a medição antiga num Apple A18 Pro (`trabalho/perf_report.json`, 67,3 ms de média em 2560×1440).
- `descida.mp4`: não existe versão final.

**Pendências já conhecidas**
- Do crítico da rodada 3, atacadas mas não reavaliadas: superfície vista de baixo (ainda parece ruído manchado, janela de Snell com pouco contraste), borrão na travessia, gelo submerso sem cara de gelo, veios parecendo neon, gelo emerso com relevo de uma escala só, reflexo liso demais, blocos flutuantes de baixo polígono.
- "Trama regular nas áreas escuras": confirmada. Aparece como linhas verticais finas no fundo escuro debaixo d'água, em captura de tela da página e nos renders. Não corrigida.
- A folha de contato `sequencia_54s` sai com a última célula preta (defeito do `pacote.mjs`, não do render).
- Servidores com recarga automática (Live Server e parecidos) recarregam a página a cada arquivo gravado na pasta: grave renders e pacotes do crítico FORA da pasta do projeto enquanto alguém estiver com a página aberta.
- Em Linux, o Chrome só encontra a GPU com `--enable-features=Vulkan`; o Firefox não tem WebGPU ligado.

## PASSO A PASSO

1. **Confira o ambiente.** `sysctl -n machdep.cpu.brand_string`, `ls /Applications | grep -i chrome`, `which ffmpeg node`. Em `trabalho/` rode `npm i` (instala `playwright` e `ffmpeg-static`).
2. **Confira `trabalho/lib.mjs`.** Ele já escolhe o Chrome do sistema (macOS ou Linux) e o `ffmpeg` do PATH; as variáveis de ambiente `CHROME` e `FFMPEG` trocam os caminhos.
3. **Confira `referencia/`.** Se os dois arquivos existirem, olhe-os e passe os caminhos ao crítico no lugar da descrição em texto (bloco REFERÊNCIAS de `trabalho/critico/prompt.md`).
4. **Build e fumaça.** `node source/build.mjs --raw`, depois `cd trabalho && node sheet.mjs r/s.png "0,0;0.2,0;0.346,0;0.62,0;1,0" res=1280x720 cols=3` e olhe a imagem.
5. **Controles e alocação.** `node teste_controles.mjs` e `node teste_alocacao.mjs`. Corrija o que falhar.
6. **Rodada 4 do crítico.** `node capture.mjs critico/rodada4 res=2560x1440`, depois `node pacote.mjs critico/rodada4`. Lance um subagente novo com o texto de `critico/prompt.md` (troque `{DIR}` e `{REFS}`; os nomes exatos dos quadros das rajadas saem do `ls`). Ele só pode ler os renders e as referências.
7. **Itere.** Corrija os defeitos por prioridade, confira em 720p com `capture.mjs ... res=1280x720 seq=0`, e repita o passo 6 até não sobrar nada acima de "menor". Guarde cada relatório em `critico/rodadaN_relatorio.md`.
8. **Desempenho na máquina-alvo.** `node perf.mjs seq` (janela visível, tempo real) gera `perf_report.json` e `perf_log.csv`. Se a média passar de 11 ms ou algum quadro de 16,7 ms, otimize primeiro o trecho logo abaixo da superfície olhando para cima (dois traçados secundários mais o meio volumétrico por pixel).
9. **Entrega.** `node source/build.mjs` (minificado), copie o `descida.mp4` da última rodada para a raiz e informe: tamanho do `index.html`, relatório de desempenho por trecho (acima da água, travessia, submerso: média, percentil 99, máximo), a revisão final do crítico e o resultado dos testes. Diga com franqueza o que foi medido e o que não foi.
