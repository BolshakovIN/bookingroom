# React + TypeScript + Vite

## Запуск у себя

```bash
npm install
npm run dev
```

Откройте http://localhost:3000

Данные пишутся в браузер (IndexedDB). На домашней сети также подтягивается локальный файл `data/bookingroom.db`.

## Как открыть доступ любому

Нельзя выкладывать одну общую базу в интернет: тогда все увидят чужие суммы. Каждый пользователь ведёт **свои** записи в своём браузере.

### GitHub Pages

Репозиторий: https://github.com/BolshakovIN/bookingroom  
Сайт после деплоя: https://bolshakovin.github.io/bookingroom/

Каждый пользователь хранит свои записи в своём браузере.

### Временно с вашего компьютера

Пока включён `npm run dev`, можно дать туннель Cloudflare (без аккаунта):

```bash
npx cloudflared tunnel --url http://localhost:3000
```

Ссылка работает, только пока запущены и туннель, и ваш компьютер.

### С телефона в той же Wi‑Fi

Откройте `http://ВАШ-IP:3000` (IP смотрите в выводе Vite, строка Network).
