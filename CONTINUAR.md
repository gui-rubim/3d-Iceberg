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
- `source/`: `common.wgsl`, `bake.wgsl`, `waves.wgsl`, `scene.wgsl`, `post.wgsl`, `particles.wgsl`, `main.js`, `index.template.html`, `build.mjs`. `node source/build.mjs` gera o `index.html` autocontido (74 KB); `--raw` mantém o WGSL legível.
- Arquitetura: o iceberg é um campo de distância assado na carga num volume 3D (256×320×256), com um segundo volume de luz (sombra da lua, oclusão do céu, espessura). Um shader de tela cheia faz ray marching do gelo, intersecta o oceano (3 cascatas de ondas em compute, com mips), traça reflexo e refração e integra o meio subaquático. Depois: TAA, partículas, desfoque de movimento, bloom, exposição automática e composição final (gotas na lente, menisco, indicador de profundidade). A câmera acompanha a ondulação perto da superfície usando uma cópia em CPU das duas cascatas longas.
- `trabalho/` (ferramentas em node + Playwright): `lib.mjs` (lança o navegador e serve a pasta), `shot.mjs` e `sheet.mjs` (renders avulsos), `capture.mjs` (6 poses + sequência de 60 s com `entradas.json`; vídeo pelo codificador H.264 do navegador; quadros do crítico sem perdas), `pacote.mjs` (recortes 1:1 e folhas de contato), `montage.mjs`, `perf.mjs` (tempo de GPU por timestamp query, janela visível), `teste_controles.mjs`, `teste_alocacao.mjs`, `heapflat.mjs`.

**Verificações**
- Controles: `teste_controles.mjs` passou 31 de 31, mas a última execução foi antes das mudanças das rodadas 2 e 3 (órbita mais rápida, chaves de câmera novas, lente maior). Precisa rodar de novo.
- Crítico: três rodadas feitas, sempre sem as imagens de referência em arquivo (só a descrição em texto). Contagem acima de "menor": 13, depois 15, depois 12. Resumos em `trabalho/critico/rodadaN_relatorio.md`. As correções da rodada 3 já estão no código, mas a rodada 4 NÃO foi renderizada nem criticada.
- Desempenho: medido só num Apple A18 Pro (não é o alvo), na versão da rodada 2: 67,3 ms de média de GPU, percentil 99 de 93,8 ms, máximo de 96,8 ms em 2560×1440 (`trabalho/perf_report.json`). Nada foi medido no M4 Max.
- Alocação por quadro: o estado está todo num `Float64Array`; sobram cerca de 465 B por quadro depois que o JIT aquece, atribuídos aos objetos que a própria API WebGPU devolve (encoder, passes, textura e view do canvas). Não foi reconfirmado depois das últimas mudanças.
- `descida.mp4` na raiz é o da rodada 3, não o final.

**Pendências já conhecidas**
- Do crítico da rodada 3, já atacadas mas não reavaliadas: superfície vista de baixo, borrão na travessia, gelo submerso sem cara de gelo, veios parecendo neon, retângulos na água logo após emergir (eram reflexos de estrelas recortados pela célula), gelo emerso com relevo de uma escala só, reflexo liso demais, blocos flutuantes de baixo polígono.
- "Trama regular nas áreas escuras": apontada duas vezes pelo crítico; não consegui reproduzir no recorte ampliado.
- A folha de contato `sequencia_54s` sai com a última célula preta (defeito do `pacote.mjs`, não do render).

## PASSO A PASSO

1. **Confira o ambiente.** `sysctl -n machdep.cpu.brand_string`, `ls /Applications | grep -i chrome`, `which ffmpeg node`. Em `trabalho/` rode `npm i` (instala `playwright` e `ffmpeg-static`).
2. **Ajuste `trabalho/lib.mjs`.** `EXE` aponta para um Chromium baixado em `trabalho/browsers/`, que não foi copiado. Troque por `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. `FFMPEG` aponta para `node_modules/ffmpeg-static/ffmpeg`; pode ficar, ou troque pelo `ffmpeg` do PATH.
3. **Confira `referencia/`.** Se os dois arquivos existirem, olhe-os e passe os caminhos ao crítico no lugar da descrição em texto (bloco REFERÊNCIAS de `trabalho/critico/prompt.md`).
4. **Build e fumaça.** `node source/build.mjs --raw`, depois `cd trabalho && node sheet.mjs r/s.png "0,0;0.2,0;0.346,0;0.62,0;1,0" res=1280x720 cols=3` e olhe a imagem.
5. **Controles e alocação.** `node teste_controles.mjs` e `node teste_alocacao.mjs`. Corrija o que falhar.
6. **Rodada 4 do crítico.** `node capture.mjs critico/rodada4 res=2560x1440`, depois `node pacote.mjs critico/rodada4`. Lance um subagente novo com o texto de `critico/prompt.md` (troque `{DIR}` e `{REFS}`; os nomes exatos dos quadros das rajadas saem do `ls`). Ele só pode ler os renders e as referências.
7. **Itere.** Corrija os defeitos por prioridade, confira em 720p com `capture.mjs ... res=1280x720 seq=0`, e repita o passo 6 até não sobrar nada acima de "menor". Guarde cada relatório em `critico/rodadaN_relatorio.md`.
8. **Desempenho na máquina-alvo.** `node perf.mjs seq` (janela visível, tempo real) gera `perf_report.json` e `perf_log.csv`. Se a média passar de 11 ms ou algum quadro de 16,7 ms, otimize primeiro o trecho logo abaixo da superfície olhando para cima (dois traçados secundários mais o meio volumétrico por pixel).
9. **Entrega.** `node source/build.mjs` (minificado), copie o `descida.mp4` da última rodada para a raiz e informe: tamanho do `index.html`, relatório de desempenho por trecho (acima da água, travessia, submerso: média, percentil 99, máximo), a revisão final do crítico e o resultado dos testes. Diga com franqueza o que foi medido e o que não foi.
