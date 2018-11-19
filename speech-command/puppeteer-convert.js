const pup = require('puppeteer');

if (process.argv.length !== 3) {
  console.log(`Usage: node ${__filename} <DAT_FILES>`);
  process.exit(1);
}

async function run() {
  const browser = await pup.launch();
  const page = await browser.newPage();

  await page.goto(`file://${__dirname}/puppeteer-convert.html`);

  const fileInput = await page.$('#fileInput');
  console.log(fileInput.uploadFile);  // DEBUG
  console.log(process.argv[2]);
  await fileInput.uploadFile(process.argv[2]);;
  //     `${__dirname}/test.txt`, `${__dirname}/test2.txt`);

  // const datFile = process.argv[2];
  // console.log(datFile);  //  DEBUG

  const convertButton = await page.$('#convert');
  await convertButton.click();

  setTimeout(async () => {
    const output = await page.evaluate(() => pageInternalFunction());
    console.log(output.logText);
    browser.close();
  }, 2500);



//   await page.evaluate(() => {
//     const button = document.getElementById('fooButton');
//     console.log(button);  // DEBUG
//   });

  // await page.pdf({
  //   path: 'test.pdf',
  //   format: 'A4',
  //   margin: {
  //     top: "20px",
  //     left: "20px",
  //     right: "20px",
  //     bottom: "20px"
  //   }
  // });


}

run();