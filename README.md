# FitTrainer MVP

Веб-приложение для тренеров и клиентов: создание тренировок, назначение, прохождение с таймером отдыха, история результатов.

## Стек

- React 18 + TypeScript + Vite
- Tailwind CSS
- Supabase (PostgreSQL + Auth + Storage)
- Vercel (хостинг)

## Локальный запуск

### 1. Установить зависимости

```bash
npm install
```

### 2. Настроить переменные окружения

```bash
cp .env.example .env.local
```

Заполнить `.env.local`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_APP_URL=http://localhost:5173
```

### 3. Применить миграции к staging БД

```bash
npx supabase db push --db-url "postgresql://postgres:PASSWORD@db.PROJECT_ID.supabase.co:5432/postgres"
```

Или через Supabase Dashboard → SQL Editor — вставить содержимое файлов из `/supabase/migrations/` по порядку.

### 4. Заполнить библиотеку упражнений

```bash
SUPABASE_URL=https://... SUPABASE_SERVICE_KEY=sb_secret_... npm run seed
```

### 5. Запустить

```bash
npm run dev
```

Приложение будет на `http://localhost:5173`

## Деплой

| Ветка | Окружение | Supabase проект |
|-------|-----------|-----------------|
| `develop` | staging.your-domain.com | fit-trainer-staging |
| `main` | app.your-domain.com | fit-trainer-production |

Vercel автоматически деплоит при пуше в соответствующую ветку.

Переменные окружения настраиваются в Vercel Dashboard → Settings → Environment Variables (отдельно для Preview и Production).

## Структура проекта

```
src/
  pages/          # Страницы приложения
  components/     # Переиспользуемые UI-компоненты
  hooks/          # React хуки (useAuth)
  lib/            # Supabase клиент, проверка лимитов тарифов
  types/          # TypeScript типы для БД
supabase/
  migrations/     # SQL миграции — только через них менять схему БД
scripts/
  seed-exercises.ts  # Заполнение библиотеки упражнений (запустить один раз)
```

## Важно для разработчика

- **Никогда** не менять схему БД через веб-интерфейс Supabase — только через миграции
- **Никогда** не коммитить `.env.local` — он в `.gitignore`
- Тестировать только на staging, в production деплоить через PR в `main`
- RLS включён на всех таблицах — проверять что второй тренер не видит данные первого

## Применение новой миграции

1. Создать файл `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
2. Закоммитить в ветку `develop`, пушнуть
3. Применить на staging вручную или через Supabase CLI
4. Проверить на staging
5. Сделать PR в `main`, после мержа применить на production
