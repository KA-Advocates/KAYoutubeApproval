require('chromedriver')
var { Builder, By, until } = require('selenium-webdriver')
var chrome = require('selenium-webdriver/chrome')

const parse = require('csv-parse/lib/sync')
const fs = require('fs')
const ExcelJS = require('exceljs');

const CONFIG = './config.csv'
const LANGUAGE = 'bg'

class SeleniumScraper {
  async init(headless) {
    console.log('Initializing driver')
    let options = new chrome.Options()
      .addArguments('--disable-gpu')
      .addArguments('--disable-extensions')
      // .addArguments('--log-level=3')
      .addArguments('--no-sandbox')
      // .windowSize(screen)
    if (headless) {
      console.log('Using headless mode')
      options.addArguments('--headless')
    }
    this._driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build()
    console.log('Driver initialized')
  }

  loadURL (url) {
    return this._driver.get(url)
  }

  goBack () {
    return this._driver.navigate().back()
  }

  async close () {
    await this._driver.quit()
  }

  pointClick (element, offsetX, offsetY) {
    return this._driver.actions({ bridge: true })
      .move({ x: offsetX, y: offsetY, origin: element })
      .click()
      .perform()
  }

  hideElem (selector) {
    return this._driver.executeScript(`$('${selector}').hide()`)
  }

  sleep (ms) {
    return this._driver.sleep(ms)
  }

  waitFor (selector, ms) {
    return this._driver.wait(until.elementLocated(By.css(selector)), ms)
  }

  waitForMulti (selector, ms) {
    return this._driver.wait(until.elementsLocated(By.css(selector)), ms)
  }

  waitForStale (element, ms) {
    return this._driver.wait(until.stalenessOf(element), ms)
  }

  waitForWith (fn, ms) {
    return this._driver.wait(fn, ms)
  }

  async waitToHide (selector, ms) {
    let element = await this.findElements(selector)
    if (element.length) return this._driver.wait(until.elementIsNotVisible(element[0]), ms)
  }

  findDescendant (elem, selector) {
    return elem.findElement(By.css(selector))
  }

  findDescendants (elem, selector) {
    return elem.findElements(By.css(selector))
  }

  findElement (selector) {
    return this._driver.findElement(By.css(selector))
  }

  findElementByXpath (selector) {
    return this._driver.findElement(By.xpath(selector))
  }

  findElements (selector) {
    return this._driver.findElements(By.css(selector))
  }

  findElementsByXpath (selector) {
    return this._driver.findElements(By.xpath(selector))
  }

  clickButton (selector) {
    return this.findElement(selector).click()
  }
}

async function login(scraper, credentials) {
  let emailElem = await scraper.waitFor('#identifierId, #Email', 2000)
  await emailElem.sendKeys(credentials.email)
  await scraper.clickButton('#identifierNext, #next')

  let passwordElem = await scraper.waitFor('input[name=password], #Passwd', 2000)
  await scraper.sleep(1000)
  await passwordElem.sendKeys(credentials.password)
  await scraper.clickButton('#passwordNext, #signIn')

  console.log('Logging in')
}

function readVideosList(filename) {
  console.log('Reading video URLs from: ', filename)
  return parse(fs.readFileSync(filename,'utf8'))
}

async function readFromXLSX(filename) {
  console.log('Reading video URLs from: ', filename)
  let workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filename)
  let worksheet = workbook.getWorksheet(1)
  let results = []
  worksheet.eachRow(function(row, rowNumber) {
    results.push([row.getCell(1).value.hyperlink]);
  });
  return results;
}

