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
  return await Promise.all(styles.map(style => launchStyleTab(browser, style)));
}

const getPage = (tabs, styleName) => {
  let tab = tabs.find(tab => tab.name === styleName);
  if (!tab) {
    console.warn(`Unknown style name '${styleName}'. Fallback to first style '${tabs[0].name}'.`);
    tab = tabs[0];
  }
  return tab.page;
}

async function fetchPicture(page, { width, height, center, zoom, type, timeout }) {
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
    return { error };
  }
  try {
    await page.waitForSelector('body.loading', { hidden: true, timeout });
  } catch {
    return { error: `Timeout exceeded (${timeout}ms)` };
  }
  const scrShot = await page.screenshot({ type });  // returns a Buffer
  return { buffer: scrShot };
}

const mimeTypes = {
  'jpeg': 'image/jpeg',
  'png': 'image/png',
}

function parseQuery(query, styleNames) {
  return {
    width: Number(query.width) || 400,
    height: Number(query.height) || 400,
    zoom: Number(query.zoom) || 3,
    center: query.center ? query.center.split(',').map(Number) : [0, 0],
    type: Object.keys(mimeTypes).includes(query.type) ? query.type : 'png',
    style: query.style || styleNames[0],
    timeout: Number(query.timeout) || 30000,
  };
}

app.listen(port);

parseMapStyles()
  .then(launchBrowser)
  .then(tabs => {
    app.get('/map', (req, res) => {
      const styleNames = tabs.map(tab => tab.name);
      const params = parseQuery(req.query, styleNames);
      const tab = getPage(tabs, params.style);

      fetchPicture(tab, params).then(({ error, buffer }) => {
        if (error) {
          res
            .status(400)
            .send(error);
        } else {
          res
            .contentType(mimeTypes[params.type])
            .end(buffer, 'binary');
        }
      })
    });
  })
  .then(() => {
    console.log('-----\nSite served on http://localhost:' + port + '\n-----');
  });
