const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/translations.js');
let content = fs.readFileSync(filePath, 'utf8');

// Temporarily expose module.exports to evaluate it
const evalCode = content + '\nmodule.exports = translations;';

const tempPath = path.join(__dirname, 'temp_translations.js');
fs.writeFileSync(tempPath, evalCode, 'utf8');

const translations = require('./temp_translations.js');

const additions = {
  en: {
    coordinates_label: "Coordinates",
    dimension_label: "Dimension",
    minimap_title: "Minimap Radar",
    movement_controls_title: "Movement Controls",
    control_forward: "Forward",
    control_left: "Left",
    control_back: "Back",
    control_right: "Right",
    control_jump: "Jump",
    control_sneak: "Sneak",
    dimension_overworld: "Overworld",
    dimension_nether: "Nether",
    dimension_end: "The End",
    entity_player: "Player",
    entity_friendly: "Friendly",
    entity_hostile: "Hostile"
  },
  tr: {
    coordinates_label: "Koordinatlar",
    dimension_label: "Dünya (Boyut)",
    minimap_title: "Mini Harita Radarı",
    movement_controls_title: "Hareket Kontrolleri",
    control_forward: "İleri",
    control_left: "Sol",
    control_back: "Geri",
    control_right: "Sağ",
    control_jump: "Zıpla",
    control_sneak: "Eğil",
    dimension_overworld: "Overworld",
    dimension_nether: "Nether",
    dimension_end: "The End (Son)",
    entity_player: "Oyuncu",
    entity_friendly: "Dost Mob",
    entity_hostile: "Düşman Mob"
  },
  az: {
    coordinates_label: "Koordinatlar",
    dimension_label: "Dünya (Ölçü)",
    minimap_title: "Mini Xəritə Radarı",
    movement_controls_title: "Hərəkət Nəzarəti",
    control_forward: "İrəli",
    control_left: "Sol",
    control_back: "Geri",
    control_right: "Sağ",
    control_jump: "Tullan",
    control_sneak: "Əyil",
    dimension_overworld: "Overworld (Dünya)",
    dimension_nether: "Nether (Cəhənnəm)",
    dimension_end: "The End (Son)",
    entity_player: "Oyunçu",
    entity_friendly: "Dost Canlı",
    entity_hostile: "Düşmən Canlı"
  },
  kk: {
    coordinates_label: "Координаттар",
    dimension_label: "Өлшем (Әлем)",
    minimap_title: "Шағын Карта Радары",
    movement_controls_title: "Қозғалысты Басқару",
    control_forward: "Алға",
    control_left: "Солға",
    control_back: "Артқа",
    control_right: "Оңға",
    control_jump: "Секіру",
    control_sneak: "Еңкею",
    dimension_overworld: "Overworld (Әлем)",
    dimension_nether: "Nether (Тозақ)",
    dimension_end: "The End (Шеткі әлем)",
    entity_player: "Ойыншы",
    entity_friendly: "Дос Моб",
    entity_hostile: "Жау Моб"
  },
  ky: {
    coordinates_label: "Координаттар",
    dimension_label: "Өлчөм (Дүйнө)",
    minimap_title: "Кичи Карта Радары",
    movement_controls_title: "Кыймылды Башкаруу",
    control_forward: "Алга",
    control_left: "Солго",
    control_back: "Артка",
    control_right: "Оңго",
    control_jump: "Секирүү",
    control_sneak: "Эңкейүү",
    dimension_overworld: "Overworld (Дүйнө)",
    dimension_nether: "Nether (Тозок)",
    dimension_end: "The End (Акыркы дүйнө)",
    entity_player: "Оюнчу",
    entity_friendly: "Дос Моб",
    entity_hostile: "Душман Моб"
  },
  zh: {
    coordinates_label: "坐标位置",
    dimension_label: "当前维度",
    minimap_title: "小地图雷达",
    movement_controls_title: "移动控制面板",
    control_forward: "前进",
    control_left: "向左",
    control_back: "后退",
    control_right: "向右",
    control_jump: "跳跃",
    control_sneak: "潜行/蹲下",
    dimension_overworld: "主世界",
    dimension_nether: "下界/地狱",
    dimension_end: "末地",
    entity_player: "玩家",
    entity_friendly: "友好生物",
    entity_hostile: "敌对生物"
  },
  ja: {
    coordinates_label: "現在座標",
    dimension_label: "ディメンション",
    minimap_title: "ミニマップレーダー",
    movement_controls_title: "移動コントロール",
    control_forward: "前進",
    control_left: "左移動",
    control_back: "後退",
    control_right: "右移動",
    control_jump: "ジャンプ",
    control_sneak: "スニーク",
    dimension_overworld: "オーバーワールド",
    dimension_nether: "ネザー",
    dimension_end: "ジ・エンド",
    entity_player: "プレイヤー",
    entity_friendly: "友好Mob",
    entity_hostile: "敌対Mob"
  },
  ar: {
    coordinates_label: "الإحداثيات",
    dimension_label: "البعد",
    minimap_title: "رادار الخريطة المصغرة",
    movement_controls_title: "عناصر التحكم في الحركة",
    control_forward: "أمام",
    control_left: "يسار",
    control_back: "خلف",
    control_right: "يمين",
    control_jump: "قفز",
    control_sneak: "انحناء",
    dimension_overworld: "العالم العادي",
    dimension_nether: "النذر",
    dimension_end: "النهاية",
    entity_player: "لاعب",
    entity_friendly: "كائن أليف",
    entity_hostile: "كائن معادي"
  },
  fr: {
    coordinates_label: "Coordonnées",
    dimension_label: "Dimension",
    minimap_title: "Minicarte Radar",
    movement_controls_title: "Contrôles de Mouvement",
    control_forward: "Avancer",
    control_left: "Gauche",
    control_back: "Reculer",
    control_right: "Droite",
    control_jump: "Sauter",
    control_sneak: "S'accroupir",
    dimension_overworld: "Monde Normal",
    dimension_nether: "Nether",
    dimension_end: "L'End",
    entity_player: "Joueur",
    entity_friendly: "Créature Amicale",
    entity_hostile: "Créature Hostile"
  },
  ru: {
    coordinates_label: "Координаты",
    dimension_label: "Измерение",
    minimap_title: "Миникарта Радар",
    movement_controls_title: "Управление Движением",
    control_forward: "Вперед",
    control_left: "Влево",
    control_back: "Назад",
    control_right: "Вправо",
    control_jump: "Прыжок",
    control_sneak: "Присесть",
    dimension_overworld: "Обычный мир",
    dimension_nether: "Недры",
    dimension_end: "Край",
    entity_player: "Игрок",
    entity_friendly: "Мирный моб",
    entity_hostile: "Враждебный моб"
  },
  de: {
    coordinates_label: "Koordinaten",
    dimension_label: "Dimension",
    minimap_title: "Minimap Radar",
    movement_controls_title: "Bewegungssteuerung",
    control_forward: "Vorwärts",
    control_left: "Links",
    control_back: "Rückwärts",
    control_right: "Rechts",
    control_jump: "Springen",
    control_sneak: "Schleichen",
    dimension_overworld: "Oberwelt",
    dimension_nether: "Nether",
    dimension_end: "Das Ende",
    entity_player: "Spieler",
    entity_friendly: "Freundlich",
    entity_hostile: "Feindlich"
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

console.log('Telemetry and movement translations added successfully!');
