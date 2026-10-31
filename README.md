# Painel de óbitos por doenças crônicas

O painel usa a 2ª prévia nacional do SIM 2026, publicada pelo Ministério da Saúde. Como a base ainda é preliminar, os números podem mudar em atualizações futuras. O recorte inclui CID-10 C00–C97, E10–E14, I00–I99 e J40–J47. Os dados tratados estão divididos por UF em `dados_estados/2026/`.

Esse recorte contém registros dos capítulos CID-10 II, IV, IX e X. O filtro de capítulo lista apenas os capítulos presentes nos CSVs carregados; o projeto não contém a classificação CID-10 completa, incluindo o capítulo XXII. A coluna de categoria agrupa os registros em quatro grupos do painel, não na hierarquia completa de categorias da CID-10.

O mapa mostra somente os municípios brasileiros sobre o fundo azul. A cópia local `municipios_brasil.geojson` contém os 5.564 municípios da fonte geodata-br, com coordenadas simplificadas em cerca de 0,001° para reduzir o download e acelerar a navegação. A comparação entre estados usa os registros que estão no filtro atual.

## Abrir o painel

Marque um ou mais estados no seletor múltiplo. Você pode buscar pelo nome ou pela sigla, remover seleções pelas etiquetas e selecionar todos os estados visíveis na busca. O painel carrega automaticamente somente os arquivos das UFs marcadas e atualiza os resultados ao alterar qualquer filtro. O seletor **Foco do mapa** oferece o Brasil e apenas os estados marcados. Ao escolher um estado, o mapa mostra somente seu território sobre o fundo azul; o botão com o ícone de casa retorna ao foco escolhido no seletor. Você pode afastar o mapa livremente, sem repetição do território. Abra o projeto por um servidor HTTP local:

No filtro **Município de residência**, clique para ver os municípios disponíveis ou digite parte do nome para reduzir a lista. A busca ignora acentos. O texto digitado filtra nomes parciais; escolher uma sugestão filtra o município exato.

```sh
python3 -m http.server 8000
```

Depois acesse <http://localhost:8000>. Também é possível selecionar um CSV preparado pelo botão no cabeçalho; o arquivo começa a carregar ao ser escolhido.

## Fontes

- [Sistema de Informações sobre Mortalidade (SIM) — Ministério da Saúde](https://dadosabertos.saude.gov.br/dataset/sim)
- [Arquivo original da 2ª prévia de 2026](https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/SIM/csv/Mortalidade_Geral_2026_csv.zip)
- [GeoJSON de municípios brasileiros](https://github.com/tbrugz/geodata-br/blob/master/geojson/geojs-100-mun.json)
