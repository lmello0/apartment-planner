"""MCMV purchase checklist (pt-BR), grouped by phase."""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.types import TaskPhase


@dataclass(frozen=True)
class TemplateTask:
    title: str
    phase: TaskPhase


_RAW: dict[TaskPhase, list[str]] = {
    TaskPhase.PRE_CONTRACT: [
        "Conferir o Quadro Resumo e a minuta do contrato de compra e venda",
        "Verificar o registro de incorporação e a matrícula do terreno",
        "Confirmar o enquadramento no Minha Casa Minha Vida (renda e faixa)",
        "Simular o financiamento e o subsídio na Caixa",
        "Guardar os comprovantes de sinal e de corretagem",
    ],
    TaskPhase.CREDIT_APPROVAL: [
        "Reunir os documentos pessoais e comprovantes de renda para a Caixa",
        "Pagar a tarifa de avaliação do imóvel pela Caixa",
        "Acompanhar a análise de crédito e a aprovação do financiamento",
        "Conferir o saldo e o extrato do FGTS para uso no financiamento",
        "Anotar o prazo de validade da aprovação de crédito",
    ],
    TaskPhase.SIGNING: [
        "Contratar o documentista e entregar os documentos",
        "Conferir a minuta do contrato de financiamento",
        "Assinar o contrato de financiamento com a Caixa",
        "Pagar a diferença do financiamento, se houver",
        "Recolher ITBI e registrar o contrato no cartório",
    ],
    TaskPhase.CONSTRUCTION: [
        "Pagar as parcelas da construtora em dia (multa de 10% + 1% a.m. no atraso)",
        "Conferir o boleto com a correção INCC-DI antes de pagar",
        "Acompanhar a evolução da obra e o cronograma",
        "Pagar os juros de obra durante a construção",
        "Guardar todos os comprovantes de pagamento",
    ],
    TaskPhase.KEY_DELIVERY: [
        "Acompanhar a emissão do habite-se",
        "Responder à convocação para a vistoria",
        "Vistoriar o apartamento e registrar as pendências por escrito",
        "Pagar a parcela das chaves e liberar o financiamento",
        "Receber as chaves e assinar o termo de entrega",
    ],
    TaskPhase.POST_DELIVERY: [
        "Transferir as contas de condomínio, luz e água para o seu nome",
        "Conferir o início da cobrança de condomínio e IPTU",
        "Acompanhar a assistência técnica das pendências de vistoria",
        "Contratar o seguro residencial",
        "Guardar o manual do proprietário e as garantias",
    ],
}

TEMPLATE: list[TemplateTask] = [
    TemplateTask(title, phase) for phase, titles in _RAW.items() for title in titles
]
