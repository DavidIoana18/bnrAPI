const express = require('express'); // Importing the Express framework
const axios = require('axios'); // Importing the Axios library for making HTTP requests
const fs = require('fs'); // Importing the File System module for working with files
const xml2js = require('xml2js'); // Importing the XML to JSON parser library
const parser = new xml2js.Parser({ attrkey: "ATTR" }); // Creating an instance of the XML parser
const { google } = require('googleapis'); // Importing the Google APIs library
const keys = require('./bnrr-386920-c0b1c551f750.json'); // Importing Google Drive API credentials
const sqlite3 = require('sqlite3').verbose(); // Importing the SQLite library

const jwt = require('jsonwebtoken'); // Importing the JSON Web Token library
const bcrypt = require('bcrypt'); // Importing the bcrypt library for password hashing
const SECRET = 'secret-key'; // Secret key used for JWT signing
const expressJwt = require('express-jwt'); // Middleware for validating JWT tokens

const db = new sqlite3.Database('./db.sqlite', (err) => { // Creating a SQLite database connection
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the SQLite database.');
});

// Creating database tables if they don't exist and inserting a test user
db.serialize(() => {
  db.run('CREATE TABLE IF NOT EXISTS currency_values (currency TEXT, rate REAL, date TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS currency_configs (currency TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS currency_analytics (currency TEXT, count INTEGER)');
  db.run('CREATE TABLE IF NOT EXISTS users (username TEXT, password TEXT)');
  db.run("INSERT INTO users VALUES ('test', ?)", bcrypt.hashSync('test', 10));
});

const app = express(); // Creating an instance of the Express application
app.use(express.json()); // Middleware to parse JSON requests

let savedCurrencies = []; // Variable to store configured currencies

// Handling user login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  // Checking if the username and password match the stored user
  db.get('SELECT password FROM users WHERE username = ?', username, (err, row) => {
      if (err || !row || !bcrypt.compareSync(password, row.password)) {
          return res.status(401).json({ error: 'Invalid username or password' });
      }
      // Generating a JWT token with the username and sending it in the response
      const token = jwt.sign({ username }, SECRET, { expiresIn: '24h' });
      res.json({ token });
  });
});

// Handling analytics endpoint, requires a valid JWT token
app.get('/analytics', expressJwt({ secret: SECRET, algorithms: ['HS256'] }), (req, res) => {
  // Retrieving all rows from the currency_analytics table
  db.all('SELECT * FROM currency_values', (err, rows) => { //currency_analytics
      if (err) {
          return res.status(500).json({ error: 'Failed to retrieve analytics' });
      }
      res.json(rows);
  });
});

// Handling currencies endpoint with a specific date
app.get('/currencies/:date', async (req, res) => {
    const { data } = await axios.get('https://www.bnr.ro/nbrfxrates.xml');
    // Parsing the XML response to JSON
    parser.parseString(data, function (err, result) {
        const date = result.DataSet.Body[0].Cube[0].ATTR.date;
        if (date !== req.params.date) {
            return res.status(400).json({ error: 'No data available for this date' });
        }
        const rates = result.DataSet.Body[0].Cube[0].Rate;
        let currencies = {};
        rates.forEach(rate => {
            currencies[rate.ATTR.currency] = rate._;
            // Inserting currency values into the currency_values table
            const stmt = db.prepare('INSERT INTO currency_values VALUES (?, ?, ?)');
            stmt.run(rate.ATTR.currency, rate._, date);
            stmt.finalize();
        });
        res.json(currencies);
    });
});

// Handling configuration of currencies
app.post('/configure-currencies', async (req, res) => {
    const { currencies } = req.body;
    savedCurrencies = currencies;
    // Inserting configured currencies into the currency_configs table
    const stmt = db.prepare('INSERT INTO currency_configs VALUES (?)');
    currencies.forEach((currency) => {
        stmt.run(currency);
    });
    stmt.finalize();
    res.json({ message: 'Currencies configured successfully' });
});

// Schedule task to run every 1 minute
setInterval(async () => {
    const { data } = await axios.get('https://www.bnr.ro/nbrfxrates.xml');
    // Parsing the XML response to JSON
    parser.parseString(data, function (err, result) {
        const date = result.DataSet.Body[0].Cube[0].ATTR.date;
        const rates = result.DataSet.Body[0].Cube[0].Rate;
        let currencies = {};
        rates.forEach(rate => {
            if (savedCurrencies.includes(rate.ATTR.currency)) {
                currencies[rate.ATTR.currency] = rate._;
                // Inserting currency values into the currency_values table
                const stmt = db.prepare('INSERT INTO currency_values VALUES (?, ?, ?)');
                stmt.run(rate.ATTR.currency, rate._, date);
                stmt.finalize();
            }
        });
        // Writing currencies to a JSON file and uploading to Google Drive
        fs.writeFile('currencies.json', JSON.stringify(currencies), (err) => {
            if (err) throw err;
            writeToGoogleDrive('currencies.json', 'currencies.json');
        });
    });
}, 60 * 1000); // Interval set to 1 minute (60 seconds)

// Starting the server on port 3000
app.listen(3000, () => console.log('Server started on port 3000'));

// Function to write a file to Google Drive
function writeToGoogleDrive(localFilePath, fileName) {
  const client = google.auth.fromJSON(keys);
  client.scopes = ['https://www.googleapis.com/auth/drive'];
  const drive = google.drive({ version: 'v3', auth: client });
  const fileMetadata = {
    'name': fileName,
    'parents': ['1TxVBdYTewXr3YRHqPXI67WlZtGUbrjEy'] // ID of the parent folder in Google Drive
  };
  const media = {
    mimeType: 'application/json',
    body: fs.createReadStream(localFilePath)
  };
  // Creating the file in Google Drive
  drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id'
  }, function (err, file) {
    if (err) {
      console.error(err);
    } else {
      console.log('File Id: ', file.id);
      // Deleting the local file after upload
      //fs.unlinkSync(localFilePath);
    }
  });
}
