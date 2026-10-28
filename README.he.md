# BananoClaude Images 🍌

[English](README.md)

**יוצרים תמונות Gemini (Nano Banana) ישירות מתוך Claude Code, על המנוי של Google AI שכבר משלמים עליו.**

אם יש לך מנוי Google AI Pro / Ultra ואתה עובד עם Claude, לא הייתה דרך נוחה ליצור תמונות Gemini דרך Claude. ה-API של Gemini דורש מפתח נפרד וחיוב לפי תמונה. הסקיל הזה פותר את זה: Claude מבקש מה-CLI הרשמי של Antigravity (`agy`) לצייר את התמונה, והעלות יורדת מהמכסה של המנוי. בלי מפתח API, בלי ייצוא טוקנים ובלי חיוב נוסף.

| פרומפט טקסט | פרומפט נוסף |
|---|---|
| <img src="assets/showcase-glass-robot.jpg" width="300"> | <img src="assets/showcase-banana-explainer.jpg" width="420"> |

שתי התמונות נוצרו מ-Claude Code עם הסקיל הזה, על Windows 11.

## איך זה עובד

```
אתה -> Claude Code -> /gemini-image -> סקריפט node -> agy הרשמי (headless) -> generate_image מובנה -> קובץ תמונה בפרויקט
```

- הסקריפט מפעיל רק את `agy` הרשמי. הוא לא קורא את פרטי ההתחברות שלך ל-Google, לא נוגע בעוגיות או בטוקנים, ולא פונה בעצמו לשרתי Google.
- הוא מסיר `GEMINI_API_KEY` / `GOOGLE_API_KEY` מהסביבה, כך ש-`agy` לא יוכל לעבור למצב חיוב API.
- אחרי כל תמונה הוא מדפיס כמה מכסה נשארה (5 שעות ושבועית), ו-Claude מספר לך.

## דרישות

- מנוי Google AI Pro או Ultra (הוא משלם על התמונות).
- [Node.js](https://nodejs.org) גרסה 18 ומעלה.
- ה-CLI של Antigravity, `agy`, מחובר פעם אחת (השלבים למטה).
- Claude Code (עובד גם עם Codex).

## התקנה

### Windows (PowerShell)

```powershell
# 1. התקנת ה-CLI הרשמי של Google, ואז פותחים חלון PowerShell חדש
irm https://antigravity.google/cli/install.ps1 | iex

# 2. התחברות חד-פעמית. עושים את זה בתיקייה קטנה וריקה, לא בתיקיית הבית,
#    כי agy מבקש אישור אמון על התיקייה שבה הוא מופעל.
mkdir $HOME\agy-home; cd $HOME\agy-home
agy            # מתחברים עם Google, בוחרים "Yes, I trust this folder", ויוצאים

# 3. התקנת הסקיל
git clone https://github.com/Amityst12/BananoClaude-Images.git $HOME\BananoClaude-Images
powershell -ExecutionPolicy Bypass -File $HOME\BananoClaude-Images\install.ps1
```

### macOS / Linux

```bash
# מתקינים את agy מ-https://antigravity.google/download, מריצים `agy` פעם אחת בתיקייה ריקה ומתחברים.
git clone https://github.com/Amityst12/BananoClaude-Images.git ~/.local/share/BananoClaude-Images
~/.local/share/BananoClaude-Images/install.sh
```

ההתקנה מחברת את הסקיל ל-`~/.claude/skills` (Claude Code) ול-`~/.agents/skills` (Codex). סקיל קיים באותו שם עובר לגיבוי ולא נמחק. מעדכנים אחר כך עם `git pull`.

אחרי ההתקנה צריך להפעיל מחדש את Claude Code.

**מומלץ:** בהגדרות של Antigravity לשים **AI Credit Overages** על **Never**, כדי שחריגה מהמכסה לא תשתמש בקרדיטים שנרכשו.

## שימוש

פשוט מבקשים מ-Claude:

```
/gemini-image רובוט זכוכית כחול קובלט על רקע לבן-חם, 1:1
/gemini-image אותו רובוט רוכב על אופניים בגשם, פוסטר 9:16
```

או מריצים את הסקריפט ישירות:

```bash
node ~/.claude/skills/gemini-image/scripts/gemini_image.mjs generate \
  --prompt "A glass robot riding a bicycle on a rainy street, 16:9 landscape" \
  --ref robot.png --out generated-images/robot-bike.png

node ~/.claude/skills/gemini-image/scripts/gemini_image.mjs usage     # מכסה שנותרה
```

טיפים:
- את יחס התמונה כותבים בפרומפט במילים ("16:9 landscape", "9:16 vertical").
- תמונת reference עם `--ref` (אפשר כמה) שומרת על דמות או סגנון. כדי לערוך את התוצאה האחרונה, משתמשים בה כ-`--ref`.
- כל תמונה לוקחת כ-40 עד 70 שניות וכ-1% מחלון של 5 שעות.

## שיהיה ש-Claude ישתמש בזה בכל פעם

Claude טוען את הסקיל כשהבקשה שלך מתאימה לתיאור שלו, אבל אפשר להפוך אותו לברירת מחדל לכל בקשת תמונה. מוסיפים את זה ל-`~/.claude/CLAUDE.md` הגלובלי שלך (ב-Windows: `C:\Users\<שם>\.claude\CLAUDE.md`):

```markdown
# Images

When I ask for an image, picture, illustration, avatar or other generated visual, use the `/gemini-image` skill by default.
Do not use other image generators unless I ask for them.
After each image, tell me my remaining quota from the `QUOTA_*` lines.
Diagrams, charts, SVG and UI mockups are not "images" for this rule.
```

מפעילים מחדש את Claude Code. בלי הכלל זה עדיין עובד, אבל אם מחוברים כמה כלי תמונות, Claude עלול לבחור בכלי אחר.

## הערות ל-Windows

המקור נכתב ל-Mac. בפורק הזה נוספו: `install.ps1` (junctions, בלי הרשאות מנהל), איתור `agy.exe` תחת `%LOCALAPPDATA%`, פענוח נתיבי Windows וקריאת גודל תמונה בלי `sips`. בלי `sips` הקובץ נשמר בפורמט ש-`agy` מחזיר (JPEG), גם אם ביקשת `.png`, ותופיע אזהרה.

## מגבלות

- תמונות בלבד. לסרטונים (Veo) אין CLI רשמי למנוי רגיל, ולכן הם לא כלולים.
- המכסות הן של המנוי שלך. שום דבר כאן לא עוקף מגבלות.
- טקסט בתוך תמונות עלול לצאת מעוות, ולפעמים מופיעים שמות מותגים אמיתיים בלי שביקשת. כדאי לבדוק לפני שימוש מסחרי.
- אין תמיכה ברקע שקוף.
- נבדק על Windows 11 עם `agy` 1.4.9 ו-Node 22. את הנתיב של macOS לא בדקתי מחדש.
- זה פרויקט קהילתי לא רשמי, ללא קשר ל-Google או ל-Anthropic.

## קרדיט ורישיון

מבוסס על [inyounglee-datapopcorn/gemini-media-skill](https://github.com/inyounglee-datapopcorn/gemini-media-skill) (MIT, Inyoung Lee / DataPopcorn). בפורק הזה הוסר חלק הסרטונים ונוספו תמיכה ב-Windows ודיווח מכסה. רישיון MIT, ראו [LICENSE](LICENSE).
