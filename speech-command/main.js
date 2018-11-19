const pup = require('puppeteer');

async function run() {
  const browser = await pup.launch();
  const page = await browser.newPage();

  await page.goto('file:///usr/local/google/home/cais/tf-scratch/puppeteer/test.html');

  const fileInput = await page.$('#fileInput');
  console.log(fileInput.uploadFile);
  await fileInput.uploadFile(
      '/usr/local/google/home/cais/tf-scratch/puppeteer/test.txt',
      '/usr/local/google/home/cais/tf-scratch/puppeteer/test2.txt');

  const button = await page.$('#fooButton');
  await button.click();

  console.log(await page.evaluate(() => pageInternalFunction()));
  
//   await page.evaluate(() => {
//     const button = document.getElementById('fooButton');
//     console.log(button);  // DEBUG
//   });

//   await page.screenshot({path: 'screenshot_1.png'});
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