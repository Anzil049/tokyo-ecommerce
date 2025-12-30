const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');


passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/api/auth/google/callback"
},
  async (accessToken, refreshToken, profile, done) => {
    try {

      // 1. Check if user already exists
      let user = await User.findOne({ email: profile.emails[0].value });

      if (user) {
        if (!user.googleId) {
          user.googleId = profile.id;
          if (!user.isVerified) user.isVerified = true;
          await user.save();
        }
        return done(null, user);
      }

      // 2. CALCULATE NAME (Bulletproof)
      // Checks Display Name -> Then First Name -> Defaults to "Google User"
      let finalName = "Google User";

      if (profile.displayName && profile.displayName.trim().length > 0) {
        finalName = profile.displayName;
      } else if (profile.name && profile.name.givenName) {
        finalName = profile.name.givenName;
      }

      // 3. Create User
      user = await User.create({
        name: finalName, // <--- MUST use the variable 'finalName'
        email: profile.emails[0].value,
        googleId: profile.id,
        isVerified: true,
        password: "GOOGLE_AUTH_" + Math.random().toString(36).slice(-8) + Date.now()
      });

      return done(null, user);

    } catch (err) {
      console.error("Google Auth Error:", err);
      return done(err, null);
    }
  }

));


module.exports = passport;