async function selectLanguage(scraper) {
  let picker = await scraper.findElements('button[data-button-menu-id=yt-languagepicker-menu-lang]')
  if (!picker.length) {
    console.log('No set language interface found')
    return
  }
  console.log('Setting language')
  await picker[0].click()
  await scraper.sleep(1000)
  // let languageMenu = await scraper.findElements('li.yt-uix-languagepicker-menu-item[data-value=${LANGUAGE}] .caption-editor-language-menu-item')
  // if (languageMenu.length) {
  //   await languageMenu[0].click()
  // } else {
    languageMenu = await scraper.findElement(`li.yt-uix-languagepicker-menu-item[data-value=${LANGUAGE}] .caption-editor-language-menu-item`)//, li.yt-uix-languagepicker-menu-item[data-value=${LANGUAGE}] .yt-uix-button-menu-item')
    await languageMenu.click()
  //}
  await scraper.sleep(1000)
  let closeButton = await scraper.findElement('#set-language-button')
  try {
    await closeButton.click()
  } catch(e) { /* close button might be hidden */ }
  console.log(`Language set to ${LANGUAGE}`)
  await scraper.sleep(200)
}

async function processURL(url, scraper, credentials) {
  console.log('Processing URL: ', url)
  await scraper.loadURL(url)

  //Login if necessary
  try {
    await login(scraper, credentials)
    await scraper.sleep(3000)
  } catch (e) {
    console.log('No need to login')
  }
  console.log('Loaded URL: ', url)

  //Must select translation language
  await selectLanguage(scraper)

  /********* First, deal with subtitles ********/
  let captionsLink = await scraper.waitFor('li#captions-editor-nav-captions a', 500)
  await captionsLink.click()
  console.log('Checking captions')
  //Is there and Edit button? if yes, click it
  try {
    let editCaptionsButtonSet = await scraper.waitFor('button.edit-published-track-button', 500)
    await editCaptionsButtonSet[0].click()
    await scraper.sleep(500)
  } catch (e) { }

  //Is there a Looks good button? if yes, click it
  let looksGoodCaptionsButtonSet = await scraper.findElements('#approve-captions-button')
  if (looksGoodCaptionsButtonSet.length) {
    console.log('Looks good clicked on captions review')
    await looksGoodCaptionsButtonSet[0].click()
    await scraper.sleep(500)
  } else {
    console.log('No Looks good button found here')
  }
  //note: Submit contribution has id #submit-edit-button; Looks good has id #approve-captions-button

  /********* Now deal with titles ********/
  let titleLink = await scraper.waitFor('li#captions-editor-nav-metadata a', 500)
  await titleLink.click()
  console.log('Checking title')
  //Is there and Edit button? if yes, click it
  try {
    let editCaptionsButtonSet = await scraper.waitFor('#metadata-edit-button', 500)
    await editCaptionsButtonSet[0].click()
    await scraper.sleep(500)
  } catch (e) { }
  //Is there a Needs rework button? if yes, we also have Looks good - click it!
  let needsReworkButtonSet = await scraper.findElements('#reject-metadata-button')
  if (needsReworkButtonSet.length) {
    console.log('Looks good clicked on title review')
    let looksGoodTitleButton = await scraper.findElement('#submit-metadata-button')
    await looksGoodTitleButton.click()
    await scraper.sleep(500)
  } else {
    console.log('No Looks good button found here')
  }
  //in case there is #discard-metadata-button, then we are at Submit contribution;
  //in case there is #reject-metadata-button, then we are at Looks good;
  //both buttons are #submit-metadata-button
}

function credentialsFromConfig() {
  return parse(fs.readFileSync(CONFIG,'utf8'),{
    columns: ['email','password']
  })
}

(async function() {
  if (process.argv.length < 3) {
    console.log('Please add the list of video files, like this: node looksgood.js myvideos.csv')
    return
  }
  let scraper = new SeleniumScraper()
  let credentialsSet = credentialsFromConfig()
  let urls = []
  if (process.argv[2].match(/\.xlsx/))
    urls = await readFromXLSX(process.argv[2]);
  else
    urls = readVideosList(process.argv[2]);
  for (let credentials of credentialsSet) {
    console.log('=================')
    console.log('Account: ', credentials.email)
    console.log('=================')
    await scraper.init(process.argv.length < 4 || process.argv[3] != '--no-headless')
    for (let url of urls) {
      console.log('~~~~~~~~~~~~~~~~~~~~~')
      await processURL(url[0], scraper, credentials)
    }
    await scraper.close()
  }
})();