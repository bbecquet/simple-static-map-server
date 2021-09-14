const express = require('express');
const app = express();
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;

app.set('views', './views');
app.set('view engine', 'pug');

app.use(function(req, res, next) {
    console.log(new Date().toISOString(), req.originalUrl);
    next();
});

// serve the page itself for internal use… beware of routing loops 
app.use(express.static(__dirname + '/page'));

app.get('/map.html', function (req, res) {
  res.render('map', {
    attribution: 'Qwant Maps © OpenMapTiles © OSM contributors',
  });
})

let page;
async function launchBrowser() {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--headless',
      '--hide-scrollbars',
      '--mute-audio',
      '--use-gl=egl',
    ]
  });
  page = await browser.newPage();
  await page.goto(`http://localhost:${port}/map.html`);
}

const errorImage = fs.readFileSync(path.join(__dirname, 'imgs/error.png'));
async function fetchPicture({ width, height, center, zoom, type }) {
  await page.setViewport({ width, height });
  const error = await page.evaluate(view => {
    document.body.classList.add('loading');
    try {
      // will throw an exception if center coordinates are invalid
      map.jumpTo(view);
      return null;
    } catch {
      document.body.classList.remove('loading');
      return 'Error, check the query parameters.'
    }
  }, { zoom, center });
  if (error) {
    return { error, buffer: errorImage };
  }
  await page.waitForSelector('body.loading', { hidden: true });
  const scrShot = await page.screenshot({ type });  // returns a Buffer
  return { buffer: scrShot };
}

const mimeTypes = {
  'jpeg': 'image/jpeg',
  'png': 'image/png',
}

function parseQuery(query) {
  return {
    width: Number(query.width) || 400,
    height: Number(query.height) || 400,
    zoom: Number(query.zoom) || 3,
    center: query.center ? query.center.split(',').map(Number) : [0, 0],
    type: Object.keys(mimeTypes).includes(query.type) ? query.type : 'png',
  };
}

app.listen(port);

launchBrowser().then(() => {
  app.get('/*', (req, res) => {
    const params = parseQuery(req.query);
    fetchPicture(params).then(({ error, buffer }) => {
      if (error) {
        res
          .status(400)
          .contentType(mimeTypes[params.type])
          .end(buffer, 'binary');
      } else {
        res
          .contentType(mimeTypes[params.type])
          .end(buffer, 'binary');
      }
    })
  });
  console.log('-----\nSite served on http://localhost:' + port + '\n-----');
});
