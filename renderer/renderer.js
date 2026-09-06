'use strict';

const state = {
  loggedIn: false,
  templatesGenerated: false,
  running: false,
};

const el = (id) => document.getElementById(id);

function appendLog({ message, level, ts }) {
  const box = el('log');
  const line = document.createElement('div');
  line.className = level || 'info';
  const time = new Date(ts).toLocaleTimeString();
  line.textContent = `[${time}] ${message}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function updateRunButtonState() {
  el('btn-run').disabled = !(state.loggedIn && state.templatesGenerated && !state.running);
}

el('btn-open-browser').addEventListener('click', async () => {
  const mode = document.querySelector('input[name="login-mode"]:checked').value;
  el('btn-open-browser').disabled = true;
  el('login-status').textContent = 'Abrindo navegador...';
  el('login-status').className = 'status';
  const res = await window.api.openBrowser(mode);
  if (!res.ok) {
    el('login-status').textContent = `Erro: ${res.error}`;
    el('btn-open-browser').disabled = false;
    return;
  }
  el('login-status').textContent = 'Navegador aberto. Faça login manualmente e aguarde a detecção automática...';
});

window.api.onLoginStatus(({ loggedIn }) => {
  state.loggedIn = loggedIn;
  el('login-status').textContent = loggedIn
    ? 'Login detectado. Pode configurar os templates abaixo.'
    : 'Não foi possível confirmar o login.';
  el('login-status').className = loggedIn ? 'status ok' : 'status';
  updateRunButtonState();
});

function buttonField(blockIndex, buttonIndex) {
  return `
    <input type="text" data-field="botao${buttonIndex}" placeholder="Botão ${buttonIndex} (ex.: CLIQUE AQUI {{URL}})" />
  `;
}

function templateBlockHtml(index) {
  return `
    <div class="template-block" data-index="${index}">
      <h3>Template #${index + 1} ${index > 0 ? '<button type="button" class="secondary btn-copy" data-index="' + index + '">Copiar do anterior</button>' : ''}</h3>
      <div class="field">
        <label>Nome do template (obrigatório — minúsculas, números e "_")</label>
        <input type="text" data-field="nome" placeholder="ex.: promo_credito_01" />
      </div>
      <div class="field">
        <label>Departamento (opcional — deixe em branco para usar o padrão)</label>
        <input type="text" data-field="departamento" placeholder="ex.: API (LAISD) - 3193" />
      </div>
      <div class="field">
        <label>Título / Header (opcional)</label>
        <input type="text" data-field="titulo" placeholder="Ex.: Atualização da sua margem" />
      </div>
      <div class="field">
        <label>Imagem do topo — caminho do arquivo no seu computador (opcional)</label>
        <input type="text" data-field="imagemPath" placeholder="C:\\caminho\\para\\imagem.png" />
      </div>
      <div class="field">
        <label>Corpo da mensagem (obrigatório — use {{1}}, {{2}}... para variáveis)</label>
        <textarea data-field="corpo" placeholder="Escreva o texto que o cliente vai receber..."></textarea>
      </div>
      <div class="field">
        <label>Rodapé (opcional)</label>
        <input type="text" data-field="rodape" placeholder="Ex.: Responda para falar com um consultor" />
      </div>
      <div class="field">
        <label>Botões de resposta rápida (até 3, opcional)</label>
        <div class="buttons-row">
          ${buttonField(index, 1)}
          ${buttonField(index, 2)}
          ${buttonField(index, 3)}
        </div>
      </div>
    </div>
  `;
}

el('btn-gerar').addEventListener('click', () => {
  const qtd = Math.max(1, Math.min(50, parseInt(el('qtd').value, 10) || 1));
  const container = el('templates-container');
  container.innerHTML = '';
  for (let i = 0; i < qtd; i++) {
    container.insertAdjacentHTML('beforeend', templateBlockHtml(i));
  }
  container.querySelectorAll('.btn-copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index, 10);
      const blocks = container.querySelectorAll('.template-block');
      const prev = blocks[idx - 1];
      const curr = blocks[idx];
      prev.querySelectorAll('[data-field]').forEach((prevInput) => {
        const field = prevInput.dataset.field;
        const currInput = curr.querySelector(`[data-field="${field}"]`);
        if (currInput) currInput.value = prevInput.value;
      });
    });
  });
  state.templatesGenerated = qtd > 0;
  updateRunButtonState();
});

function collectTemplates() {
  const blocks = document.querySelectorAll('.template-block');
  const templates = [];
  for (const block of blocks) {
    const get = (field) => (block.querySelector(`[data-field="${field}"]`) || {}).value || '';
    templates.push({
      nome: get('nome').trim(),
      departamento: get('departamento').trim(),
      titulo: get('titulo').trim(),
      imagemPath: get('imagemPath').trim(),
      corpo: get('corpo').trim(),
      rodape: get('rodape').trim(),
      botoes: [get('botao1').trim(), get('botao2').trim(), get('botao3').trim()],
    });
  }
  return templates;
}

el('btn-run').addEventListener('click', async () => {
  const templates = collectTemplates();
  const invalid = templates.find((t) => !t.nome || !t.corpo);
  if (invalid) {
    appendLog({ message: 'Preencha ao menos "Nome do template" e "Corpo da mensagem" em todos os blocos.', level: 'error', ts: Date.now() });
    return;
  }
  state.running = true;
  updateRunButtonState();
  el('btn-stop').disabled = false;
  el('btn-gerar').disabled = true;

  const options = { pauseBeforeSubmit: el('pausar').checked };
  await window.api.runAutomation(templates, options);
});

el('btn-stop').addEventListener('click', async () => {
  await window.api.stopAutomation();
});

window.api.onRunFinished(() => {
  state.running = false;
  el('btn-stop').disabled = true;
  el('btn-gerar').disabled = false;
  updateRunButtonState();
});

window.api.onLog(appendLog);
