const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

// ...rest of your existing requires (express, mongoose, etc.)
require("dotenv").config();

const app = require("./app");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 5000;

console.log("MONGO_URI:", process.env.MONGO_URI);

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
