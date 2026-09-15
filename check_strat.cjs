const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('data/bot.db');
db.get("SELECT value FROM store WHERE key = 'settings'", (err, row) => {
  if (row) {
    console.log(JSON.parse(row.value).activeStrategy);
  } else {
    console.log("No settings found");
  }
});
