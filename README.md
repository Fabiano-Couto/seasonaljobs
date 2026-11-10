<div align="center">
  <img src="icons/icon128.png" width="128" height="128" alt="Seasonal Jobs Monitor Logo">
  <h1>🌟 Seasonal Jobs Monitor</h1>
  <p>Uma extensão poderosa para o Google Chrome que automatiza a busca e candidatura de vagas no portal oficial do Governo dos EUA (SeasonalJobs.dol.gov) e nas vagas para visto J1/H2B da CoolWorks.com.</p>
</div>

---

## 🚀 Sobre o Projeto

O **Seasonal Jobs Monitor** foi desenvolvido para dar velocidade e inteligência na caça por vagas de trabalho temporárias e sazonais. Chega de passar horas dando F5 na página ou perdendo vagas recém-publicadas! A extensão atua em duas frentes: **Monitoramento Oculto (Background)** e **Automação de Aplicação (In-Page)**.

## ✨ Funcionalidades Incríveis

### 🕵️ Monitoramento 100% Automático
- **SeasonalJobs (DOL):** a extensão consulta direto a busca do site (Azure Cognitive Search) **a cada 5 minutos**, uma vez por palavra-chave, pegando as 10 vagas ativas mais recentes de cada uma (a API do DOL só aceita pedir 1, 10 ou 12 por vez).
- **CoolWorks · J1/H2B:** a cada 5 minutos a extensão lê a página [J1 / H2B Visa Jobs](https://www.coolworks.com/international-job-seekers) e o perfil de cada empresa listada nela. Avisa **toda** vaga nova dessa página (sem filtro de palavra-chave — a página já é o filtro), cada vaga nova no perfil dessas empresas e, com um aviso só, cada empresa nova que aparecer. As consultas vão com os cookies do seu Chrome (o site usa a proteção anti-robô do Cloudflare).
- **Um liga/desliga por site** no popup, e o rodapé mostra a última verificação e qual site falhou, se falhar.
- **Notificações Nativas:** a primeira leitura de cada site — e, no SeasonalJobs, de cada palavra-chave nova — só registra o que já existe (palavra-chave adicionada hoje não avisa das vagas que já estavam publicadas); depois disso, cada vaga nova vira um alerta do Windows/Chrome — clique nele para abrir a vaga.

### ✍️ Templates de E-mail Dinâmicos
- **Personalização por Vaga:** Crie modelos de e-mail personalizados para diferentes tipos de vagas (ex: um modelo para *Landscaping*, outro para *Housekeeping*).
- **Auto-Preenchimento Inteligente:** A extensão lê o anúncio da vaga, descobre o título da vaga, o nome da empresa contratante e o e-mail de recrutamento, e substitui as variáveis mágicas (`[Job Title]`, `[Company Name]`) automaticamente no seu texto.

### 📎 Anexo de Currículo Descomplicado
- Salve o link do seu portfólio, LinkedIn ou currículo em nuvem (Google Drive/Dropbox) nas configurações. A extensão anexa automaticamente a URL ao final de todo e-mail gerado.

### ⚡ Botão "Candidatar-se Agora"
- Ao abrir qualquer vaga compatível, um botão flutuante e verde surgirá na tela. Com apenas um clique, o e-mail abre com o destinatário, assunto (ex: `Application for Landscaper at Ortega's Lawn`) e o corpo 100% prontos para enviar!
- **Na CoolWorks:** o botão aparece na página da vaga (quando ela informa um e-mail — vaga que só tem "Apply Now" para um sistema externo não ganha botão) e em **cada vaga da lista do perfil da empresa**. Em perfil com várias vagas, o botão flutuante vira um aviso que leva até a lista.
- **Gmail ou Outlook:** no popup, em "Enviar a candidatura pelo", escolha **Gmail** (padrão — abre a tela "Escrever" numa aba do Chrome) ou o **app de e-mail do Windows** (link `mailto:`, normalmente o Outlook). Com mais de uma conta Google no Chrome, informe a conta do Gmail que deve enviar; em branco, vale a conta principal.

---

## 🛠️ Como Instalar no Google Chrome

1. Clone ou baixe este repositório para o seu computador.
2. Abra o Google Chrome e digite `chrome://extensions/` na barra de endereços.
3. No canto superior direito, ative o **"Modo do desenvolvedor"** (Developer mode).
4. Clique no botão **"Carregar sem compactação"** (Load unpacked) no canto superior esquerdo.
5. Selecione a pasta onde você salvou este projeto.
6. Pronto! O ícone da maleta aparecerá na barra do seu navegador. 💼

---

## ⚙️ Como Usar (Configuração Rápida)

Tudo no popup é salvo automaticamente, na hora — não há botão de salvar.

1. Clique no ícone da extensão no navegador para abrir o popup.
2. **Currículo:** cole o link público do seu currículo.
3. **Enviar a candidatura pelo:** Gmail (padrão) ou app de e-mail do Windows; com Gmail e mais de uma conta Google no Chrome, informe a conta que deve enviar.
4. **Palavras-chave:** adicione termos (ex: `Landscaping`, `Farm`, `Cleaner`) e clique em cada um para escrever o modelo de e-mail dele. Palavra-chave que aparece no título da vaga vence a que só aparece na descrição.
5. **Variáveis:** no texto do e-mail, use `[Job Title]` e `[Company Name]` (ou `[Company/Resort Name]`); a extensão troca pelos dados da vaga na hora do clique.
6. **Sites monitorados:** ligue ou desligue o SeasonalJobs e a CoolWorks · J1/H2B. O nome do site abre a página dele.
7. Navegue até [seasonaljobs.dol.gov](https://seasonaljobs.dol.gov) ou [a página J1/H2B da CoolWorks](https://www.coolworks.com/international-job-seekers) e abra uma vaga.

---

## 🧪 Testes

Sem dependências — só o Node (18 ou mais novo):

```
node --test tests/
```

- `tests/email-link.test.js` — link do botão (Gmail ou `mailto:`), conta do Gmail, aba nova, botões refeitos ao mudar a configuração, palavra-chave do título vencendo a da descrição, botões do perfil (uma vaga ou várias).
- `tests/coolworks-job.test.js` — cargo e empresa lidos das páginas de vaga e de perfil da CoolWorks (JSON-LD primeiro, HTML como reserva), com o JSON-LD real em `tests/fixtures/`.
- `tests/coolworks-monitor.test.js` — monitor da página J1/H2B: registro inicial, perfil que falha ou devolve página de bloqueio, perfil sem vagas, atributos do HTML em outra ordem, empresa nova, limite da memória, decodificação de títulos e endereços, cookies nas consultas, migração do liga/desliga na instalação e na atualização, clique nas notificações (cards reais em `tests/fixtures/`).
- `tests/coolworks-job.test.js` também cobre a vaga sem e-mail (só "Apply Now"), que não ganha botão.
- `tests/seasonaljobs-page.test.js` — leitura da página de vaga do SeasonalJobs (e-mail, cargo, empresa) com uma leitura do texto por verificação.

O popup não tem teste automático (precisaria de um navegador ou de uma dependência como o jsdom); ele é conferido no Chrome.

---

## 👨‍💻 Tecnologias Utilizadas

- **JavaScript Vanilla:** Lógica de Background Service Workers e manipulação avançada de DOM (Single Page Applications - SPA).
- **CSS3:** Interfaces responsivas e Injeção de UI (Botão Flutuante).
- **Manifest V3:** A mais recente, segura e rápida arquitetura de extensões do Google Chrome.
- **RESTful APIs:** Integração assíncrona com os endpoints nativos do Azure DataHub.

---

<div align="center">
  <i>Desenvolvido para automatizar o seu sucesso profissional! 🚀</i>
</div>
