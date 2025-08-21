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
    } catch (_e) {
      return done(_e);
    }
  };

  passport.use(new LocalStrategy({ usernameField: 'email' }, authenticateUser));
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      const { rows } = await pool.query(
        'SELECT id, email, username FROM users WHERE id = $1',
        [id],
      );
      const user = rows[0];
      if (!user) {
        console.warn('[auth] deserializeUser: user not found for id=', id);
        // 古い/破損セッション。未ログインとして扱う
        return done(null, false);
      }
      return done(null, user);
    } catch (_e) {
      return done(_e);
    }
  });
}

module.exports = { initialize };
