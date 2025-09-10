const client = require('prom-client');

module.exports.aiRawParseFail = new client.Counter({
  name: 'ai_raw_parse_failed_count',
  help: 'ai_raw parse failure count',
});

module.exports.chooseSlotMismatch = new client.Counter({
  name: 'choose_slot_returning_mismatch_count',
  help: 'choose-slot RETURNING != computed payload',
});
