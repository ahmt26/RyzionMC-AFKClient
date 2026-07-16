const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/translations.js');
let content = fs.readFileSync(filePath, 'utf8');

// Temporarily expose module.exports to evaluate it
const evalCode = content + '\nmodule.exports = translations;';

// Write a temp file to require it
const tempPath = path.join(__dirname, 'temp_translations.js');
fs.writeFileSync(tempPath, evalCode, 'utf8');

const translations = require('./temp_translations.js');

const additions = {
  en: {
    section_panel_settings: "Dashboard Settings",
    section_ai_settings: "AI API Settings"
  },
  tr: {
    section_panel_settings: "Panel Ayarları",
    section_ai_settings: "AI API Ayarları"
  },
  az: {
    section_panel_settings: "Panel Parametrləri",
    section_ai_settings: "AI API Parametrləri"
  },
  kk: {
    section_panel_settings: "Панель Баптаулары",
    section_ai_settings: "AI API Баптаулары"
  },
  ky: {
    section_panel_settings: "Панель Орнотуулары",
    section_ai_settings: "AI API Орнотуулары"
  },
  zh: {
    section_panel_settings: "控制台设置",
    section_ai_settings: "AI API 设置"
  },
  ja: {
    section_panel_settings: "パネル設定",
    section_ai_settings: "AI API設定"
  },
  ar: {
    section_panel_settings: "إعدادات لوحة التحكم",
    section_ai_settings: "إعدادات واجهات برمجة تطبيقات الذكاء الاصطناعي"
  },
  fr: {
    section_panel_settings: "Paramètres du Panel",
    section_ai_settings: "Paramètres des API d'IA"
  },
  ru: {
    section_panel_settings: "Настройки Панели",
    section_ai_settings: "Настройки AI API"
  },
  de: {
    section_panel_settings: "Panel-Einstellungen",
    section_ai_settings: "AI-API-Einstellungen"
  }
};

// Update keys
for (const lang in additions) {
  if (translations[lang]) {
    translations[lang].section_panel_settings = additions[lang].section_panel_settings;
    translations[lang].section_ai_settings = additions[lang].section_ai_settings;
  }
}

// Format the new file cleanly
const newContent = 'const translations = ' + JSON.stringify(translations, null, 2) + ';\n';
fs.writeFileSync(filePath, newContent, 'utf8');

// Cleanup
fs.unlinkSync(tempPath);
console.log('Translations updated successfully!');
