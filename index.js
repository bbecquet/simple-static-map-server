const express = require('express');
const app = express();
const puppeteer = require('puppeteer');

const port = process.env.PORT || 3000;

app.use(function(req, res, next) {
    console.log(new Date().toISOString(), req.originalUrl);
    next();
});

// serve the page itself for internal use… beware of routing loops 
app.use(express.static(__dirname + '/page'));

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
  await page.goto(`http://localhost:${port}/page.html`);
}

async function fetchPicture({ width, height, center, zoom, type }) {
  await page.setViewport({ width, height });
  await page.evaluate(view => {
    document.body.classList.add('loading');
    map.jumpTo(view);
  }, { zoom, center });
  await page.waitFor('body.loading', { hidden: true });
  return await page.screenshot({ type });  // returns a Buffer
}

const mimeTypes = {
  'jpeg': 'image/jpeg',
  'png': 'image/png',
}
function parseQuery(query) {
  return {
    width: query.width ? Number(query.width) : 400,
    height: query.height ? Number(query.height) : 400,
    zoom: query.zoom ? Number(query.zoom) : 3,
    center: (query.center ? query.center.split(',').map(Number) : [0, 0]),
    type: Object.keys(mimeTypes).includes(query.type) ? query.type : 'jpeg',
  };
}

app.listen(port);

launchBrowser().then(() => {
  app.get('/*', (req, res) => {
    const params = parseQuery(req.query);
    fetchPicture(params).then(buffer => {
      res.contentType(mimeTypes[params.type]);
      res.end(buffer, 'binary');
    })
  });
  console.log('-----\nSite served on http://localhost:' + port + '\n-----');
});
