# Meu Treino

App pessoal de treino de academia, feito para usar no iPhone como um app instalado.
Tudo fica salvo no próprio celular e funciona sem internet. Se você conectar o Supabase, os dados também vão para a nuvem.

## O que o app faz

- **Fichas e treinos:** fichas (uma ativa, as outras prontas ou encerradas) com treinos A, B, C…, exercícios em ordem, superset e séries planejadas.
- **Treino em andamento:** cronômetro, check por exercício e por série, tipo de série (aquecimento, normal, falha, drop), carga em kg, lb ou número da placa, e descanso com aviso sonoro.
- **Biblioteca:** mais de 100 exercícios em português com animação e fotos. Você pode criar os seus.
- **Calendário e histórico:** dias treinados, com a opção de adicionar, editar ou apagar qualquer dia à mão.
- **Progresso:** evolução de carga por exercício, recordes, peso, medidas e fotos.
- **Backup:** exporte e importe um arquivo com todos os dados, e sincronize com o Supabase.

---

## 1. Colocar o app no ar (grátis, com GitHub Pages)

Você só faz isso uma vez. Depois, cada atualização vai para o ar sozinha.

1. Crie uma conta grátis em https://github.com.
2. Crie um repositório novo chamado `meu-treino`. Ele pode ser **público**, porque nenhum dado seu fica no código.
3. No computador, dentro desta pasta, envie o código:
   ```bash
   git remote add origin https://github.com/SEU-USUARIO/meu-treino.git
   ```
   ```bash
   git push -u origin main
   ```
   O Git vai abrir o navegador para você entrar na sua conta do GitHub.
4. No GitHub, abra o repositório → **Settings** → **Pages** → em **Source**, escolha **GitHub Actions**.
5. Abra a aba **Actions** e espere o "Publicar no GitHub Pages" ficar verde (1 a 2 minutos).
6. O endereço do app será `https://SEU-USUARIO.github.io/meu-treino/`.

## 2. Instalar no iPhone

1. Abra o endereço no **Safari**.
2. Toque em **Compartilhar** (o quadrado com a seta) → **Adicionar à Tela de Início**.
3. Abra sempre pelo ícone novo. Ele abre em tela cheia e funciona sem internet.

## 3. Conectar o Supabase (opcional, recomendado)

Sem o Supabase, os dados ficam só no iPhone. Com ele, ficam na nuvem também.

1. Crie uma conta grátis em https://supabase.com e clique em **New project**.
   - Name: `meu-treino`
   - Region: **South America (São Paulo)**
   - Anote a senha do banco (o app não usa, mas o Supabase pede).
2. Menu **SQL Editor** → **New query** → cole todo o conteúdo do arquivo `supabase/schema.sql` → **Run**.
3. Menu **Authentication** → **Sign In / Providers** → **Email**: desligue **Confirm email** (assim você não precisa confirmar por e-mail).
4. Menu **Project Settings** → **API Keys**: copie a **chave pública** (publishable ou anon). Em **Data API**, copie a **Project URL**.
5. No app: **Perfil** → **Backup na nuvem** → cole a URL e a chave → **Conectar** → **Criar conta** com seu e-mail e uma senha.
6. Depois de criar sua conta, volte em **Authentication** → **Sign In / Providers** e desligue **Allow new users to sign up**. Assim ninguém mais consegue criar conta no seu projeto.

> ⚠️ **Plano grátis:** o Supabase pausa o projeto depois de 7 dias sem nenhum uso. Se acontecer, entre no painel e clique em **Restore**. Seus dados continuam lá e o app continua funcionando offline enquanto isso.

---

## Para quem for mexer no código

Requisitos: Node.js 20 ou mais novo.

```bash
npm install
```
```bash
npm run dev
```
```bash
npm run build
```

- React + TypeScript + Vite, e PWA com `vite-plugin-pwa`.
- Os dados ficam no IndexedDB (Dexie), em `src/lib/db.ts`.
- A sincronização (`src/lib/sync.ts`) usa uma tabela genérica `records` no Supabase, protegida por RLS.
- A biblioteca de exercícios fica em `src/data/catalog.ts`. As animações vêm do ExerciseDB; as fotos, do free-exercise-db (domínio público).
- Os ícones de equipamento (`src/components/EquipmentIcon.tsx`) vêm em parte do Material Design Icons, da Pictogrammers (licença Apache 2.0).
- Também dá para configurar o Supabase no build com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
