'use strict';

const state = {
  loggedIn: false,
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
  el('btn-run').disabled = !(state.loggedIn && !state.running);
}

el('btn-open-browser').addEventListener('click', async () => {
  el('btn-open-browser').disabled = true;
  el('login-status').textContent = 'Abrindo navegador...';
  el('login-status').className = 'status';
  const res = await window.api.openBrowser();
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
    ? 'Login detectado. Pode configurar o template abaixo.'
    : 'Não foi possível confirmar o login.';
  el('login-status').className = loggedIn ? 'status ok' : 'status';
  updateRunButtonState();
});

el('btn-escolher-imagem').addEventListener('click', async () => {
  const filePath = await window.api.selectImage();
  if (filePath) {
    document.querySelector('[data-field="imagemPath"]').value = filePath;
  }
});

function readBaseTemplate() {
  const get = (field) => (document.querySelector(`[data-field="${field}"]`) || {}).value || '';
  return {
    nome: get('nome').trim(),
    departamento: get('departamento').trim(),
    titulo: get('titulo').trim(),
    imagemPath: get('imagemPath').trim(),
    corpo: get('corpo').trim(),
    rodape: get('rodape').trim(),
    botoes: [get('botao1').trim(), get('botao2').trim(), get('botao3').trim()],
  };
}

function collectTemplates() {
  const base = readBaseTemplate();
  const qtd = Math.max(1, Math.min(50, parseInt(el('qtd').value, 10) || 1));
  const templates = [];
  for (let i = 0; i < qtd; i++) {
    const tpl = { ...base, botoes: [...base.botoes] };
    if (qtd > 1) tpl.nome = `${base.nome}_${i + 1}`;
    templates.push(tpl);
  }
  return templates;
}

el('btn-run').addEventListener('click', async () => {
  const templates = collectTemplates();
  const invalid = templates.find((t) => !t.nome || !t.corpo);
  if (invalid) {
    appendLog({ message: 'Preencha ao menos "Nome do template" e "Corpo da mensagem".', level: 'error', ts: Date.now() });
    return;
  }
  state.running = true;
  updateRunButtonState();
  el('btn-stop').disabled = false;

  const options = { pauseBeforeSubmit: el('pausar').checked };
  await window.api.runAutomation(templates, options);
});

el('btn-stop').addEventListener('click', async () => {
  await window.api.stopAutomation();
});

window.api.onRunFinished(() => {
  state.running = false;
  el('btn-stop').disabled = true;
  updateRunButtonState();
});

window.api.onLog(appendLog);
