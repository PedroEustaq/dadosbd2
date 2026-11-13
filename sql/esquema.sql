-- ============================================================
-- Saúde no Território — esquema MySQL / MariaDB
-- Base tratada gerada por scripts/ (ver docs/DADOS.md).
-- Carga: python3 scripts/importar_mysql.py -- -u USUARIO -p
--
-- Tratamento refletido no esquema:
--   * ausentes: combinação sem evento NÃO vira linha com zero; população ou
--     indicador sem valor NÃO vira linha (nada é preenchido com zero ou média);
--   * duplicidades: chaves primárias compostas impedem a mesma combinação duas vezes;
--   * outliers: valores mantidos; os casos sinalizados ficam na tabela `outlier`.
-- Compatível com MySQL 8 e MariaDB 10.5+.
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP VIEW IF EXISTS vw_resumo_municipio;
DROP VIEW IF EXISTS vw_taxa_obitos_capitulo;
DROP TABLE IF EXISTS outlier, lacuna_dados, indicador_valor, indicador,
  dengue_municipio, internacao_municipio_capitulo, obito_uf_mes, obito_uf_cid,
  obito_municipio_perfil, obito_municipio_cid, populacao_censo_idade, populacao,
  cid_categoria, cid_grupo, cid_capitulo, municipio, uf, fonte, controle_carga;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------- Território ----------
