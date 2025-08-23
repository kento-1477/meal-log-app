const app = require('./server');
const { initializeDatabase } = require('./services/db-init');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

/**
 * Starts the application.
 * Initializes the database and then starts the Express server.
 */
async function startApp() {
  // Ensure the database schema is up-to-date before starting the server.
  await initializeDatabase();

  app.listen(PORT, HOST, () => {
    console.log(`Server listening on ${HOST}:${PORT}`);
  });
}

startApp();
