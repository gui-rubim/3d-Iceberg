# 3d-Iceberg

Iceberg num oceano noturno, em WebGPU, sem bibliotecas. Tudo procedural, num único `index.html` autocontido.

## Abrir

Abra `index.html` num navegador com WebGPU (Chrome). Em Linux o Chrome precisa do Vulkan ligado:

```bash
google-chrome --enable-features=Vulkan index.html
```

## Controles

- Rolagem, arrasto vertical, `W`/`S` ou setas: sobe e desce
- `Home` / `End`: topo / fundo
- `Espaço`: passeio automático
- `A` / `D` ou arrasto horizontal: gira em volta do iceberg
- `V`: alterna entre a descida reta e o caminho que se aproxima do gelo
- `C`: liga e desliga a órbita lenta

O trabalho está em andamento: veja `CONTINUAR.md` para o estado atual e o passo a passo.
