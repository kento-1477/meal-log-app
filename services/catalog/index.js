const { searchFoods } = require('./search/searchFoods');
const { ingestOffSnapshot } = require('./ingest/offSnapshot');

module.exports = {
  searchFoods,
  ingestOffSnapshot,
};
