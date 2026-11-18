Privacy Policy — Twitch Images In Chat (Safety)

Last updated: 25.10.2026

The extension does not collect, store, sell, or share any personal data.
There is no analytics, no tracking, no advertising, and no user accounts.

Local storage:
The extension saves two settings in your browser using chrome.storage.local:
whether the whitelist is ignored, and the cached list of trusted image hosts.
This data never leaves your device.

Network requests:
1. The extension periodically downloads a JSON file containing a list of
   trusted image hosting domains from a public GitHub repository
   (raw.githubusercontent.com). This request contains no user data.
2. When you send or receive a link to an image or video in chat, the media
   is loaded directly from the hosting service by your browser. As with any
   website, that hosting service can see your IP address. This is exactly
   why the extension asks for confirmation before loading media from
   unknown domains.

Permissions:
- storage: save your settings locally.
- alarms: periodically refresh the trusted domains list.
- Host permissions for twitch.tv, kick.com and live.vkvideo.ru: detect
  media links in chat and display previews.

Contact: lepayy@bk.ru
