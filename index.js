const express = require('express');
const app = express();
const puppeteer = require('puppeteer');

app.use(function(req, res, next) {
    console.log(new Date().toISOString(), req.originalUrl);
    next();
});

// serve the page itself for internal use… beware of routing loops 
app.use(express.static(__dirname + '/page'));

let page;
async function launchBrowser() {
  const browser = await puppeteer.launch({ headless: true });
  page = await browser.newPage();
  await page.goto('http://localhost:3666/page.html');
  // @TODO: wait for Mapbox-GL to be ready and map initialized
}

async function fetchPicture({
  width = 400,
  height = 400,
  center = [0, 0],
  zoom = 3,
} = {}) {
  await page.setViewport({ width, height });
  await page.evaluate(view => {
    document.body.classList.add('loading');
    map.jumpTo(view);
  }, { zoom, center });
  await page.waitFor('body.loading', { hidden: true });
  return await page.screenshot({ format: 'jpg' });  // returns a Buffer
}

function parseQuery(query) {
  return {
    width: query.width ? Number(query.width) : undefined,
    height: query.height ? Number(query.height) : undefined,
    zoom: query.zoom ? Number(query.zoom) : undefined,
    center: (query.center ? query.center.split(',').map(Number) : undefined),
  };
}

const port = process.env.PORT || 3000;
app.listen(port);

launchBrowser().then(() => {
  app.get('/*', (req, res) => {
    const params = parseQuery(req.query);
    fetchPicture(params).then(buffer => {
      res.contentType('image/jpeg');
      res.end(buffer, 'binary');
    })
  });
  console.log('-----\nSite served on http://localhost:' + port + '\n-----');
});
