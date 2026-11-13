#!/usr/bin/env python3
"""Base de conhecimento: relações documentadas entre condições (CID-10) e fatores territoriais.

O conteúdo é uma curadoria do projeto a partir das fontes listadas em REFERENCIAS
(OMS, OPAS, Ministério da Saúde, INCA). Cada relação aponta para um indicador
municipal existente em dados/indicadores/dicionario.json; o script recusa
indicadores, ações ou referências inexistentes.

Saída: dados/conhecimento/base.json
Uso: python3 scripts/montar_conhecimento.py
"""

import os

from comum import DADOS, gravar_json, hoje, ler_json

W = "https://www.who.int/news-room/fact-sheets/detail/"
M = "https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/"
REFERENCIAS = {
    "oms_diarreia": ("OMS", "Diarrhoeal disease (ficha informativa)", W + "diarrhoeal-disease"),
    "oms_agua": ("OMS", "Drinking-water (ficha informativa)", W + "drinking-water"),
    "oms_saneamento": ("OMS", "Sanitation (ficha informativa)", W + "sanitation"),
    "ms_dda": ("Ministério da Saúde", "Doenças diarreicas agudas (DDA)", M + "d/dda"),
    "oms_dengue": ("OMS", "Dengue and severe dengue (ficha informativa)", W + "dengue-and-severe-dengue"),
    "ms_dengue": ("Ministério da Saúde", "Dengue", M + "d/dengue"),
    "opas_dengue": ("OPAS", "Dengue", "https://www.paho.org/pt/topicos/dengue"),
    "oms_vetores": ("OMS", "Vector-borne diseases (ficha informativa)", W + "vector-borne-diseases"),
    "oms_lepto": ("OMS", "Leptospirosis (ficha informativa)", W + "leptospirosis"),
    "ms_lepto": ("Ministério da Saúde", "Leptospirose", M + "l/leptospirose"),
    "oms_tb": ("OMS", "Tuberculosis (ficha informativa)", W + "tuberculosis"),
    "ms_tb": ("Ministério da Saúde", "Tuberculose", M + "t/tuberculose"),
    "oms_dpoc": ("OMS", "Chronic obstructive pulmonary disease (ficha informativa)", W + "chronic-obstructive-pulmonary-disease-(copd)"),
    "oms_asma": ("OMS", "Asthma (ficha informativa)", W + "asthma"),
    "ms_asma": ("Ministério da Saúde", "Asma", M + "a/asma"),
    "oms_ar": ("OMS", "Ambient (outdoor) air pollution (ficha informativa)", W + "ambient-(outdoor)-air-quality-and-health"),
    "oms_ar_domestico": ("OMS", "Household air pollution (ficha informativa)", W + "household-air-pollution-and-health"),
    "oms_queimadas": ("OMS", "Wildfires (tema de saúde)", "https://www.who.int/health-topics/wildfires"),
    "ms_queimadas": ("Ministério da Saúde", "Queimadas e saúde", M + "q/queimadas"),
    "oms_pneumonia": ("OMS", "Pneumonia in children (ficha informativa)", W + "pneumonia"),
    "oms_influenza": ("OMS", "Influenza (seasonal) (ficha informativa)", W + "influenza-(seasonal)"),
    "ms_gripe": ("Ministério da Saúde", "Gripe (influenza)", M + "g/gripe-influenza"),
    "oms_dcv": ("OMS", "Cardiovascular diseases (ficha informativa)", W + "cardiovascular-diseases-(cvds)"),
    "oms_hipertensao": ("OMS", "Hypertension (ficha informativa)", W + "hypertension"),
    "ms_avc": ("Ministério da Saúde", "Acidente vascular cerebral (AVC)", M + "a/avc"),
    "ms_infarto": ("Ministério da Saúde", "Infarto", M + "i/infarto"),
    "ms_hipertensao": ("Ministério da Saúde", "Hipertensão (pressão alta)", M + "h/hipertensao"),
    "opas_dcv": ("OPAS", "Doenças cardiovasculares", "https://www.paho.org/pt/topicos/doencas-cardiovasculares"),
    "oms_diabetes": ("OMS", "Diabetes (ficha informativa)", W + "diabetes"),
    "ms_diabetes": ("Ministério da Saúde", "Diabetes (diabetes mellitus)", M + "d/diabetes"),
    "oms_dcnt": ("OMS", "Noncommunicable diseases (ficha informativa)", W + "noncommunicable-diseases"),
    "oms_cancer": ("OMS", "Cancer (ficha informativa)", W + "cancer"),
    "ms_cancer": ("Ministério da Saúde", "Câncer", M + "c/cancer"),
    "inca_prevencao": ("INCA", "Causas e prevenção do câncer", "https://www.gov.br/inca/pt-br/assuntos/causas-e-prevencao-do-cancer"),
    "oms_transito": ("OMS", "Road traffic injuries (ficha informativa)", W + "road-traffic-injuries"),
    "opas_transito": ("OPAS", "Segurança no trânsito", "https://www.paho.org/pt/topicos/seguranca-no-transito"),
    "oms_violencia": ("OMS", "Youth violence (ficha informativa)", W + "youth-violence"),
    "oms_suicidio": ("OMS", "Suicide (ficha informativa)", W + "suicide"),
    "ms_suicidio": ("Ministério da Saúde", "Prevenção do suicídio", M + "s/suicidio-prevencao"),
    "oms_neonatal": ("OMS", "Newborn mortality (ficha informativa)", W + "newborn-mortality"),
    "oms_materna": ("OMS", "Maternal mortality (ficha informativa)", W + "maternal-mortality"),
    "ms_crianca": ("Ministério da Saúde", "Saúde da criança", M + "s/saude-da-crianca"),
    "oms_quedas": ("OMS", "Falls (ficha informativa)", W + "falls"),
    "oms_envelhecimento": ("OMS", "Ageing and health (ficha informativa)", W + "ageing-and-health"),
    "opas_envelhecimento": ("OPAS", "Envelhecimento saudável", "https://www.paho.org/pt/topicos/envelhecimento-saudavel"),
    "oms_esquisto": ("OMS", "Schistosomiasis (ficha informativa)", W + "schistosomiasis"),
    "ms_esquisto": ("Ministério da Saúde", "Esquistossomose", M + "e/esquistossomose"),
    "oms_hepa": ("OMS", "Hepatitis A (ficha informativa)", W + "hepatitis-a"),
    "ms_hepatites": ("Ministério da Saúde", "Hepatites virais", M + "h/hepatites-virais"),
    "oms_chagas": ("OMS", "Chagas disease (ficha informativa)", W + "chagas-disease-(american-trypanosomiasis)"),
    "ms_chagas": ("Ministério da Saúde", "Doença de Chagas", M + "d/doenca-de-chagas"),
    "oms_determinantes": ("OMS", "Social determinants of health (tema de saúde)", "https://www.who.int/health-topics/social-determinants-of-health"),
    "oms_aps": ("OMS", "Primary health care (ficha informativa)", W + "primary-health-care"),
    "opas_aps": ("OPAS", "Atenção primária à saúde", "https://www.paho.org/pt/topicos/atencao-primaria-saude"),
    "oms_clima": ("OMS", "Climate change (ficha informativa)", W + "climate-change-and-health"),
    "oms_calor": ("OMS", "Heat and health (ficha informativa)", W + "climate-change-heat-and-health"),
    "oms_imunizacao": ("OMS", "Immunization coverage (ficha informativa)", W + "immunization-coverage"),
    "ms_vacinacao": ("Ministério da Saúde", "Calendário Nacional de Vacinação", M + "c/calendario-nacional-de-vacinacao"),
    "oms_sepse": ("OMS", "Sepsis (ficha informativa)", W + "sepsis"),
    "oms_demencia": ("OMS", "Dementia (ficha informativa)", W + "dementia"),
}

