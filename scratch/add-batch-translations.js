const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/translations.js');
let content = fs.readFileSync(filePath, 'utf8');

const evalCode = content + '\nmodule.exports = translations;';
const tempPath = path.join(__dirname, 'temp_translations3.js');
fs.writeFileSync(tempPath, evalCode, 'utf8');

const translations = require('./temp_translations3.js');

const additions = {
  en: {
    btn_batch_connect: "Connect All",
    btn_batch_disconnect: "Disconnect All",
    batch_connect_title: "Batch Connect All Bots",
    batch_connect_desc: "This will connect all offline bot accounts one-by-one with a random delay (1-60s) between connections to prevent IP rate limiting.",
    mode_configured: "Use each account's configured server",
    mode_custom: "Connect all accounts to a single custom server IP",
    btn_connect_all_confirm: "Start Connecting",
    batch_status_waiting: "Next bot in {sec} seconds...",
    batch_status_connecting: "Processing connection..."
  },
  tr: {
    btn_batch_connect: "Tümünü Bağla",
    btn_batch_disconnect: "Tümünü Kes",
    batch_connect_title: "Tüm Hesapları Bağla",
    batch_connect_desc: "IP engellemesini veya proxy limitlerini aşmamak için tüm çevrimdışı bot hesaplarını sırayla 1-60 saniye arası rastgele gecikmelerle bağlar.",
    mode_configured: "Kayıtlı sunucu adreslerini kullan",
    mode_custom: "Tüm hesapları ortak bir sunucu IP'sine bağla",
    btn_connect_all_confirm: "Bağlantıyı Başlat",
    batch_status_waiting: "Sonraki bot için {sec}sn bekleniyor...",
    batch_status_connecting: "Sıradaki bota bağlanılıyor..."
  },
  az: {
    btn_batch_connect: "Hamısını Bağla",
    btn_batch_disconnect: "Hamısını Kəs",
    batch_connect_title: "Bütün Hesabları Bağla",
    batch_connect_desc: "IP məhdudiyyətlərini aşmamaq üçün bütün oflayn bot hesablarını növbə ilə 1-60 saniyəlik təsadüfi gecikmələrlə bağlayır.",
    mode_configured: "Qeyd olunmuş server ünvanlarını istifadə et",
    mode_custom: "Bütün hesabları ortaq bir server IP-nə bağla",
    btn_connect_all_confirm: "Bağlantını Başlat",
    batch_status_waiting: "Növbəti bot üçün {sec}sn gözlənilir...",
    batch_status_connecting: "Növbəti bota bağlanılır..."
  },
  kk: {
    btn_batch_connect: "Барлығын қосу",
    btn_batch_disconnect: "Барлығын өшіру",
    batch_connect_title: "Барлық аккаунттарды қосу",
    batch_connect_desc: "IP шектеулерін болдырмау үшін барлық желіден тыс бот аккаунттарын кезекпен 1-60 секунд кездейсоқ кідіріспен қосады.",
    mode_configured: "Әр аккаунттың бапталған серверін пайдалану",
    mode_custom: "Барлық аккаунтты бір ортақ сервер IP-не қосу",
    btn_connect_all_confirm: "Қосылуды бастау",
    batch_status_waiting: "Келесі бот {sec} секундта...",
    batch_status_connecting: "Қосылуда..."
  },
  ky: {
    btn_batch_connect: "Баарын кошуу",
    btn_batch_disconnect: "Баарын өчүрүү",
    batch_connect_title: "Баардык аккаунттарды кошуу",
    batch_connect_desc: "IP чектөөлөрүн болтурбоо үчүн баардык оффлайн бот аккаунттарын кезек менен 1-60 секунд кокусунан кечигүү менен кошот.",
    mode_configured: "Ар бир аккаунттун жөндөлгөн серверин колдонуу",
    mode_custom: "Баардык аккаунтту бир жалпы сервер IP-не кошуу",
    btn_connect_all_confirm: "Кошулууну баштоо",
    batch_status_waiting: "Кийинки бот {sec} секундда...",
    batch_status_connecting: "Кошулууда..."
  },
  zh: {
    btn_batch_connect: "一键连接全部",
    btn_batch_disconnect: "一键断开全部",
    batch_connect_title: "批量启动全部账号",
    batch_connect_desc: "为了防止IP速率限制，本功能将以1至60秒之间的随机延迟逐一连接所有离线的机器人账号。",
    mode_configured: "使用每个账号单独配置的服务器",
    mode_custom: "将所有账号连接到同一个自定义服务器IP",
    btn_connect_all_confirm: "开始批量连接",
    batch_status_waiting: "{sec} 秒后启动下一个机器人...",
    batch_status_connecting: "正在处理连接..."
  },
  ja: {
    btn_batch_connect: "すべて接続",
    btn_batch_disconnect: "すべて切断",
    batch_connect_title: "すべてのアカウントを一括接続",
    batch_connect_desc: "IP接続制限を回避するため、オフラインのボットアカウントを1〜60秒のランダムな遅延を挟みながら順次接続します。",
    mode_configured: "各アカウントの設定済みサーバーを使用",
    mode_custom: "すべてのアカウントを共通のカスタムサーバーIPに接続",
    btn_connect_all_confirm: "一括接続を開始",
    batch_status_waiting: "次のボットまであと {sec} 秒...",
    batch_status_connecting: "接続処理中..."
  },
  ar: {
    btn_batch_connect: "ربط الجميع",
    btn_batch_disconnect: "فصل الجميع",
    batch_connect_title: "ربط جميع الحسابات دفعة واحدة",
    batch_connect_desc: "سيقوم هذا بربط جميع حسابات البوت غير المتصلة واحدًا تلو الآخر بتأخير عشوائي (1-60 ثانية) لمنع حظر الآي بي.",
    mode_configured: "استخدام خادم كل حساب المكون سابقًا",
    mode_custom: "ربط جميع الحسابات بخادم مخصص واحد",
    btn_connect_all_confirm: "بدء الاتصال الجماعي",
    batch_status_waiting: "البوت التالي بعد {sec} ثانية...",
    batch_status_connecting: "جاري الاتصال..."
  },
  fr: {
    btn_batch_connect: "Tout Connecter",
    btn_batch_disconnect: "Tout Déconnecter",
    batch_connect_title: "Connexion Groupée des Bots",
    batch_connect_desc: "Cela connectera tous les comptes bots hors ligne un par un avec un délai aléatoire (1-60s) pour éviter les limitations d'IP.",
    mode_configured: "Utiliser le serveur configuré de chaque compte",
    mode_custom: "Connecter tous les comptes à un serveur personnalisé unique",
    btn_connect_all_confirm: "Lancer la Connexion",
    batch_status_waiting: "Prochain bot dans {sec} secondes...",
    batch_status_connecting: "Connexion en cours..."
  },
  ru: {
    btn_batch_connect: "Подключить все",
    btn_batch_disconnect: "Отключить все",
    batch_connect_title: "Пакетное подключение ботов",
    batch_connect_desc: "Это подключит все оффлайн аккаунты ботов по одному с произвольной задержкой (1-60 сек.) для предотвращения бана IP.",
    mode_configured: "Использовать настроенные серверы каждого аккаунта",
    mode_custom: "Подключить все аккаунты к единому серверу IP",
    btn_connect_all_confirm: "Запустить подключение",
    batch_status_waiting: "Следующий бот через {sec} сек...",
    batch_status_connecting: "Подключение следующего..."
  },
  de: {
    btn_batch_connect: "Alle verbinden",
    btn_batch_disconnect: "Alle trennen",
    batch_connect_title: "Alle Bots stapelweise verbinden",
    batch_connect_desc: "Verbindet alle Offline-Bot-Accounts nacheinander mit einer zufälligen Verzögerung (1-60s), um IP-Ratenbegrenzungen zu vermeiden.",
    mode_configured: "Konfigurierten Server jedes Accounts nutzen",
    mode_custom: "Alle Accounts mit einer benutzerdefinierten Server-IP verbinden",
    btn_connect_all_confirm: "Verbindung starten",
    batch_status_waiting: "Nächster Bot in {sec} Sekunden...",
    batch_status_connecting: "Verbindung wird hergestellt..."
  }
};

for (const lang in additions) {
  if (translations[lang]) {
    Object.assign(translations[lang], additions[lang]);
  }
}

const newContent = 'const translations = ' + JSON.stringify(translations, null, 2) + ';\n';
fs.writeFileSync(filePath, newContent, 'utf8');
fs.unlinkSync(tempPath);

console.log('Batch action translations added successfully!');