CREATE TABLE uf (
  sigla        CHAR(2)      NOT NULL PRIMARY KEY,
  codigo_ibge  CHAR(2)      NOT NULL UNIQUE,
  nome         VARCHAR(40)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Unidades da Federação (IBGE)';

CREATE TABLE municipio (
  codigo_ibge  CHAR(7)      NOT NULL PRIMARY KEY COMMENT 'código IBGE de 7 dígitos',
  nome         VARCHAR(80)  NOT NULL,
  uf           CHAR(2)      NOT NULL,
  CONSTRAINT fk_municipio_uf FOREIGN KEY (uf) REFERENCES uf (sigla),
  INDEX ix_municipio_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='5.571 municípios (IBGE Localidades)';

-- local = código IBGE do município, sigla da UF ou BR
CREATE TABLE populacao (
  local        VARCHAR(7)   NOT NULL,
  ano          SMALLINT     NOT NULL,
  populacao    INT UNSIGNED NOT NULL,
  fonte        VARCHAR(60)  NOT NULL,
  PRIMARY KEY (local, ano)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Censo 2022 e estimativas IBGE; ano sem valor publicado não tem linha';

CREATE TABLE populacao_censo_idade (
  local        VARCHAR(7)   NOT NULL COMMENT 'município, UF ou BR',
  sexo         CHAR(1)      NOT NULL,
  faixa        TINYINT      NOT NULL COMMENT 'idade inicial da faixa de 5 anos; 80 = 80 ou mais',
  populacao    INT UNSIGNED NOT NULL,
  PRIMARY KEY (local, sexo, faixa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Censo 2022 por sexo e faixa etária (denominador dos recortes)';

-- ---------- Classificação CID-10 ----------
CREATE TABLE cid_capitulo (
  numero       TINYINT      NOT NULL PRIMARY KEY,
  romano       VARCHAR(6)   NOT NULL,
  cod_inicio   CHAR(3)      NOT NULL,
  cod_fim      CHAR(3)      NOT NULL,
  nome         VARCHAR(200) NOT NULL,
  natureza     VARCHAR(80)  NOT NULL COMMENT 'doença, causa externa, sintoma etc.'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cid_grupo (
  id           SMALLINT     NOT NULL PRIMARY KEY,
  cod_inicio   CHAR(3)      NOT NULL,
  cod_fim      CHAR(3)      NOT NULL,
  nome         VARCHAR(250) NOT NULL,
  capitulo     TINYINT      NOT NULL,
  CONSTRAINT fk_grupo_capitulo FOREIGN KEY (capitulo) REFERENCES cid_capitulo (numero)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cid_categoria (
  codigo       CHAR(3)      NOT NULL PRIMARY KEY,
  nome         VARCHAR(250) NOT NULL,
  grupo_id     SMALLINT     NOT NULL,
  capitulo     TINYINT      NOT NULL,
  marcador     CHAR(1)      NULL COMMENT "+ (adaga, etiologia) ou * (asterisco, manifestação)",
  suplemento   BOOLEAN      NOT NULL DEFAULT FALSE COMMENT 'código posterior à edição de 2008',
  CONSTRAINT fk_categoria_grupo FOREIGN KEY (grupo_id) REFERENCES cid_grupo (id),
  CONSTRAINT fk_categoria_capitulo FOREIGN KEY (capitulo) REFERENCES cid_capitulo (numero)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Eventos de saúde (fatos) ----------
-- Sistemas diferentes NÃO devem ser somados entre si.
CREATE TABLE obito_municipio_cid (
  ano          SMALLINT     NOT NULL,
  codigo_ibge  CHAR(7)      NOT NULL,
  cid3         CHAR(3)      NOT NULL COMMENT "categoria da causa básica; '???' = código fora do catálogo",
  obitos       INT UNSIGNED NOT NULL,
  PRIMARY KEY (ano, codigo_ibge, cid3),
  INDEX ix_obito_cid (cid3, ano),
  CONSTRAINT fk_obito_mun FOREIGN KEY (codigo_ibge) REFERENCES municipio (codigo_ibge)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='SIM: óbitos por município de residência e causa básica';

CREATE TABLE obito_municipio_perfil (
  ano          SMALLINT     NOT NULL,
  codigo_ibge  CHAR(7)      NOT NULL,
  capitulo     TINYINT      NOT NULL,
  sexo         CHAR(1)      NOT NULL COMMENT 'F, M ou I (ignorado)',
  faixa        VARCHAR(3)   NOT NULL COMMENT "faixa de 5 anos ou 'ign'",
  obitos       INT UNSIGNED NOT NULL,
  PRIMARY KEY (ano, codigo_ibge, capitulo, sexo, faixa),
  CONSTRAINT fk_perfil_mun FOREIGN KEY (codigo_ibge) REFERENCES municipio (codigo_ibge),
  CONSTRAINT fk_perfil_cap FOREIGN KEY (capitulo) REFERENCES cid_capitulo (numero)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='SIM: óbitos por capítulo, sexo e faixa etária';

CREATE TABLE obito_uf_cid (
  ano          SMALLINT     NOT NULL,
  uf           CHAR(2)      NOT NULL,
  cid          VARCHAR(4)   NOT NULL COMMENT 'categoria (3) ou subcategoria (4): não some os dois níveis',
  obitos       INT UNSIGNED NOT NULL,
  PRIMARY KEY (ano, uf, cid),
  CONSTRAINT fk_obito_uf FOREIGN KEY (uf) REFERENCES uf (sigla)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='SIM por UF, inclui óbitos com município ignorado';

CREATE TABLE obito_uf_mes (
  ano          SMALLINT     NOT NULL,
  uf           CHAR(2)      NOT NULL,
  capitulo     TINYINT      NOT NULL,
  mes          TINYINT      NOT NULL,
  obitos       INT UNSIGNED NOT NULL,
  PRIMARY KEY (ano, uf, capitulo, mes),
  CONSTRAINT fk_mes_uf FOREIGN KEY (uf) REFERENCES uf (sigla)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE internacao_municipio_capitulo (
  ano          SMALLINT     NOT NULL,
  codigo_ibge  CHAR(7)      NOT NULL,
  capitulo     TINYINT      NOT NULL,
  internacoes  INT UNSIGNED NOT NULL,
  PRIMARY KEY (ano, codigo_ibge, capitulo),
  CONSTRAINT fk_sih_mun FOREIGN KEY (codigo_ibge) REFERENCES municipio (codigo_ibge),
  CONSTRAINT fk_sih_cap FOREIGN KEY (capitulo) REFERENCES cid_capitulo (numero)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='SIH/SUS: internações pagas pelo SUS (conta internações, não pessoas)';

CREATE TABLE dengue_municipio (
  ano          SMALLINT     NOT NULL,
  codigo_ibge  CHAR(7)      NOT NULL,
  casos_provaveis INT UNSIGNED NOT NULL,
  PRIMARY KEY (ano, codigo_ibge),
  CONSTRAINT fk_dengue_mun FOREIGN KEY (codigo_ibge) REFERENCES municipio (codigo_ibge)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='SINAN: notificações de dengue (casos prováveis)';

-- ---------- Indicadores do território ----------
CREATE TABLE indicador (
  id           VARCHAR(40)  NOT NULL PRIMARY KEY,
  nome         VARCHAR(120) NOT NULL,
  dimensao     VARCHAR(60)  NOT NULL,
  unidade      VARCHAR(40)  NOT NULL,
  ano_referencia SMALLINT   NOT NULL,
  fonte        VARCHAR(60)  NOT NULL,
  tabela       VARCHAR(120) NOT NULL,
  sentido      VARCHAR(20)  NOT NULL,
  definicao    TEXT         NOT NULL,
  limitacoes   TEXT         NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE indicador_valor (
  codigo_ibge  CHAR(7)      NOT NULL,
  indicador_id VARCHAR(40)  NOT NULL,
  valor        DECIMAL(16,4) NOT NULL,
  PRIMARY KEY (codigo_ibge, indicador_id),
  INDEX ix_valor_indicador (indicador_id),
  CONSTRAINT fk_valor_mun FOREIGN KEY (codigo_ibge) REFERENCES municipio (codigo_ibge),
  CONSTRAINT fk_valor_ind FOREIGN KEY (indicador_id) REFERENCES indicador (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Formato longo; sem linha = valor não publicado (não é zero)';

CREATE TABLE lacuna_dados (
  dimensao     VARCHAR(80)  NOT NULL PRIMARY KEY,
  situacao     VARCHAR(40)  NOT NULL,
  motivo       TEXT         NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Dimensões avaliadas e não integradas, com o motivo';

-- ---------- Qualidade e controle ----------
CREATE TABLE outlier (
  id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tipo         VARCHAR(30)  NOT NULL COMMENT 'taxa_tukey_*, taxa_funil_*, indicador_extremo, populacao_salto, invalido',
  medida       VARCHAR(40)  NOT NULL COMMENT 'evento (obitos, internacoes, dengue) ou id do indicador',
  ano          VARCHAR(9)   NOT NULL,
  codigo_ibge  CHAR(7)      NOT NULL,
  valor        DECIMAL(18,4) NOT NULL,
  limite_inferior DECIMAL(18,4) NULL,
  limite_superior DECIMAL(18,4) NULL,
  metodo       VARCHAR(80)  NOT NULL,
  decisao      VARCHAR(30)  NOT NULL,
  INDEX ix_outlier_mun (codigo_ibge),
  INDEX ix_outlier_tipo (tipo, medida, ano),
  CONSTRAINT fk_outlier_mun FOREIGN KEY (codigo_ibge) REFERENCES municipio (codigo_ibge)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Saída de scripts/detectar_outliers.py';

CREATE TABLE fonte (
  id           VARCHAR(40)  NOT NULL PRIMARY KEY,
  titulo       VARCHAR(200) NOT NULL,
  instituicao  VARCHAR(200) NOT NULL,
  pagina       VARCHAR(300) NOT NULL,
  licenca      TEXT         NULL,
  periodo_referencia TEXT   NULL,
  frequencia_fonte VARCHAR(120) NULL,
  coletado_em  DATE         NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Manifestos de origem (dados/manifestos)';

CREATE TABLE controle_carga (
  carregado_em DATETIME     NOT NULL,
  dados_gerados_em DATE     NOT NULL,
  versao_dados VARCHAR(20)  NOT NULL,
  observacao   TEXT         NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Quando a base foi carregada e de que geração ela vem';

-- ---------- Visões com as regras de negócio do painel ----------
-- Taxa por 100 mil = eventos ÷ população do mesmo ano × 100.000.
-- Para 2023 não há estimativa oficial: usa-se o Censo 2022 (mesma regra do painel).
CREATE VIEW vw_taxa_obitos_capitulo AS
SELECT o.ano, o.codigo_ibge, m.nome AS municipio, m.uf, c.numero AS capitulo, c.nome AS capitulo_nome,
       SUM(o.obitos) AS obitos, p.populacao,
       ROUND(SUM(o.obitos) / p.populacao * 100000, 2) AS taxa_100mil
FROM obito_municipio_cid o
JOIN municipio m      ON m.codigo_ibge = o.codigo_ibge
JOIN cid_categoria k  ON k.codigo = o.cid3
JOIN cid_capitulo c   ON c.numero = k.capitulo
LEFT JOIN populacao p ON p.local = o.codigo_ibge AND p.ano = IF(o.ano = 2023, 2022, o.ano)
GROUP BY o.ano, o.codigo_ibge, m.nome, m.uf, c.numero, c.nome, p.populacao;

CREATE VIEW vw_resumo_municipio AS
SELECT a.ano, m.codigo_ibge, m.nome AS municipio, m.uf, p.populacao,
       (SELECT SUM(obitos) FROM obito_municipio_cid x WHERE x.ano = a.ano AND x.codigo_ibge = m.codigo_ibge) AS obitos,
       (SELECT SUM(internacoes) FROM internacao_municipio_capitulo x WHERE x.ano = a.ano AND x.codigo_ibge = m.codigo_ibge) AS internacoes_sus,
       (SELECT casos_provaveis FROM dengue_municipio x WHERE x.ano = a.ano AND x.codigo_ibge = m.codigo_ibge) AS dengue_casos_provaveis
FROM municipio m
CROSS JOIN (SELECT DISTINCT ano FROM obito_municipio_cid) a
LEFT JOIN populacao p ON p.local = m.codigo_ibge AND p.ano = IF(a.ano = 2023, 2022, a.ano);