LIM_ACAO = "Não é possível estimar, com os dados deste painel, quanto a ação reduziria os casos neste município."
ACOES = {
    "esgoto": ("poder_publico", "Ampliar a coleta e o tratamento de esgoto e eliminar lançamentos a céu aberto, priorizando as áreas sem rede.",
               "Contato de pessoas, água e alimentos com fezes.", ["oms_saneamento", "oms_diarreia"]),
    "agua": ("poder_publico", "Ampliar o abastecimento regular de água tratada e monitorar a qualidade da água distribuída e das soluções alternativas (poços, carros-pipa).",
             "Consumo de água contaminada e armazenamento improvisado em casa.", ["oms_agua", "ms_dda"]),
    "residuos": ("poder_publico", "Regularizar a coleta de lixo e eliminar pontos de descarte irregular.",
                 "Acúmulo de resíduos que juntam água parada, atraem roedores e contaminam o solo.", ["ms_dengue", "ms_lepto"]),
    "criadouros": ("comunidade", "Organizar mutirões e vistorias semanais para eliminar recipientes com água parada em casas, quintais e terrenos.",
                   "Criadouros do mosquito Aedes aegypti perto das moradias.", ["ms_dengue", "opas_dengue"]),
    "higiene": ("populacao", "Lavar as mãos com água e sabão, tratar ou ferver a água quando a origem não for segura e higienizar os alimentos.",
                "Transmissão fecal-oral de vírus, bactérias e parasitas.", ["oms_diarreia", "ms_dda"]),
    "enchente": ("populacao", "Evitar contato com água e lama de enchente; se inevitável, usar botas e luvas e procurar atendimento se houver febre nos dias seguintes.",
                 "Contato com água contaminada pela urina de roedores.", ["ms_lepto", "oms_lepto"]),
    "aps": ("poder_publico", "Fortalecer a atenção primária: equipes completas, busca ativa, acompanhamento regular de pessoas com doenças crônicas e acesso a medicamentos.",
            "Diagnóstico tardio e falta de acompanhamento de condições tratáveis.", ["oms_aps", "opas_aps"]),
    "urgencia": ("poder_publico", "Organizar a rede de urgência (transporte, regulação e referência hospitalar) para reduzir o tempo até o atendimento.",
                 "Atraso no atendimento de eventos agudos como infarto, AVC e traumas.", ["ms_avc", "ms_infarto"]),
    "cronicas_pop": ("populacao", "Medir a pressão e a glicemia periodicamente, manter o tratamento prescrito, não fumar, reduzir o sal e o álcool e praticar atividade física.",
                     "Fatores de risco modificáveis das doenças cardiovasculares e do diabetes.", ["oms_dcv", "ms_hipertensao", "ms_diabetes"]),
    "rastreio": ("poder_publico", "Garantir acesso aos exames de rastreamento e ao diagnóstico em tempo oportuno, com encaminhamento ao tratamento.",
                 "Diagnóstico de câncer em estágio avançado.", ["oms_cancer", "inca_prevencao"]),
    "fumaca_gestao": ("poder_publico", "Prevenir e combater queimadas, emitir alertas em episódios de fumaça e preparar os serviços de saúde para o aumento de atendimentos respiratórios.",
                      "Exposição da população à fumaça de queimadas.", ["ms_queimadas", "oms_queimadas"]),
    "fumaca_pop": ("populacao", "Em dias de fumaça, evitar esforço ao ar livre, manter portas e janelas fechadas quando possível e não queimar lixo ou restos de vegetação.",
                   "Inalação de partículas finas da fumaça.", ["ms_queimadas", "oms_ar"]),
    "vacinas": ("poder_publico", "Manter a vacinação em dia (influenza, pneumocócica e demais vacinas do calendário), com busca ativa dos grupos prioritários.",
                "Infecções preveníveis por vacina e suas complicações.", ["ms_vacinacao", "oms_imunizacao"]),
    "tb_busca": ("poder_publico", "Fazer busca ativa de pessoas com tosse por três semanas ou mais, examinar os contatos e apoiar o tratamento até o fim.",
                 "Transmissão continuada por casos não diagnosticados ou com tratamento interrompido.", ["ms_tb", "oms_tb"]),
    "moradia": ("poder_publico", "Melhorar as condições de moradia e reduzir o adensamento, com políticas habitacionais e de proteção social.",
                "Ambientes fechados, pouco ventilados e com muitas pessoas facilitam a transmissão respiratória.", ["oms_tb", "oms_determinantes"]),
    "transito": ("poder_publico", "Gerenciar a velocidade, fiscalizar álcool ao volante, capacete e cinto, e adequar as vias a pedestres, ciclistas e motociclistas.",
                 "Fatores de risco conhecidos para lesões e mortes no trânsito.", ["oms_transito", "opas_transito"]),
    "violencia": ("poder_publico", "Combinar políticas de proteção social, educação, oportunidades para jovens e redução do acesso a armas e ao álcool.",
                  "Fatores sociais associados à violência interpessoal.", ["oms_violencia"]),
    "saude_mental": ("poder_publico", "Ampliar o acesso ao cuidado em saúde mental e treinar as equipes para identificar e acompanhar pessoas em risco.",
                     "Falta de acesso a cuidado e acompanhamento.", ["oms_suicidio", "ms_suicidio"]),
    "prenatal": ("poder_publico", "Garantir pré-natal de qualidade desde o início da gestação, parto em serviço com capacidade adequada e acompanhamento do recém-nascido.",
                 "Complicações evitáveis da gestação, do parto e dos primeiros dias de vida.", ["oms_neonatal", "oms_materna", "ms_crianca"]),
    "quedas": ("comunidade", "Adaptar casas e espaços públicos (iluminação, corrimãos, calçadas) e oferecer atividade física orientada para pessoas idosas.",
               "Risco de quedas em pessoas idosas.", ["oms_quedas", "opas_envelhecimento"]),
    "registro": ("poder_publico", "Investigar os óbitos com causa mal definida e qualificar o preenchimento da declaração de óbito.",
                 "Causas mal definidas escondem o perfil real de mortalidade do município.", ["oms_aps"]),
}

