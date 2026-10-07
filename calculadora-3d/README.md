# Calculadora de custo de impressão 3D

App de uma página que calcula o custo real e o preço de venda de uma impressão 3D.

- **Custo**: filamento (com perda), energia, depreciação da impressora, manutenção, mão de obra, taxa de falha, embalagem e insumos.
- **Preço**: margem de lucro + impostos + taxa de marketplace (percentual e fixa).
- **Importação**: `.gcode`, `.bgcode` e `.gcode.3mf` (Bambu Studio, OrcaSlicer, PrusaSlicer, Cura, Simplify3D); foto da tela do fatiador (lida pelo Claude quando aberto no claude.ai).
- **Banco de dados**: impressoras, filamentos (com estoque em gramas), histórico de trabalhos e ajustes. No claude.ai fica salvo na conta; aberto direto no navegador (`index.html`) fica no `localStorage`. Backup em JSON e exportação do histórico em CSV.

`app.html` é a fonte publicada como Artifact; `index.html` é a mesma página com o cabeçalho HTML completo, para abrir localmente.
