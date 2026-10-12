# Privacy Policy — Focus

Last updated: 2026-10-12

Focus is a custom new tab page. This policy explains what the extension does with data.

## Data we collect

**The developer collects nothing.** Focus has no accounts, no analytics, no tracking and no servers of its own. We do not collect, store on servers, sell or share any personal data, browsing history or user activity. The only data that leaves your device is described in "Network requests" below.

## Data stored on your device

Everything you create stays in your browser's local storage and is not sent to the developer:
- links and site names you add (localStorage)
- pictures, notes and drawings on the Cloud board (IndexedDB)
- background images (IndexedDB)
- favicon disk cache (Cache Storage)
- settings: theme, search icon, mail link, toggles (localStorage)

Uninstalling the extension removes this data with the browser profile.

## Network requests

The extension contacts the network only on your explicit actions:
- **Favicons** (`icons.duckduckgo.com`, `ico.faviconkit.net`): when you add a site, the extension requests that site's icon from these services. The request contains the domain of the site you added. The icon is downloaded once, then served from the local disk cache, including offline.
- **Search**: by default your query is sent to your browser's default search engine via the Chrome Search API (Standard option) only when you submit a search; if you explicitly pick Google or Yandex for a space, the query goes there instead, under that service's own privacy policy.

No data is sent anywhere else, at any time.

## Permissions used

- `unlimitedStorage` — prevents the browser from evicting your pictures and caches under storage pressure
- `search` — search via the Chrome Search API with your browser's default engine
- Host access to the two favicon services above — favicon download only

## Changes

If this policy changes, the updated text will ship with the extension update.

---

# Политика конфиденциальности — Focus

Focus не использует аккаунты, собственные серверы, аналитику и рекламу. Ссылки, картинки, заметки, рисунки, настройки и кеш иконок хранятся только в вашем браузере; разработчик их не получает. При добавлении сайта домен отправляется сервисам иконок (DuckDuckGo, Faviconkit) для загрузки значка; поисковые запросы уходят в поисковую систему вашего браузера по умолчанию (Стандарт) либо в явно выбранный вами Google/Яндекс. Данные не продаются и не передаются для рекламы. Связь: lepayy@bk.ru