L_ECO = "Dados agregados: não mostram se as pessoas que adoeceram eram as expostas ao fator."
DEF_CENSO = "O indicador é de 2022 e pode não refletir a situação atual."


def f(indicador, papel, atencao, porque, refs, acoes, limitacoes=""):
    return {"indicador": indicador, "papel": papel, "atencao": atencao, "porque": porque, "refs": refs, "acoes": acoes,
            "limitacoes": (limitacoes + " " if limitacoes else "") + L_ECO}


IDOSOS = lambda refs: f("pct_60mais", "contexto demográfico", "maior",
                        "O risco cresce com a idade. Municípios com mais idosos têm mais eventos mesmo sem risco maior em cada idade; por isso a comparação padronizada por idade é a mais justa.",
                        refs, [], "É uma característica da população, não um fator a ser 'corrigido'.")
APS = lambda refs: f("ubs_10mil", "acesso ao diagnóstico e ao cuidado", "menor",
                     "A atenção primária identifica cedo e acompanha condições que, sem cuidado, evoluem para internação ou morte.",
                     refs + ["oms_aps"], ["aps"], "Número de unidades não mede equipe, horário, resolutividade nem qualidade.")
RENDA = lambda refs: f("renda_mediana", "determinante social (associação indireta)", "menor",
                       "Baixa renda se associa a piores condições de moradia, alimentação e acesso a serviços, o que aumenta o risco e dificulta o tratamento.",
                       refs + ["oms_determinantes"], [], DEF_CENSO + " Renda é um marcador amplo de condições de vida, não uma causa direta.")
ESCOLA = lambda refs: f("alfabetizacao", "determinante social (associação indireta)", "menor",
                        "Menor escolaridade se associa a menos acesso a informação e a serviços de saúde e a maior exposição a fatores de risco.",
                        refs + ["oms_determinantes"], [], DEF_CENSO)

