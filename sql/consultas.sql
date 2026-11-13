-- ============================================================
-- Consultas de conferência e de análise sobre a base importada
-- Uso: mysql -u USUARIO -p saude_territorio < sql/consultas.sql
-- ============================================================

-- 1. Quando a base foi carregada e de que geração de dados ela vem
SELECT carregado_em, dados_gerados_em, versao_dados FROM controle_carga;

-- 2. Totais por ano e sistema (sistemas diferentes NUNCA são somados entre si)
SELECT 'óbitos (SIM)' AS sistema, ano, SUM(obitos) AS total FROM obito_municipio_cid GROUP BY ano
UNION ALL
SELECT 'internações SUS (SIH)', ano, SUM(internacoes) FROM internacao_municipio_capitulo GROUP BY ano
UNION ALL
SELECT 'dengue (SINAN)', ano, SUM(casos_provaveis) FROM dengue_municipio GROUP BY ano
ORDER BY sistema, ano;

-- 3. Duplicidades: deve devolver zero linhas (a chave primária já impede)
SELECT ano, codigo_ibge, cid3, COUNT(*) AS repeticoes
FROM obito_municipio_cid GROUP BY ano, codigo_ibge, cid3 HAVING COUNT(*) > 1;

-- 4. Ausentes: municípios sem população publicada em algum ano (não preenchidos)
SELECT m.codigo_ibge, m.nome, m.uf, a.ano
FROM municipio m
CROSS JOIN (SELECT 2022 AS ano UNION SELECT 2024 UNION SELECT 2025 UNION SELECT 2026) a
LEFT JOIN populacao p ON p.local = m.codigo_ibge AND p.ano = a.ano
WHERE p.populacao IS NULL;

-- 5. Exemplos conferíveis com o painel e com docs/VALIDACAO.md
--    São Paulo, infarto agudo (I21), 2024: 6.425 óbitos, 54,01 por 100 mil
SELECT o.obitos, p.populacao, ROUND(o.obitos / p.populacao * 100000, 2) AS taxa_100mil
FROM obito_municipio_cid o JOIN populacao p ON p.local = o.codigo_ibge AND p.ano = o.ano
WHERE o.ano = 2024 AND o.codigo_ibge = '3550308' AND o.cid3 = 'I21';
--    Campinas, doenças do aparelho circulatório (capítulo IX), 2024: 2.392 óbitos, 201,69 por 100 mil
SELECT obitos, populacao, taxa_100mil FROM vw_taxa_obitos_capitulo
WHERE ano = 2024 AND codigo_ibge = '3509502' AND capitulo = 9;

-- 6. Pergunta central do painel, em SQL: municípios com mais óbitos do que o esperado
--    pela taxa do próprio estado (capítulo IX, 2024; só com ao menos 20 esperados)
WITH uf_taxa AS (
  SELECT m.uf, SUM(v.obitos) / SUM(v.populacao) AS taxa
  FROM vw_taxa_obitos_capitulo v JOIN municipio m ON m.codigo_ibge = v.codigo_ibge
  WHERE v.ano = 2024 AND v.capitulo = 9 AND v.populacao IS NOT NULL
  GROUP BY m.uf
)
SELECT v.municipio, v.uf, v.obitos,
       ROUND(u.taxa * v.populacao, 1) AS esperado,
       ROUND(v.obitos / (u.taxa * v.populacao), 2) AS razao_obs_esp
FROM vw_taxa_obitos_capitulo v JOIN uf_taxa u ON u.uf = v.uf
WHERE v.ano = 2024 AND v.capitulo = 9 AND u.taxa * v.populacao >= 20
ORDER BY razao_obs_esp DESC
LIMIT 15;

-- 7. Principais causas de óbito no Brasil em 2024 (capítulos)
SELECT c.numero, c.nome, SUM(o.obitos) AS obitos
FROM obito_municipio_cid o
JOIN cid_categoria k ON k.codigo = o.cid3
JOIN cid_capitulo c ON c.numero = k.capitulo
WHERE o.ano = 2024
GROUP BY c.numero, c.nome ORDER BY obitos DESC LIMIT 10;

-- 8. Outliers sinalizados por tipo e ano (mantidos na base, ver decisão)
SELECT tipo, medida, ano, COUNT(*) AS municipios, MIN(decisao) AS decisao
FROM outlier GROUP BY tipo, medida, ano ORDER BY medida, ano, tipo;

-- 9. Municípios atípicos em internações por 3 anos seguidos (pista para auditoria)
SELECT m.nome, m.uf, COUNT(DISTINCT o.ano) AS anos_acima
FROM outlier o JOIN municipio m ON m.codigo_ibge = o.codigo_ibge
WHERE o.tipo = 'taxa_funil_acima' AND o.medida = 'internacoes'
GROUP BY m.nome, m.uf HAVING COUNT(DISTINCT o.ano) = 3
ORDER BY m.uf, m.nome LIMIT 20;

-- 10. Indicador do território ao lado da taxa (ex.: esgoto precário × óbitos por diarreia)
SELECT m.nome, m.uf, iv.valor AS pct_esgoto_precario,
       COALESCE(SUM(o.obitos), 0) AS obitos_diarreia_2024   -- sem linha = nenhum registro
FROM indicador_valor iv
JOIN municipio m ON m.codigo_ibge = iv.codigo_ibge
LEFT JOIN obito_municipio_cid o ON o.codigo_ibge = iv.codigo_ibge AND o.ano = 2024 AND o.cid3 BETWEEN 'A00' AND 'A09'
WHERE iv.indicador_id = 'esgoto_precario'
GROUP BY m.nome, m.uf, iv.valor
ORDER BY iv.valor DESC LIMIT 10;
