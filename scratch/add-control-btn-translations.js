const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/translations.js');
let content = fs.readFileSync(filePath, 'utf8');

const evalCode = content + '\nmodule.exports = translations;';
const tempPath = path.join(__dirname, 'temp_translations2.js');
fs.writeFileSync(tempPath, evalCode, 'utf8');

const translations = require('./temp_translations2.js');

const additions = {
  en: { btn_control_bot: "Control & Radar", control_self: "Self" },
  tr: { btn_control_bot: "Kontrol & Radar", control_self: "Kendisi" },
  az: { btn_control_bot: "Nəzarət & Radar", control_self: "Özü" },
  kk: { btn_control_bot: "Басқару және Радар", control_self: "Өзі" },
  ky: { btn_control_bot: "Башкаруу жана Радар", control_self: "Өзү" },
  zh: { btn_control_bot: "控制与雷达", control_self: "自身" },
  ja: { btn_control_bot: "操作 & レーダー", control_self: "自分" },
  ar: { btn_control_bot: "التحكم والرادار", control_self: "البوت" },
  fr: { btn_control_bot: "Contrôle & Radar", control_self: "Soi-même" },
  ru: { btn_control_bot: "Управление и Радар", control_self: "Бот" },
  de: { btn_control_bot: "Steuerung & Radar", control_self: "Selbst" }
};

for (const lang in additions) {
  if (translations[lang]) {
    Object.assign(translations[lang], additions[lang]);
  }
}

const newContent = 'const translations = ' + JSON.stringify(translations, null, 2) + ';\n';
fs.writeFileSync(filePath, newContent, 'utf8');
fs.unlinkSync(tempPath);

console.log('Translations for control button added successfully!');