TEMAS = [
    {"id": "diarreicas", "nome": "Doenças infecciosas intestinais (diarreias)", "cid": ["A00-A09"],
     "descricao": "Infecções do intestino por vírus, bactérias ou parasitas, que causam diarreia e podem levar à desidratação, mais grave em crianças pequenas e idosos.",
     "transmissao": "Principalmente fecal-oral: água ou alimentos contaminados por fezes e mãos sujas.",
     "risco": ["Água sem tratamento adequado", "Falta de esgotamento sanitário e de banheiro", "Higiene insuficiente das mãos e dos alimentos", "Desnutrição e idade inferior a 5 anos"],
     "prevencao": ["Água tratada e saneamento", "Lavagem das mãos com sabão", "Aleitamento materno e vacinação contra rotavírus", "Reidratação oral precoce nos casos"],
     "refs": ["oms_diarreia", "ms_dda", "oms_agua", "oms_saneamento"],
     "fatores": [
         f("esgoto_precario", "transmissão", "maior", "Esgoto sem coleta adequada contamina o solo, a água e os alimentos com microrganismos das fezes.", ["oms_saneamento", "oms_diarreia"], ["esgoto", "higiene"], DEF_CENSO),
         f("agua_sem_rede", "transmissão", "maior", "Sem rede geral, é mais comum o uso de fontes sem tratamento e o armazenamento improvisado de água.", ["oms_agua", "ms_dda"], ["agua", "higiene"], DEF_CENSO + " Poço profundo ou nascente protegida podem fornecer água segura."),
         f("sem_banheiro", "transmissão", "maior", "A falta de banheiro leva à defecação a céu aberto, que espalha os agentes das diarreias.", ["oms_saneamento"], ["esgoto"], DEF_CENSO),
         f("pct_0a4", "contexto demográfico", "maior", "Crianças menores de 5 anos adoecem mais e têm formas mais graves.", ["oms_diarreia"], [], "É uma característica da população."),
         APS(["ms_dda"]),
     ]},
    {"id": "dengue", "nome": "Dengue e outras arboviroses", "cid": ["A90-A92", "A97-A97"],
     "descricao": "Infecções virais transmitidas pelo mosquito Aedes aegypti. A maioria dos casos é leve, mas a dengue pode evoluir para formas graves.",
     "transmissao": "Picada da fêmea do mosquito Aedes aegypti infectada. Não passa diretamente de pessoa para pessoa.",
     "risco": ["Recipientes com água parada perto das casas", "Abastecimento irregular de água, que leva ao armazenamento em tonéis e caixas", "Coleta de lixo insuficiente", "Calor e chuva, que favorecem o mosquito", "Áreas urbanas densas"],
     "prevencao": ["Eliminar criadouros semanalmente", "Tampar caixas-d'água e reservatórios", "Coleta regular de lixo", "Vacinação para os grupos indicados pelo Ministério da Saúde", "Procurar atendimento ao primeiro sinal de alarme"],
     "refs": ["oms_dengue", "ms_dengue", "opas_dengue", "oms_vetores"],
     "fatores": [
         f("lixo_queimado_ou_jogado", "condição para o vetor", "maior", "Lixo descartado em terrenos acumula água da chuva e vira criadouro do mosquito.", ["ms_dengue", "oms_dengue"], ["residuos", "criadouros"], DEF_CENSO),
         f("agua_sem_rede", "condição para o vetor", "maior", "Sem rede regular, as famílias guardam água em recipientes que, destampados, viram criadouros.", ["oms_dengue", "opas_dengue"], ["agua", "criadouros"], DEF_CENSO + " O Censo não mede a intermitência do abastecimento."),
         f("pct_urbana", "contexto", "maior", "O Aedes aegypti é um mosquito adaptado ao ambiente urbano e às moradias.", ["oms_dengue"], ["criadouros"]),
         f("densidade", "contexto", "maior", "Maior densidade de pessoas e moradias facilita a circulação do vírus entre mosquitos e pessoas.", ["oms_dengue"], []),
         APS(["ms_dengue"]),
     ]},
    {"id": "leptospirose", "nome": "Leptospirose", "cid": ["A27-A27"],
     "descricao": "Infecção bacteriana que pode causar febre, dores musculares e, nas formas graves, comprometimento dos rins, do fígado e dos pulmões.",
     "transmissao": "Contato da pele ou mucosas com água ou lama contaminadas pela urina de animais infectados, principalmente ratos; comum após enchentes.",
     "risco": ["Enchentes e alagamentos", "Esgoto a céu aberto", "Acúmulo de lixo e presença de roedores", "Trabalho com esgoto, lixo ou em áreas alagadas"],
     "prevencao": ["Controle de roedores e coleta de lixo", "Drenagem e saneamento", "Evitar contato com água de enchente", "Atendimento rápido em caso de febre após exposição"],
     "refs": ["oms_lepto", "ms_lepto"],
     "fatores": [
         f("esgoto_precario", "transmissão", "maior", "Esgoto a céu aberto e valas favorecem roedores e o contato das pessoas com água contaminada.", ["ms_lepto"], ["esgoto", "enchente"], DEF_CENSO),
         f("lixo_queimado_ou_jogado", "condição para o reservatório", "maior", "Lixo acumulado oferece alimento e abrigo para ratos.", ["ms_lepto"], ["residuos"], DEF_CENSO),
     ]},
    {"id": "tuberculose", "nome": "Tuberculose", "cid": ["A15-A19"],
     "descricao": "Infecção causada pelo bacilo de Koch, que atinge principalmente os pulmões. Tem cura com tratamento completo, oferecido pelo SUS.",
     "transmissao": "Pelo ar, quando a pessoa com tuberculose pulmonar tosse, fala ou espirra.",
     "risco": ["Moradias com muitas pessoas e pouca ventilação", "Pobreza e desnutrição", "Infecção pelo HIV, diabetes, tabagismo e uso de álcool", "Privação de liberdade e situação de rua"],
     "prevencao": ["Vacina BCG ao nascer", "Diagnóstico precoce de quem tem tosse por 3 semanas ou mais", "Tratamento completo", "Avaliação dos contatos", "Ambientes ventilados"],
     "refs": ["oms_tb", "ms_tb"],
     "fatores": [
         f("moradores_por_domicilio", "transmissão", "maior", "Mais pessoas por domicílio aumentam o contato prolongado em ambiente fechado, que favorece a transmissão.", ["oms_tb"], ["moradia", "tb_busca"], "A média de moradores é um indicador indireto: não considera o tamanho nem a ventilação das casas. " + DEF_CENSO),
         RENDA(["oms_tb"]),
         APS(["ms_tb"]),
     ]},
    {"id": "resp_cronicas", "nome": "Doenças respiratórias crônicas (DPOC, asma, bronquite, enfisema)", "cid": ["J40-J47"],
     "descricao": "Doenças de longa duração das vias aéreas e dos pulmões, que causam falta de ar, tosse e chiado e podem ter crises graves.",
     "transmissao": None,
     "risco": ["Tabagismo (principal causa da DPOC)", "Poluição do ar externa e dentro de casa (fogão a lenha, queima de lixo)", "Fumaça de queimadas", "Poeiras e produtos químicos no trabalho", "Infecções respiratórias repetidas na infância"],
     "prevencao": ["Não fumar e evitar a fumaça do cigarro", "Reduzir a exposição à fumaça e à poluição", "Vacinação contra gripe e pneumonia", "Acompanhamento regular e uso correto dos medicamentos"],
     "refs": ["oms_dpoc", "oms_asma", "ms_asma", "oms_ar"],
     "fatores": [
         f("focos_por_1000km2", "agravamento (indicador indireto)", "maior", "A fumaça de queimadas contém partículas finas que desencadeiam crises e agravam doenças respiratórias.", ["oms_queimadas", "ms_queimadas", "oms_ar"], ["fumaca_gestao", "fumaca_pop"], "Focos de calor não medem fumaça nem exposição; a fumaça viaja entre municípios e o efeito é mais visível em atendimentos e internações de curto prazo do que em óbitos anuais."),
         f("lixo_queimado_ou_jogado", "agravamento (indicador indireto)", "maior", "A queima de lixo perto das moradias produz fumaça irritante para as vias aéreas.", ["oms_ar_domestico", "oms_ar"], ["residuos", "fumaca_pop"], DEF_CENSO + " O indicador soma lixo queimado e lixo jogado em terreno."),
         IDOSOS(["oms_dpoc"]),
         APS(["oms_dpoc", "ms_asma"]),
     ]},
    {"id": "pneumonia", "nome": "Gripe e pneumonia", "cid": ["J09-J18"],
     "descricao": "Infecções respiratórias agudas. A pneumonia é a inflamação dos pulmões, mais grave em crianças pequenas, idosos e pessoas com doenças crônicas.",
     "transmissao": "Gotículas e secreções respiratórias de pessoas infectadas; alguns agentes já vivem nas vias aéreas.",
     "risco": ["Idade inferior a 5 anos ou superior a 60", "Doenças crônicas e baixa imunidade", "Fumaça dentro de casa e poluição do ar", "Aglomeração domiciliar", "Vacinação incompleta"],
     "prevencao": ["Vacinas contra influenza, pneumococo, Hib e sarampo", "Aleitamento materno", "Ambientes ventilados e sem fumaça", "Tratamento precoce"],
     "refs": ["oms_pneumonia", "oms_influenza", "ms_gripe"],
     "fatores": [
         IDOSOS(["oms_influenza"]),
         f("moradores_por_domicilio", "transmissão", "maior", "Mais pessoas dividindo o mesmo ambiente facilitam a transmissão de infecções respiratórias.", ["oms_pneumonia"], ["moradia", "vacinas"], "Indicador indireto de adensamento. " + DEF_CENSO),
         f("focos_por_1000km2", "agravamento (indicador indireto)", "maior", "A poluição do ar por fumaça aumenta o risco e a gravidade das infecções respiratórias.", ["oms_ar", "oms_queimadas"], ["fumaca_gestao", "fumaca_pop"], "Focos de calor não medem fumaça nem exposição."),
         APS(["oms_pneumonia"]),
     ]},
    {"id": "circulatorias", "nome": "Doenças do aparelho circulatório (infarto, AVC, hipertensão, insuficiência cardíaca)", "cid": ["I00-I99"],
     "descricao": "Doenças do coração e dos vasos sanguíneos. Infarto e AVC são as formas agudas mais conhecidas e estão entre as principais causas de morte.",
     "transmissao": None,
     "risco": ["Pressão alta, diabetes e colesterol elevado", "Tabagismo e uso nocivo de álcool", "Alimentação com excesso de sal e ultraprocessados, sedentarismo e obesidade", "Idade", "Poluição do ar", "Pobreza e dificuldade de acesso ao cuidado"],
     "prevencao": ["Controle da pressão, da glicemia e do colesterol", "Não fumar, reduzir sal e álcool, praticar atividade física", "Acompanhamento na atenção primária", "Reconhecer sinais de infarto e AVC e acionar o SAMU 192"],
     "refs": ["oms_dcv", "oms_hipertensao", "ms_avc", "ms_infarto", "ms_hipertensao", "opas_dcv"],
     "fatores": [
         IDOSOS(["oms_dcv"]),
         APS(["oms_hipertensao", "ms_hipertensao"]),
         f("urgencia_100mil", "acesso ao cuidado de urgência", "menor", "No infarto e no AVC, o tempo até o atendimento muda o desfecho.", ["ms_avc", "ms_infarto"], ["urgencia"], "Conta estabelecimentos, não mede tempo de resposta; o SAMU e hospitais de municípios vizinhos não aparecem aqui."),
         RENDA(["oms_dcv"]),
         ESCOLA(["oms_dcv"]),
     ]},
    {"id": "diabetes", "nome": "Diabetes mellitus", "cid": ["E10-E14"],
     "descricao": "Doença crônica em que o açúcar no sangue fica elevado. Sem controle, causa complicações no coração, nos rins, nos olhos e nos nervos.",
     "transmissao": None,
     "risco": ["Excesso de peso e sedentarismo", "Alimentação inadequada", "Histórico familiar", "Idade", "Dificuldade de acesso a diagnóstico, medicamentos e acompanhamento"],
     "prevencao": ["Alimentação saudável e atividade física", "Exames periódicos para diagnóstico precoce", "Tratamento contínuo e cuidado com os pés, os olhos e os rins"],
     "refs": ["oms_diabetes", "ms_diabetes", "oms_dcnt"],
     "fatores": [IDOSOS(["oms_diabetes"]), APS(["oms_diabetes", "ms_diabetes"]), RENDA(["oms_diabetes"]), ESCOLA(["oms_dcnt"])]},
    {"id": "neoplasias", "nome": "Neoplasias (cânceres)", "cid": ["C00-D48"],
     "descricao": "Grupo de mais de cem doenças em que células crescem de forma desordenada. As causas e a prevenção variam conforme o tipo de câncer.",
     "transmissao": None,
     "risco": ["Tabagismo e álcool", "Alimentação inadequada, excesso de peso e sedentarismo", "Infecções (HPV, hepatites B e C, H. pylori)", "Exposição solar, radiação e agentes químicos no ambiente e no trabalho", "Idade"],
     "prevencao": ["Não fumar e limitar o álcool", "Vacinas contra HPV e hepatite B", "Proteção solar", "Rastreamento (colo do útero, mama, intestino) e diagnóstico precoce"],
     "refs": ["oms_cancer", "ms_cancer", "inca_prevencao"],
     "fatores": [
         IDOSOS(["oms_cancer"]),
         f("hospitais_100mil", "acesso ao diagnóstico e ao tratamento", "menor", "O diagnóstico tardio reduz a chance de cura; ele depende de acesso a exames e serviços especializados.", ["oms_cancer", "inca_prevencao"], ["rastreio"], "O tratamento oncológico é regionalizado: a ausência de hospital no município não significa falta de acesso, e a presença não garante oncologia."),
         APS(["inca_prevencao"]),
         RENDA(["oms_cancer"]),
     ]},
    {"id": "transito", "nome": "Acidentes de transporte", "cid": ["V01-V99"],
     "descricao": "Lesões e mortes de pedestres, ciclistas, motociclistas e ocupantes de veículos. São causas externas, não doenças.",
     "transmissao": None,
     "risco": ["Velocidade excessiva", "Álcool e direção", "Não uso de capacete, cinto e cadeirinha", "Vias inseguras para pedestres e motociclistas", "Demora no atendimento às vítimas"],
     "prevencao": ["Gestão de velocidade e fiscalização", "Infraestrutura segura", "Uso de capacete e cinto", "Atendimento pré-hospitalar rápido"],
     "refs": ["oms_transito", "opas_transito"],
     "fatores": [
         f("urgencia_100mil", "acesso ao cuidado de urgência", "menor", "O atendimento rápido após o trauma reduz mortes e sequelas.", ["oms_transito"], ["urgencia", "transito"], "Não mede o tempo de resposta. O óbito é contado no município de residência da vítima, que pode não ser o local do acidente."),
     ]},
    {"id": "agressoes", "nome": "Agressões (violência interpessoal)", "cid": ["X85-Y09"],
     "descricao": "Lesões e mortes provocadas intencionalmente por outra pessoa. São causas externas, não doenças.",
     "transmissao": None,
     "risco": ["Desigualdade e pobreza concentrada", "Baixa escolaridade e falta de oportunidades para jovens", "Acesso a armas de fogo", "Uso nocivo de álcool e mercados ilegais de drogas"],
     "prevencao": ["Políticas de proteção social e educação", "Programas para jovens", "Controle de armas e do álcool", "Policiamento orientado a problemas e apoio às vítimas"],
     "refs": ["oms_violencia"],
     "fatores": [RENDA(["oms_violencia"]), ESCOLA(["oms_violencia"]),
                 f("pct_urbana", "contexto", "maior", "A violência letal se concentra em áreas urbanas com desigualdade.", ["oms_violencia"], ["violencia"])]},
    {"id": "suicidio", "nome": "Lesões autoprovocadas (suicídio)", "cid": ["X60-X84"],
     "descricao": "Mortes por lesões autoprovocadas intencionalmente. O suicídio é prevenível. Se você ou alguém próximo precisa de ajuda, ligue 188 (CVV) ou procure um serviço de saúde.",
     "transmissao": None,
     "risco": ["Transtornos mentais sem cuidado, em especial depressão e uso de álcool", "Tentativa anterior", "Isolamento, perdas e crises financeiras", "Acesso a meios letais"],
     "prevencao": ["Acesso a cuidado em saúde mental", "Restrição do acesso a meios", "Comunicação responsável sobre o tema", "Acompanhamento de quem já tentou"],
     "refs": ["oms_suicidio", "ms_suicidio"],
     "fatores": [f("ubs_10mil", "acesso ao cuidado", "menor", "A atenção primária é a porta de entrada para identificar sofrimento mental e encaminhar o cuidado.", ["oms_suicidio", "ms_suicidio"], ["saude_mental"], "Não mede a oferta de saúde mental (CAPS, psicólogos, psiquiatras).")]},
    {"id": "perinatal", "nome": "Afecções perinatais e causas maternas", "cid": ["P00-P96", "O00-O99"],
     "descricao": "Condições da gestação, do parto e dos primeiros dias de vida, como prematuridade, asfixia ao nascer, infecções e complicações obstétricas.",
     "transmissao": None,
     "risco": ["Pré-natal ausente, tardio ou de baixa qualidade", "Parto sem assistência adequada", "Hipertensão, diabetes e infecções na gestação", "Gravidez na adolescência e vulnerabilidade social"],
     "prevencao": ["Pré-natal desde o início da gestação", "Parto em serviço com estrutura adequada", "Cuidado ao recém-nascido e aleitamento materno"],
     "refs": ["oms_neonatal", "oms_materna", "ms_crianca"],
     "fatores": [APS(["oms_neonatal"]),
                 f("hospitais_100mil", "acesso ao cuidado no parto", "menor", "Complicações do parto e do recém-nascido exigem serviço com capacidade de resposta.", ["oms_materna", "oms_neonatal"], ["prenatal"], "Não mede leitos obstétricos ou neonatais nem a distância até a maternidade de referência."),
                 RENDA(["oms_materna"])]},
    {"id": "quedas", "nome": "Quedas", "cid": ["W00-W19"],
     "descricao": "Quedas são causas externas de lesão. Em pessoas idosas, podem causar fraturas e levar à morte.",
     "transmissao": None,
     "risco": ["Idade avançada", "Problemas de equilíbrio, visão e uso de vários medicamentos", "Casas e calçadas com obstáculos e pouca iluminação"],
     "prevencao": ["Adaptação dos ambientes", "Atividade física para força e equilíbrio", "Revisão de medicamentos"],
     "refs": ["oms_quedas", "oms_envelhecimento"],
     "fatores": [IDOSOS(["oms_quedas"]) | {"acoes": ["quedas"]}]},
    {"id": "hidricas_outros", "nome": "Esquistossomose e hepatite A", "cid": ["B65-B65", "B15-B15"],
     "descricao": "Infecções ligadas à contaminação da água por fezes: a esquistossomose (verme transmitido em águas com caramujos) e a hepatite A (vírus).",
     "transmissao": "Esquistossomose: contato da pele com água doce contaminada. Hepatite A: via fecal-oral, por água e alimentos contaminados.",
     "risco": ["Falta de esgotamento sanitário", "Uso de rios e lagoas contaminados para banho, trabalho ou lazer", "Água sem tratamento"],
     "prevencao": ["Saneamento básico", "Água tratada", "Vacina contra hepatite A (calendário infantil)", "Diagnóstico e tratamento dos casos"],
     "refs": ["oms_esquisto", "ms_esquisto", "oms_hepa", "ms_hepatites"],
     "fatores": [f("esgoto_precario", "transmissão", "maior", "Fezes lançadas no ambiente contaminam a água onde as pessoas se expõem.", ["oms_esquisto", "oms_hepa"], ["esgoto", "agua", "higiene"], DEF_CENSO),
                 f("agua_sem_rede", "transmissão", "maior", "Sem água tratada, cresce o uso de fontes que podem estar contaminadas.", ["oms_hepa", "ms_esquisto"], ["agua"], DEF_CENSO)]},
    {"id": "chagas", "nome": "Doença de Chagas", "cid": ["B57-B57"],
     "descricao": "Infecção pelo parasita Trypanosoma cruzi. Muitos óbitos atuais são de pessoas infectadas décadas atrás, que desenvolveram a forma crônica cardíaca ou digestiva.",
     "transmissao": "Pelo inseto barbeiro, por alimentos contaminados (transmissão oral), de mãe para filho e, mais raramente, por transfusão ou transplante.",
     "risco": ["Moradias que abrigam o barbeiro (frestas, pau a pique)", "Consumo de alimentos contaminados, como açaí e caldo de cana sem higiene", "Ter vivido em área endêmica"],
     "prevencao": ["Melhoria das moradias e controle do vetor", "Boas práticas na manipulação de alimentos", "Triagem em gestantes e bancos de sangue", "Diagnóstico e tratamento"],
     "refs": ["oms_chagas", "ms_chagas"],
     "fatores": [RENDA(["oms_chagas"]) | {"limitacoes": "A mortalidade atual reflete exposições antigas, muitas vezes em outro município: o indicador de hoje pouco explica os óbitos de hoje. " + L_ECO}]},
    {"id": "mal_definidas", "nome": "Sintomas, sinais e causas mal definidas", "cid": ["R00-R99"],
     "descricao": "Códigos usados quando a declaração de óbito não permite identificar a doença que causou a morte. Uma proporção alta indica problema na qualidade da informação, não uma doença específica.",
     "transmissao": None,
     "risco": ["Óbitos sem assistência médica", "Preenchimento incompleto da declaração de óbito", "Falta de investigação do óbito"],
     "prevencao": ["Investigação dos óbitos mal definidos", "Capacitação para o preenchimento da declaração de óbito", "Acesso a serviços de saúde"],
     "refs": ["oms_aps"],
     "fatores": [f("ubs_10mil", "acesso ao diagnóstico", "menor", "Onde o acesso a serviços é menor, mais pessoas morrem sem diagnóstico registrado.", ["oms_aps"], ["registro", "aps"], "Muitos óbitos mal definidos subestimam todas as outras causas no município.")]},
]

