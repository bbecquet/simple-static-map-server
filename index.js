const express = require('express');
const app = express();
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;

app.use(function(req, res, next) {
    console.log(new Date().toISOString(), req.originalUrl);
    next();
});

// serve the page itself for internal use… beware of routing loops 
app.use(express.static(__dirname + '/page'));

function parseMapStyles() {
  return new Promise((resolve, reject) => { 
    fs.readFile(path.join(__dirname, 'mapstyles.json'), (error, json) => {
      if (error) reject(error);
      else resolve(JSON.parse(json));
    });
  });
}

async function launchStyleTab(browser, { name, styleUrl, attribution }) {
  console.log(` - ${name}`);
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/map.html`);
  await page.evaluate(({ styleUrl, attribution }) => {
    map.setStyle(styleUrl);
    document.getElementById('attribution').innerHTML = attribution;
  }, { styleUrl, attribution });
  return { name, page };
}

let tabs;
async function launchBrowser(styles) {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--headless',
      '--hide-scrollbars',
      '--mute-audio',
      '--use-gl=egl',
    ]
  });
  console.log('Preparing tabs for styles…')
  tabs = await Promise.all(styles.map(style => launchStyleTab(browser, style)));
}

const getPage = styleName => {
  let tab = tabs.find(tab => tab.name === styleName);
  if (!tab) {
    console.warn(`Unknown style name '${styleName}'. Fallback to first style '${tabs[0].name}'.`);
    tab = tabs[0];
  }
  return tab.page;
}

const errorImage = fs.readFileSync(path.join(__dirname, 'imgs/error.png'));
async function fetchPicture({ width, height, center, zoom, type, style }) {
  const page = getPage(style);
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

function parseQuery(query, styles) {
  return {
    width: Number(query.width) || 400,
    height: Number(query.height) || 400,
    zoom: Number(query.zoom) || 3,
    center: query.center ? query.center.split(',').map(Number) : [0, 0],
    type: Object.keys(mimeTypes).includes(query.type) ? query.type : 'png',
    style: query.style || styles[0].name,
  };
}

app.listen(port);

parseMapStyles()
  .then(styles => {
    launchBrowser(styles)
    .then(() => {
      app.get('/*', (req, res) => {
        const params = parseQuery(req.query, styles);
        fetchPicture(params).then(({ error, buffer }) => {
          if (error) {
            res
              .status(400)
              .contentType('png')
              .end(buffer, 'binary');
          } else {
            res
              .contentType(mimeTypes[params.type])
              .end(buffer, 'binary');
          }
        })
      });
      console.log('-----\nSite served on http://localhost:' + port + '\n-----');
    })
  });
