const pup = require('puppeteer');

async function run() {
  const browser = await pup.launch();
  const page = await browser.newPage();

  await page.goto(`file://${__dirname}/puppeteer-convert.html`);

  const fileInput = await page.$('#fileInput');
  console.log(fileInput.uploadFile);
  await fileInput.uploadFile(
      `${__dirname}/test.txt`, `${__dirname}/test2.txt`);

  const button = await page.$('#fooButton');
  await button.click();

  console.log(await page.evaluate(() => pageInternalFunction()));

//   await page.evaluate(() => {
//     const button = document.getElementById('fooButton');
//     console.log(button);  // DEBUG
//   });

  await page.pdf({
    path: 'test.pdf',
    format: 'A4',
    margin: {
      top: "20px",
      left: "20px",
      right: "20px",
      bottom: "20px"
    }
  });

  browser.close();
}

run();