const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');

function initialize(passport, pool) {
  const authenticateUser = async (email, password, done) => {
    try {
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [
        email,
      ]);
      const user = result.rows[0];

      if (!user) {
        return done(null, false, { message: 'No user with that email' });
      }

      if (await bcrypt.compare(password, user.password_hash)) {
        return done(null, user);
      } else {
        return done(null, false, { message: 'Password incorrect' });
      }
    } catch (e) {
      return done(e);
    }
  };

  passport.use(new LocalStrategy({ usernameField: 'email' }, authenticateUser));
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [
        id,
      ]);
      return done(null, result.rows[0]);
    } catch (e) {
      return done(e);
    }
  });
}

module.exports = { initialize };
