---
name: wa-akg-operations
description: Use when the user wants to inspect or operate authorized WA-AKG WhatsApp sessions through MCP.
---

# Operações WA-AKG

Use as ferramentas MCP do WA-AKG para consultar sessões, mensagens e demais recursos autorizados pelo usuário.

- Explique o efeito antes de qualquer operação de escrita ou ação que possa enviar mensagens, alterar sessões ou chamar webhooks.
- Prefira leitura e confirmação explícita antes de operações externas.
- Respeite os erros de autorização, escopo OAuth, propriedade e limite de sessão retornados pelo servidor.
- Nunca solicite, exponha ou registre tokens OAuth, chaves de API ou QR codes.
- Se o túnel estiver indisponível, informe que a conexão depende do endpoint público configurado.
