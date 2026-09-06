# VSFY Template Automation

App desktop (Windows/Mac) que automatiza o preenchimento e envio de templates Meta no painel [painel.vsfy.pro](https://painel.vsfy.pro/supervisor/templates).

Ele abre seu Google Chrome instalado (num perfil próprio do app, separado do seu perfil pessoal) e preenche/envia os templates que você configurar na tela. Você loga uma vez nesse perfil; nas próximas execuções a sessão já está salva.

## Requisitos

- Google Chrome instalado (o app não baixa nem empacota nenhum navegador — ele controla o Chrome que já está no seu computador).

## Rodando em modo desenvolvimento

```bash
npm install
npm start
```

## Gerando o instalador

- Windows: `npm run dist:win` (gera `.exe` em `dist/`)
- Mac: `npm run dist:mac` (gera `.dmg` em `dist/`) — precisa rodar num Mac, ou usar o GitHub Actions abaixo.

## Gerando os dois instaladores via GitHub Actions (sem precisar de um Mac)

1. Crie um repositório no GitHub e suba este código (`git push`).
2. Na aba **Actions** do repositório, rode o workflow **"Build installers"** manualmente (botão "Run workflow"), ou crie uma tag `vX.Y.Z` e faça push dela.
3. Quando terminar, os instaladores `.exe` (Windows) e `.dmg` (Mac) aparecem na aba **Actions → (execução) → Artifacts**, prontos para baixar.

## Como usar o app

1. Abra o app e clique em **"Abrir navegador e entrar no VSFY"**. Uma janela de Chrome abre na página de templates — na primeira vez, faça login manualmente ali (inclusive 2FA se tiver). O app detecta o login automaticamente; nas próximas vezes a sessão já estará salva.
2. Preencha o template (nome, corpo da mensagem, rodapé, botões, etc.) e defina quantos templates quer criar com esse mesmo conteúdo — o nome recebe um sufixo automático quando for mais de 1.
3. Decida se quer manter marcado **"Revisar cada template antes de enviar"**:
   - **Marcado (recomendado)**: o app preenche o formulário e espera você mesmo clicar em "Enviar para análise" no navegador antes de seguir para o próximo. Bom para os primeiros usos.
   - **Desmarcado**: o app clica em "Enviar para análise" automaticamente para todos os templates da lista, sem pausa.
4. Clique em **"Iniciar automação"** e acompanhe o log na tela. O botão **"Parar"** interrompe após o template em andamento.

## Observações importantes

- O envio de um template é real: ele entra na fila de aprovação do Meta na sua conta. Revise o conteúdo antes de confirmar.
- O app guarda a sessão do navegador entre execuções (perfil próprio, separado do seu Chrome pessoal), então você não precisa logar toda vez — só quando a sessão expirar.
- Campo "Departamento": deixe em branco para usar o único/padrão da conta. Se a conta tiver mais de um número/departamento, digite o texto exatamente como aparece no dropdown do site.
