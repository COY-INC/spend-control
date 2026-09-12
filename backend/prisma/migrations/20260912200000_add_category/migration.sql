-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- Seed: preserva a lista que até aqui era hard-coded no frontend (CATEGORIES em api.ts),
-- pra ninguém perder categorias já em uso ao migrar pra lista editável.
INSERT INTO "Category" ("id", "name") VALUES
    ('cat_mercado', 'Mercado'),
    ('cat_restaurante', 'Restaurante'),
    ('cat_comida', 'Comida'),
    ('cat_uber', 'Uber'),
    ('cat_ifood', 'Ifood'),
    ('cat_shopping', 'Shopping'),
    ('cat_transporte', 'Transporte'),
    ('cat_viagem', 'Viagem'),
    ('cat_lazer', 'Lazer'),
    ('cat_assinaturas', 'Assinaturas'),
    ('cat_servicos', 'Serviços'),
    ('cat_casa', 'Casa'),
    ('cat_saude', 'Saúde'),
    ('cat_educacao', 'Educação'),
    ('cat_contas', 'Contas'),
    ('cat_impostos', 'Impostos'),
    ('cat_investimentos', 'Investimentos'),
    ('cat_salario', 'Salário'),
    ('cat_transferencias', 'Transferências'),
    ('cat_presente', 'Presente'),
    ('cat_prestacao_de_contas', 'Prestação de contas'),
    ('cat_carro', 'Carro'),
    ('cat_pagamento_de_cartao', 'Pagamento de cartão'),
    ('cat_cachorro', 'Cachorro'),
    ('cat_sem_categoria', 'Sem categoria');