TERMOS = [
    ("infarto", "c:I21"), ("ataque cardiaco", "c:I21"), ("avc", "g:I60-I69"), ("derrame", "g:I60-I69"), ("pressao alta", "g:I10-I15"),
    ("hipertensao", "g:I10-I15"), ("cancer", "g:C00-C97"), ("tumor", "cap:2"), ("diabetes", "g:E10-E14"), ("dengue", "c:A90"),
    ("covid", "c:B34"), ("coronavirus", "c:B34"), ("pneumonia", "g:J09-J18"), ("gripe", "g:J09-J18"), ("tuberculose", "g:A15-A19"),
    ("aids", "g:B20-B24"), ("hiv", "g:B20-B24"), ("diarreia", "g:A00-A09"), ("alzheimer", "c:G30"), ("asma", "c:J45"),
    ("bronquite", "g:J40-J47"), ("enfisema", "c:J43"), ("dpoc", "c:J44"), ("suicidio", "g:X60-X84"), ("homicidio", "g:X85-Y09"),
    ("assassinato", "g:X85-Y09"), ("acidente de transito", "g:V01-V99"), ("queda", "g:W00-W19"), ("afogamento", "g:W65-W74"),
    ("cirrose", "c:K74"), ("insuficiencia renal", "g:N17-N19"), ("sepse", "c:A41"), ("infeccao generalizada", "c:A41"),
    ("chagas", "c:B57"), ("leptospirose", "c:A27"), ("esquistossomose", "c:B65"), ("barriga d'agua", "c:B65"), ("hepatite", "g:B15-B19"),
    ("meningite", "c:G03"), ("depressao", "c:F32"), ("alcoolismo", "c:F10"), ("desnutricao", "g:E40-E46"), ("obesidade", "c:E66"),
    ("cancer de mama", "c:C50"), ("cancer de pulmao", "c:C34"), ("cancer de prostata", "c:C61"), ("cancer de colo do utero", "c:C53"),
    ("cancer de intestino", "c:C18"), ("cancer de estomago", "c:C16"), ("cancer de pele", "c:C44"), ("cancer de figado", "c:C22"),
    ("anemia", "g:D50-D53"), ("parkinson", "c:G20"), ("epilepsia", "c:G40"), ("insuficiencia cardiaca", "c:I50"), ("malaria", "g:B50-B64"),
]


