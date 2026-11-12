# ConectaFlow B2 — Release notes (RASCUNHO, NÃO PUBLICAR)
Estado: DRAFT / NO-GO; data de referência 2026-11-09. Não há tag nem release B2 aprovada.
Repositório: https://github.com/fabriciocs/ConectaFlow; PR de preparação: https://github.com/fabriciocs/ConectaFlow/pull/2.

## Identidade
- Nome comercial: ConectaFlow.
- Nomenclatura final da release B2: PENDENTE de identificação da B1 e decisão de semver.
- SHA da versão final: NÃO DEFINIDO; não usar HEAD de documentação como binário lançado.
- Upgrade path suportado: PENDENTE dos ensaios de banco virgem e backup restaurado.
- Artifacts, checksums, SBOM, schemas finais, instruções de deploy: PENDENTES.

## Alterações confirmadas APENAS na preparação documental
- Inventário Git e atualização das referências remotas de origin/upstream.
- Sincronização de ancestralidade upstream em worktree isolado, sem importar financiamento nem badge do autor original.
- Script PowerShell 5.1 para Audit/Fetch/Prepare/Check com execução controlada e sem deploy implícito.
- Dossiê técnico docs/B2: especificação detalhada, runbook, matriz de ferramentas/skills, contratos por módulo, tracker de gates.
- Adaptação do guia de atualização para alertar que a versão B2 ainda não tem upgrade automático validado.
Nenhum desses itens, isoladamente, equivale a uma nova versão funcional pronta.

## Mudanças previstas, mas NÃO declaradas como entregues
- Integração de branches de autenticação e vinculação WhatsApp, segurança, multi-tenancy, OAuth, QR e sessão, dependências, réplica e mobile UI.
- Correções TypeScript/lint e remediação de vulnerabilidades pendentes.
- Reconciliação das migrações V1/V2, bootstrap sem P3018 e upgrade com restauração.
- Testes end-to-end autorizados com isolamento entre tenants, autorização real e OpenAPI atualizada.
- Scripts de backup, verificação, upgrade e rollback com controles por ambiente.

## Compatibilidade, APIs e migrações
A candidata parte de package.json 1.7.0 (baseline técnico, não versão release B2). APIs/contratos e banco final ainda não estão congelados. A candidata não inclui bootstrap V2 ou esquema tenant; não aplicar auto-migrate ao banco existente. Devem ser gerados e revisados relatórios de breaking changes, mapeamento de variáveis de ambiente, inventário de DB, testes de compatibilidade e plano de reversão.

## Gates impeditivos
B1 ambígua; trabalho não commitado em worktrees; R15 security NO-GO; Prisma P3018/restore sem prova final; auth/tenant/MCP não integrados; TS/lint falharam no baseline histórico; teste de upgrade não executado; sem tag/release aprovada.
Referências: docs/B2/01-ESPECIFICACAO-MESTRA.md e docs/B2/05-GATE-TRACKER.md.

## Modelo de publicação FUTURA
Somente após todos os gates, incluir:
1. Tag imutável B2, commit SHA, versão npm/MCP, hashes de artefatos e matriz B1→B2.
2. Resumo de cada funcionalidade comprovada por teste, com caminhos/commits relevantes.
3. CVEs/remediações, compatibilidade, eventuais mudanças de contrato, de esquema e env names.
4. Pré-requisitos, upgrade ensaiado, backup e restore, rollback/forward-fix, riscos conhecidos.
5. Release assets verificáveis e aprovação de reviewer/operador.
6. Links para documentação e registro do teste pós-publicação.

Sem essas provas, manter o status DRAFT e não criar uma release/tag no GitHub.
