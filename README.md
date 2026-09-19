<div align="center">
  <img src="icons/icon128.png" width="128" height="128" alt="Seasonal Jobs Monitor Logo">
  <h1>🌟 Seasonal Jobs Monitor</h1>
  <p>Uma extensão poderosa para o Google Chrome que automatiza a busca e candidatura de vagas no portal oficial do Governo dos EUA (SeasonalJobs.dol.gov).</p>
</div>

---

## 🚀 Sobre o Projeto

O **Seasonal Jobs Monitor** foi desenvolvido para dar velocidade e inteligência na caça por vagas de trabalho temporárias e sazonais. Chega de passar horas dando F5 na página ou perdendo vagas recém-publicadas! A extensão atua em duas frentes: **Monitoramento Oculto (Background)** e **Automação de Aplicação (In-Page)**.

## ✨ Funcionalidades Incríveis

### 🕵️ Monitoramento 100% Automático na Nuvem
- **Integração Direta via API:** A extensão ignora a interface visual do site e consulta diretamente o banco de dados do governo via Azure Cognitive Search a cada 15 minutos.
- **Notificações Nativas:** Assim que uma nova vaga (que você ainda não viu) for publicada contendo suas palavras-chave favoritas, você receberá um alerta nativo do Windows/Chrome na mesma hora!

### ✍️ Templates de E-mail Dinâmicos
- **Personalização por Vaga:** Crie modelos de e-mail personalizados para diferentes tipos de vagas (ex: um modelo para *Landscaping*, outro para *Housekeeping*).
- **Auto-Preenchimento Inteligente:** A extensão lê o anúncio da vaga, descobre o título da vaga, o nome da empresa contratante e o e-mail de recrutamento, e substitui as variáveis mágicas (`[Job Title]`, `[Company Name]`) automaticamente no seu texto.

### 📎 Anexo de Currículo Descomplicado
- Salve o link do seu portfólio, LinkedIn ou currículo em nuvem (Google Drive/Dropbox) nas configurações. A extensão anexa automaticamente a URL ao final de todo e-mail gerado.

### ⚡ Botão "Candidatar-se Agora"
- Ao abrir qualquer vaga compatível, um botão flutuante e verde surgirá na tela. Com apenas um clique, seu cliente de e-mail padrão será aberto com o remetente, assunto (ex: `Application for Landscaper at Ortega's Lawn`) e o corpo do e-mail 100% prontos para enviar!

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

1. Clique no ícone da extensão no navegador para abrir as Configurações.
2. **Defina suas Palavras-Chave:** Adicione termos (ex: `Landscaping`, `Farm`, `Cleaner`) e associe um texto/template de e-mail diferente para cada uma.
3. **Variáveis:** No texto do e-mail, use `[Job Title]` e `[Company Name]`. Nós substituiremos isso pelos dados reais da vaga na hora do clique!
4. **Currículo:** Cole o link público do seu currículo.
5. **Monitor:** Ative a chave "Ativar Monitoramento de Novas Vagas".
6. Clique em **Salvar Configurações** e navegue até [seasonaljobs.dol.gov](https://seasonaljobs.dol.gov) para ver a mágica acontecer!

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