def main():
    indicadores = {i["id"] for i in ler_json(os.path.join(DADOS, "indicadores", "dicionario.json"))["indicadores"]}
    for tema in TEMAS:
        for ref in tema["refs"]:
            assert ref in REFERENCIAS, ref
        for fator in tema["fatores"]:
            assert fator["indicador"] in indicadores, fator["indicador"]
            assert all(r in REFERENCIAS for r in fator["refs"]), fator["refs"]
            assert all(a in ACOES for a in fator["acoes"]), fator["acoes"]
    for acao in ACOES.values():
        assert all(r in REFERENCIAS for r in acao[3])
    gravar_json(os.path.join(DADOS, "conhecimento", "base.json"), {
        "meta": {
            "revisado_em": hoje(),
            "natureza": "Curadoria do projeto a partir de fichas e páginas oficiais da OMS, OPAS, Ministério da Saúde e INCA. É informação geral da literatura: não descreve o que aconteceu em nenhum município.",
            "cobertura": f"{len(TEMAS)} temas. Códigos CID fora desses temas não têm conteúdo explicativo revisado.",
            "enderecos_verificados_em": "2026-11-12",
        },
        "referencias": {k: {"org": o, "titulo": t, "url": u} for k, (o, t, u) in REFERENCIAS.items()},
        "acoes": {k: {"tipo": t, "texto": x, "problema": p, "refs": r, "limitacoes": LIM_ACAO} for k, (t, x, p, r) in ACOES.items()},
        "temas": TEMAS,
        "termos_populares": [{"termo": t, "sel": s} for t, s in TERMOS],
        "aviso_termos": "Termos populares são atalhos de busca definidos neste projeto; não são sinônimos oficiais da CID-10.",
    }, compacto=False)
    print(f"{len(TEMAS)} temas, {len(ACOES)} ações, {len(REFERENCIAS)} referências, {len(TERMOS)} termos")


if __name__ == "__main__":
    main()
