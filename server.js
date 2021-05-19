require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const mongoose = require('mongoose');
const dns = require('dns');
const parser= require('body-parser');

// Basic Configuration
const port = process.env.PORT || 3000;

// mongoose connection
mongoose.connect(process.env['MGDB_CON'], {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false,
  useCreateIndex: true
});

// Check db connection. (Remove if it causes issues?)
// Boilerplate from mongoosejs.com
const db = mongoose.connection;
// Log error if we don't connect.
db.on('error', console.error.bind(console, 'connection error:'));
// Report if connection successful.
db.once('open', function() {
  console.log('Connection opened successfully.')
});

// Schema used to store shortened URLS as keys for long URLS.
const urlSchema = new mongoose.Schema({
  shortURL: { type: String, unique: true },
  longURL: { type: String, unique: true }
});

// Model for the schema
const URLModel = mongoose.model('url', urlSchema);

// Initialize model in database to ensure unique values recognized.
URLModel.init().then(() => console.log("Model initialized"));

// URL shortener routine
// return random string of numbers and lower case letters
urlShortener = () => Math.random().toString(36).slice(2, 7);

app.use(cors());
let bodyParser = parser.urlencoded({extended:false});

app.use('/public', express.static(`${process.cwd()}/public`));

app.get('/', function(req, res) {
  res.sendFile(process.cwd() + '/views/index.html');
});

// Your first API endpoint
app.get('/api/hello', function(req, res) {
  res.json({ greeting: 'hello API' });
});

app.post('/api/shorturl/', bodyParser, (req, res, next) => {
  console.log("Entered POST");
  let longFormURL = req.body.url; // Original shape 

  // Parse URL for use in DNS lookup.
  let urlParser = /^https?:\/\/([^\/]+)\/?/
  let parsedURL = urlParser.exec(req.body.url)
  let originalURL = parsedURL ? urlParser.exec(req.body.url)[1] : null;

  // Late init variable for storing the shortened URL.
  let shortenedURL;

  // If not valid from the outset, return error.
  if (!originalURL) {     
    console.log("Invalid URL. Must be in the format: https://example.com; or: http://example.com");
    res.json({ error: 'invalid url' });
  } else {
    console.log("Original URL: " + longFormURL + "\nParsed URL: " + originalURL);

    // Validate address with a dns lookup.
    dns.lookup(originalURL, (err, host, serv) => {
      if (err) { 
        console.log("Invalid DNS lookup for: " + originalURL);
        res.json({ error: 'invalid url'});
      } else {
        createNewEntry();
      }
    });

    function createNewEntry() {
      // Generate shortened URL.
      shortenedURL = urlShortener();
      console.log(originalURL + " -> " + shortenedURL);
      
      // Check for collisions (two identical shortened URLs). Create new shortened URL until an unusued one is found.
      // TODO Handle error?
      let collision = false;
      do {
        console.log("Checking for collisions for shortened URL.")
        URLModel.findOne({ shortURL: shortenedURL }, (err, result) => {
          if (result) {
            shortenedURL = urlShortener();
            collision = true;
          }
        }); 
      } while (collision);
      
      // After finding an unusued shortened URL, add to db and save.
      let newEntry = new URLModel({ shortURL: shortenedURL, longURL: longFormURL });
      // Attempt to save entry. If an error results, check if it is due to a duplicate existing.
      // If there is a duplicate, return it. If there is another error, show that there was an error.
      // TODO Duplicates are creating errors and preventing the data from being overwritten, but they 
      newEntry.save((err) => {
        checkError(err);
      });

      function checkError(saveErr) {
        if (saveErr) {
          // If there was some other error, log.
          console.log("Error on save.")
          if (saveErr.code == 11000) {
          console.log("Duplicate entry; returning existing entry.");
          URLModel.findOne({ longURL: longFormURL }, (err, result) => {
            if (err) {
              console.log("Error on lookup.")
              next();
            } else {
              res.json({ original_url: result.longURL, short_url: result.shortURL });
            }
          });
          }
        } else {
          // return json version of what was saved.
          console.log("Save successful")
          res.json({ original_url: longFormURL, short_url: shortenedURL });
        }
      }
    }
  }
});

app.get('/api/shorturl/:shorturl', (req, res, next) => {
  let shortenedURL = req.params.shorturl;

  // Look up stored value and return longURL, append "https://" ot front and "/" to end and redirect to URL.
  URLModel.findOne({ shortURL: shortenedURL }, (err, result) => {
    if (!result) {
      res.json({ error: 'invalid url' })
    } else {
      res.redirect(result.longURL);
    }
  });
});

app.listen(port, function() {
  console.log(`Listening on port ${port}`);
});
